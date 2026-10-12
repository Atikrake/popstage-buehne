import { clock } from '../show/clock';
import { useEffect, useState } from 'react';
import { DUR, ROUND_MS, TOTAL_ROUNDS } from '../show/config';
import { answeringFocus, elapsedOf, presentIndex } from '../show/timeline';
import type { Contestant, ShowEvent, ShowState } from '../show/types';

/**
 * The flat controls over the stage — the host's side of the show. In the app
 * these become the app's own buttons; the stage underneath only ever needs
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

export function Hud({
  state,
  dispatch,
  muted,
  onMute,
}: {
  state: ShowState;
  dispatch: (event: ShowEvent) => void;
  muted: boolean;
  onMute: () => void;
}) {
  const now = useNow(state.phase === 'answering' || state.phase === 'choosing' ? 100 : 250);
  const t = elapsedOf(state, now);
  const at = () => clock();
  const byId = (id: string | null) => state.contestants.find((c) => c.id === id) ?? null;
  const inRounds = ['roundStart', 'choosing', 'answering', 'verdict', 'pop', 'regroup', 'allStay'].includes(state.phase);

  if (state.phase === 'title') return null;

  const seconds = Math.max(0, Math.ceil((ROUND_MS - t) / 1000));

  return (
    <>
      <div className="top">
        <div className="pill">
          <span className="dot" />
          LIVE
        </div>
        {inRounds ? (
          <div className="pill">
            RUNDE {state.round}/{TOTAL_ROUNDS}
          </div>
        ) : state.phase === 'presentation' ? (
          <div className="pill">VORSTELLUNG</div>
        ) : null}
        <button type="button" className="icon-button" onClick={onMute} aria-label={muted ? 'Ton an' : 'Ton aus'}>
          <SoundIcon muted={muted} />
        </button>
      </div>

      {state.phase === 'answering' ? (
        <div className={`timer${seconds <= 5 ? ' urgent' : ''}`}>0:{String(seconds).padStart(2, '0')}</div>
      ) : null}

      <div className="bottom">
        {state.phase === 'intro' ? (
          <button type="button" className="ghost" onClick={() => dispatch({ type: 'skipIntro', now: at() })}>
            Intro überspringen ›
          </button>
        ) : null}

        {state.phase === 'presentation' ? <Presentation state={state} now={now} onNext={() => dispatch({ type: 'next', now: at() })} /> : null}

        {state.phase === 'choosing' ? (
          <div className="sheet" key={`choose-${state.round}`}>
            <div className="kicker">Runde {state.round} von {TOTAL_ROUNDS}</div>
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

        {state.phase === 'answering' ? (
          <Answering state={state} now={now} focusOf={byId} onFocus={(id) => dispatch({ type: 'focus', id, now: at() })} onPop={(id) => dispatch({ type: 'pop', id, now: at() })} onAllStay={() => dispatch({ type: 'allStay', now: at() })} />
        ) : null}

        {state.phase === 'verdict' ? <div className="caption">Wer muss gehen?</div> : null}
        {state.phase === 'pop' && byId(state.target) ? <div className="caption">{byId(state.target)!.name} muss gehen</div> : null}
        {state.phase === 'allStay' ? <div className="caption">Zeit um · alle bleiben</div> : null}
      </div>
    </>
  );
}

function Presentation({ state, now, onNext }: { state: ShowState; now: number; onNext: () => void }) {
  const index = presentIndex(state, now);
  const c = index >= 0 ? state.contestants[index] : null;
  return (
    <div className="row" style={{ width: '100%', alignItems: 'center' }}>
      <div className="caption" style={{ flex: 1, textAlign: 'center' }}>
        {c ? `Kandidat ${index + 1} von ${state.contestants.length} · ${c.name}` : 'Das sind eure Kandidaten'}
      </div>
      <button type="button" className="ghost" style={{ flex: '0 0 auto' }} onClick={onNext}>
        Weiter ›
      </button>
    </div>
  );
}

function Answering({
  state,
  now,
  focusOf,
  onFocus,
  onPop,
  onAllStay,
}: {
  state: ShowState;
  now: number;
  focusOf: (id: string | null) => Contestant | null;
  onFocus: (id: string) => void;
  onPop: (id: string) => void;
  onAllStay: () => void;
}) {
  const focusId = answeringFocus(state, now);
  const focused = focusOf(focusId);
  const standing = state.standing.map((id) => focusOf(id)!).filter(Boolean);
  return (
    <div className="sheet" key={`answer-${state.round}`}>
      <div className="kicker">Antippen: ins Licht · POP: raus</div>
      <div className="chips" role="list">
        {standing.map((c) => (
          <button key={c.id} type="button" role="listitem" className={`chip${c.id === focusId ? ' on' : ''}`} onClick={() => onFocus(c.id)}>
            <Heart color={c.color} />
            {c.name}
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="primary pop" style={{ flex: 1.6 }} onClick={() => focused && onPop(focused.id)} disabled={!focused}>
          POP · {focused?.name ?? '…'}
        </button>
        <button type="button" className="secondary pop" onClick={onAllStay}>
          Alle bleiben
        </button>
      </div>
    </div>
  );
}
