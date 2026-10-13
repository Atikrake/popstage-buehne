import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The studio's shapes. Nothing here is a box: every piece of furniture is a
 * smooth outline swept along a side profile whose corners are rounded off,
 * the way a set builder would mill it. Normals are worked out from the
 * outline and the profile directly rather than averaged from the triangles,
 * so curved surfaces shade without seams or facets.
 *
 * Conventions: an outline lives in the floor plane — its x is the world's x,
 * its y the world's z (so +y is the front of a podium). A profile is a list
 * of (offset, height) pairs: how far the surface stands out from the outline
 * at each height, from the floor up.
 */

export type Outline = {
  points: THREE.Vector2[];
  /** Pointing away from the inside, one per point. */
  normals: THREE.Vector2[];
};

// --- profiles ---------------------------------------------------------------

/**
 * Rounds the corners of a polyline: every inner corner becomes an arc of
 * `radius` (or the matching entry of an array), shortened where the
 * neighbouring segments are too short to fit it.
 */
export function fillet(points: THREE.Vector2[], radius: number | number[], segments = 6) {
  const out: THREE.Vector2[] = [points[0].clone()];
  // A fillet that uses up a whole segment would repeat its end point.
  const push = (p: THREE.Vector2) => {
    if (out[out.length - 1].distanceToSquared(p) > 1e-12) out.push(p);
  };
  for (let i = 1; i < points.length - 1; i += 1) {
    const r = Array.isArray(radius) ? radius[i] ?? 0 : radius;
    const p = points[i];
    const a = points[i - 1];
    const b = points[i + 1];
    const u1 = a.clone().sub(p);
    const u2 = b.clone().sub(p);
    const l1 = u1.length();
    const l2 = u2.length();
    u1.normalize();
    u2.normalize();
    const cos = THREE.MathUtils.clamp(u1.dot(u2), -1, 1);
    const theta = Math.acos(cos);
    if (r <= 0 || theta < 1e-3 || Math.PI - theta < 1e-3) {
      push(p.clone());
      continue;
    }
    // Distance from the corner to where the arc touches each side.
    let d = r / Math.tan(theta / 2);
    // A segment shared with another corner gives each half of its length;
    // the first and last segments belong to one corner only.
    const fit = Math.min(i === 1 ? l1 : l1 * 0.5, i === points.length - 2 ? l2 : l2 * 0.5);
    const rr = d > fit ? fit * Math.tan(theta / 2) : r;
    d = Math.min(d, fit);
    const t1 = p.clone().addScaledVector(u1, d);
    const t2 = p.clone().addScaledVector(u2, d);
    const bisector = u1.clone().add(u2).normalize();
    const center = p.clone().addScaledVector(bisector, rr / Math.sin(theta / 2));
    const a1 = Math.atan2(t1.y - center.y, t1.x - center.x);
    let a2 = Math.atan2(t2.y - center.y, t2.x - center.x);
    // Always the short way round.
    let span = a2 - a1;
    while (span > Math.PI) span -= Math.PI * 2;
    while (span < -Math.PI) span += Math.PI * 2;
    a2 = a1 + span;
    for (let s = 0; s <= segments; s += 1) {
      const k = a1 + ((a2 - a1) * s) / segments;
      push(new THREE.Vector2(center.x + Math.cos(k) * rr, center.y + Math.sin(k) * rr));
    }
  }
  push(points[points.length - 1].clone());
  return out;
}

/** Shorthand for a profile: [offset, height, cornerRadius] triples. */
export function profile(spec: [number, number, number?][], segments = 6) {
  return fillet(
    spec.map(([s, h]) => new THREE.Vector2(s, h)),
    spec.map(([, , r]) => r ?? 0),
    segments,
  );
}

// --- outlines ---------------------------------------------------------------

function arc(
  out: Outline,
  center: THREE.Vector2,
  radius: number,
  from: number,
  to: number,
  segments: number,
  inward = false,
) {
  for (let i = 0; i <= segments; i += 1) {
    const a = from + ((to - from) * i) / segments;
    const dir = new THREE.Vector2(Math.cos(a), Math.sin(a));
    out.points.push(center.clone().addScaledVector(dir, radius));
    out.normals.push(inward ? dir.clone().negate() : dir);
  }
}

/** A rectangle with rounded corners, centred on the origin. */
export function roundedRectOutline(width: number, depth: number, radius: number, cornerSegments = 10): Outline {
  const out: Outline = { points: [], normals: [] };
  const hx = width / 2 - radius;
  const hy = depth / 2 - radius;
  const corners: [number, number, number][] = [
    [hx, hy, 0],
    [-hx, hy, Math.PI / 2],
    [-hx, -hy, Math.PI],
    [hx, -hy, Math.PI * 1.5],
  ];
  corners.forEach(([x, y, start]) => arc(out, new THREE.Vector2(x, y), radius, start, start + Math.PI / 2, cornerSegments));
  return out;
}

/**
 * A crescent: the curved desk a host stands inside. Its centre of curvature
 * is `center`; the front bulges towards -y (the stage), the ends are round.
 */
export function crescentOutline(center: THREE.Vector2, inner: number, outer: number, halfAngle: number, segments = 48): Outline {
  const out: Outline = { points: [], normals: [] };
  const mid = (inner + outer) / 2;
  const capR = (outer - inner) / 2;
  // Angles measured the usual way; the front of the desk is at -90°.
  const front = -Math.PI / 2;
  arc(out, center, outer, front - halfAngle, front + halfAngle, segments);
  const endA = new THREE.Vector2(Math.cos(front + halfAngle), Math.sin(front + halfAngle)).multiplyScalar(mid).add(center);
  arc(out, endA, capR, front + halfAngle, front + halfAngle + Math.PI, 14);
  arc(out, center, inner, front + halfAngle, front - halfAngle, segments, true);
  const endB = new THREE.Vector2(Math.cos(front - halfAngle), Math.sin(front - halfAngle)).multiplyScalar(mid).add(center);
  arc(out, endB, capR, front - halfAngle + Math.PI, front - halfAngle + Math.PI * 2, 14);
  return dedupe(out);
}

/** Drops points that sit on top of their neighbour (where arcs meet). */
function dedupe(outline: Outline): Outline {
  const out: Outline = { points: [], normals: [] };
  outline.points.forEach((p, i) => {
    const last = out.points[out.points.length - 1];
    if (last && last.distanceToSquared(p) < 1e-10) {
      // Keep one point; average the normals so the join stays smooth.
      out.normals[out.normals.length - 1].add(outline.normals[i]).normalize();
      return;
    }
    out.points.push(p.clone());
    out.normals.push(outline.normals[i].clone());
  });
  const first = out.points[0];
  const last = out.points[out.points.length - 1];
  if (first.distanceToSquared(last) < 1e-10) {
    out.points.pop();
    out.normals[0].add(out.normals.pop()!).normalize();
  }
  return out;
}

/** The outline grown (or shrunk, negative) by `offset` along its normals. */
export function offsetOutline(outline: Outline, offset: number) {
  return outline.points.map((p, i) => p.clone().addScaledVector(outline.normals[i], offset));
}

// --- sweeping ---------------------------------------------------------------

/**
 * A closed surface: the outline at every height of the profile, pushed out by
 * the profile's offset. `v` runs up the profile, `u` round the outline, both
 * in metres so patterns keep their size from piece to piece.
 */
export function sweep(outline: Outline, prof: THREE.Vector2[]) {
  const n = outline.points.length;
  const m = prof.length;
  // Profile normals in (offset, height) space, averaged at each point.
  const pn = prof.map((_, j) => {
    const a = prof[Math.max(0, j - 1)];
    const b = prof[Math.min(m - 1, j + 1)];
    const t = b.clone().sub(a).normalize();
    return new THREE.Vector2(t.y, -t.x);
  });
  const along = [0];
  for (let i = 1; i <= n; i += 1) along.push(along[i - 1] + outline.points[i % n].distanceTo(outline.points[i - 1]));
  const up = [0];
  for (let j = 1; j < m; j += 1) up.push(up[j - 1] + prof[j].distanceTo(prof[j - 1]));

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  // One extra column closes the loop with its own u, without a shading seam.
  for (let i = 0; i <= n; i += 1) {
    const p = outline.points[i % n];
    const q = outline.normals[i % n];
    for (let j = 0; j < m; j += 1) {
      const [s, h] = [prof[j].x, prof[j].y];
      positions.push(p.x + q.x * s, h, p.y + q.y * s);
      const nn = new THREE.Vector3(q.x * pn[j].x, pn[j].y, q.y * pn[j].x).normalize();
      normals.push(nn.x, nn.y, nn.z);
      uvs.push(along[i], up[j]);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m - 1; j += 1) {
      const a = i * m + j;
      const b = (i + 1) * m + j;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  orientFaces(geometry);
  return geometry;
}

/** Flat cap over an outline at a height, facing up (1) or down (-1). */
export function cap(points: THREE.Vector2[], height: number, facing: 1 | -1 = 1) {
  const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.y)));
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, height, 0);
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const nor = geometry.getAttribute('normal');
  for (let i = 0; i < pos.count; i += 1) {
    // Planar uv in metres, like the sweep's.
    uv.setXY(i, pos.getX(i), pos.getZ(i));
    nor.setXYZ(i, 0, facing, 0);
  }
  orientFaces(geometry);
  return geometry;
}

/** A swept piece with its top closed. */
export function solid(outline: Outline, prof: THREE.Vector2[]) {
  const top = prof[prof.length - 1];
  return merge([sweep(outline, prof), cap(offsetOutline(outline, top.x), top.y)]);
}

/** Triangles wound so their face matches the stored normals. */
export function orientFaces(geometry: THREE.BufferGeometry) {
  const index = geometry.getIndex();
  const pos = geometry.getAttribute('position');
  const nor = geometry.getAttribute('normal');
  if (!index || index.count < 3) return;
  // Judge by the largest triangle: tiny ones at a fillet can mislead.
  let best = 0;
  let agree = 1;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const face = new THREE.Vector3();
  const stored = new THREE.Vector3();
  for (let t = 0; t < index.count; t += 3) {
    const i0 = index.getX(t);
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, index.getX(t + 1));
    c.fromBufferAttribute(pos, index.getX(t + 2));
    face.subVectors(c, b).cross(a.sub(b));
    const area = face.length();
    if (area > best) {
      best = area;
      stored.fromBufferAttribute(nor, i0);
      agree = Math.sign(face.dot(stored)) || 1;
    }
  }
  if (agree < 0) flipFaces(geometry);
}

function flipFaces(geometry: THREE.BufferGeometry) {
  const index = geometry.getIndex();
  if (!index) return;
  const arr = index.array as Uint16Array | Uint32Array;
  for (let t = 0; t < arr.length; t += 3) {
    const tmp = arr[t + 1];
    arr[t + 1] = arr[t + 2];
    arr[t + 2] = tmp;
  }
  index.needsUpdate = true;
}

/** Merges pieces that share a material, keeping only what every piece has. */
export function merge(parts: THREE.BufferGeometry[]) {
  const prepared = parts.map((g) => {
    const one = g.index ? g : g.toNonIndexed();
    for (const name of Object.keys(one.attributes)) if (!['position', 'normal', 'uv'].includes(name)) one.deleteAttribute(name);
    return one.index ? one : indexed(one);
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('merge: pieces do not fit together');
  merged.computeBoundingSphere();
  return merged;
}

function indexed(geometry: THREE.BufferGeometry) {
  const count = geometry.getAttribute('position').count;
  geometry.setIndex(Array.from({ length: count }, (_, i) => i));
  return geometry;
}

// --- turned pieces --------------------------------------------------------

/** A turned piece (a lathe): profile as (radius, height). Smooth, closed at the axis if the profile reaches it. */
export function turned(prof: THREE.Vector2[], segments = 48) {
  const outline: Outline = { points: [], normals: [] };
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const dir = new THREE.Vector2(Math.cos(a), Math.sin(a));
    outline.points.push(new THREE.Vector2(0, 0));
    outline.normals.push(dir);
  }
  return sweep(outline, prof);
}

/** A rounded tube along a polyline, its corners filleted. */
export function pipe(points: THREE.Vector3[], radius: number, cornerRadius: number, radial = 10) {
  const dense: THREE.Vector3[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (i === 0 || i === points.length - 1) {
      dense.push(p.clone());
      continue;
    }
    const a = points[i - 1];
    const b = points[i + 1];
    const u1 = a.clone().sub(p).normalize();
    const u2 = b.clone().sub(p).normalize();
    const d = Math.min(cornerRadius, a.distanceTo(p) * 0.45, b.distanceTo(p) * 0.45);
    const t1 = p.clone().addScaledVector(u1, d);
    const t2 = p.clone().addScaledVector(u2, d);
    // A quadratic curve through the corner reads as a bent tube.
    for (let s = 0; s <= 8; s += 1) {
      const k = s / 8;
      const q = t1
        .clone()
        .multiplyScalar((1 - k) * (1 - k))
        .addScaledVector(p, 2 * k * (1 - k))
        .addScaledVector(t2, k * k);
      dense.push(q);
    }
  }
  const curve = new THREE.CatmullRomCurve3(dense, false, 'centripetal');
  return new THREE.TubeGeometry(curve, dense.length * 3, radius, radial, false);
}

// --- the heart balloon -----------------------------------------------------

/**
 * A heart-shaped balloon. The shape is described as a distance field — two
 * round lobes and a rounded cone for the point, melted into each other
 * smoothly — so it is puffy and round everywhere like an inflated balloon,
 * with no creases. A sphere is shrink-wrapped onto it ray by ray, which keeps
 * the mesh even, and the normals come from the field itself. Flattened front
 * to back like a foil balloon. About `height` tall, centred; `bottom` is
 * where its point (and the knot) is.
 */
let heart: { geometry: THREE.BufferGeometry; bottom: number; top: number } | null = null;

const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

/** Distance to a cone with rounded ends, from a (radius r1) to b (radius r2). After Inigo Quilez. */
function roundCone(px: number, py: number, pz: number, a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number) {
  const bax = b.x - a.x;
  const bay = b.y - a.y;
  const baz = b.z - a.z;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - a.x;
  const pay = py - a.y;
  const paz = pz - a.z;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y;
  const qy = pay * l2 - bay * y;
  const qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

export function heartBalloon(height = 0.66) {
  if (heart) return heart;
  const flat = 0.62;
  const coneTop = new THREE.Vector3(0, 0.02, 0);
  const coneTip = new THREE.Vector3(0, -0.98, 0);
  // Distance to the round heart, before it is flattened.
  const field = (x: number, y: number, z: number) => {
    const left = Math.hypot(x + 0.5, y - 0.22, z) - 0.55;
    const right = Math.hypot(x - 0.5, y - 0.22, z) - 0.55;
    const point = roundCone(x, y, z, coneTop, coneTip, 0.72, 0.07);
    // A tight seam between the lobes keeps the dip on top; a wide one blends in the point.
    return smin(smin(left, right, 0.07), point, 0.26);
  };
  const gradient = (x: number, y: number, z: number) => {
    const e = 1e-4;
    return new THREE.Vector3(
      field(x + e, y, z) - field(x - e, y, z),
      field(x, y + e, z) - field(x, y - e, z),
      field(x, y, z + e) - field(x, y, z - e),
    );
  };
  // A sphere whose poles look front and back, away from the point and the dip.
  const sphere = new THREE.SphereGeometry(1, 56, 42);
  sphere.rotateX(Math.PI / 2);
  const pos = sphere.getAttribute('position');
  const nor = sphere.getAttribute('normal');
  const origin = new THREE.Vector3(0, 0.05, 0);
  const dir = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    dir.fromBufferAttribute(pos, i).normalize();
    // March out until outside, then halve the step down to the surface.
    let lo = 0;
    let hi = 2.5;
    for (let t = 0.02; t < 2.5; t += 0.02) {
      p.copy(origin).addScaledVector(dir, t);
      if (field(p.x, p.y, p.z) > 0) {
        hi = t;
        break;
      }
      lo = t;
    }
    for (let k = 0; k < 28; k += 1) {
      const mid = (lo + hi) / 2;
      p.copy(origin).addScaledVector(dir, mid);
      if (field(p.x, p.y, p.z) > 0) hi = mid;
      else lo = mid;
    }
    p.copy(origin).addScaledVector(dir, (lo + hi) / 2);
    // Flatten front to back; the normal follows the inverse squash.
    const n = gradient(p.x, p.y, p.z);
    n.z /= flat;
    n.normalize();
    pos.setXYZ(i, p.x, p.y, p.z * flat);
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  sphere.computeBoundingBox();
  const box = sphere.boundingBox!;
  const scale = height / (box.max.y - box.min.y);
  const midY = (box.max.y + box.min.y) / 2;
  sphere.translate(0, -midY, 0);
  sphere.scale(scale, scale, scale);
  // An even scale keeps the normals right.
  sphere.computeBoundingSphere();
  heart = { geometry: sphere, bottom: (box.min.y - midY) * scale, top: (box.max.y - midY) * scale };
  return heart;
}

/** The knot at a balloon's foot: a little turned bead with a lip. */
export function balloonKnot() {
  return turned(
    profile([
      [0.0, -0.05],
      [0.018, -0.046, 0.008],
      [0.012, -0.02, 0.01],
      [0.022, 0.0, 0.006],
      [0.0, 0.012],
    ], 4),
    18,
  );
}

// --- the lighting truss ----------------------------------------------------

/**
 * A ring of triangular truss: three tube chords and a zig-zag of braces
 * between them, as one piece. `bands` braces round the ring.
 */
export function trussRing(radius: number, size = 0.42, bands = 120) {
  const chordR = 0.035;
  const braceR = 0.012;
  const h = size * Math.sqrt(3) / 2;
  // The triangle's corners: two below (inside and outside), one on top.
  const corners = [
    new THREE.Vector2(-size / 2, -h / 3),
    new THREE.Vector2(size / 2, -h / 3),
    new THREE.Vector2(0, (2 * h) / 3),
  ];
  const parts: THREE.BufferGeometry[] = [];
  corners.forEach((c) => {
    const torus = new THREE.TorusGeometry(radius + c.x, chordR, 10, 160);
    torus.rotateX(Math.PI / 2);
    torus.translate(0, c.y, 0);
    parts.push(torus);
  });
  const at = (corner: THREE.Vector2, angle: number) =>
    new THREE.Vector3(Math.sin(angle) * (radius + corner.x), corner.y, Math.cos(angle) * (radius + corner.x));
  const brace = new THREE.CylinderGeometry(braceR, braceR, 1, 6, 1, true);
  for (let i = 0; i < bands; i += 1) {
    const a0 = (i / bands) * Math.PI * 2;
    const a1 = ((i + 1) / bands) * Math.PI * 2;
    for (let k = 0; k < 3; k += 1) {
      const from = at(corners[k], i % 2 ? a1 : a0);
      const to = at(corners[(k + 1) % 3], i % 2 ? a0 : a1);
      const piece = brace.clone();
      const length = from.distanceTo(to);
      piece.scale(1, length, 1);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      piece.applyQuaternion(q);
      const mid = from.clone().add(to).multiplyScalar(0.5);
      piece.translate(mid.x, mid.y, mid.z);
      parts.push(piece);
    }
  }
  return merge(parts);
}

// --- small helpers -------------------------------------------------------

/** A flat rounded rectangle facing +z, with uv 0…1 over its box. */
export function roundedPlane(width: number, height: number, radius: number, segments = 8) {
  const outline = roundedRectOutline(width, height, Math.min(radius, width / 2, height / 2), segments);
  const shape = new THREE.Shape(outline.points);
  const geometry = new THREE.ShapeGeometry(shape, 1);
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, pos.getX(i) / width + 0.5, pos.getY(i) / height + 0.5);
  return geometry;
}

/**
 * A slab with rounded corners and softly rounded edges, facing +z and
 * centred on the origin: bezels, frames, panels. `detail` is how many steps
 * make each rounded corner and edge — fewer for things seen only from afar.
 */
export function roundedSlab(width: number, height: number, depth: number, radius: number, edge = Math.min(0.012, depth / 3), detail = { corner: 8, edge: 4 }) {
  const r = Math.max(edge + 0.002, Math.min(radius, width / 2, height / 2));
  const outline = roundedRectOutline(width, height, r, detail.corner);
  const prof = profile(
    [
      [-edge, 0],
      [0, 0, edge],
      [0, depth, edge],
      [-edge, depth],
    ],
    detail.edge,
  );
  const inner = offsetOutline(outline, -edge);
  const geometry = merge([sweep(outline, prof), cap(inner, 0, -1), cap(inner, depth, 1)]);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}
