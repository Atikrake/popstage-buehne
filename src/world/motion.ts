/**
 * Gliding a value towards a goal the way a camera operator would: it speeds
 * up gently, travels, and settles without overshooting — never a jolt, even
 * when the goal jumps somewhere else halfway through a move. `time` is
 * roughly how long the move takes, in seconds. (A critically damped spring.)
 */
export function smoothDamp(current: number, goal: number, velocity: { v: number }, time: number, dt: number) {
  const omega = 2 / Math.max(0.0001, time);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - goal;
  const temp = (velocity.v + omega * change) * dt;
  velocity.v = (velocity.v - omega * temp) * exp;
  return goal + (change + temp) * exp;
}

export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** 0 → 1 with speed and acceleration both zero at either end. */
export const smoother = (t: number) => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
