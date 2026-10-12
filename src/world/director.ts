import * as THREE from 'three';
import { DUR, INTRO, roundsFor, TURN_MS } from '../show/config';
import { currentTurn, elapsedOf, presentSlot, spotlightOn, VERDICT_LAND_MS } from '../show/timeline';
import type { Contestant, ShowState } from '../show/types';
import type { HostScreenView, LedView } from './canvasArt';
import {
  answerShot,
  contestantShot,
  fovToFit,
  hostShot,
  PODIUM,
  presentShot,
  reverseShot,
  seatMap,
  type Seat,
  type Shot,
  STAGE_CENTER,
  STAGE_TOP,
  TRUSS,
  wideShot,
} from './layout';

/**
 * The director's desk: for any state and moment, what the camera sees, which
 * lights are on, where the moving heads point and what the screens say.
 *
 * Pure: the same state and time always give the same picture. Nothing in
 * here is remembered between frames — that is what lets a phone that joins
 * late, or a phone whose clock runs a little differently, show the same show.
 */

export type SpotCue = { aim: THREE.Vector3; level: number; color: THREE.Color; snap: boolean };

export type Cues = {
  shot: Shot;
  /** Roughly how many seconds the camera takes to arrive at its shot; 0 cuts. */
  ease: number;
  /** Small handheld drift, as on a real studio camera. */
  handheld: number;
  /** Overall studio light, 0 dark … 1 full. */
  house: number;
  cove: number;
  slats: number;
  stageEdge: number;
  ledPower: number;
  led: LedView;
  host: HostScreenView;
  corridorLights: number;
  doorOpen: number;
  /** Per seat index, during the intro: the podium coming up, the balloon filling. */
  rise: (seatIndex: number) => number;
  inflate: (seatIndex: number) => number;
  spots: SpotCue[];
  /** Who is in the light, if anybody, and how dim everybody else is. */
  focusId: string | null;
  othersDim: number;
  /** The real spotlight jumps instead of travelling (the verdict's hunt). */
  focusSnap: boolean;
  /** The host's desk in the light: presenting the host, asking the question. */
  hostLit: number;
  applause: number;
  /** A white flash through the room, 0 … 1. */
  flash: number;
  /** The last seconds of a turn: the room pulses with the clock. */
  clockPulse: number;
  /** Balloons bouncing for joy. */
  bounce: number;
  /** The one being sent off and how far along: 0 → 1 over the pop phase. */
  popId: string | null;
  popT: number;
  confettiRain: number;
  gold: number;
  seats: Map<string, Seat>;
};

const WHITE = new THREE.Color('#FFF2F7');
const PINK = new THREE.Color('#FF4F98');
const GOLD = new THREE.Color('#FFD27A');
const RED = new THREE.Color('#FF3355');

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number) => 1 - Math.pow(1 - THREE.MathUtils.clamp(t, 0, 1), 3);

/** Lights come on with a little flicker, like real ones. */
function switchOn(t: number, at: number) {
  if (t < at) return 0;
  const d = t - at;
  if (d < 60) return 0.8;
  if (d < 110) return 0.15;
  if (d < 170) return 1;
  if (d < 210) return 0.5;
  return 1;
}

/** The moving heads hang around the truss ring. */
export function headPosition(index: number) {
  const angle = (index / TRUSS.heads) * Math.PI * 2 + Math.PI / TRUSS.heads;
  return new THREE.Vector3(
    TRUSS.center.x + Math.sin(angle) * TRUSS.radius,
    TRUSS.center.y - 0.35,
    TRUSS.center.z + Math.cos(angle) * TRUSS.radius,
  );
}
const HEADS = Array.from({ length: TRUSS.heads }, (_, index) => headPosition(index));
const HOST_AIM = new THREE.Vector3(0, 0.02, 6.4);

/** The heads best placed to light somebody from the front. */
function headsFor(s: Seat) {
  const front = s.position.clone().addScaledVector(s.facing, 4);
  return HEADS.map((head, index) => ({ index, d: head.distanceToSquared(front) }))
    .sort((a, b) => a.d - b.d)
    .map((one) => one.index);
}

/** The heads nearest the host's desk. */
const HOST_HEADS = HEADS.map((head, index) => ({ index, d: head.distanceToSquared(HOST_AIM) }))
  .sort((a, b) => a.d - b.d)
  .map((one) => one.index);

function sweepAim(index: number, t: number, speed = 1, spread = 1) {
  const a = t * 0.0009 * speed + index * 0.78;
  return new THREE.Vector3(
    STAGE_CENTER.x + Math.sin(a) * 4.2 * spread,
    STAGE_TOP,
    STAGE_CENTER.z + Math.cos(a * 1.3) * 2.6 * spread + 1,
  );
}

function aimAt(s: Seat) {
  return s.position.clone().setY(STAGE_TOP);
}

function pathAt(keys: { at: number; p: THREE.Vector3 }[], t: number) {
  if (t <= keys[0].at) return keys[0].p.clone();
  for (let i = 0; i < keys.length - 1; i += 1) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b.at) {
      // Catmull-Rom through the neighbours, so the move never kinks at a key.
      const p0 = keys[Math.max(0, i - 1)].p;
      const p3 = keys[Math.min(keys.length - 1, i + 2)].p;
      const u = (t - a.at) / (b.at - a.at);
      const k = u * u * (3 - 2 * u);
      const k2 = k * k;
      const k3 = k2 * k;
      const axis = (q0: number, q1: number, q2: number, q3: number) =>
        0.5 * (2 * q1 + (-q0 + q2) * k + (2 * q0 - 5 * q1 + 4 * q2 - q3) * k2 + (-q0 + 3 * q1 - 3 * q2 + q3) * k3);
      return new THREE.Vector3(axis(p0.x, a.p.x, b.p.x, p3.x), axis(p0.y, a.p.y, b.p.y, p3.y), axis(p0.z, a.p.z, b.p.z, p3.z));
    }
  }
  return keys[keys.length - 1].p.clone();
}

function introShot(t: number, aspect: number): Shot {
  const host = hostShot(aspect);
  const positions = [
    { at: 0, p: new THREE.Vector3(0, 1.62, 41) },
    { at: INTRO.walkEnd, p: new THREE.Vector3(0, 1.66, 19.4) },
    { at: 6_900, p: new THREE.Vector3(0, 1.72, 15.6) },
    { at: 8_300, p: new THREE.Vector3(0, 2.2, 12.6) },
    { at: 10_600, p: new THREE.Vector3(-4.4, 6.6, 10.4) },
    { at: 13_000, p: new THREE.Vector3(3.4, 5.4, 10.8) },
    { at: 15_000, p: host.position.clone() },
    { at: 16_000, p: host.position.clone() },
  ];
  const targets = [
    { at: 0, p: new THREE.Vector3(0, 1.6, 20) },
    { at: INTRO.walkEnd, p: new THREE.Vector3(0, 1.75, 4) },
    { at: 6_900, p: new THREE.Vector3(0, 2.2, 0) },
    { at: 8_300, p: new THREE.Vector3(0, 2.6, -3.6) },
    { at: 10_600, p: new THREE.Vector3(0, 1.6, -3.4) },
    { at: 13_000, p: new THREE.Vector3(0, 1.9, -3.8) },
    { at: 15_000, p: host.target.clone() },
    { at: 16_000, p: host.target.clone() },
  ];
  const position = pathAt(positions, t);
  const target = pathAt(targets, t);
  if (t < INTRO.walkEnd) {
    // Footsteps.
    position.y += Math.sin(t * 0.0105) * 0.024;
    position.x += Math.sin(t * 0.00525) * 0.035;
  }
  const fov = t < 8_000 ? 60 : THREE.MathUtils.lerp(60, host.fov, smooth(8_000, 15_000, t));
  return { position, target, fov };
}

function centroid(seats: Seat[]) {
  const c = new THREE.Vector3();
  seats.forEach((s) => c.add(s.position));
  return seats.length ? c.multiplyScalar(1 / seats.length) : STAGE_CENTER.clone().setY(STAGE_TOP);
}

const byId = (state: ShowState, id: string | null) => state.contestants.find((c) => c.id === id) ?? null;

export function computeCues(state: ShowState, now: number, aspect: number): Cues {
  const t = elapsedOf(state, now);
  const seats = seatMap(state.standing);
  const seatList = state.standing.map((id) => seats.get(id)!);
  const total = roundsFor(state.contestants.length);
  const round = Math.min(state.round, total);

  const spots: SpotCue[] = HEADS.map((_, index) => ({ aim: sweepAim(index, now), level: 0.55, color: WHITE.clone(), snap: false }));
  const cues: Cues = {
    shot: hostShot(aspect),
    ease: 1.2,
    handheld: 1,
    house: 1,
    cove: 1,
    slats: 1,
    stageEdge: 1,
    ledPower: 1,
    led: { kind: 'logo' },
    host: { kicker: `Runde ${round} von ${total}`, line: 'Die Show läuft', seconds: null, urgent: false },
    corridorLights: 99,
    // Closed again once everybody is in: behind the host is the entrance, not a hole.
    doorOpen: 0,
    rise: () => 1,
    inflate: () => 1,
    spots,
    focusId: null,
    othersDim: 1,
    focusSnap: false,
    hostLit: 0,
    applause: 0,
    flash: 0,
    clockPulse: 0,
    bounce: 0,
    popId: null,
    popT: 0,
    confettiRain: 0,
    gold: 0,
    seats,
  };

  /** Puts the two best heads on somebody, the rest soft. */
  const light = (id: string | null, level = 1, color = WHITE, rest = 0.18) => {
    const s = id ? seats.get(id) : null;
    spots.forEach((spot, index) => {
      spot.level = rest;
      spot.aim = sweepAim(index, now, 0.4, 0.8);
    });
    if (!s) return;
    const [first, second] = headsFor(s);
    spots[first] = { aim: aimAt(s), level, color: color.clone(), snap: false };
    spots[second] = { aim: aimAt(s), level: level * 0.7, color: color.clone(), snap: false };
  };

  /** Two heads on the host's desk. */
  const lightHost = (level = 1) => {
    spots.forEach((spot, index) => {
      spot.level = 0.15;
      spot.aim = sweepAim(index, now, 0.4, 0.8);
    });
    spots[HOST_HEADS[0]] = { aim: HOST_AIM.clone(), level, color: WHITE.clone(), snap: false };
    spots[HOST_HEADS[1]] = { aim: HOST_AIM.clone(), level: level * 0.7, color: PINK.clone(), snap: false };
  };

  switch (state.phase) {
    case 'title': {
      const a = now * 0.00006;
      const position = new THREE.Vector3(Math.sin(a) * 11.5, 6.2, STAGE_CENTER.z + Math.cos(a) * 12.5 + 1);
      cues.shot = { position, target: new THREE.Vector3(0, 2.1, -3.6), fov: 52 };
      cues.ease = 0;
      cues.handheld = 0;
      cues.house = 0.8;
      spots.forEach((spot, index) => {
        spot.aim = sweepAim(index, now, 0.5);
        spot.level = 0.6;
        spot.color = index % 2 ? PINK.clone() : WHITE.clone();
      });
      break;
    }

    case 'intro': {
      cues.shot = introShot(t, aspect);
      cues.ease = 0;
      cues.handheld = t > INTRO.insideAt ? 0.6 : 0;
      cues.corridorLights = Math.max(0, (t - INTRO.corridorLightsFrom) / INTRO.corridorLightStep);
      cues.doorOpen = smooth(INTRO.doorsOpen, INTRO.doorsOpen + INTRO.doorsOpenDur, t);
      cues.house = 0.04 + 0.96 * smooth(INTRO.coveOn + 300, INTRO.podiumsFrom + 1_200, t);
      cues.cove = switchOn(t, INTRO.coveOn);
      cues.slats = smooth(INTRO.slatsOn, INTRO.slatsOn + 900, t);
      cues.stageEdge = switchOn(t, INTRO.spotsFrom + 200);
      cues.ledPower = t < INTRO.ledBoot ? 0 : 1;
      cues.led =
        t < INTRO.ledBoot
          ? { kind: 'off' }
          : t < INTRO.ledLogo
            ? { kind: 'boot', progress: (t - INTRO.ledBoot) / (INTRO.ledLogo - INTRO.ledBoot) }
            : { kind: 'logo' };
      cues.rise = (i) => easeOut((t - INTRO.podiumsFrom - i * INTRO.podiumStep) / INTRO.podiumRise);
      cues.inflate = (i) =>
        easeOut((t - INTRO.podiumsFrom - i * INTRO.podiumStep - INTRO.balloonDelay) / INTRO.balloonInflate);
      spots.forEach((spot, index) => {
        spot.level = switchOn(t, INTRO.spotsFrom + index * INTRO.spotStep);
        spot.aim = sweepAim(index, now, 1.6, 1.1);
        spot.color = index % 3 === 0 ? PINK.clone() : WHITE.clone();
      });
      cues.applause = smooth(INTRO.ledLogo - 400, INTRO.ledLogo + 600, t) * (1 - smooth(14_000, 15_800, t));
      cues.host = { kicker: 'Gleich live', line: 'Die Show beginnt', seconds: null, urgent: false };
      break;
    }

    case 'presentation': {
      const slot = presentSlot(state, now);
      if (slot.kind === 'host') {
        // The host first: the camera comes in towards the desk from the stage.
        cues.shot = reverseShot(aspect, easeOut(slot.progress) * 0.85);
        cues.ease = slot.progress < 0.05 ? 0.9 : 1.4;
        lightHost(1);
        cues.hostLit = 1;
        cues.othersDim = 0.5;
        cues.house = 0.7;
        cues.led = { kind: 'host', name: state.host.name };
        cues.applause = slot.progress < 0.3 ? 0.6 * (1 - slot.progress / 0.3) : 0;
        cues.host = { kicker: 'Dein Host', line: state.host.name, seconds: null, urgent: false };
      } else if (slot.kind === 'contestant') {
        const c = state.contestants[slot.index];
        const s = seats.get(c.id);
        // First the profile on the wall above them, then in to their face.
        if (s) cues.shot = presentShot(s, aspect, smooth(0.58, 0.95, slot.progress));
        cues.ease = slot.progress < 0.06 ? 0.9 : 1.1;
        light(c.id, 1, WHITE, 0.12);
        cues.focusId = c.id;
        cues.othersDim = 0.45;
        cues.house = 0.72;
        cues.led = { kind: 'profile', contestant: c, index: slot.index, total: state.contestants.length, progress: slot.progress, anchor: s ? s.position.x * 0.7 : 0 };
        cues.applause = slot.progress < 0.18 ? 0.45 * (1 - slot.progress / 0.18) : 0;
        cues.host = { kicker: `Kandidat ${slot.index + 1}`, line: c.name, seconds: null, urgent: false };
      } else {
        const wide = wideShot(aspect);
        cues.shot = { ...wide, position: wide.position.clone().add(new THREE.Vector3(0, 0, -slot.progress * 1.2)) };
        cues.ease = 1.4;
        cues.led = { kind: 'lineup', contestants: state.contestants };
        cues.applause = 1 - smooth(0.55, 1, slot.progress);
        spots.forEach((spot, i) => {
          const s = seatList[i % Math.max(1, seatList.length)];
          if (s) spot.aim = aimAt(s);
          spot.level = 0.8;
          spot.color = i % 2 ? PINK.clone() : WHITE.clone();
        });
        cues.host = { kicker: 'Alle da', line: 'Gleich geht es los', seconds: null, urgent: false };
      }
      break;
    }

    case 'roundStart': {
      const wide = wideShot(aspect);
      cues.shot = { ...wide, position: wide.position.clone().add(new THREE.Vector3(0, 0.6 - t * 0.0002, 1.2 - t * 0.0006)) };
      cues.ease = 1.3;
      cues.led = { kind: 'round', round, total };
      cues.flash = Math.max(0, 1 - t / 500) * 0.6;
      spots.forEach((spot, index) => {
        spot.aim = sweepAim(index, now, 3.2, 1.2);
        spot.level = 0.9;
        spot.color = index % 2 ? PINK.clone() : WHITE.clone();
      });
      cues.host = { kicker: `Runde ${round} von ${total}`, line: 'Gleich kommt die Frage', seconds: null, urgent: false };
      break;
    }

    case 'choosing': {
      cues.shot = hostShot(aspect);
      cues.ease = 1.3;
      cues.led = { kind: 'choose', round, total };
      spots.forEach((spot, index) => {
        const s = seatList[index];
        if (s) {
          spot.aim = aimAt(s);
          spot.level = 0.42;
        } else spot.level = 0.12;
      });
      cues.host = { kicker: `Runde ${round} von ${total}`, line: 'Wähle deine Frage', seconds: null, urgent: false };
      break;
    }

    case 'asking': {
      // The contestants' view: the host puts the question to them.
      cues.shot = reverseShot(aspect, smooth(0, DUR.asking, t) * 0.12);
      cues.ease = t < 150 ? 0 : 1.6;
      lightHost(1);
      cues.hostLit = 1;
      cues.house = 0.75;
      const text = state.question?.kind === 'random' ? state.question.text.replace(/\s*\n\s*/g, ' ') : 'Ich stelle meine eigene Frage';
      cues.led = { kind: 'question', round, total, text: state.question?.kind === 'random' ? state.question.text : null, turn: null };
      cues.host = { kicker: 'Die Frage', line: text, seconds: null, urgent: false };
      break;
    }

    case 'answering': {
      const turn = currentTurn(state, now);
      const s = turn ? seats.get(turn.id) : null;
      const c = byId(state, turn?.id ?? null);
      if (s) cues.shot = answerShot(s, aspect);
      cues.ease = 1.1;
      light(turn?.id ?? null, 1, WHITE, 0.2);
      cues.focusId = turn?.id ?? null;
      cues.othersDim = 0.4;
      cues.house = 0.78;
      const seconds = turn ? Math.ceil(turn.left / 1000) : 0;
      if (turn && turn.left <= 3_000) cues.clockPulse = Math.pow((turn.left % 1000) / 1000, 6);
      cues.led = {
        kind: 'question',
        round,
        total,
        text: state.question?.kind === 'random' ? state.question.text : null,
        turn: turn && c ? { name: c.name, color: c.color, seconds, fraction: turn.left / TURN_MS, index: turn.index, count: turn.count } : null,
      };
      cues.host = { kicker: c ? `${c.name} antwortet` : 'Antworten', line: turn ? `Kandidat ${turn.index + 1} von ${turn.count}` : '', seconds, urgent: seconds <= 3 };
      break;
    }

    case 'deciding': {
      // Over the host's shoulder: the whole row, the host's own picture below.
      cues.shot = hostShot(aspect);
      cues.ease = 1.3;
      const picked = state.selected ? seats.get(state.selected) : null;
      spots.forEach((spot, index) => {
        const s = seatList[index];
        spot.aim = s ? aimAt(s) : sweepAim(index, now);
        spot.level = s ? 0.35 : 0.08;
      });
      if (picked) {
        const [first, second] = headsFor(picked);
        spots[first] = { aim: aimAt(picked), level: 1, color: RED.clone().lerp(WHITE, 0.5), snap: false };
        spots[second] = { aim: aimAt(picked), level: 0.7, color: WHITE.clone(), snap: false };
      }
      cues.focusId = state.selected;
      cues.othersDim = state.selected ? 0.55 : 1;
      cues.house = 0.6;
      cues.led = { kind: 'decide', round, total };
      const name = byId(state, state.selected)?.name;
      cues.host = { kicker: 'Deine Entscheidung', line: name ? `${name} poppen?` : 'Wer muss gehen?', seconds: null, urgent: false };
      break;
    }

    case 'verdict': {
      const current = spotlightOn(state, now);
      const landed = t >= VERDICT_LAND_MS;
      const target = state.target ? seats.get(state.target) : null;
      const wide = wideShot(aspect);
      if (landed && target) {
        cues.shot = contestantShot(target, aspect, smooth(VERDICT_LAND_MS, DUR.verdict, t) * 0.2, 0);
        cues.ease = 0.8;
      } else {
        cues.shot = { ...wide, position: wide.position.clone().add(new THREE.Vector3(0, -0.4, -t * 0.0004)) };
        cues.ease = 1.0;
      }
      cues.house = 1 - 0.95 * smooth(0, 400, t);
      cues.cove = 0.18;
      cues.slats = 0.12;
      cues.stageEdge = 0.3;
      cues.focusSnap = !landed;
      spots.forEach((spot) => {
        spot.level = 0;
      });
      const s = current ? seats.get(current) : null;
      if (s) {
        const [first, second] = headsFor(s);
        spots[first] = { aim: aimAt(s), level: 1, color: landed ? RED.clone().lerp(WHITE, 0.45) : WHITE.clone(), snap: !landed };
        if (landed) spots[second] = { aim: aimAt(s), level: 0.8, color: WHITE.clone(), snap: false };
      }
      cues.focusId = current;
      cues.othersDim = 0.22;
      cues.led = { kind: 'verdict', round, total };
      cues.host = { kicker: 'POP', line: 'Wer muss gehen?', seconds: null, urgent: true };
      break;
    }

    case 'pop': {
      const target = state.target ? seats.get(state.target) : null;
      const c = byId(state, state.target);
      if (target) {
        const shot = contestantShot(target, aspect, 0.25, 0);
        // Pull back as the podium goes down.
        shot.position.addScaledVector(target.facing, smooth(1_200, 2_500, t) * 1.4);
        shot.target.y -= smooth(1_200, 2_500, t) * 0.5;
        cues.shot = shot;
      }
      cues.ease = 0.7;
      cues.popId = state.target;
      cues.popT = t / DUR.pop;
      cues.house = 0.4 + 0.4 * smooth(700, 1_400, t);
      cues.cove = 0.5 + 0.5 * smooth(700, 1_400, t);
      cues.focusId = state.target;
      cues.othersDim = 0.4;
      light(state.target, 1, t < 700 ? WHITE : RED, 0.1);
      cues.flash = t > 700 ? Math.max(0, 1 - (t - 700) / 450) : 0;
      cues.led = t < 700 || !c ? { kind: 'verdict', round, total } : { kind: 'out', contestant: c };
      cues.host = { kicker: 'POP', line: c ? `${c.name} geht` : '', seconds: null, urgent: false };
      break;
    }

    case 'regroup': {
      cues.shot = wideShot(aspect);
      cues.ease = 1.2;
      spots.forEach((spot, index) => {
        const s = seatList[index];
        spot.aim = s ? aimAt(s) : sweepAim(index, now);
        spot.level = s ? 0.6 : 0.2;
      });
      const gone = state.out[state.out.length - 1];
      const c = byId(state, gone?.id ?? null);
      cues.led = c && t < 900 ? { kind: 'out', contestant: c } : { kind: 'logo' };
      cues.host = { kicker: `${state.standing.length} übrig`, line: 'Die anderen rücken auf', seconds: null, urgent: false };
      break;
    }

    case 'finale':
    case 'end': {
      const winnersSeats = seatList;
      const empty = winnersSeats.length === 0;
      const since = state.phase === 'end' ? t + DUR.finale : t;
      if (empty) {
        const wide = wideShot(aspect);
        cues.shot = { ...wide, position: wide.position.clone().add(new THREE.Vector3(0, since * 0.00012, since * 0.00025)) };
        cues.house = 0.35;
        cues.cove = 0.4;
        spots.forEach((spot) => (spot.level = 0.08));
        cues.led = { kind: 'empty' };
      } else {
        const center = centroid(winnersSeats);
        const radius = winnersSeats.length === 1 ? 5.4 : 7.8;
        // A sweep in from the side, then round to the front, where the wall
        // with the winner's name is in the picture; it never goes behind the stage.
        const sweep = smooth(0, 5_200, since);
        const a = THREE.MathUtils.lerp(-1.15, 0, sweep) + Math.sin(since * 0.00035) * 0.12 * sweep;
        const lift = THREE.MathUtils.lerp(2.6, 3.4, sweep);
        const position = new THREE.Vector3(center.x * (1 - 0.4 * sweep) + Math.sin(a) * radius, lift, center.z + Math.cos(a) * radius);
        const target = center.clone().add(new THREE.Vector3(-center.x * 0.3 * sweep, PODIUM.monitorY + 0.35 + sweep * 0.9, 0));
        cues.shot = { position, target, fov: fovToFit(winnersSeats.length === 1 ? 46 : 54, 2.4, position.distanceTo(target), aspect) };
        cues.ease = since < 400 ? 1.2 : 0.5;
        cues.gold = smooth(0, 800, since);
        cues.confettiRain = 1 - smooth(6_500, 9_000, since);
        cues.applause = 1 - smooth(5_000, 8_000, since);
        cues.bounce = 0.6;
        spots.forEach((spot, index) => {
          const s = winnersSeats[index % winnersSeats.length];
          spot.aim = aimAt(s);
          spot.level = 0.95;
          spot.color = index % 2 ? GOLD.clone() : WHITE.clone();
        });
        cues.led = { kind: 'winner', contestants: state.standing.map((id) => byId(state, id)).filter(Boolean) as Contestant[] };
      }
      const winner = byId(state, state.standing[0] ?? null);
      cues.host = { kicker: 'Finale', line: winner ? `${winner.name} gewinnt` : 'Niemand ist geblieben', seconds: null, urgent: false };
      break;
    }
  }

  return cues;
}
