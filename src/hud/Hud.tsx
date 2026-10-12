import { useEffect, useRef, useState } from 'react';
import { clock } from '../show/clock';
import { DUR, roundsFor } from '../show/config';
import { currentTurn, elapsedOf, presentSlot } from '../show/timeline';
import type { ShowEvent, ShowState } from '../show/types';

/**
 * The flat controls over the stage. The host asks and decides; a contestant's
 * phone only shows them what is going on and when it is their turn. In the app
 * these become the app's own buttons — the stage underneath only ever needs
 * the state they change.
 */

function useNow(every = 200) {
  const [now, setNow] = useState(() => clock());
  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

export function Heart({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 92" aria-hidden="true">
      <path d="M50 92C18 70 0 50 0 28 0 10 14 0 28 0c10 0 18 6 22 15C54 6 62 0 72 0c14 0 28 10 28 28 0 22-18 42-50 64z" fill={color} />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {muted ? <path d="m22 9-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
    </svg>
  );
}

function MicIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
      {on ? null : <path d="M3 3l18 18" />}
    </svg>
  );
}

/** A live camera as a small picture — your own, mirrored like a front camera. */
export function LiveVideo({ stream, mirrored = true }: { stream: MediaStream | null; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} muted playsInline autoPlay style={{ transform: mirrored ? 'scaleX(-1)' : undefined }} />;
}

export type HudProps = {
  state: ShowState;
  dispatch: (event: ShowEvent) => void;
  /** Who this phone is: the host runs the show, a contestant follows it. */
  role: 'host' | 'contestant';
  myId: string;
  muted: boolean;
  onMute: () => void;
  /** Live only: the own camera for the corner picture, and the microphone. */
  selfStream: MediaStream | null;
  selfImage: string | null;
  mic: { on: boolean; toggle: () => void } | null;
  soundBlocked: boolean;
};

export function Hud({ state, dispatch, role, myId, muted, onMute, selfStream, selfImage, mic, soundBlocked }: HudProps) {
  const now = useNow(state.phase === 'answering' || state.phase === 'choosing' ? 100 : 250);
  const t = elapsedOf(state, now);
  const at = () => clock();
  const byId = (id: string | null) => state.contestants.find((c) => c.id === id) ?? null;
  const total = roundsFor(state.contestants.length);
  const inRounds = ['roundStart', 'choosing', 'asking', 'answering', 'deciding', 'verdict', 'pop', 'regroup'].includes(state.phase);
  const host = role === 'host';

  if (state.phase === 'title') return null;

  const turn = currentTurn(state, now);
  const turnPerson = byId(turn?.id ?? null);
  const myTurn = turn?.id === myId;
  const iAmOut = role === 'contestant' && state.out.some((one) => one.id === myId);

  return (
    <>
      <div className="top">
        <div className="pill">
          <span className="dot" />
          LIVE
        </div>
        {inRounds ? (
          <div className="pill">
            RUNDE {Math.min(state.round, total)}/{total}
          </div>
        ) : state.phase === 'presentation' ? (
          <div className="pill">VORSTELLUNG</div>
        ) : null}
        <div className="row" style={{ flex: '0 0 auto', gap: 8 }}>
          {mic ? (
            <button type="button" className={`icon-button${mic.on ? '' : ' off'}`} onClick={mic.toggle} aria-label={mic.on ? 'Mikrofon aus' : 'Mikrofon an'}>
              <MicIcon on={mic.on} />
            </button>
          ) : null}
          <button type="button" className="icon-button" onClick={onMute} aria-label={muted ? 'Ton an' : 'Ton aus'}>
            <SoundIcon muted={muted} />
          </button>
        </div>
      </div>

      {/* Yourself, always in the corner: the host sees the host, a contestant sees themselves. */}
      <div className={`self${myTurn ? ' speaking' : ''}`}>
        {selfStream ? <LiveVideo stream={selfStream} /> : selfImage ? <img src={selfImage} alt="" /> : null}
        <span>{host ? 'Du · Host' : 'Du'}</span>
      </div>

      {state.phase === 'answering' && turn && turnPerson ? (
        <div className={`timer${turn.left <= 3000 ? ' urgent' : ''}`}>0:{String(Math.ceil(turn.left / 1000)).padStart(2, '0')}</div>
      ) : null}

      {soundBlocked ? (
        <button type="button" className="primary sound-nudge">
          🔊 Ton an – hier tippen
        </button>
      ) : null}

      <div className="bottom">
        {state.phase === 'presentation' ? <PresentationCaption state={state} now={now} /> : null}

        {state.phase === 'choosing' && host ? (
          <div className="sheet" key={`choose-${state.round}`}>
            <div className="kicker">
              Runde {state.round} von {total}
            </div>
            <h2>Welche Frage stellst du?</h2>
            <div className="row">
              <button type="button" className="primary" onClick={() => dispatch({ type: 'chooseRandom', now: at() })}>
                Zufällige Frage
              </button>
              <button type="button" className="secondary" onClick={() => dispatch({ type: 'chooseOwn', now: at() })}>
                Ich frage selbst
              </button>
            </div>
            <div className="progress" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (t / DUR.chooseAuto) * 100)}%` }} />
            </div>
            <p className="hint">Wählst du nicht, zieht die Show in {Math.max(0, Math.ceil((DUR.chooseAuto - t) / 1000))} s eine Frage.</p>
          </div>
        ) : null}
        {state.phase === 'choosing' && !host ? <div className="caption">Der Host wählt die Frage …</div> : null}

        {state.phase === 'asking' ? (
          <div className="caption">{host ? (state.question?.kind === 'own' ? 'Stell jetzt deine Frage' : 'Lies die Frage vor') : 'Der Host fragt …'}</div>
        ) : null}

        {state.phase === 'answering' && turnPerson ? (
          <div className={`turn${myTurn ? ' mine' : ''}`}>
            <div className="turn-name">
              <Heart color={turnPerson.color} />
              {myTurn ? 'Du bist dran – antworte jetzt!' : `${turnPerson.name} antwortet`}
            </div>
            <div className="turn-dots" aria-hidden="true">
              {state.standing.map((id, index) => (
                <i key={id} className={index < (turn?.index ?? 0) ? 'done' : index === turn?.index ? 'now' : ''} style={{ background: index <= (turn?.index ?? 0) ? byId(id)?.color : undefined }} />
              ))}
            </div>
          </div>
        ) : null}

        {state.phase === 'deciding' && host ? <Deciding state={state} dispatch={dispatch} /> : null}
        {state.phase === 'deciding' && !host ? <div className="caption">{iAmOut ? 'Du schaust zu' : 'Der Host entscheidet …'}</div> : null}

        {state.phase === 'verdict' ? <div className="caption">Wer muss gehen?</div> : null}
        {state.phase === 'pop' && byId(state.target) ? (
          <div className="caption">{state.target === myId ? 'Du musst gehen' : `${byId(state.target)!.name} muss gehen`}</div>
        ) : null}
      </div>
    </>
  );
}

function PresentationCaption({ state, now }: { state: ShowState; now: number }) {
  const slot = presentSlot(state, now);
  const text =
    slot.kind === 'host'
      ? `Dein Host · ${state.host.name}`
      : slot.kind === 'contestant'
        ? `Kandidat ${slot.index + 1} von ${state.contestants.length} · ${state.contestants[slot.index].name}`
        : 'Das sind eure Kandidaten';
  return <div className="caption">{text}</div>;
}

function Deciding({ state, dispatch }: { state: ShowState; dispatch: (event: ShowEvent) => void }) {
  const standing = state.standing.map((id) => state.contestants.find((c) => c.id === id)!).filter(Boolean);
  const picked = standing.find((c) => c.id === state.selected) ?? null;
  return (
    <div className="sheet" key={`decide-${state.round}`}>
      <div className="kicker">Alle haben geantwortet</div>
      <h2>Wen poppst du?</h2>
      <div className="chips" role="list">
        {standing.map((c) => (
          <button key={c.id} type="button" role="listitem" className={`chip${c.id === state.selected ? ' on' : ''}`} onClick={() => dispatch({ type: 'select', id: c.id, now: clock() })}>
            <Heart color={c.color} />
            {c.name}
          </button>
        ))}
      </div>
      <button type="button" className="primary pop" disabled={!picked} onClick={() => dispatch({ type: 'pop', now: clock() })}>
        {picked ? `POP · ${picked.name}` : 'Erst jemanden antippen'}
      </button>
    </div>
  );
}
