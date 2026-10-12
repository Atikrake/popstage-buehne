import { QUALITY_LABEL, type Quality } from '../quality';
import { TOTAL_ROUNDS } from '../show/config';
import type { ShowState } from '../show/types';
import { Heart } from './Hud';

export function TitleCard({
  ready,
  quality,
  onQuality,
  muted,
  onMute,
  onStart,
}: {
  ready: boolean;
  quality: Quality;
  onQuality: (quality: Quality) => void;
  muted: boolean;
  onMute: () => void;
  onStart: () => void;
}) {
  return (
    <div className="title">
      <div className="pill studio">
        <span className="dot" />
        STUDIO 3 · LIVE
      </div>
      <h1 className="wordmark">
        POP<span>STAGE</span>
      </h1>
      <p className="lede">Die Dating-Show auf deinem Handy. Fünf Kandidaten, fünf Runden, fünf Herzballons – und du bist der Host.</p>
      <button type="button" className="primary" onClick={onStart} disabled={!ready}>
        {ready ? 'Show starten' : 'Das Studio wird aufgebaut …'}
      </button>
      <div className="settings">
        <div>
          <span className="label">Qualität</span>
          <div className="segmented" role="group" aria-label="Qualität">
            {(['low', 'medium', 'high'] as Quality[]).map((one) => (
              <button key={one} type="button" aria-pressed={quality === one} onClick={() => onQuality(one)}>
                {QUALITY_LABEL[one]}
              </button>
            ))}
          </div>
        </div>
        <div className="segmented" role="group" aria-label="Ton">
          <button type="button" aria-pressed={!muted} onClick={() => muted && onMute()}>
            Ton an
          </button>
          <button type="button" aria-pressed={muted} onClick={() => !muted && onMute()}>
            Aus
          </button>
        </div>
      </div>
      <p className="note">Vorschau der neuen Bühne · noch nicht in der App</p>
    </div>
  );
}

export function EndCard({ state, onAgain, onIntro }: { state: ShowState; onAgain: () => void; onIntro: () => void }) {
  const stayed = state.standing;
  const winners = state.contestants.filter((c) => stayed.includes(c.id));
  const title =
    winners.length === 0 ? 'Niemand ist geblieben' : winners.length === 1 ? `${winners[0].name} hat gewonnen` : `${winners.map((c) => c.name).join(', ')} sind weiter`;
  return (
    <div className="end">
      <div className="sheet">
        <div className="kicker">Show vorbei · {TOTAL_ROUNDS} Runden</div>
        <h2>{title}</h2>
        <ul className="results">
          {state.contestants.map((c) => {
            const out = state.out.find((one) => one.id === c.id);
            return (
              <li key={c.id}>
                <Heart color={c.color} />
                <span className="name">
                  {c.name}, {c.age}
                </span>
                <span className={`status ${out ? 'left' : 'stayed'}`}>{out ? `Raus in Runde ${out.round}` : 'Geblieben'}</span>
              </li>
            );
          })}
        </ul>
        <div className="row">
          <button type="button" className="primary" onClick={onAgain}>
            Nochmal spielen
          </button>
          <button type="button" className="secondary" onClick={onIntro}>
            Mit Intro
          </button>
        </div>
      </div>
    </div>
  );
}
