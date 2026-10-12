import type { Contestant, Look } from '../show/types';

/**
 * Everything with words or pictures on it is painted on a 2D canvas and worn
 * as a texture: the LED wall, the name plates, the stand-in faces, the posters
 * in the corridor. A canvas needs no font files fetched at runtime and no
 * images from anywhere, and it stays sharp however close the camera gets.
 */

export const DISPLAY = '"Sora Variable", "Sora", "Avenir Next", "Segoe UI", system-ui, sans-serif';
export const BODY = '"Figtree Variable", "Figtree", "Avenir Next", "Segoe UI", system-ui, sans-serif';

export const PINK = '#FF2D7A';
export const PINK_SOFT = '#FF8FBC';
export const PLUM = '#14040C';

export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function hexToRgb(hex: string) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Lighter (amount > 0) or darker (amount < 0) version of a colour. */
export function shade(hex: string, amount: number) {
  const [r, g, b] = hexToRgb(hex);
  const to = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  const mixc = (c: number) => Math.round(c + (to - c) * k);
  return `rgb(${mixc(r)},${mixc(g)},${mixc(b)})`;
}

export function rgba(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** A small heart, the show's mark. */
export function heart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string) {
  const s = size / 100;
  ctx.save();
  ctx.translate(x - 50 * s, y - 45 * s);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(50, 92);
  ctx.bezierCurveTo(18, 70, 0, 50, 0, 28);
  ctx.bezierCurveTo(0, 10, 14, 0, 28, 0);
  ctx.bezierCurveTo(38, 0, 46, 6, 50, 15);
  ctx.bezierCurveTo(54, 6, 62, 0, 72, 0);
  ctx.bezierCurveTo(86, 0, 100, 10, 100, 28);
  ctx.bezierCurveTo(100, 50, 82, 70, 50, 92);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

// --- stand-in faces --------------------------------------------------------

/**
 * A stand-in for a contestant's camera: a faceless studio portrait — head,
 * hair, shoulders, lit from both sides in their colour. Deliberately not a
 * real-looking face: it holds the place a live picture takes in the app.
 */
export function drawAvatar(look: Look) {
  const W = 384;
  const H = 512;
  const { canvas, ctx } = makeCanvas(W, H);
  const cx = W / 2;

  // The backdrop: two coloured lights and a soft glow behind the head.
  const bg = ctx.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, look.light[0]);
  bg.addColorStop(1, look.light[1]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(cx - 30, 210, 10, cx, 230, 260);
  glow.addColorStop(0, 'rgba(255,255,255,0.75)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // Out-of-focus studio lights behind.
  for (let i = 0; i < 9; i += 1) {
    const x = (i * 97 + 31) % W;
    const y = 40 + ((i * 53) % 180);
    const r = 10 + ((i * 7) % 18);
    const bokeh = ctx.createRadialGradient(x, y, 0, x, y, r);
    bokeh.addColorStop(0, 'rgba(255,255,255,0.55)');
    bokeh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bokeh;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const headY = 222;
  const longBack = look.hairStyle === 'long' || look.hairStyle === 'wavy';

  // Hair that falls behind the shoulders.
  if (longBack) {
    ctx.fillStyle = shade(look.hair, -0.12);
    ctx.beginPath();
    ctx.moveTo(cx - 92, headY - 40);
    if (look.hairStyle === 'wavy') {
      ctx.bezierCurveTo(cx - 128, headY + 60, cx - 96, headY + 120, cx - 126, headY + 200);
      ctx.bezierCurveTo(cx - 140, headY + 240, cx - 100, headY + 250, cx - 80, headY + 238);
    } else {
      ctx.lineTo(cx - 108, headY + 236);
      ctx.lineTo(cx - 70, headY + 244);
    }
    ctx.lineTo(cx + 70, headY + 244);
    if (look.hairStyle === 'wavy') {
      ctx.bezierCurveTo(cx + 100, headY + 250, cx + 140, headY + 236, cx + 124, headY + 196);
      ctx.bezierCurveTo(cx + 98, headY + 120, cx + 130, headY + 60, cx + 92, headY - 40);
    } else {
      ctx.lineTo(cx + 108, headY + 236);
      ctx.lineTo(cx + 92, headY - 40);
    }
    ctx.closePath();
    ctx.fill();
  }
  if (look.hairStyle === 'curly') {
    ctx.fillStyle = shade(look.hair, -0.08);
    for (let i = 0; i < 26; i += 1) {
      const a = Math.PI * (0.92 + (i / 25) * 1.16);
      const r = 112 + (i % 3) * 8;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.86, headY - 6 + Math.sin(a) * r, 34 + (i % 4) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Shoulders and top.
  const body = ctx.createLinearGradient(0, 380, 0, H);
  body.addColorStop(0, shade(look.top, 0.08));
  body.addColorStop(1, shade(look.top, -0.25));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-10, H);
  ctx.bezierCurveTo(0, 430, 70, 392, cx - 52, 380);
  ctx.lineTo(cx + 52, 380);
  ctx.bezierCurveTo(W - 70, 392, W, 430, W + 10, H);
  ctx.closePath();
  ctx.fill();

  // Neck, in the shade of the jaw.
  const neck = ctx.createLinearGradient(0, headY + 70, 0, 400);
  neck.addColorStop(0, shade(look.skin, -0.32));
  neck.addColorStop(1, shade(look.skin, -0.12));
  ctx.fillStyle = neck;
  ctx.beginPath();
  ctx.moveTo(cx - 34, headY + 60);
  ctx.lineTo(cx - 38, 392);
  ctx.quadraticCurveTo(cx, 414, cx + 38, 392);
  ctx.lineTo(cx + 34, headY + 60);
  ctx.closePath();
  ctx.fill();
  // The neckline.
  ctx.fillStyle = shade(look.top, -0.06);
  ctx.beginPath();
  ctx.moveTo(cx - 52, 380);
  ctx.quadraticCurveTo(cx, 430, cx + 52, 380);
  ctx.quadraticCurveTo(cx, 412, cx - 52, 380);
  ctx.fill();

  // Ears.
  ctx.fillStyle = shade(look.skin, -0.1);
  ctx.beginPath();
  ctx.ellipse(cx - 76, headY + 6, 13, 22, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 76, headY + 6, 13, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head, lit from the left.
  const face = ctx.createRadialGradient(cx - 26, headY - 30, 10, cx, headY, 120);
  face.addColorStop(0, shade(look.skin, 0.16));
  face.addColorStop(0.6, look.skin);
  face.addColorStop(1, shade(look.skin, -0.2));
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(cx, headY, 74, 94, 0, 0, Math.PI * 2);
  ctx.fill();
  // Soft cheek warmth.
  ctx.fillStyle = 'rgba(255,120,140,0.12)';
  ctx.beginPath();
  ctx.ellipse(cx - 38, headY + 26, 20, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 38, headY + 26, 20, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (look.beard) {
    ctx.fillStyle = rgba(look.hair, 0.85);
    ctx.beginPath();
    ctx.moveTo(cx - 72, headY + 8);
    ctx.bezierCurveTo(cx - 70, headY + 80, cx - 34, headY + 100, cx, headY + 102);
    ctx.bezierCurveTo(cx + 34, headY + 100, cx + 70, headY + 80, cx + 72, headY + 8);
    ctx.bezierCurveTo(cx + 56, headY + 40, cx + 30, headY + 52, cx, headY + 52);
    ctx.bezierCurveTo(cx - 30, headY + 52, cx - 56, headY + 40, cx - 72, headY + 8);
    ctx.fill();
  }

  // Hair on top.
  const hair = ctx.createLinearGradient(cx - 90, headY - 110, cx + 90, headY);
  hair.addColorStop(0, shade(look.hair, 0.22));
  hair.addColorStop(1, look.hair);
  ctx.fillStyle = hair;
  ctx.beginPath();
  switch (look.hairStyle) {
    case 'short':
      ctx.moveTo(cx - 78, headY - 4);
      ctx.bezierCurveTo(cx - 86, headY - 92, cx - 30, headY - 112, cx + 6, headY - 108);
      ctx.bezierCurveTo(cx + 62, headY - 104, cx + 86, headY - 70, cx + 78, headY - 4);
      ctx.bezierCurveTo(cx + 70, headY - 46, cx + 30, headY - 62, cx - 6, headY - 60);
      ctx.bezierCurveTo(cx - 44, headY - 58, cx - 70, headY - 42, cx - 78, headY - 4);
      break;
    case 'swept':
      ctx.moveTo(cx - 80, headY + 4);
      ctx.bezierCurveTo(cx - 96, headY - 96, cx - 20, headY - 132, cx + 40, headY - 118);
      ctx.bezierCurveTo(cx + 96, headY - 100, cx + 92, headY - 40, cx + 80, headY + 2);
      ctx.bezierCurveTo(cx + 70, headY - 50, cx + 20, headY - 50, cx - 20, headY - 64);
      ctx.bezierCurveTo(cx - 52, headY - 50, cx - 72, headY - 30, cx - 80, headY + 4);
      break;
    case 'bun':
    case 'curly':
      ctx.moveTo(cx - 78, headY - 2);
      ctx.bezierCurveTo(cx - 84, headY - 100, cx + 84, headY - 100, cx + 78, headY - 2);
      ctx.bezierCurveTo(cx + 60, headY - 52, cx - 60, headY - 52, cx - 78, headY - 2);
      break;
    case 'long':
      // Straight, with a fringe.
      ctx.moveTo(cx - 84, headY + 40);
      ctx.bezierCurveTo(cx - 92, headY - 100, cx + 92, headY - 100, cx + 84, headY + 40);
      ctx.lineTo(cx + 70, headY + 40);
      ctx.bezierCurveTo(cx + 70, headY - 20, cx + 60, headY - 34, cx + 40, headY - 40);
      ctx.lineTo(cx - 40, headY - 40);
      ctx.bezierCurveTo(cx - 60, headY - 34, cx - 70, headY - 20, cx - 70, headY + 40);
      break;
    case 'wavy':
      // Side parting.
      ctx.moveTo(cx - 86, headY + 50);
      ctx.bezierCurveTo(cx - 96, headY - 90, cx - 10, headY - 118, cx + 30, headY - 104);
      ctx.bezierCurveTo(cx + 90, headY - 86, cx + 96, headY - 10, cx + 84, headY + 50);
      ctx.bezierCurveTo(cx + 72, headY - 10, cx + 60, headY - 50, cx + 20, headY - 62);
      ctx.bezierCurveTo(cx - 30, headY - 40, cx - 66, headY - 10, cx - 86, headY + 50);
      break;
  }
  ctx.fill();
  if (look.hairStyle === 'curly') {
    ctx.fillStyle = look.hair;
    for (let i = 0; i < 12; i += 1) {
      const a = Math.PI * (1.08 + (i / 11) * 0.84);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 70, headY - 18 + Math.sin(a) * 86, 22 + (i % 3) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (look.hairStyle === 'bun') {
    ctx.beginPath();
    ctx.arc(cx, headY - 112, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rim light from the right, in their colour.
  ctx.globalCompositeOperation = 'lighter';
  const rim = ctx.createLinearGradient(W * 0.55, 0, W, 0);
  rim.addColorStop(0, 'rgba(255,255,255,0)');
  rim.addColorStop(1, rgba(look.light[1].length === 7 ? look.light[1] : '#ffffff', 0.22));
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  // A gentle vignette, like a webcam.
  const vignette = ctx.createRadialGradient(cx, H * 0.48, H * 0.3, cx, H * 0.5, H * 0.72);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(20,4,12,0.32)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  return canvas;
}

// --- name plates ------------------------------------------------------------

export function drawNamePlate(c: Contestant) {
  const { canvas, ctx } = makeCanvas(512, 136);
  ctx.fillStyle = '#0E0A0D';
  ctx.fillRect(0, 0, 512, 136);
  ctx.fillStyle = c.color;
  ctx.fillRect(0, 0, 12, 136);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 64px ${DISPLAY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(c.name.toUpperCase(), 40, 76);
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.font = `600 26px ${BODY}`;
  ctx.fillText(`${c.age} · ${c.persona.toUpperCase()}`, 42, 114);
  heart(ctx, 462, 66, 46, c.color);
  return canvas;
}

/** The small red "LIVE" tag in the corner of each monitor. */
export function drawLiveTag() {
  const { canvas, ctx } = makeCanvas(160, 56);
  roundRect(ctx, 2, 2, 156, 52, 26);
  ctx.fillStyle = 'rgba(12,6,10,0.78)';
  ctx.fill();
  ctx.fillStyle = '#FF2B4A';
  ctx.beginPath();
  ctx.arc(30, 28, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 26px ${DISPLAY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('LIVE', 52, 29);
  return canvas;
}

// --- the LED wall ---------------------------------------------------------------

export type LedView =
  | { kind: 'off' }
  | { kind: 'boot'; progress: number }
  | { kind: 'logo' }
  | { kind: 'host'; name: string }
  /** `anchor`: the point on the wall (in metres from its middle) the profile is centred on — above the person. */
  | { kind: 'profile'; contestant: Contestant; index: number; total: number; progress: number; anchor: number }
  | { kind: 'lineup'; contestants: Contestant[] }
  | { kind: 'round'; round: number; total: number }
  | { kind: 'choose'; round: number; total: number }
  | {
      kind: 'question';
      round: number;
      total: number;
      text: string | null;
      /** Whose turn it is to answer, and how much of it is left. */
      turn: { name: string; color: string; seconds: number; fraction: number; index: number; count: number } | null;
    }
  | { kind: 'decide'; round: number; total: number }
  | { kind: 'verdict'; round: number; total: number }
  | { kind: 'out'; contestant: Contestant }
  | { kind: 'winner'; contestants: Contestant[] }
  | { kind: 'empty' };

/**
 * What makes one LED picture different from another. The wall is only
 * repainted when this changes — painting a canvas with glows and uploading it
 * to the graphics card is far too costly to do on every frame.
 */
export function ledKey(view: LedView): string {
  switch (view.kind) {
    case 'boot':
      return `boot-${Math.floor(view.progress * 10)}`;
    case 'profile': {
      const chips = view.contestant.vibes.filter((_, index) => view.progress > 0.1 + index * 0.07).length;
      return `profile-${view.contestant.id}-${chips}-${view.progress > 0.28 ? 1 : 0}-${view.anchor.toFixed(2)}`;
    }
    case 'question':
      return `question-${view.round}-${view.text}-${view.turn ? `${view.turn.name}-${view.turn.seconds}` : ''}`;
    case 'host':
      return `host-${view.name}`;
    case 'lineup':
    case 'winner':
      return `${view.kind}-${view.contestants.map((c) => c.id).join(',')}`;
    case 'out':
      return `out-${view.contestant.id}`;
    case 'round':
    case 'choose':
    case 'decide':
    case 'verdict':
      return `${view.kind}-${view.round}`;
    default:
      return view.kind;
  }
}

function ledBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number, tint = PINK) {
  const bg = ctx.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H / 2, W * 0.75);
  bg.addColorStop(0, '#3B0B27');
  bg.addColorStop(0.55, '#1C0613');
  bg.addColorStop(1, '#0A0207');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // A floor grid running away to the horizon.
  const horizon = H * 0.58;
  ctx.save();
  ctx.strokeStyle = rgba(tint, 0.22);
  ctx.lineWidth = 2;
  for (let i = -12; i <= 12; i += 1) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 26, horizon);
    ctx.lineTo(W / 2 + i * 150, H);
    ctx.stroke();
  }
  for (let i = 1; i < 10; i += 1) {
    const k = i / 9;
    const y = horizon + (H - horizon) * k * k;
    ctx.globalAlpha = 0.25 + k * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();
  // Horizon glow.
  const line = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 40);
  line.addColorStop(0, rgba(tint, 0));
  line.addColorStop(0.5, rgba(tint, 0.32));
  line.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = line;
  ctx.fillRect(0, horizon - 40, W, 80);
}

function ledTopBar(ctx: CanvasRenderingContext2D, W: number, right: string) {
  ctx.save();
  ctx.font = `700 22px ${DISPLAY}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FF2B4A';
  ctx.beginPath();
  ctx.arc(46, 40, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('LIVE  ·  POPSTAGE  ·  STUDIO 3', 64, 41);
  ctx.textAlign = 'right';
  ctx.fillText(right, W - 40, 41);
  ctx.restore();
}

function glowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, glow: string, blur = 28) {
  ctx.save();
  ctx.font = font;
  ctx.shadowColor = glow;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, filled = false) {
  ctx.save();
  ctx.font = `700 24px ${BODY}`;
  const w = ctx.measureText(text).width + 40;
  roundRect(ctx, x, y - 22, w, 44, 22);
  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.fillStyle = rgba(color, 0.16);
    ctx.fill();
    ctx.strokeStyle = rgba(color, 0.7);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.fillStyle = filled ? '#14040C' : '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 20, y + 1);
  ctx.restore();
  return w;
}

function wordmark(ctx: CanvasRenderingContext2D, cx: number, y: number, size: number) {
  ctx.save();
  ctx.font = `800 ${size}px ${DISPLAY}`;
  ctx.textBaseline = 'alphabetic';
  const pop = 'POP';
  const stage = 'STAGE';
  const w1 = ctx.measureText(pop).width;
  const w2 = ctx.measureText(stage).width;
  const x = cx - (w1 + w2) / 2;
  glowText(ctx, pop, x, y, ctx.font, '#FFFFFF', 'rgba(255,255,255,0.6)', 30);
  glowText(ctx, stage, x + w1, y, ctx.font, PINK, rgba(PINK, 0.9), 40);
  ctx.restore();
}

/** Two lines at most, in the largest size that fits. */
function fitLines(ctx: CanvasRenderingContext2D, text: string, width: number, from: number, to: number) {
  const clean = text.replace(/\s*\n\s*/g, ' ');
  let size = from;
  let lines: string[] = [];
  for (size = from; size >= to; size -= 4) {
    ctx.font = `800 ${size}px ${DISPLAY}`;
    lines = wrap(ctx, clean, width);
    if (lines.length <= 2) break;
  }
  return { size, lines: lines.slice(0, 2) };
}

/** Paints one moment of the LED wall. */
export function drawLed(ctx: CanvasRenderingContext2D, W: number, H: number, view: LedView) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (view.kind === 'off') {
    ctx.fillStyle = '#050204';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    return;
  }

  if (view.kind === 'boot') {
    ctx.fillStyle = '#050204';
    ctx.fillRect(0, 0, W, H);
    // Coloured bars sweeping in, then noise.
    const bars = ['#FFFFFF', '#FFE14D', '#4DE8FF', '#4DFF8C', '#FF4DE8', '#FF2D7A', '#4D6BFF'];
    const shown = Math.min(1, view.progress * 1.6);
    bars.forEach((color, index) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect((index * W) / bars.length, 0, (W / bars.length) * shown, H * 0.72);
    });
    ctx.globalAlpha = 1;
    for (let i = 0; i < 700; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 3, 3);
    }
    ctx.restore();
    return;
  }

  const tint =
    view.kind === 'out' ? view.contestant.color : view.kind === 'profile' ? view.contestant.color : view.kind === 'winner' ? '#FFC23D' : PINK;
  ledBackdrop(ctx, W, H, tint);

  switch (view.kind) {
    case 'logo': {
      ledTopBar(ctx, W, 'HEUTE LIVE');
      heart(ctx, W / 2, H * 0.3, 92, PINK);
      wordmark(ctx, W / 2, H * 0.6, 132);
      ctx.textAlign = 'center';
      ctx.font = `600 30px ${BODY}`;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('Die Dating-Show  ·  Wer bleibt bis zum Schluss?', W / 2, H * 0.74);
      break;
    }
    case 'host': {
      ledTopBar(ctx, W, 'DEIN HOST');
      ctx.textAlign = 'center';
      ctx.font = `800 30px ${DISPLAY}`;
      ctx.fillStyle = PINK;
      ctx.fillText('HEUTE FÜHRT DURCH DIE SHOW', W / 2, 160);
      glowText(ctx, view.name.toUpperCase(), W / 2, 300, `800 140px ${DISPLAY}`, '#FFFFFF', rgba(PINK, 0.9), 44);
      ctx.font = `600 32px ${BODY}`;
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.fillText('Stellt die Fragen  ·  entscheidet, wer geht', W / 2, 372);
      break;
    }
    case 'profile': {
      const c = view.contestant;
      ledTopBar(ctx, W, `KANDIDAT ${view.index + 1} VON ${view.total}`);
      // A card-sized block above wherever the person stands, kept to the
      // upper part of the wall: the balloons float in front of the lower part.
      const BW = 520;
      const x = Math.min(W - 40 - BW, Math.max(40, W / 2 + (view.anchor / 7.8) * W - BW / 2));
      ctx.font = `800 22px ${DISPLAY}`;
      ctx.fillStyle = c.color;
      ctx.fillText(`KANDIDAT ${view.index + 1}`, x, 108);
      glowText(ctx, c.name.toUpperCase(), x - 4, 198, `800 100px ${DISPLAY}`, '#FFFFFF', rgba(c.color, 0.85), 32);
      ctx.font = `700 32px ${BODY}`;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      const ageText = c.age ? `${c.age} Jahre` : '';
      ctx.fillText(ageText, x, 252);
      let cx = x + (ageText ? ctx.measureText(ageText).width + 20 : 0);
      chip(ctx, c.persona, cx, 241, c.color, true);
      cx = x;
      c.vibes.forEach((vibe, index) => {
        if (view.progress > 0.1 + index * 0.07) cx += chip(ctx, vibe, cx, 306, c.color) + 12;
      });
      if (view.progress > 0.28 && c.bio) {
        ctx.font = `500 27px ${BODY}`;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        wrap(ctx, `„${c.bio}“`, BW).slice(0, 2).forEach((line, index) => ctx.fillText(line, x, 364 + index * 36));
      }
      break;
    }
    case 'lineup': {
      ledTopBar(ctx, W, 'DIE KANDIDATEN');
      ctx.textAlign = 'center';
      glowText(ctx, 'DAS SIND EURE', W / 2, 150, `800 50px ${DISPLAY}`, '#FFFFFF', 'rgba(255,255,255,0.5)');
      glowText(ctx, 'KANDIDATEN', W / 2, 236, `800 96px ${DISPLAY}`, PINK, rgba(PINK, 0.9), 40);
      ctx.textAlign = 'left';
      ctx.font = `700 32px ${BODY}`;
      const names = view.contestants;
      const widths = names.map((c) => ctx.measureText(c.name).width + 54);
      let x = (W - widths.reduce((a, b) => a + b, 0)) / 2;
      names.forEach((c, index) => {
        heart(ctx, x + 14, 316, 26, c.color);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(c.name, x + 34, 328);
        x += widths[index];
      });
      break;
    }
    case 'round': {
      ledTopBar(ctx, W, `RUNDE ${view.round} / ${view.total}`);
      ctx.textAlign = 'center';
      ctx.font = `800 36px ${DISPLAY}`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('RUNDE', W / 2, 130);
      glowText(ctx, String(view.round), W / 2, 330, `800 230px ${DISPLAY}`, '#FFFFFF', rgba(PINK, 0.95), 60);
      ctx.font = `600 30px ${BODY}`;
      ctx.fillStyle = PINK_SOFT;
      ctx.fillText(view.round === view.total ? 'Das Finale um den Sieg' : `von ${view.total}  ·  einer muss gehen`, W / 2, 384);
      break;
    }
    case 'choose': {
      ledTopBar(ctx, W, `RUNDE ${view.round} / ${view.total}`);
      ctx.textAlign = 'center';
      glowText(ctx, 'DER HOST WÄHLT', W / 2, 190, `800 62px ${DISPLAY}`, '#FFFFFF', 'rgba(255,255,255,0.4)');
      glowText(ctx, 'DIE FRAGE', W / 2, 276, `800 84px ${DISPLAY}`, PINK, rgba(PINK, 0.9), 36);
      break;
    }
    case 'question': {
      ledTopBar(ctx, W, `RUNDE ${view.round} / ${view.total}`);
      // Centred and kept high: the balloons float in front of the lower part.
      const BW = 540;
      ctx.textAlign = 'center';
      ctx.font = `800 22px ${DISPLAY}`;
      ctx.fillStyle = PINK;
      ctx.fillText(view.text ? 'DIE FRAGE' : 'DER HOST FRAGT SELBST', W / 2, 100);
      const { size, lines } = fitLines(ctx, view.text ?? 'Hört genau zu!', BW, 54, 34);
      lines.forEach((line, index) =>
        glowText(ctx, line, W / 2, 158 + index * (size + 8), `800 ${size}px ${DISPLAY}`, '#FFFFFF', 'rgba(255,255,255,0.35)', 18),
      );
      const turn = view.turn;
      if (turn) {
        // Whose turn, and their ten seconds as a bar that empties.
        const y = 158 + lines.length * (size + 8) + 4;
        ctx.font = `800 30px ${DISPLAY}`;
        ctx.fillStyle = turn.color;
        ctx.fillText(`${turn.name.toUpperCase()} ANTWORTET  ·  ${turn.index + 1}/${turn.count}`, W / 2, y);
        const barY = y + 22;
        roundRect(ctx, W / 2 - BW / 2, barY, BW, 14, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
        roundRect(ctx, W / 2 - BW / 2, barY, Math.max(14, BW * turn.fraction), 14, 7);
        const urgent = turn.seconds <= 3;
        ctx.fillStyle = urgent ? '#FF3B4E' : turn.color;
        ctx.fill();
        glowText(ctx, `0:${String(turn.seconds).padStart(2, '0')}`, W / 2, barY + 56, `800 38px ${DISPLAY}`, urgent ? '#FF6B7A' : '#FFFFFF', urgent ? '#FF3B4E' : rgba(turn.color, 0.6), 14);
      }
      break;
    }
    case 'decide': {
      ledTopBar(ctx, W, `RUNDE ${view.round} / ${view.total}`);
      ctx.textAlign = 'center';
      ctx.font = `800 26px ${DISPLAY}`;
      ctx.fillStyle = PINK_SOFT;
      ctx.fillText('ALLE HABEN GEANTWORTET', W / 2, 140);
      glowText(ctx, 'WEN POPPT', W / 2, 236, `800 92px ${DISPLAY}`, '#FFFFFF', 'rgba(255,255,255,0.5)', 30);
      glowText(ctx, 'DER HOST?', W / 2, 334, `800 92px ${DISPLAY}`, PINK, rgba(PINK, 1), 44);
      break;
    }
    case 'verdict': {
      ledTopBar(ctx, W, `RUNDE ${view.round} / ${view.total}`);
      ctx.textAlign = 'center';
      glowText(ctx, 'WER MUSS', W / 2, 220, `800 104px ${DISPLAY}`, '#FFFFFF', 'rgba(255,255,255,0.5)', 30);
      glowText(ctx, 'GEHEN?', W / 2, 342, `800 128px ${DISPLAY}`, PINK, rgba(PINK, 1), 48);
      break;
    }
    case 'out': {
      const c = view.contestant;
      ledTopBar(ctx, W, 'POP!');
      ctx.textAlign = 'center';
      glowText(ctx, c.name.toUpperCase(), W / 2, 250, `800 150px ${DISPLAY}`, '#FFFFFF', rgba(c.color, 0.9), 44);
      glowText(ctx, 'MUSS GEHEN', W / 2, 340, `800 62px ${DISPLAY}`, c.color, rgba(c.color, 0.9), 30);
      break;
    }
    case 'winner': {
      ledTopBar(ctx, W, 'FINALE');
      ctx.textAlign = 'center';
      ctx.font = `800 40px ${DISPLAY}`;
      ctx.fillStyle = '#FFD36E';
      ctx.fillText('GEWONNEN HAT', W / 2, 140);
      const name = view.contestants[0]?.name.toUpperCase() ?? '';
      glowText(ctx, name, W / 2, 310, `800 ${name.length > 7 ? 130 : 170}px ${DISPLAY}`, '#FFFFFF', 'rgba(255,200,80,0.95)', 56);
      for (let i = 0; i < 9; i += 1) heart(ctx, 80 + i * 108, 380, 34, i % 2 ? '#FFC23D' : PINK);
      break;
    }
    case 'empty': {
      ledTopBar(ctx, W, 'FINALE');
      ctx.textAlign = 'center';
      glowText(ctx, 'DIE BÜHNE', W / 2, 240, `800 100px ${DISPLAY}`, '#FFFFFF', 'rgba(255,255,255,0.4)', 24);
      glowText(ctx, 'IST LEER', W / 2, 350, `800 100px ${DISPLAY}`, PINK, rgba(PINK, 0.9), 36);
      break;
    }
  }

  // Scanlines and a soft edge, so it reads as a screen and not a sticker.
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  const edge = ctx.createRadialGradient(W / 2, H / 2, H * 0.5, W / 2, H / 2, W * 0.62);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// --- the host's screens --------------------------------------------------------

export type HostScreenView = { kicker: string; line: string; seconds: number | null; urgent: boolean };

export function hostScreenKey(view: HostScreenView) {
  return `${view.kicker}|${view.line}|${view.seconds}|${view.urgent}`;
}

/**
 * The bar laid over the host's picture on both desk monitors: the round and
 * what is happening, and the clock while somebody answers. Transparent
 * everywhere else, so the picture shows through.
 */
export function drawHostOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, view: HostScreenView) {
  ctx.clearRect(0, 0, W, H);
  const bar = ctx.createLinearGradient(0, H * 0.62, 0, H);
  bar.addColorStop(0, 'rgba(20,4,12,0)');
  bar.addColorStop(0.45, 'rgba(20,4,12,0.78)');
  bar.addColorStop(1, 'rgba(20,4,12,0.92)');
  ctx.fillStyle = bar;
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
  roundRect(ctx, 22, 20, 128, 42, 21);
  ctx.fillStyle = PINK;
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 22px ${DISPLAY}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('● HOST', 40, 42);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 30px ${DISPLAY}`;
  const lines = wrap(ctx, view.line, view.seconds !== null ? W - 170 : W - 48).slice(0, 2);
  ctx.font = `800 22px ${DISPLAY}`;
  ctx.fillStyle = PINK_SOFT;
  ctx.fillText(view.kicker.toUpperCase(), 24, H - 30 - lines.length * 36);
  ctx.font = `800 30px ${DISPLAY}`;
  ctx.fillStyle = '#FFFFFF';
  lines.forEach((line, index) => ctx.fillText(line, 24, H - 26 - (lines.length - 1 - index) * 36));
  if (view.seconds !== null) {
    ctx.textAlign = 'right';
    ctx.font = `800 54px ${DISPLAY}`;
    ctx.fillStyle = view.urgent ? '#FF3B4E' : '#FFFFFF';
    ctx.fillText(`0:${String(view.seconds).padStart(2, '0')}`, W - 22, H - 26);
    ctx.textAlign = 'left';
  }
}

// --- the corridor ---------------------------------------------------------------

export function drawPoster(kind: 0 | 1 | 2) {
  const { canvas, ctx } = makeCanvas(512, 768);
  const bg = ctx.createLinearGradient(0, 0, 512, 768);
  if (kind === 0) {
    bg.addColorStop(0, '#FF2D7A');
    bg.addColorStop(1, '#7A0F45');
  } else if (kind === 1) {
    bg.addColorStop(0, '#1A0612');
    bg.addColorStop(1, '#3B0B27');
  } else {
    bg.addColorStop(0, '#FFE3EF');
    bg.addColorStop(1, '#FF8FBC');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 768);
  ctx.textAlign = 'center';
  if (kind === 0) {
    heart(ctx, 256, 270, 250, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 86px ${DISPLAY}`;
    ctx.fillText('POP', 256, 520);
    ctx.fillText('STAGE', 256, 606);
    ctx.font = `700 28px ${BODY}`;
    ctx.fillText('STAFFEL 1 · JEDEN ABEND LIVE', 256, 686);
  } else if (kind === 1) {
    ctx.fillStyle = PINK;
    ctx.font = `800 70px ${DISPLAY}`;
    ['WER', 'BLEIBT?', 'WER', 'GEHT?'].forEach((line, index) => {
      ctx.fillStyle = index % 2 ? '#FFFFFF' : PINK;
      ctx.fillText(line, 256, 200 + index * 100);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `600 30px ${BODY}`;
    ctx.fillText('Der Host entscheidet.', 256, 640);
  } else {
    ctx.fillStyle = '#7A0F45';
    ctx.font = `800 64px ${DISPLAY}`;
    ctx.fillText('STUDIO 3', 256, 140);
    for (let i = 0; i < 5; i += 1) heart(ctx, 96 + i * 80, 330, 64, i === 2 ? PINK : '#FFFFFF');
    ctx.font = `800 46px ${DISPLAY}`;
    ctx.fillText('5 KANDIDATEN', 256, 500);
    ctx.fillText('5 RUNDEN', 256, 566);
    ctx.fillText('1 HOST', 256, 632);
  }
  return canvas;
}

export function drawSign(text: string, sub: string) {
  const { canvas, ctx } = makeCanvas(1024, 256);
  ctx.fillStyle = '#0E0A0D';
  ctx.fillRect(0, 0, 1024, 256);
  ctx.textAlign = 'center';
  glowText(ctx, text, 512, 150, `800 120px ${DISPLAY}`, '#FFFFFF', rgba(PINK, 0.8), 30);
  ctx.font = `700 34px ${BODY}`;
  ctx.fillStyle = PINK_SOFT;
  ctx.fillText(sub, 512, 214);
  return canvas;
}

export function drawOnAir() {
  const { canvas, ctx } = makeCanvas(512, 160);
  ctx.fillStyle = '#2A0408';
  ctx.fillRect(0, 0, 512, 160);
  ctx.textAlign = 'center';
  glowText(ctx, 'ON AIR', 256, 112, `800 96px ${DISPLAY}`, '#FFE9EC', 'rgba(255,40,60,1)', 40);
  return canvas;
}

/** A soft round spot of light, for pools on the floor and glows. */
export function drawGlow(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const { canvas, ctx } = makeCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return canvas;
}
