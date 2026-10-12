import { CAST } from './cast';
import { DUR, QUESTIONS, ROUND_MS, TOTAL_ROUNDS } from './config';
import { newSeed } from './seed';
import type { Phase, ShowEvent, ShowState } from './types';

/**
 * The show's rules — the host's side of it.
 *
 * Only the host runs this. It holds who is on stage, which round it is and
 * what is on the board, and moves from one phase to the next. Everything a
 * phone shows is drawn from the resulting state; nothing is decided by
 * whatever phone happens to be looking.
 *
 * The rules are the app's: five rounds; in each, the host asks a question
 * and twenty seconds run; the host may POP one contestant, which ends the
 * round; if the time runs out, everybody stays. The show ends after the fifth
 * round or once the stage is empty.
 */

export function initialState(now = 0): ShowState {
  return {
    phase: 'title',
    phaseStart: now,
    round: 1,
    seed: newSeed(),
    contestants: CAST,
    standing: CAST.map((one) => one.id),
    out: [],
    question: null,
    focus: null,
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

/** How long the presentation runs for this many contestants. */
export function presentationLength(count: number) {
  return count * DUR.presentEach + DUR.presentOutro;
}

/** After a round: the next one, or the finale. */
function afterRound(state: ShowState, now: number): ShowState {
  if (state.round >= TOTAL_ROUNDS || state.standing.length === 0) {
    return to(state, 'finale', now, { question: null, focus: null, target: null });
  }
  return to(state, 'roundStart', now, { round: state.round + 1, question: null, focus: null, target: null });
}

export function reduce(state: ShowState, event: ShowEvent): ShowState {
  const { now } = event;
  const elapsed = now - state.phaseStart;

  switch (event.type) {
    case 'start':
      return { ...initialState(now), phase: 'intro', phaseStart: now };

    case 'skipIntro':
      return state.phase === 'intro' ? to(state, 'presentation', now) : state;

    case 'next': {
      // "Weiter" during the presentation: straight on to the next person.
      if (state.phase !== 'presentation') return state;
      const length = presentationLength(state.contestants.length);
      const index = Math.floor(elapsed / DUR.presentEach);
      if (index >= state.contestants.length - 1) {
        // The last one, or the line-up: on to the first round.
        return elapsed >= length - DUR.presentOutro
          ? to(state, 'roundStart', now)
          : { ...state, phaseStart: now - (length - DUR.presentOutro) };
      }
      return { ...state, phaseStart: now - (index + 1) * DUR.presentEach };
    }

    case 'chooseRandom':
      if (state.phase !== 'choosing') return state;
      {
        const text = drawQuestion(state.lastQuestion);
        return to(state, 'answering', now, { question: { kind: 'random', text }, lastQuestion: text, focus: null });
      }

    case 'chooseOwn':
      if (state.phase !== 'choosing') return state;
      return to(state, 'answering', now, { question: { kind: 'own' }, focus: null });

    case 'focus':
      if (state.phase !== 'answering' || !state.standing.includes(event.id)) return state;
      return { ...state, focus: { id: event.id, at: now } };

    case 'pop':
      // One POP per round, and only while answers are running.
      if (state.phase !== 'answering' || !state.standing.includes(event.id)) return state;
      return to(state, 'verdict', now, { target: event.id });

    case 'allStay':
      if (state.phase !== 'answering') return state;
      return to(state, 'allStay', now);

    case 'restart':
      return { ...initialState(now), phase: 'presentation', phaseStart: now };

    case 'toTitle':
      return initialState(now);

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
        question: ['answering', 'verdict', 'pop'].includes(event.phase) ? { kind: 'random', text: QUESTIONS[0] } : null,
        target: event.target ?? (['verdict', 'pop'].includes(event.phase) ? standing[1] : null),
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
        case 'choosing':
          if (elapsed < DUR.chooseAuto) return state;
          {
            const text = drawQuestion(state.lastQuestion);
            return to(state, 'answering', now, { question: { kind: 'random', text }, lastQuestion: text });
          }
        case 'answering':
          return elapsed >= ROUND_MS ? to(state, 'allStay', now) : state;
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
        case 'allStay':
          return elapsed >= DUR.allStay ? afterRound(state, now) : state;
        case 'finale':
          return elapsed >= DUR.finale ? to(state, 'end', now) : state;
        default:
          return state;
      }
  }
}
