/**
 * The show as data.
 *
 * Everything the stage shows is worked out from a `ShowState` and the time
 * that has passed since its current phase began. That is the whole contract
 * with the app later on: the host's phone runs this state, sends it to the
 * others together with how long the phase has been running, and every phone
 * draws exactly the same moment.
 */

export type Phase =
  /** The title card, before anything starts. */
  | 'title'
  /** Walking in: corridor, doors, lights, the stage building itself. */
  | 'intro'
  /** Every contestant introduced once, one after another. */
  | 'presentation'
  /** "Runde 2 von 5". */
  | 'roundStart'
  /** The host picks: a random question, or one of their own. */
  | 'choosing'
  /** Twenty seconds of answers; the camera goes from person to person. */
  | 'answering'
  /** The host pressed POP: who is it going to be? */
  | 'verdict'
  /** The balloon bursts and the contestant leaves the stage. */
  | 'pop'
  /** The others close ranks. */
  | 'regroup'
  /** The time ran out and nobody was sent home. */
  | 'allStay'
  /** The last round is over, or the stage is empty. */
  | 'finale'
  /** The end card. */
  | 'end';

export type HairStyle = 'long' | 'wavy' | 'short' | 'bun' | 'curly' | 'swept';

/** How a stand-in is drawn. A real player is their live camera instead. */
export type Look = {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: string;
  /** Light from the left and from the right of the picture. */
  light: [string, string];
  beard?: boolean;
};

export type Persona = 'Secret Fan' | 'Romantic' | 'Wildcard' | 'Showstopper';

export type Contestant = {
  id: string;
  name: string;
  age: number;
  persona: Persona;
  vibes: string[];
  bio: string;
  /** Their balloon, their ring, their accent on the screens. */
  color: string;
  look: Look;
};

export type Question = { kind: 'random'; text: string } | { kind: 'own' };

export type ShowState = {
  phase: Phase;
  /** When the current phase began, in `performance.now()` milliseconds. */
  phaseStart: number;
  /** 1 … TOTAL_ROUNDS. */
  round: number;
  /** New for every show: drives every "random" moment so all phones agree. */
  seed: number;
  /** Everybody in this show, in seat order. */
  contestants: Contestant[];
  /** Who is still on the stage, in seat order. */
  standing: string[];
  /** Who left, and in which round. */
  out: { id: string; round: number }[];
  question: Question | null;
  /** The contestant the host tapped, and when. Otherwise the camera wanders. */
  focus: { id: string; at: number } | null;
  /** Whoever the host popped — set from the verdict until they are gone. */
  target: string | null;
  lastQuestion: string | null;
};

export type ShowEvent =
  | { type: 'start'; now: number }
  | { type: 'skipIntro'; now: number }
  | { type: 'next'; now: number }
  | { type: 'chooseRandom'; now: number }
  | { type: 'chooseOwn'; now: number }
  | { type: 'focus'; id: string; now: number }
  | { type: 'pop'; id: string; now: number }
  | { type: 'allStay'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'restart'; now: number }
  | { type: 'toTitle'; now: number }
  /** For testing only: jump to a moment inside the current phase. */
  | { type: 'seek'; ms: number; now: number }
  /** For testing only: straight into a phase. */
  | { type: 'jump'; phase: Phase; ms: number; round?: number; standing?: string[]; target?: string; now: number };
