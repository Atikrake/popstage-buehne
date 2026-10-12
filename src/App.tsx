import { clock, holdClock } from './show/clock';
import { Canvas, useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import * as THREE from 'three';
import { useShowSound } from './audio/showSound';
import { sound } from './audio/sound';
import { EndCard, TitleCard } from './hud/Cards';
import { Hud } from './hud/Hud';
import { defaultQuality, QUALITY, type Quality } from './quality';
import { initialState, reduce } from './show/engine';
import type { ShowEvent } from './show/types';
import { StudioWorld } from './world/StudioWorld';

/**
 * The stage lab: the POPSTAGE studio on its own, played from the host's side
 * with five stand-ins. Everything the app needs later is in `show/` (the rules
 * and the timing) and `world/` (the studio, driven by nothing but the state).
 */

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

export function App() {
  const [state, dispatch] = useReducer(reduce, undefined, () => initialState(clock()));
  const [quality, setQuality] = useState<Quality>(() => readSetting('popstage.quality', defaultQuality(), ['low', 'medium', 'high']));
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(() => readSetting('popstage.muted', 'no', ['yes', 'no']) === 'yes');

  // The clock that moves the show on: the rules check it ten times a second.
  useEffect(() => {
    const timer = setInterval(() => dispatch({ type: 'tick', now: clock() }), 100);
    return () => clearInterval(timer);
  }, []);

  useShowSound(state);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Testing aid in development builds only: jump to any moment of the show.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __show: unknown }).__show = {
      send: (event: Omit<ShowEvent, 'now'>) => dispatch({ ...event, now: clock() } as ShowEvent),
      hold: (on: boolean) => holdClock(on),
      state: () => stateRef.current,
    };
  }, []);

  useEffect(() => {
    sound.setMuted(muted);
    writeSetting('popstage.muted', muted ? 'yes' : 'no');
  }, [muted]);
  useEffect(() => writeSetting('popstage.quality', quality), [quality]);

  const send = useCallback((event: ShowEvent) => dispatch(event), []);
  const start = () => {
    sound.wake();
    dispatch({ type: 'start', now: clock() });
  };
  const toggleMute = () => {
    sound.wake();
    setMuted((value) => !value);
  };

  return (
    <div className="shell">
      <Canvas
        key={quality}
        dpr={[1, QUALITY[quality].dpr]}
        gl={{ antialias: !QUALITY[quality].composer, powerPreference: 'high-performance', toneMapping: THREE.NeutralToneMapping }}
        camera={{ fov: 50, near: 0.1, far: 120, position: [0, 6, 14] }}
      >
        <StudioWorld state={state} quality={quality} onTap={(id) => send({ type: 'focus', id, now: clock() })} />
        <FirstFrame onReady={() => setReady(true)} />
      </Canvas>

      {state.phase === 'intro' ? <div className="fade" key={state.phaseStart} /> : null}

      <Hud state={state} dispatch={send} muted={muted} onMute={toggleMute} />

      {state.phase === 'title' ? (
        <TitleCard ready={ready} quality={quality} onQuality={setQuality} muted={muted} onMute={toggleMute} onStart={start} />
      ) : null}
      {state.phase === 'end' ? (
        <EndCard
          state={state}
          onAgain={() => {
            sound.wake();
            dispatch({ type: 'restart', now: clock() });
          }}
          onIntro={start}
        />
      ) : null}
    </div>
  );
}
