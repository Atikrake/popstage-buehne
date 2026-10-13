import { PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import * as THREE from 'three';
import { useShowSound } from './audio/showSound';
import { sound } from './audio/sound';
import { EndCard, LobbyCard, NoticeCard, SetupCard, TitleCard, type SetupValues } from './hud/Cards';
import { Hud } from './hud/Hud';
import { newCode, tidyCode, useLiveShow, type Peer, type PlayerProfile } from './net/live';
import { readAppProfile, useRemoteAudio, useVideoTextures } from './net/media';
import { defaultQuality, QUALITY, type Quality } from './quality';
import { CAST, DEMO_HOST, HOST_LOOK, SEAT_COLORS, SEAT_LOOKS } from './show/cast';
import { clock, holdClock } from './show/clock';
import { initialState, reduce } from './show/engine';
import type { Contestant, ShowEvent, ShowState } from './show/types';
import { drawAvatar } from './world/canvasArt';
import { StudioWorld } from './world/StudioWorld';

/**
 * POPSTAGE's stage, playable: one host and up to five contestants, each with
 * camera and microphone, on popstage.vercel.app/buehne. The host's phone runs
 * the show and sends it to everybody else; the demo plays the same show
 * against five stand-ins, for a look without anybody else.
 *
 * Everything the app needs later is in `show/` (the rules and the timing),
 * `world/` (the studio, driven by nothing but the state) and `net/` (the room).
 */

const MAX_CONTESTANTS = 5;

type Mode = 'menu' | 'setup-host' | 'setup-join' | 'lobby' | 'show' | 'demo';

function readSetting<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be blocked; the setting simply is not remembered.
  }
}

/** Tells the page once the studio has been drawn for the first time. */
function FirstFrame({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    requestAnimationFrame(onReady);
  });
  return null;
}

/** The people who joined, as contestants on the stage, in the order they came. */
function castFrom(peers: Peer[]): Contestant[] {
  return peers.slice(0, MAX_CONTESTANTS).map((peer, index) => ({
    id: peer.id,
    name: peer.profile.name || `Kandidat ${index + 1}`,
    age: peer.profile.age ?? 0,
    persona: peer.profile.persona ?? 'Kandidat',
    vibes: peer.profile.vibes,
    bio: peer.profile.bio,
    color: SEAT_COLORS[index % SEAT_COLORS.length],
    look: SEAT_LOOKS[index % SEAT_LOOKS.length],
  }));
}

export function App() {
  const [mode, setMode] = useState<Mode>('menu');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [state, dispatch] = useReducer(reduce, undefined, () => initialState(clock()));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [quality, setQuality] = useState<Quality>(() => readSetting('popstage.quality', defaultQuality(), ['low', 'medium', 'high']));
  const [dprScale, setDprScale] = useState(1);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(() => readSetting('popstage.muted', 'no', ['yes', 'no']) === 'yes');
  const appProfile = useMemo(() => readAppProfile(), []);
  const [me, setMe] = useState<SetupValues>(() => ({
    name: appProfile?.name ?? '',
    age: appProfile?.age ? String(appProfile.age) : '',
    code: (() => {
      try {
        return tidyCode(new URLSearchParams(window.location.search).get('code') ?? '');
      } catch {
        return '';
      }
    })(),
  }));

  // A contestant's phone takes the show as the host sends it.
  const live = useLiveShow((incoming, elapsed) => {
    if (live.role !== 'contestant') return;
    dispatch({ type: 'sync', state: incoming as ShowState, elapsed, now: clock() });
  });
  const isHost = mode === 'demo' || live.role === 'host';
  const peerList = useMemo(() => Object.values(live.peers), [live.peers]);

  // The rules run on the host's phone only (and in the demo).
  useEffect(() => {
    const timer = setInterval(() => {
      if (modeRef.current === 'demo' || (modeRef.current === 'show' && live.role === 'host')) dispatch({ type: 'tick', now: clock() });
    }, 100);
    return () => clearInterval(timer);
  }, [live.role]);

  // The host sends the show on every change and once a second besides.
  const { sendState, turnAway } = live;
  useEffect(() => {
    if (mode !== 'show' || live.role !== 'host') return;
    sendState(state, clock() - state.phaseStart);
  }, [live.role, mode, sendState, state]);
  useEffect(() => {
    if (mode !== 'show' || live.role !== 'host') return undefined;
    const timer = setInterval(() => sendState(stateRef.current, clock() - stateRef.current.phaseStart), 1000);
    return () => clearInterval(timer);
  }, [live.role, mode, sendState]);

  // A contestant: the show begins when the host's first state arrives.
  useEffect(() => {
    if (live.role === 'contestant' && mode === 'lobby' && state.phase !== 'title') setMode('show');
  }, [live.role, mode, state.phase]);

  // The host: whoever drops out leaves the stage; late arrivals are turned away.
  useEffect(() => {
    if (live.role !== 'host') return;
    const here = new Set(peerList.map((peer) => peer.id));
    if (mode === 'show') {
      state.standing.forEach((id) => {
        if (!here.has(id)) dispatch({ type: 'drop', id, now: clock() });
      });
      peerList.forEach((peer) => {
        if (peer.role === 'contestant' && !state.contestants.some((c) => c.id === peer.id)) turnAway(peer.id);
      });
    } else if (mode === 'lobby') {
      peerList.filter((peer) => peer.role === 'contestant').slice(MAX_CONTESTANTS).forEach((peer) => turnAway(peer.id));
    }
  }, [live.role, mode, peerList, state.contestants, state.standing, turnAway]);

  useShowSound(state);

  // Testing aid in development builds only: jump to any moment of the show.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __show: unknown }).__show = {
      send: (event: Omit<ShowEvent, 'now'>) => {
        setMode((m) => (m === 'menu' ? 'demo' : m));
        dispatch({ ...event, now: clock() } as ShowEvent);
      },
      hold: (on: boolean) => holdClock(on),
      state: () => stateRef.current,
    };
  }, []);

  useEffect(() => {
    sound.setMuted(muted);
    writeSetting('popstage.muted', muted ? 'yes' : 'no');
  }, [muted]);
  useEffect(() => writeSetting('popstage.quality', quality), [quality]);

  // Pictures: every live camera by its owner's id; your own as well.
  const streams = useMemo(() => {
    const map: Record<string, MediaStream | null> = {};
    peerList.forEach((peer) => (map[peer.id] = peer.stream));
    if (live.myId) map[live.myId] = live.localStream;
    return map;
  }, [live.localStream, live.myId, peerList]);
  const textures = useVideoTextures(mode === 'show' ? streams : {});
  const soundBlocked = useRemoteAudio(useMemo(() => peerList.map((peer) => peer.stream).filter(Boolean) as MediaStream[], [peerList]));
  const hostImage = useMemo(() => drawAvatar(HOST_LOOK).toDataURL('image/jpeg', 0.8), []);

  const profile = (values: SetupValues): PlayerProfile => ({
    name: values.name.trim().slice(0, 24),
    age: values.age ? Number(values.age) : null,
    persona: appProfile?.persona ?? null,
    vibes: appProfile?.vibes ?? [],
    bio: appProfile?.bio ?? '',
  });

  const goLive = async (values: SetupValues) => {
    sound.wake();
    setMe(values);
    const host = mode === 'setup-host';
    const code = host ? newCode() : values.code;
    const ok = await live.join(host ? 'host' : 'contestant', code, profile(values));
    if (ok) setMode('lobby');
  };

  const startShow = () => {
    sound.wake();
    const contestants = castFrom(peerList.filter((peer) => peer.role === 'contestant'));
    dispatch({ type: 'start', now: clock(), contestants, host: { id: live.myId, name: me.name.trim() || 'Host' } });
    setMode('show');
  };

  const startDemo = () => {
    sound.wake();
    dispatch({ type: 'start', now: clock(), contestants: CAST, host: DEMO_HOST });
    setMode('demo');
  };

  const backToMenu = () => {
    live.leave();
    dispatch({ type: 'toTitle', now: clock() });
    setMode('menu');
  };

  const toggleMute = () => {
    sound.wake();
    setMuted((value) => !value);
  };

  const inShow = mode === 'show' || mode === 'demo';
  const role = isHost ? 'host' : 'contestant';
  const myId = mode === 'demo' ? DEMO_HOST.id : live.myId;

  return (
    <div className="shell">
      <Canvas
        key={quality}
        dpr={[1, QUALITY[quality].dpr * dprScale]}
        shadows={QUALITY[quality].shadows > 0 ? 'percentage' : false}
        gl={{ antialias: !QUALITY[quality].composer, powerPreference: 'high-performance', toneMapping: THREE.NeutralToneMapping }}
        camera={{ fov: 50, near: 0.1, far: 120, position: [0, 6, 14] }}
        onCreated={({ gl }) => {
          // Testing aid in development builds only: shader problems collected where a test can read them.
          if (!import.meta.env.DEV) return;
          const errors: string[] = [];
          (window as unknown as { __shaderErrors: string[] }).__shaderErrors = errors;
          gl.debug.onShaderError = (context, program, vertex, fragment) => {
            const log = (shader: WebGLShader) => context.getShaderInfoLog(shader) ?? '';
            errors.push(`${context.getProgramInfoLog(program) ?? ''}\n${log(vertex)}\n${log(fragment)}`.trim());
          };
        }}
      >
        {/* When the phone cannot keep up, the picture gets a little softer instead of jerky. */}
        <PerformanceMonitor onDecline={() => setDprScale((s) => Math.max(0.6, s - 0.15))} onIncline={() => setDprScale((s) => Math.min(1, s + 0.1))} flipflops={4} />
        <StudioWorld
          state={state}
          quality={quality}
          onTap={(id) => isHost && state.phase === 'deciding' && dispatch({ type: 'select', id, now: clock() })}
          pictures={textures}
        />
        <FirstFrame onReady={() => setReady(true)} />
      </Canvas>

      {state.phase === 'intro' ? <div className="fade" key={state.phaseStart} /> : null}

      {inShow ? (
        <Hud
          state={state}
          dispatch={dispatch}
          role={role}
          myId={myId}
          muted={muted}
          onMute={toggleMute}
          selfStream={mode === 'show' ? live.localStream : null}
          selfImage={mode === 'demo' ? hostImage : null}
          mic={mode === 'show' ? { on: live.micOn, toggle: live.toggleMic } : null}
          soundBlocked={mode === 'show' && soundBlocked}
        />
      ) : null}

      {mode === 'menu' ? (
        <TitleCard
          ready={ready}
          quality={quality}
          onQuality={setQuality}
          muted={muted}
          onMute={toggleMute}
          onHost={() => setMode('setup-host')}
          onJoin={() => setMode('setup-join')}
          onDemo={startDemo}
        />
      ) : null}

      {mode === 'setup-host' || mode === 'setup-join' ? (
        <SetupCard
          role={mode === 'setup-host' ? 'host' : 'contestant'}
          initial={me}
          busy={live.status === 'camera' || live.status === 'connecting'}
          error={live.status === 'error' ? live.error : null}
          onBack={backToMenu}
          onGo={(values) => void goLive(values)}
        />
      ) : null}

      {mode === 'lobby' ? (
        live.status === 'error' ? (
          <NoticeCard title="Das hat nicht geklappt" text={live.error ?? ''} action="Zurück" onAction={backToMenu} />
        ) : (
          <LobbyCard
            role={live.role ?? 'contestant'}
            code={live.code}
            peers={peerList}
            selfStream={live.localStream}
            name={me.name}
            max={MAX_CONTESTANTS}
            missing={live.missing}
            onStart={startShow}
            onLeave={backToMenu}
          />
        )
      ) : null}

      {mode === 'show' && live.hostLeft ? (
        <NoticeCard title="Der Host ist gegangen" text="Ohne Host geht die Show nicht weiter." action="Zurück zum Start" onAction={backToMenu} />
      ) : null}
      {mode === 'show' && !live.hostLeft && live.status === 'error' ? (
        <NoticeCard title="Verbindung weg" text={live.error ?? ''} action="Zurück zum Start" onAction={backToMenu} />
      ) : null}

      {state.phase === 'end' && inShow ? (
        <EndCard
          state={state}
          canRestart={isHost}
          onAgain={() => {
            sound.wake();
            const here = mode === 'demo' ? CAST : state.contestants.filter((c) => peerList.some((peer) => peer.id === c.id));
            dispatch({ type: 'restart', now: clock(), contestants: here });
          }}
          onLeave={backToMenu}
        />
      ) : null}
    </div>
  );
}
