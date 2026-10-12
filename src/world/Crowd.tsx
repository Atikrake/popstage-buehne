import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../show/seed';
import { useFrameData } from './frame';

/**
 * The studio audience on the tiers either side: simple figures, some holding
 * up a phone light. They sit still in the dark and bob and clap when the
 * director calls for applause. Drawn as one instanced mesh, so a full house
 * costs the phone a single draw.
 */

const TIER_INNER = 10.4;
const TIER_STEP = 1.05;

export function Crowd({ count }: { count: number }) {
  const frame = useFrameData();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => {
    const torso = new THREE.CapsuleGeometry(0.2, 0.34, 4, 10);
    torso.translate(0, 0.37, 0);
    const head = new THREE.SphereGeometry(0.13, 12, 10);
    head.translate(0, 0.86, 0);
    return mergeGeometries([torso, head])!;
  }, []);

  const people = useMemo(() => {
    const random = rng(42);
    const list: { x: number; y: number; z: number; phase: number; phone: boolean }[] = [];
    const perSide = Math.floor(count / 2);
    for (const side of [1, -1]) {
      for (let i = 0; i < perSide; i += 1) {
        const tier = i % 3;
        const r = TIER_INNER + tier * TIER_STEP + 0.55;
        const k = Math.floor(i / 3) / Math.max(1, Math.floor(perSide / 3));
        const a = side * (Math.PI * 0.31 + k * Math.PI * 0.32) + (random() - 0.5) * 0.02;
        const x = Math.sin(a) * r;
        const z = Math.cos(a) * r;
        list.push({ x, y: 0.42 * (tier + 1), z, phase: random() * 10, phone: random() < 0.18 });
      }
    }
    return list;
  }, [count]);

  const colors = useMemo(() => ['#3A2A33', '#4A3340', '#2E2530', '#55404C', '#3F2F3A', '#6A4A5A'].map((c) => new THREE.Color(c)), []);

  useEffect(() => {
    const random = rng(7);
    people.forEach((_, index) => mesh.current?.setColorAt(index, colors[Math.floor(random() * colors.length)]));
    if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [colors, people]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const phoneMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#FFFFFF').multiplyScalar(2.2), toneMapped: false, side: THREE.DoubleSide }), []);
  const phones = useMemo(() => people.filter((one) => one.phone), [people]);

  useFrame(() => {
    const c = frame.current.cues;
    if (!c || !mesh.current) return;
    const now = frame.current.now * 0.001;
    const cheer = c.applause;
    people.forEach((one, index) => {
      const bob = cheer * Math.abs(Math.sin(now * 9 + one.phase)) * 0.07 + Math.sin(now * 0.8 + one.phase) * 0.01;
      // Everybody faces the stage.
      dummy.position.set(one.x, one.y + bob, one.z);
      dummy.rotation.set(0, Math.atan2(-one.x, -3.6 - one.z), Math.sin(now * 1.3 + one.phase) * 0.03 * (1 + cheer * 3));
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (lights.current) {
      phones.forEach((one, index) => {
        const sway = Math.sin(now * 1.6 + one.phase) * 0.18;
        dummy.position.set(one.x + sway * 0.3, one.y + 1.25 + cheer * 0.05, one.z);
        dummy.rotation.set(0, Math.atan2(-one.x, -3.6 - one.z), 0);
        dummy.updateMatrix();
        lights.current!.setMatrixAt(index, dummy.matrix);
      });
      lights.current.instanceMatrix.needsUpdate = true;
      phoneMaterial.color.setScalar(0.3 + (1 - c.house) * 1.6 + cheer * 0.6);
    }
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[geometry, undefined, people.length]}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, phoneMaterial, phones.length]}>
        <planeGeometry args={[0.07, 0.12]} />
      </instancedMesh>
    </>
  );
}
