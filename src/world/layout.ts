import * as THREE from 'three';

/**
 * Where everything stands in the studio. One unit is roughly one metre.
 *
 * The contestants stand on a round stage in a shallow arc, every podium turned
 * towards the host's desk in front of them. Behind them hangs the LED wall,
 * above them a ring of moving lights. The default camera looks over the
 * host's shoulder — the view the show is built around on a portrait phone.
 */

export const STAGE_CENTER = new THREE.Vector3(0, 0, -3.6);
export const STAGE_RADIUS = 6.4;
export const STAGE_TOP = 0.32;

/** The arc the podiums stand on, and the point they all face. */
const ARC_CENTER = new THREE.Vector3(0, 0, 4.8);
const ARC_RADIUS = 8.6;
const GAP_DEG: Record<number, number> = { 1: 0, 2: 15, 3: 13.5, 4: 11.5, 5: 9.6, 6: 8.4 };

export const HOST_DESK = new THREE.Vector3(0, 0, 6.4);
export const LED_WALL = { center: new THREE.Vector3(0, 4.75, -8.3), width: 7.8, height: 4.39 };
export const TRUSS = { center: new THREE.Vector3(0, 8.7, -3.4), radius: 6.2, heads: 8 };
export const STUDIO_RADIUS = 14;
export const CORRIDOR = { start: 42, end: 14.2, width: 3.4, height: 3.5 };

/** Heights on a podium, measured from the stage floor. */
export const PODIUM = {
  width: 1.0,
  height: 1.05,
  depth: 0.72,
  monitorWidth: 0.86,
  monitorHeight: 1.12,
  monitorY: 1.05 + 0.13 + 0.56,
  balloonY: 1.05 + 0.13 + 1.12 + 0.62,
} as const;

export type Seat = { position: THREE.Vector3; rotationY: number; facing: THREE.Vector3 };

/** The seat for one contestant out of `count` still standing. */
export function seat(index: number, count: number): Seat {
  const gap = THREE.MathUtils.degToRad(GAP_DEG[Math.min(6, Math.max(1, count))] ?? 9);
  const angle = (index - (count - 1) / 2) * gap;
  const position = new THREE.Vector3(
    ARC_CENTER.x + Math.sin(angle) * ARC_RADIUS,
    STAGE_TOP,
    ARC_CENTER.z - Math.cos(angle) * ARC_RADIUS,
  );
  const facing = new THREE.Vector3(ARC_CENTER.x - position.x, 0, ARC_CENTER.z - position.z).normalize();
  return { position, rotationY: Math.atan2(facing.x, facing.z), facing };
}

/** Seats for everybody standing, by id. */
export function seatMap(ids: string[]) {
  const map = new Map<string, Seat>();
  ids.forEach((id, index) => map.set(id, seat(index, ids.length)));
  return map;
}

export type Shot = { position: THREE.Vector3; target: THREE.Vector3; fov: number };

/**
 * A field of view wide enough for `halfWidth` units across at `distance` on
 * this screen. Portrait phones are narrow, so the lens opens up to keep the
 * whole row in the picture instead of cropping its ends.
 */
export function fovToFit(base: number, halfWidth: number, distance: number, aspect: number) {
  const needed = THREE.MathUtils.radToDeg(2 * Math.atan(halfWidth / (distance * Math.max(0.2, aspect))));
  return Math.min(78, Math.max(base, needed));
}

/** Over the host's shoulder: the whole stage, the LED wall and the rig. */
export function hostShot(aspect: number): Shot {
  const position = new THREE.Vector3(0, 3.5, 12.6);
  const target = new THREE.Vector3(0, 2.05, -3.4);
  return { position, target, fov: fovToFit(50, 3.75, position.distanceTo(target), aspect) };
}

/** A little higher and closer — for moments the whole stage shares. */
export function wideShot(aspect: number): Shot {
  const position = new THREE.Vector3(0, 4.6, 10.4);
  const target = new THREE.Vector3(0, 2.2, -3.6);
  return { position, target, fov: fovToFit(48, 3.8, position.distanceTo(target), aspect) };
}

/** One contestant: monitor, balloon and name plate in frame. `closeness` 0 → 1 dollies in. */
export function contestantShot(s: Seat, aspect: number, closeness = 0, side = 0.35): Shot {
  const distance = THREE.MathUtils.lerp(4.4, 3.2, closeness);
  const right = new THREE.Vector3(s.facing.z, 0, -s.facing.x);
  const position = s.position
    .clone()
    .addScaledVector(s.facing, distance)
    .addScaledVector(right, side)
    .add(new THREE.Vector3(0, 2.15, 0));
  const target = s.position.clone().add(new THREE.Vector3(0, 2.05, 0));
  return { position, target, fov: fovToFit(40, 0.72, distance, aspect) };
}

/**
 * A contestant with the LED wall above them: their monitor low in the frame,
 * their profile on the wall behind. `push` 0 → 1 dollies in to their face.
 */
export function presentShot(s: Seat, aspect: number, push: number): Shot {
  // Square on to the wall, so the profile above them reads straight.
  const wide = {
    position: new THREE.Vector3(s.position.x * 0.86, 3.0, s.position.z + 7.2),
    target: new THREE.Vector3(s.position.x * 0.72, 3.35, s.position.z - 3),
  };
  const close = contestantShot(s, aspect, 0.15, 0);
  const position = wide.position.clone().lerp(close.position, push);
  const target = wide.target.clone().lerp(close.target, push);
  const wideFov = fovToFit(50, 2.2, wide.position.distanceTo(wide.target), aspect);
  return { position, target, fov: THREE.MathUtils.lerp(wideFov, close.fov, push) };
}

/**
 * The other way round: from behind the contestants towards the host's desk,
 * as the contestants see the host. `closeness` 0 → 1 moves up to the desk.
 */
export function reverseShot(aspect: number, closeness = 0): Shot {
  const far = new THREE.Vector3(0.7, 3.0, -6.2);
  const near = new THREE.Vector3(0.2, 2.05, 2.6);
  const position = far.clone().lerp(near, closeness);
  const target = new THREE.Vector3(0, 1.72, HOST_DESK.z);
  return { position, target, fov: fovToFit(THREE.MathUtils.lerp(34, 40, closeness), THREE.MathUtils.lerp(1.6, 1.0, closeness), position.distanceTo(target), aspect) };
}

/** Halfway between the host's view and one contestant: for the answering rounds. */
export function answerShot(s: Seat, aspect: number): Shot {
  // The question on the wall above, the one answering lit in the middle.
  const position = new THREE.Vector3(s.position.x * 0.75, 3.5, s.position.z + 10.2);
  const target = new THREE.Vector3(s.position.x * 0.6, 2.9, s.position.z - 4);
  return { position, target, fov: fovToFit(48, 3.0, position.distanceTo(target), aspect) };
}
