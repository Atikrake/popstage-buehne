/**
 * How much the phone is asked to do. "Hoch" adds a mirror floor and finer
 * edges; "Niedrig" drops the glow pass and the haze for older phones.
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
  low: { dpr: 1, composer: false, dust: 0, audience: 70, confetti: 240 },
  medium: { dpr: 1.5, composer: true, dust: 220, audience: 130, confetti: 420 },
  high: { dpr: 2, composer: true, dust: 420, audience: 190, confetti: 620 },
} as const;
