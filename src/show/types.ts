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
  /** The host first, then every contestant, one after another. */
  | 'presentation'
  /** "Runde 2 von 4". */
  | 'roundStart'
  /** The host picks: a random question, or one of their own. */
  | 'choosing'
  /** The host asks — seen from the contestants' side. */
  | 'asking'
  /** Every contestant answers in turn, ten seconds each, nobody skipped. */
  | 'answering'
  /** Everybody has answered: the host must choose who goes. */
  | 'deciding'
  /** The host pressed POP: the spotlight hunts before it settles. */
  | 'verdict'
  /** The balloon bursts and the contestant leaves the stage. */
  | 'pop'
  /** The others close ranks. */
  | 'regroup'
  /** One contestant is left: the winner. */
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
  /** One of the app's personas, or a plain label for a player without one. */
  persona: Persona | string;
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
  /** 1 … rounds; a show has one round fewer than it has contestants. */
  round: number;
  /** New for every show: drives every "random" moment so all phones agree. */
  seed: number;
  /** The one asking the questions and deciding who goes. */
  host: { id: string; name: string };
  /** Everybody in this show, in seat order. */
  contestants: Contestant[];
  /** Who is still on the stage, in seat order. */
  standing: string[];
  /** Who left, and in which round. */
  out: { id: string; round: number }[];
  question: Question | null;
  /** While deciding: whom the host has picked so far. */
  selected: string | null;
  /** Whoever the host popped — set from the verdict until they are gone. */
  target: string | null;
  lastQuestion: string | null;
};

export type ShowEvent =
  | { type: 'start'; now: number; contestants?: Contestant[]; host?: { id: string; name: string } }
  | { type: 'skipIntro'; now: number }
  | { type: 'chooseRandom'; now: number }
  | { type: 'chooseOwn'; now: number }
  | { type: 'select'; id: string; now: number }
  | { type: 'pop'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'restart'; now: number; contestants?: Contestant[] }
  | { type: 'toTitle'; now: number }
  /** A contestant closed the show on their phone: they are off the stage. */
  | { type: 'drop'; id: string; now: number }
  /** A contestant's phone takes the show as the host sends it. */
  | { type: 'sync'; state: ShowState; elapsed: number; now: number }
  /** For testing only: jump to a moment inside the current phase. */
  | { type: 'seek'; ms: number; now: number }
  /** For testing only: straight into a phase. */
  | { type: 'jump'; phase: Phase; ms: number; round?: number; standing?: string[]; target?: string; now: number };
