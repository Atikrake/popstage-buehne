import { useState } from 'react';
import { CODE_LENGTH, tidyCode, type Peer } from '../net/live';
import { QUALITY_LABEL, type Quality } from '../quality';
import { roundsFor } from '../show/config';
import type { ShowState } from '../show/types';
import { Heart, LiveVideo } from './Hud';

/** The cards around the show: the title, getting ready, the waiting room, the end. */

export function TitleCard({
  ready,
  quality,
  onQuality,
  muted,
  onMute,
  onHost,
  onJoin,
  onDemo,
}: {
  ready: boolean;
  quality: Quality;
  onQuality: (quality: Quality) => void;
  muted: boolean;
  onMute: () => void;
  onHost: () => void;
  onJoin: () => void;
  onDemo: () => void;
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
      <p className="lede">Die Dating-Show live mit Kamera und Mikro. Ein Host, bis zu fünf Kandidaten – am Ende bleibt nur einer.</p>
      <div className="row">
        <button type="button" className="primary" onClick={onHost} disabled={!ready}>
          {ready ? 'Show erstellen' : 'Studio wird aufgebaut …'}
        </button>
        <button type="button" className="secondary" onClick={onJoin} disabled={!ready}>
          Beitreten
        </button>
      </div>
      <button type="button" className="ghost" onClick={onDemo} disabled={!ready}>
        Ohne Mitspieler ansehen (Demo)
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
    </div>
  );
}

export type SetupValues = { name: string; age: string; code: string };

export function SetupCard({
  role,
  initial,
  busy,
  error,
  onBack,
  onGo,
}: {
  role: 'host' | 'contestant';
  initial: SetupValues;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onGo: (values: SetupValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const host = role === 'host';
  const ok = values.name.trim().length > 0 && (host || values.code.length === CODE_LENGTH);
  return (
    <div className="end">
      <form
        className="sheet"
        onSubmit={(event) => {
          event.preventDefault();
          if (ok && !busy) onGo(values);
        }}
      >
        <div className="kicker">{host ? 'Neue Show' : 'Einer Show beitreten'}</div>
        <h2>{host ? 'Du bist der Host' : 'Du bist Kandidat'}</h2>
        {!host ? (
          <label className="field">
            <span>Show-Code</span>
            <input
              id="code"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              value={values.code}
              placeholder="z. B. AB3XK"
              onChange={(event) => setValues({ ...values, code: tidyCode(event.target.value) })}
              className="code-input"
            />
          </label>
        ) : null}
        <div className="row">
          <label className="field" style={{ flex: 2 }}>
            <span>Dein Name</span>
            <input id="name" value={values.name} maxLength={24} onChange={(event) => setValues({ ...values, name: event.target.value })} placeholder="Vorname" />
          </label>
          <label className="field">
            <span>Alter</span>
            <input id="age" inputMode="numeric" value={values.age} maxLength={2} onChange={(event) => setValues({ ...values, age: event.target.value.replace(/\D/g, '') })} placeholder="–" />
          </label>
        </div>
        <p className="hint">Kamera und Mikrofon werden gleich abgefragt – bitte erlauben. Ohne sie geht die Show nicht.</p>
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <button type="button" className="secondary" onClick={onBack}>
            Zurück
          </button>
          <button type="submit" className="primary" disabled={!ok || busy} style={{ flex: 1.6 }}>
            {busy ? 'Verbinde …' : host ? 'Show öffnen' : 'Beitreten'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function LobbyCard({
  role,
  code,
  peers,
  selfStream,
  name,
  max,
  missing,
  onStart,
  onLeave,
}: {
  role: 'host' | 'contestant';
  code: string;
  peers: Peer[];
  selfStream: MediaStream | null;
  name: string;
  max: number;
  missing: 'camera' | 'all' | null;
  onStart: () => void;
  onLeave: () => void;
}) {
  const host = role === 'host';
  const contestants = peers.filter((one) => one.role === 'contestant');
  const theHost = peers.find((one) => one.role === 'host');
  const count = host ? contestants.length : contestants.length + 1;
  const enough = contestants.length >= 2;
  return (
    <div className="end">
      <div className="sheet">
        <div className="kicker">Warteraum</div>
        <div className="code-row">
          <div>
            <div className="hint">Show-Code</div>
            <div className="code">{code}</div>
          </div>
          <div className="self-small">
            <LiveVideo stream={selfStream} />
          </div>
        </div>
        <ul className="results">
          <li>
            <Heart color="#FF2D7A" />
            <span className="name">{host ? `${name} (du)` : (theHost?.profile.name || 'Host')}</span>
            <span className="status stayed">Host</span>
          </li>
          {!host ? (
            <li>
              <Heart color="#FF8FBC" />
              <span className="name">{name} (du)</span>
              <span className="status left">Kandidat</span>
            </li>
          ) : null}
          {contestants.map((one) => (
            <li key={one.id}>
              <Heart color="#FF8FBC" />
              <span className="name">{one.profile.name || 'Jemand'}</span>
              <span className="status left">Kandidat</span>
            </li>
          ))}
        </ul>
        <p className="hint">
          {host
            ? enough
              ? `${count} von ${max} Kandidaten da. Starte, wenn alle drin sind.`
              : 'Schick den Code an mindestens zwei Kandidaten. Sie öffnen popstage.vercel.app/buehne und tippen auf „Beitreten“.'
            : `${count} Kandidaten da. Gleich startet der Host die Show.`}
        </p>
        {missing ? (
          <p className="error">
            {missing === 'camera'
              ? 'Deine Kamera ist nicht an – die anderen hören dich nur. Erlaube die Kamera im Browser und tritt neu bei.'
              : 'Kamera und Mikrofon sind nicht an – die anderen sehen und hören dich nicht. Erlaube beides im Browser und tritt neu bei.'}
          </p>
        ) : null}
        <div className="row">
          <button type="button" className="secondary" onClick={onLeave}>
            Verlassen
          </button>
          {host ? (
            <button type="button" className="primary" onClick={onStart} disabled={!enough} style={{ flex: 1.6 }}>
              Show starten
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function NoticeCard({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div className="end">
      <div className="sheet">
        <h2>{title}</h2>
        <p className="hint">{text}</p>
        <button type="button" className="primary" onClick={onAction}>
          {action}
        </button>
      </div>
    </div>
  );
}

export function EndCard({ state, canRestart, onAgain, onLeave }: { state: ShowState; canRestart: boolean; onAgain: () => void; onLeave: () => void }) {
  const winners = state.contestants.filter((c) => state.standing.includes(c.id));
  const title = winners.length === 0 ? 'Niemand ist geblieben' : `${winners.map((c) => c.name).join(', ')} hat gewonnen`;
  return (
    <div className="end">
      <div className="sheet">
        <div className="kicker">Show vorbei · {roundsFor(state.contestants.length)} Runden</div>
        <h2>{title}</h2>
        <ul className="results">
          {state.contestants.map((c) => {
            const out = state.out.find((one) => one.id === c.id);
            return (
              <li key={c.id}>
                <Heart color={c.color} />
                <span className="name">
                  {c.name}
                  {c.age ? `, ${c.age}` : ''}
                </span>
                <span className={`status ${out ? 'left' : 'stayed'}`}>{out ? `Raus in Runde ${out.round}` : 'Gewonnen'}</span>
              </li>
            );
          })}
        </ul>
        <div className="row">
          <button type="button" className="secondary" onClick={onLeave}>
            Beenden
          </button>
          {canRestart ? (
            <button type="button" className="primary" onClick={onAgain} style={{ flex: 1.6 }}>
              Nochmal spielen
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
