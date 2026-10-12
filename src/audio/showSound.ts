import { clock } from '../show/clock';
import { useEffect, useRef } from 'react';
import { DUR, INTRO, TURN_MS } from '../show/config';
import { verdictHops, VERDICT_LAND_MS } from '../show/timeline';
import type { ShowState } from '../show/types';
import { sound } from './sound';

/**
 * When which sound plays. Each phase brings a list of sounds at set moments;
 * a moment that already lies behind when the phase is entered (somebody
 * pressed "Weiter", or skipped the intro) is passed over instead of all of
 * them firing at once.
 */

type Cue = { at: number; play: () => void };

function cuesFor(state: ShowState): Cue[] {
  const list: Cue[] = [];
  const add = (at: number, play: () => void) => list.push({ at, play });
  switch (state.phase) {
    case 'intro': {
      add(0, () => {
        sound.crowdLevel(0);
        sound.theme(0);
      });
      for (let at = 250; at < INTRO.walkEnd; at += 520) add(at, () => sound.step());
      for (let i = 0; i < 11; i += 2) add(INTRO.corridorLightsFrom + i * INTRO.corridorLightStep, () => sound.clunk());
      add(INTRO.doorsOpen, () => sound.door());
      add(INTRO.doorsOpen + 600, () => sound.crowdLevel(0.6));
      add(INTRO.coveOn, () => sound.clunk());
      add(INTRO.slatsOn, () => sound.clunk());
      for (let i = 0; i < 8; i += 1) add(INTRO.spotsFrom + i * INTRO.spotStep, () => sound.clunk());
      add(INTRO.ledBoot, () => sound.boot());
      add(INTRO.ledLogo, () => {
        sound.sting();
        sound.applause(4.2, 1);
        sound.theme(1);
        sound.crowdLevel(1);
      });
      for (let i = 0; i < 5; i += 1) add(INTRO.podiumsFrom + i * INTRO.podiumStep, () => sound.whoosh(0.5, 0.6));
      add(13_000, () => sound.whoosh(1.1, 0.8));
      break;
    }
    case 'presentation': {
      add(0, () => {
        sound.theme(0.75);
        sound.crowdLevel(0.7);
        sound.whoosh(0.8, 0.9);
        sound.applause(1.8, 0.6);
      });
      state.contestants.forEach((_, index) => {
        add(DUR.presentHost + index * DUR.presentEach + 10, () => {
          sound.whoosh(0.6, 0.8);
          sound.applause(1.4, 0.45);
        });
      });
      add(DUR.presentHost + state.contestants.length * DUR.presentEach + 10, () => {
        sound.sting();
        sound.applause(2.6, 1);
      });
      break;
    }
    case 'roundStart':
      add(0, () => {
        sound.theme(0.9);
        sound.whoosh(0.8, 1);
        sound.sting();
      });
      break;
    case 'choosing':
      add(0, () => sound.theme(0.4));
      break;
    case 'asking':
      add(0, () => {
        sound.whoosh(0.7, 0.8);
        sound.theme(0.15);
      });
      break;
    case 'answering': {
      // Quiet under the answers, so everybody can hear each other.
      add(0, () => {
        sound.theme(0.08);
        sound.crowdLevel(0.25);
      });
      state.standing.forEach((_, index) => {
        const start = index * TURN_MS;
        if (index > 0) add(start, () => sound.whoosh(0.5, 0.6));
        for (let s = 3; s >= 1; s -= 1) add(start + TURN_MS - s * 1000, () => sound.tick(true));
      });
      break;
    }
    case 'deciding':
      add(0, () => {
        sound.theme(0.25);
        sound.sting();
      });
      break;
    case 'verdict': {
      add(0, () => {
        sound.theme(0);
        sound.crowdLevel(0.2);
        sound.drumroll(VERDICT_LAND_MS / 1000);
      });
      verdictHops(state).forEach((hop, index) => {
        if (index > 0) add(hop.at, () => sound.hop());
      });
      add(VERDICT_LAND_MS + 120, () => sound.heartbeat());
      add(VERDICT_LAND_MS + 760, () => sound.heartbeat());
      break;
    }
    case 'pop':
      add(0, () => sound.heartbeat());
      add(700, () => {
        sound.pop();
        sound.ooh();
      });
      add(1_350, () => sound.sink());
      add(2_200, () => sound.crowdLevel(0.6));
      break;
    case 'regroup':
      add(0, () => sound.whoosh(0.9, 0.7));
      add(DUR.regroup - 200, () => sound.theme(0.7));
      break;
    case 'finale':
      add(0, () => {
        sound.theme(0);
        sound.whoosh(1.2, 1);
      });
      add(500, () => {
        if (state.standing.length > 0) {
          sound.fanfare();
          sound.applause(6, 1);
        } else sound.ooh();
      });
      add(2_800, () => sound.theme(state.standing.length > 0 ? 0.9 : 0.25));
      break;
    case 'end':
      add(0, () => {
        sound.theme(0.35);
        sound.crowdLevel(0.4);
      });
      break;
    default:
      break;
  }
  return list;
}

export function useShowSound(state: ShowState) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const run = useRef<{ key: string; cues: Cue[]; fired: Set<number> }>({ key: '', cues: [], fired: new Set() });

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const current = stateRef.current;
      if (current.phase === 'title' || !sound.ctx) return;
      const now = clock();
      const elapsed = now - current.phaseStart;
      const key = `${current.phase}-${current.phaseStart}`;
      if (run.current.key !== key) {
        const cues = cuesFor(current);
        // Moments already behind us are skipped, not played all at once.
        const fired = new Set<number>();
        cues.forEach((cue, index) => {
          if (cue.at < elapsed - 150 && cue.at > 0) fired.add(index);
        });
        run.current = { key, cues, fired };
      }
      run.current.cues.forEach((cue, index) => {
        if (!run.current.fired.has(index) && elapsed >= cue.at) {
          run.current.fired.add(index);
          cue.play();
        }
      });
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
}
