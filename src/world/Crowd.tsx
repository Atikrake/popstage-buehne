import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { rng } from '../show/seed';
import { useFrameData } from './frame';
import { extend } from './materials';
import { merge, profile, roundedSlab, turned } from './shapes';

/**
 * The studio audience on the tiers either side, each in a seat: people with
 * shoulders, a head and two arms, some holding up a phone light. When the
 * director calls for applause they lift their arms and clap, each to their
 * own rhythm, and bob in their seats.
 *
 * All of that movement happens on the graphics chip: every person is placed
 * once, and the arms and the bobbing are worked out in the vertex shader from
 * one "applause" number and the time. A full house costs the phone two draws
 * and nothing per frame.
 */

const TIER_INNER = 10.4;
const TIER_STEP = 1.05;
const STAGE_Z = -3.6;
const SHOULDER_Y = 0.56;
const SHOULDER_X = 0.19;

/** One seated person, built once. Arm vertices carry which side they belong to. */
function personGeometry() {
  const torso = turned(
    profile([
      [0, 0],
      [0.17, 0, 0.05],
      [0.155, 0.24, 0.06],
      [0.2, 0.46, 0.08],
      [0.17, SHOULDER_Y + 0.04, 0.05],
      [0.06, 0.64, 0.03],
      [0.05, 0.68],
      [0, 0.68],
    ], 4),
    16,
  );
  // A little flatter front to back, like a body.
  torso.scale(1, 1, 0.72);
  const head = new THREE.SphereGeometry(0.105, 14, 10);
  head.scale(1, 1.12, 1);
  head.translate(0, 0.79, 0.01);
  const body = merge([torso, head]);
  body.setAttribute('aArm', new THREE.Float32BufferAttribute(new Float32Array(body.getAttribute('position').count), 1));

  const arms: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.042, 0.38, 3, 8);
    // Hanging from the shoulder, forearm resting forwards on the lap.
    arm.translate(0, -0.23, 0);
    arm.rotateX(-0.55);
    arm.rotateZ(side * 0.12);
    arm.translate(side * SHOULDER_X, SHOULDER_Y, 0.02);
    const one = merge([arm]);
    one.setAttribute('aArm', new THREE.Float32BufferAttribute(new Float32Array(one.getAttribute('position').count).fill(side), 1));
    arms.push(one);
  }
  const all = [body, ...arms];
  const merged = new THREE.BufferGeometry();
  const total = all.reduce((sum, g) => sum + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const side = new Float32Array(total);
  const index: number[] = [];
  let offset = 0;
  for (const g of all) {
    const count = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, offset * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, offset * 3);
    side.set(g.getAttribute('aArm').array as Float32Array, offset);
    const idx = g.getIndex()!;
    for (let i = 0; i < idx.count; i += 1) index.push(idx.getX(i) + offset);
    offset += count;
  }
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('aArm', new THREE.BufferAttribute(side, 1));
  merged.setIndex(index);
  merged.computeBoundingSphere();
  return merged;
}

/** A seat: a rounded shell with a back, behind and under the person. */
function seatGeometry() {
  const seat = roundedSlab(0.5, 0.44, 0.08, 0.08, 0.025);
  seat.rotateX(-Math.PI / 2);
  seat.translate(0, -0.04, 0.0);
  const back = roundedSlab(0.5, 0.62, 0.07, 0.1, 0.025);
  back.rotateX(-0.12);
  back.translate(0, 0.28, -0.24);
  return merge([seat, back]);
}

/** The arms and the bobbing, shared by the position and the normal. */
const CLAP_HEAD = /* glsl */ `
  attribute float aArm;
  attribute float aPhase;
  uniform float uApplause;
  uniform float uTime;
  mat3 psRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  mat3 psRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  float psClapAmount() {
    // Not everybody at once: each person joins a moment later than the last.
    return smoothstep(0.0, 1.0, clamp(uApplause * 1.6 - fract(aPhase * 0.37) * 0.6, 0.0, 1.0));
  }
  mat3 psArmTurn() {
    float k = psClapAmount();
    float clap = 0.5 + 0.5 * sin(uTime * 13.0 + aPhase * 6.0);
    // Arms come up in front of the chest, hands meeting and parting.
    float lift = k * (1.75 + 0.12 * sin(uTime * 2.1 + aPhase));
    float inward = k * (0.3 + 0.12 * clap);
    return psRotY(-aArm * inward) * psRotX(-lift);
  }
`;

export function Crowd({ count }: { count: number }) {
  const frame = useFrameData();
  const people = useRef<THREE.InstancedMesh>(null);
  const seats = useRef<THREE.InstancedMesh>(null);
  const phones = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => personGeometry(), []);
  const seat = useMemo(() => seatGeometry(), []);

  const places = useMemo(() => {
    const random = rng(42);
    const list: { x: number; y: number; z: number; phase: number; phone: boolean }[] = [];
    const perSide = Math.floor(count / 2);
    for (const side of [1, -1]) {
      for (let i = 0; i < perSide; i += 1) {
        const tier = i % 3;
        const r = TIER_INNER + tier * TIER_STEP + 0.55;
        const k = Math.floor(i / 3) / Math.max(1, Math.floor(perSide / 3));
        const a = side * (Math.PI * 0.31 + k * Math.PI * 0.32) + (random() - 0.5) * 0.012;
        list.push({ x: Math.sin(a) * r, y: 0.42 * (tier + 1), z: Math.cos(a) * r, phase: random() * 10, phone: random() < 0.16 });
      }
    }
    return list;
  }, [count]);
  const phonePlaces = useMemo(() => places.filter((one) => one.phone), [places]);

  const uniforms = useMemo(() => ({ uApplause: { value: 0 }, uTime: { value: 0 }, uPhones: { value: 1 } }), []);
  const material = useMemo(
    () =>
      extend(new THREE.MeshStandardMaterial({ roughness: 0.82 }), {
        key: 'crowd-person',
        uniforms,
        vertexHead: CLAP_HEAD,
        vertex: {
          beginnormal_vertex: /* glsl */ `
            if (aArm != 0.0) objectNormal = psArmTurn() * objectNormal;
          `,
          begin_vertex: /* glsl */ `
            if (aArm != 0.0) {
              vec3 shoulder = vec3(aArm * ${SHOULDER_X.toFixed(3)}, ${SHOULDER_Y.toFixed(3)}, 0.02);
              transformed = shoulder + psArmTurn() * (transformed - shoulder);
            }
            transformed.y += psClapAmount() * abs(sin(uTime * 6.5 + aPhase * 3.0)) * 0.045;
          `,
        },
      }),
    [uniforms],
  );
  const seatMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3B2533', roughness: 0.55, metalness: 0.1 }), []);
  const phoneMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        toneMapped: false,
        side: THREE.DoubleSide,
        uniforms,
        vertexShader: /* glsl */ `
          attribute float aPhase;
          uniform float uApplause;
          uniform float uTime;
          void main() {
            vec3 p = position;
            // Held up and swaying gently with the music.
            p.x += sin(uTime * 1.6 + aPhase) * 0.06 * (0.3 + uApplause);
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uPhones;
          void main() {
            gl_FragColor = vec4(vec3(1.0, 0.97, 0.94) * uPhones, 1.0);
          }
        `,
      }),
    [uniforms],
  );

  // Everybody is placed once.
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    const random = rng(7);
    const palette = ['#3A2A33', '#4A3340', '#2E2530', '#55404C', '#3F2F3A', '#6A4A5A', '#7A5566', '#2B3040'].map((c) => new THREE.Color(c));
    const phase = new Float32Array(places.length);
    places.forEach((one, index) => {
      dummy.position.set(one.x, one.y, one.z);
      dummy.rotation.set(0, Math.atan2(-one.x, STAGE_Z - one.z), 0);
      dummy.updateMatrix();
      people.current?.setMatrixAt(index, dummy.matrix);
      seats.current?.setMatrixAt(index, dummy.matrix);
      people.current?.setColorAt(index, palette[Math.floor(random() * palette.length)]);
      phase[index] = one.phase;
    });
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    if (people.current) {
      people.current.instanceMatrix.needsUpdate = true;
      if (people.current.instanceColor) people.current.instanceColor.needsUpdate = true;
      people.current.computeBoundingSphere();
    }
    if (seats.current) {
      seats.current.instanceMatrix.needsUpdate = true;
      seats.current.computeBoundingSphere();
    }
    const phonePhase = new Float32Array(phonePlaces.length);
    phonePlaces.forEach((one, index) => {
      dummy.position.set(one.x, one.y + 1.22, one.z);
      dummy.rotation.set(0, Math.atan2(-one.x, STAGE_Z - one.z), 0);
      dummy.updateMatrix();
      phones.current?.setMatrixAt(index, dummy.matrix);
      phonePhase[index] = one.phase;
    });
    if (phones.current) {
      phones.current.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phonePhase, 1));
      phones.current.instanceMatrix.needsUpdate = true;
      phones.current.computeBoundingSphere();
    }
  }, [geometry, phonePlaces, places]);

  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    uniforms.uApplause.value = c.applause;
    uniforms.uTime.value = frame.current.now / 1000;
    uniforms.uPhones.value = 0.3 + (1 - c.house) * 1.6 + c.applause * 0.6;
  });

  return (
    <>
      <instancedMesh ref={people} args={[geometry, material, places.length]} castShadow={false} />
      <instancedMesh ref={seats} args={[seat, seatMaterial, places.length]} />
      <instancedMesh ref={phones} args={[undefined, phoneMaterial, phonePlaces.length]}>
        <planeGeometry args={[0.07, 0.13]} />
      </instancedMesh>
    </>
  );
}
