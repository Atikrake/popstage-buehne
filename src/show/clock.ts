/**
 * The show's clock. Normally just the browser's; for testing it can be held
 * still on one moment so a single frame can be looked at closely.
 */
let held: number | null = null;

export function clock() {
  return held ?? performance.now();
}

export function holdClock(on: boolean) {
  held = on ? (held ?? performance.now()) : null;
}
