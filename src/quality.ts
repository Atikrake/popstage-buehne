/**
 * How much the phone is asked to do. "Hoch" draws a sharper mirror in the
 * floor and finer edges; "Mittel" keeps the glow, soft shadows and a softer
 * mirror; "Niedrig" drops the glow pass, the shadows, the mirror and the
 * haze for older phones.
 */
export type Quality = 'low' | 'medium' | 'high';

export const QUALITY_LABEL: Record<Quality, string> = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' };

export function defaultQuality(): Quality {
  if (typeof window === 'undefined') return 'medium';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse) return cores >= 6 ? 'medium' : 'low';
  return 'medium';
}

export const QUALITY = {
  /** `shadows`: size of the spotlight's shadow map, 0 = none. `mirror`: the floor's mirror image, as a share of the screen, 0 = none. */
  low: { dpr: 1, composer: false, msaa: 0, shadows: 0, mirror: 0, dust: 0, audience: 70, confetti: 240, sparks: 0 },
  medium: { dpr: 1.5, composer: true, msaa: 2, shadows: 512, mirror: 0.25, dust: 220, audience: 130, confetti: 420, sparks: 360 },
  high: { dpr: 2, composer: true, msaa: 4, shadows: 1024, mirror: 0.5, dust: 420, audience: 190, confetti: 620, sparks: 720 },
} as const;
