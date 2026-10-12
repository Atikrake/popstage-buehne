import { CAST, DEMO_HOST } from './cast';
import { DUR, QUESTIONS, roundsFor, TURN_MS } from './config';
import { newSeed } from './seed';
import type { Contestant, Phase, ShowEvent, ShowState } from './types';

/**
 * The show's rules — the host's side of it.
 *
 * Only the host runs this. It holds who is on stage, which round it is and
 * what is on the board, and moves from one phase to the next. Everything a
 * phone shows is drawn from the resulting state; nothing is decided by
 * whatever phone happens to be looking.
 *
 * A round: the host asks a question; every contestant answers in turn, ten
 * seconds each, in seat order — nobody is skipped and nobody jumps the queue;
 * then the host must send one of them home. Rounds go on until a single
 * contestant is left, and that one wins.
 */

export function initialState(now = 0, contestants: Contestant[] = CAST, host = DEMO_HOST): ShowState {
  return {
    phase: 'title',
    phaseStart: now,
    round: 1,
    seed: newSeed(),
    host,
    contestants,
    standing: contestants.map((one) => one.id),
    out: [],
    question: null,
    selected: null,
    target: null,
    lastQuestion: null,
  };
}

function to(state: ShowState, phase: Phase, now: number, patch: Partial<ShowState> = {}): ShowState {
  return { ...state, ...patch, phase, phaseStart: now };
}

function drawQuestion(previous: string | null) {
  const pool = QUESTIONS.filter((one) => one !== previous);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** How long the presentation runs: the host, then everybody, then the line-up. */
export function presentationLength(count: number) {
  return DUR.presentHost + count * DUR.presentEach + DUR.presentOutro;
}

/** Everybody's turn, one after another. */
export function answeringLength(state: ShowState) {
  return state.standing.length * TURN_MS;
}

export function totalRounds(state: ShowState) {
  return roundsFor(state.contestants.length);
}

/** After a POP: the next round, or the winner if only one is left. */
function afterRound(state: ShowState, now: number): ShowState {
  if (state.standing.length <= 1) {
    return to(state, 'finale', now, { question: null, selected: null, target: null });
  }
  return to(state, 'roundStart', now, { round: state.round + 1, question: null, selected: null, target: null });
}

export function reduce(state: ShowState, event: ShowEvent): ShowState {
  const { now } = event;
  const elapsed = now - state.phaseStart;

  switch (event.type) {
    case 'start': {
      const fresh = initialState(now, event.contestants ?? state.contestants, event.host ?? state.host);
      return { ...fresh, phase: 'intro', phaseStart: now };
    }

    case 'skipIntro':
      return state.phase === 'intro' ? to(state, 'presentation', now) : state;

    case 'chooseRandom': {
      if (state.phase !== 'choosing') return state;
      const text = drawQuestion(state.lastQuestion);
      return to(state, 'asking', now, { question: { kind: 'random', text }, lastQuestion: text });
    }

    case 'chooseOwn':
      if (state.phase !== 'choosing') return state;
      return to(state, 'asking', now, { question: { kind: 'own' } });

    case 'select':
      // Only once everybody has answered, and only somebody still standing.
      if (state.phase !== 'deciding' || !state.standing.includes(event.id)) return state;
      return { ...state, selected: event.id };

    case 'pop':
      if (state.phase !== 'deciding' || !state.selected) return state;
      return to(state, 'verdict', now, { target: state.selected });

    case 'restart': {
      const fresh = initialState(now, event.contestants ?? state.contestants, state.host);
      return { ...fresh, phase: 'presentation', phaseStart: now };
    }

    case 'toTitle':
      return initialState(now, state.contestants, state.host);

    case 'drop': {
      if (!state.standing.includes(event.id)) return state;
      const standing = state.standing.filter((id) => id !== event.id);
      const next = { ...state, standing, out: [...state.out, { id: event.id, round: state.round }], selected: state.selected === event.id ? null : state.selected };
      // Before the show runs nothing changes; once it does, one left means a winner.
      if (['title', 'intro', 'presentation'].includes(state.phase)) return next;
      if (standing.length <= 1 && state.phase !== 'finale' && state.phase !== 'end') return to(next, 'finale', now, { question: null, target: null });
      return next;
    }

    case 'sync': {
      // Keep our own clock steady: only move it when it is more than a beat out.
      const phaseStart = now - event.elapsed;
      const same = event.state.phase === state.phase && Math.abs(phaseStart - state.phaseStart) < 180;
      return { ...event.state, phaseStart: same ? state.phaseStart : phaseStart };
    }

    case 'seek':
      return { ...state, phaseStart: now - event.ms };

    case 'jump': {
      const base = initialState(now);
      const standing = event.standing ?? base.standing;
      return {
        ...base,
        phase: event.phase,
        phaseStart: now - event.ms,
        round: event.round ?? 1,
        standing,
        out: base.standing.filter((id) => !standing.includes(id)).map((id) => ({ id, round: 1 })),
        question: ['asking', 'answering', 'deciding', 'verdict', 'pop'].includes(event.phase) ? { kind: 'random', text: QUESTIONS[0] } : null,
        target: event.target ?? (['verdict', 'pop'].includes(event.phase) ? standing[1] : null),
        selected: event.target ?? null,
      };
    }

    case 'tick':
      switch (state.phase) {
        case 'intro':
          return elapsed >= DUR.intro ? to(state, 'presentation', now) : state;
        case 'presentation':
          return elapsed >= presentationLength(state.contestants.length) ? to(state, 'roundStart', now) : state;
        case 'roundStart':
          return elapsed >= DUR.roundStart ? to(state, 'choosing', now) : state;
        case 'choosing': {
          if (elapsed < DUR.chooseAuto) return state;
          const text = drawQuestion(state.lastQuestion);
          return to(state, 'asking', now, { question: { kind: 'random', text }, lastQuestion: text });
        }
        case 'asking':
          return elapsed >= DUR.asking ? to(state, 'answering', now) : state;
        case 'answering':
          return elapsed >= answeringLength(state) ? to(state, 'deciding', now, { selected: null }) : state;
        case 'verdict':
          return elapsed >= DUR.verdict ? to(state, 'pop', now) : state;
        case 'pop':
          if (elapsed < DUR.pop || !state.target) return state;
          return to(state, 'regroup', now, {
            standing: state.standing.filter((id) => id !== state.target),
            out: [...state.out, { id: state.target, round: state.round }],
          });
        case 'regroup':
          return elapsed >= DUR.regroup ? afterRound(state, now) : state;
        case 'finale':
          return elapsed >= DUR.finale ? to(state, 'end', now) : state;
        default:
          return state;
      }
  }
}
