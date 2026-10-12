import { DUR, ROUND_MS } from './config';
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

/** During the presentation: whose turn it is, or -1 for the closing line-up. */
export function presentIndex(state: ShowState, now: number) {
  const t = elapsedOf(state, now);
  const n = state.contestants.length;
  const index = Math.floor(t / DUR.presentEach);
  return index >= n || t >= presentationLength(n) - DUR.presentOutro ? -1 : index;
}

/** Progress through the current presentation slot, 0 → 1. */
export function presentProgress(state: ShowState, now: number) {
  const t = elapsedOf(state, now);
  return (t % DUR.presentEach) / DUR.presentEach;
}

export function remainingMs(state: ShowState, now: number) {
  if (state.phase === 'answering') return Math.max(0, ROUND_MS - elapsedOf(state, now));
  if (state.phase === 'choosing' || state.phase === 'roundStart') return ROUND_MS;
  return 0;
}

/**
 * While answers run: who is in the light. A tap from the host holds the light
 * on that person for a while; otherwise it moves along the row on its own.
 */
export function answeringFocus(state: ShowState, now: number): string | null {
  if (state.standing.length === 0) return null;
  if (state.focus && now - state.focus.at < DUR.manualFocusHold && state.standing.includes(state.focus.id)) {
    return state.focus.id;
  }
  const t = elapsedOf(state, now);
  const step = Math.floor(t / DUR.autoFocus);
  return state.standing[step % state.standing.length];
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
    if (index === times.length - 1) id = target;
    else if (ids.length === 1) id = target;
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
      const index = presentIndex(state, now);
      return index >= 0 ? state.contestants[index].id : null;
    }
    case 'answering':
      return answeringFocus(state, now);
    case 'verdict':
      return verdictSpot(verdictHops(state), elapsedOf(state, now));
    case 'pop':
      return state.target;
    default:
      return null;
  }
}

/** The ones celebrated at the end. */
export function winners(state: ShowState) {
  return state.standing;
}
