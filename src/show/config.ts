/** Five rounds, as in the app. One POP per round at most. */
export const TOTAL_ROUNDS = 5;

/** Talking time once the question is settled — the app's ROUND_SECONDS. */
export const ROUND_MS = 20_000;

/** How long each part of the show lasts, in milliseconds. */
export const DUR = {
  intro: 16_000,
  presentEach: 5_400,
  presentOutro: 3_400,
  roundStart: 2_800,
  /** Nobody chose: a question is drawn, as in the app. */
  chooseAuto: 10_000,
  /** How long the spotlight stays on one person while they answer. */
  autoFocus: 4_200,
  /** A tap holds the focus on somebody for this long. */
  manualFocusHold: 9_000,
  verdict: 3_900,
  pop: 2_700,
  regroup: 1_600,
  allStay: 3_000,
  finale: 9_500,
} as const;

/** When things happen inside the intro (ms from its start). */
export const INTRO = {
  /** Ceiling panels in the corridor switch on one after another. */
  corridorLightsFrom: 300,
  corridorLightStep: 170,
  /** Walking up to the studio doors. */
  walkEnd: 5_600,
  doorsOpen: 4_500,
  doorsOpenDur: 1_300,
  /** Through the doors, into the dark studio. */
  insideAt: 8_000,
  /** The studio switches on, piece by piece. */
  coveOn: 8_300,
  slatsOn: 8_700,
  spotsFrom: 9_000,
  spotStep: 190,
  ledBoot: 9_400,
  ledLogo: 10_300,
  /** The podiums come up out of the stage, one after another. */
  podiumsFrom: 10_600,
  podiumStep: 420,
  podiumRise: 900,
  balloonDelay: 500,
  balloonInflate: 700,
} as const;

export const QUESTIONS = [
  'Was ist dein\nideales erstes Date?',
  'Meer\noder Berge?',
  'Was macht dich\nsofort glücklich?',
  'Was wäre dein\nperfekter Sonntag?',
  'Was ist ein absolutes\nNo-Go beim Dating?',
  'Spontan\noder geplant?',
  'Was bringt dich\nsofort zum Lachen?',
  'Womit kann man dich\nimmer überraschen?',
  'Was war dein\npeinlichstes Date?',
  'Welcher Song beschreibt\ndich am besten?',
] as const;
