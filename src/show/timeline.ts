import { DUR, TURN_MS } from './config';
import { presentationLength } from './engine';
import { mix, rng } from './seed';
import type { ShowState } from './types';

/**
 * Moments worked out from the state and the clock. Pure functions: given the
 * same state and the same elapsed time they give the same answer on every
 * phone, which is what keeps the host, the contestants and the audience in step.
 */

export function elapsedOf(state: ShowState, now: number) {
  return Math.max(0, now - state.phaseStart);
}

export type PresentSlot =
  | { kind: 'host'; progress: number }
  | { kind: 'contestant'; index: number; progress: number }
  | { kind: 'lineup'; progress: number };

/** During the presentation: the host first, then each contestant, then everybody. */
export function presentSlot(state: ShowState, now: number): PresentSlot {
  const t = elapsedOf(state, now);
  const n = state.contestants.length;
  if (t < DUR.presentHost) return { kind: 'host', progress: t / DUR.presentHost };
  const after = t - DUR.presentHost;
  const index = Math.floor(after / DUR.presentEach);
  if (index < n) return { kind: 'contestant', index, progress: (after % DUR.presentEach) / DUR.presentEach };
  const outroStart = presentationLength(n) - DUR.presentOutro;
  return { kind: 'lineup', progress: Math.min(1, (t - outroStart) / DUR.presentOutro) };
}

export type Turn = { id: string; index: number; count: number; left: number; progress: number };

/** While answering: whose turn it is and how much of their ten seconds is left. */
export function currentTurn(state: ShowState, now: number): Turn | null {
  const count = state.standing.length;
  if (state.phase !== 'answering' || count === 0) return null;
  const t = elapsedOf(state, now);
  const index = Math.min(count - 1, Math.floor(t / TURN_MS));
  const into = t - index * TURN_MS;
  return { id: state.standing[index], index, count, left: Math.max(0, TURN_MS - into), progress: Math.min(1, into / TURN_MS) };
}

export type Hop = { at: number; id: string };

/** When the spotlight stops hopping and settles on the one who goes. */
export const VERDICT_LAND_MS = 2_750;

/**
 * The spotlight hunting across the stage before it settles: quick at first,
 * slower and slower, and the last hop is always the one the host chose. The
 * order comes from the show's seed and the round, so every phone hops alike.
 */
export function verdictHops(state: ShowState): Hop[] {
  const ids = state.standing;
  const target = state.target ?? ids[0];
  if (!target) return [];
  const random = rng(mix(state.seed, state.round, 7));
  const times: number[] = [];
  let at = 0;
  let gap = 95;
  while (at < VERDICT_LAND_MS) {
    times.push(at);
    at += gap;
    gap *= 1.19;
  }
  times.push(VERDICT_LAND_MS);
  const hops: Hop[] = [];
  let last = '';
  times.forEach((time, index) => {
    let id: string;
    if (index === times.length - 1 || ids.length === 1) id = target;
    else {
      // Never the same twice running, and never the target just before landing.
      const choices = ids.filter((one) => one !== last && (index !== times.length - 2 || one !== target));
      id = choices[Math.floor(random() * choices.length)] ?? target;
    }
    hops.push({ at: time, id });
    last = id;
  });
  return hops;
}

export function verdictSpot(hops: Hop[], t: number): string | null {
  let current: string | null = null;
  for (const hop of hops) {
    if (hop.at <= t) current = hop.id;
    else break;
  }
  return current;
}

/** Who is in the light right now, whatever is going on. */
export function spotlightOn(state: ShowState, now: number): string | null {
  switch (state.phase) {
    case 'presentation': {
      const slot = presentSlot(state, now);
      return slot.kind === 'contestant' ? state.contestants[slot.index].id : null;
    }
    case 'answering':
      return currentTurn(state, now)?.id ?? null;
    case 'deciding':
      return state.selected;
    case 'verdict':
      return verdictSpot(verdictHops(state), elapsedOf(state, now));
    case 'pop':
      return state.target;
    default:
      return null;
  }
}
