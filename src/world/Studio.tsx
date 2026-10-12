import { MeshReflectorMaterial } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Quality } from '../quality';
import { useFrameData } from './frame';
import { CORRIDOR, HOST_DESK, LED_WALL, STAGE_CENTER, STAGE_RADIUS, STAGE_TOP, STUDIO_RADIUS, TRUSS } from './layout';
import { neon, setNeon } from './materials';

/**
 * The studio itself: a round white room with a glossy floor, a raised round
 * stage edged in pink light, slatted walls with pink light between the slats,
 * a dark ceiling with a glowing cove ring, and a lighting truss over the stage.
 * The look follows POPSTAGE's own studio pictures — white, pink, glossy.
 */

const DOOR_GAP = 0.125;

/** A flat ring sector lifted into a solid tier, for the audience seating. */
function tierGeometry(inner: number, outer: number, start: number, end: number, height: number) {
  const shape = new THREE.Shape();
  const steps = 40;
  for (let i = 0; i <= steps; i += 1) {
    const a = start + ((end - start) * i) / steps;
    const x = Math.sin(a) * outer;
    const y = -Math.cos(a) * outer;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const a = start + ((end - start) * i) / steps;
    shape.lineTo(Math.sin(a) * inner, -Math.cos(a) * inner);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 4 });
  // Shape x/y → world x/z, extruded upwards.
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function Environment() {
  const { gl, scene } = useThree();
  const frame = useFrameData();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.background = new THREE.Color('#0C0509');
    return () => {
      env.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    scene.environmentIntensity = 0.04 + c.house * 0.55;
  });
  return null;
}

export function Lights() {
  const frame = useFrameData();
  const hemi = useRef<THREE.HemisphereLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const wash = useRef<THREE.PointLight>(null);
  const focus = useRef<THREE.SpotLight>(null);
  const focusTarget = useMemo(() => new THREE.Object3D(), []);
  const gold = useMemo(() => new THREE.Color('#FFE2A8'), []);
  const white = useMemo(() => new THREE.Color('#FFFFFF'), []);
  const aim = useRef(new THREE.Vector3(0, 0.3, -3.6));
  const level = useRef(0);

  useFrame((_s, delta) => {
    const c = frame.current.cues;
    if (!c) return;
    const lift = c.flash * 1.6 + c.clockPulse * 0.25;
    if (hemi.current) hemi.current.intensity = 0.03 + c.house * 1.05 + lift;
    if (key.current) {
      key.current.intensity = c.house * 1.5 + lift;
      key.current.color.copy(white).lerp(gold, c.gold * 0.6);
    }
    if (fill.current) fill.current.intensity = c.house * 0.55;
    if (wash.current) wash.current.intensity = 6 + c.cove * 18;
    // A real light that follows whoever is in the spotlight.
    const s = c.focusId ? c.seats.get(c.focusId) : null;
    const want = s ? 1 : 0;
    level.current += (want - level.current) * Math.min(1, delta * 4);
    if (s) aim.current.lerp(s.position.clone().setY(1.6), c.focusSnap ? 1 : Math.min(1, delta * 6));
    focusTarget.position.copy(aim.current);
    if (focus.current) {
      focus.current.intensity = 70 * level.current;
      focus.current.position.set(aim.current.x * 0.6, 8.2, aim.current.z + 6.5);
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#FFF6FA', '#E9D3DD', 1]} />
      <directionalLight ref={key} position={[3, 10, 12]} intensity={1.2} />
      <directionalLight ref={fill} position={[-8, 5, 2]} intensity={0.5} color="#FFD9E8" />
      <pointLight ref={wash} position={[0, 1.4, -1]} distance={14} decay={1.6} color="#FF5A9E" />
      <primitive object={focusTarget} />
      <spotLight ref={focus} angle={0.32} penumbra={0.8} decay={1.2} distance={24} color="#FFF4F8" target={focusTarget} />
    </>
  );
}

export function Studio({ quality }: { quality: Quality }) {
  const frame = useFrameData();

  const mats = useMemo(() => {
    const white = new THREE.MeshStandardMaterial({ color: '#F6F1F3', roughness: 0.3, metalness: 0.02 });
    const wall = new THREE.MeshStandardMaterial({ color: '#EFE7EB', roughness: 0.55, side: THREE.BackSide });
    const band = new THREE.MeshStandardMaterial({ color: '#2A1220', roughness: 0.7, side: THREE.BackSide });
    const ceiling = new THREE.MeshStandardMaterial({ color: '#130A10', roughness: 0.9, side: THREE.DoubleSide });
    const metal = new THREE.MeshStandardMaterial({ color: '#1C161A', roughness: 0.32, metalness: 0.85 });
    const slat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.4 });
    const stageTop = new THREE.MeshStandardMaterial({ color: '#FBF7F9', roughness: 0.16, metalness: 0.05 });
    const riser = new THREE.MeshStandardMaterial({ color: '#EDE3E8', roughness: 0.5 });
    return {
      white,
      wall,
      band,
      ceiling,
      metal,
      slat,
      stageTop,
      riser,
      edge: neon('#FF2D7A', 2.6),
      cove: neon('#FF5AA0', 2.2),
      slatLight: neon('#FF8CC0', 1.8),
      soffit: neon('#FFF1F6', 1.5),
      inlay: neon('#FF2D7A', 1.4),
    };
  }, []);

  // The pink light between the wall slats, and the slats themselves.
  const slatCount = 64;
  const slats = useMemo(() => {
    const list: { x: number; z: number; ry: number }[] = [];
    for (let i = 0; i < slatCount; i += 1) {
      const a = (i / slatCount) * Math.PI * 2 + 0.05;
      const wrapped = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(wrapped) < DOOR_GAP + 0.06) continue;
      list.push({ x: Math.sin(a) * (STUDIO_RADIUS - 0.2), z: Math.cos(a) * (STUDIO_RADIUS - 0.2), ry: a });
    }
    return list;
  }, []);
  const slatMesh = useRef<THREE.InstancedMesh>(null);
  const lightMesh = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    slats.forEach((one, index) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), one.ry);
      m.compose(new THREE.Vector3(one.x, 3.1, one.z), q, new THREE.Vector3(1, 1, 1));
      slatMesh.current?.setMatrixAt(index, m);
      const a = one.ry + Math.PI / slatCount;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      m.compose(new THREE.Vector3(Math.sin(a) * (STUDIO_RADIUS - 0.08), 3.1, Math.cos(a) * (STUDIO_RADIUS - 0.08)), q, new THREE.Vector3(1, 1, 1));
      lightMesh.current?.setMatrixAt(index, m);
    });
    if (slatMesh.current) slatMesh.current.instanceMatrix.needsUpdate = true;
    if (lightMesh.current) lightMesh.current.instanceMatrix.needsUpdate = true;
  }, [slats]);

  const tiers = useMemo(() => {
    const list: THREE.BufferGeometry[] = [];
    for (const side of [1, -1]) {
      for (let i = 0; i < 3; i += 1) {
        const start = side > 0 ? Math.PI * 0.3 : -Math.PI * 0.64;
        const end = side > 0 ? Math.PI * 0.64 : -Math.PI * 0.3;
        list.push(tierGeometry(10.4 + i * 1.05, 11.45 + i * 1.05, start, end, 0.42 * (i + 1)));
      }
    }
    return list;
  }, []);

  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    const pulse = c.clockPulse * 0.6 + c.flash;
    setNeon(mats.edge, c.stageEdge * (0.75 + pulse));
    setNeon(mats.cove, c.cove * (0.85 + pulse * 0.5));
    setNeon(mats.slatLight, c.slats * (0.7 + pulse * 0.4));
    setNeon(mats.soffit, c.cove * 0.9);
    setNeon(mats.inlay, c.stageEdge * 0.45, 0.02);
    // Gold creeps into the room for the finale.
    if (c.gold > 0) {
      (mats.cove.userData.base as THREE.Color).set('#FF5AA0').lerp(new THREE.Color('#FFC86A'), c.gold * 0.7);
    } else {
      (mats.cove.userData.base as THREE.Color).set('#FF5AA0');
    }
  });

  return (
    <group>
      {/* The floor: glossy white, with pink rings set into it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[STUDIO_RADIUS + 0.5, 96]} />
        {quality === 'high' ? (
          <MeshReflectorMaterial
            color="#EFE8EC"
            blur={[400, 120]}
            resolution={768}
            mixBlur={1}
            mixStrength={1.6}
            mirror={0.55}
            roughness={0.55}
            metalness={0.15}
            depthScale={0.4}
            minDepthThreshold={0.6}
            maxDepthThreshold={1.2}
          />
        ) : (
          <meshStandardMaterial color="#F1EAEE" roughness={0.12} metalness={0.08} />
        )}
      </mesh>
      {[7.4, 8.9].map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[STAGE_CENTER.x, 0.004, STAGE_CENTER.z]} material={mats.inlay}>
          <ringGeometry args={[r, r + (i ? 0.035 : 0.06), 128]} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[HOST_DESK.x, 0.004, HOST_DESK.z]} material={mats.edge}>
        <ringGeometry args={[1.55, 1.6, 96]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[HOST_DESK.x, 0.003, HOST_DESK.z]} material={mats.inlay}>
        <ringGeometry args={[2.0, 2.02, 96]} />
      </mesh>

      {/* The stage: a step, then the round platform with light along its edge. */}
      <mesh position={[STAGE_CENTER.x, 0.07, STAGE_CENTER.z]} material={mats.white}>
        <cylinderGeometry args={[STAGE_RADIUS + 0.5, STAGE_RADIUS + 0.5, 0.14, 128]} />
      </mesh>
      <mesh position={[STAGE_CENTER.x, 0.07 + 0.14, STAGE_CENTER.z]} material={mats.stageTop}>
        <cylinderGeometry args={[STAGE_RADIUS, STAGE_RADIUS, 0.22, 128]} />
      </mesh>
      <mesh position={[STAGE_CENTER.x, STAGE_TOP - 0.03, STAGE_CENTER.z]} rotation={[Math.PI / 2, 0, 0]} material={mats.edge}>
        <torusGeometry args={[STAGE_RADIUS + 0.01, 0.028, 8, 160]} />
      </mesh>
      <mesh position={[STAGE_CENTER.x, 0.13, STAGE_CENTER.z]} rotation={[Math.PI / 2, 0, 0]} material={mats.edge}>
        <torusGeometry args={[STAGE_RADIUS + 0.51, 0.022, 8, 160]} />
      </mesh>
      {[2.2, 3.9].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[STAGE_CENTER.x, STAGE_TOP + 0.002, STAGE_CENTER.z]} material={mats.inlay}>
          <ringGeometry args={[r, r + 0.03, 128]} />
        </mesh>
      ))}

      {/* The wall, with a gap where the corridor comes in. */}
      <mesh position={[0, 3.1, 0]} material={mats.wall}>
        <cylinderGeometry args={[STUDIO_RADIUS, STUDIO_RADIUS, 6.2, 128, 1, true, DOOR_GAP, Math.PI * 2 - DOOR_GAP * 2]} />
      </mesh>
      <mesh position={[0, 7.9, 0]} material={mats.band}>
        <cylinderGeometry args={[STUDIO_RADIUS, STUDIO_RADIUS, 3.4, 128, 1, true]} />
      </mesh>
      <instancedMesh ref={slatMesh} args={[undefined, undefined, slats.length]} material={mats.slat}>
        <boxGeometry args={[0.32, 6.2, 0.22]} />
      </instancedMesh>
      <instancedMesh ref={lightMesh} args={[undefined, undefined, slats.length]} material={mats.slatLight}>
        <boxGeometry args={[0.07, 5.6, 0.02]} />
      </instancedMesh>
      {/* The soffit and cove where wall meets ceiling. */}
      <mesh position={[0, 6.22, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.soffit}>
        <torusGeometry args={[STUDIO_RADIUS - 0.25, 0.05, 8, 192]} />
      </mesh>
      <mesh position={[0, 6.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.ceiling}>
        <ringGeometry args={[STUDIO_RADIUS - 1.4, STUDIO_RADIUS, 128]} />
      </mesh>
      <mesh position={[0, 6.48, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.cove}>
        <torusGeometry args={[STUDIO_RADIUS - 1.4, 0.07, 8, 192]} />
      </mesh>
      <mesh position={[0, 9.6, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.ceiling}>
        <circleGeometry args={[STUDIO_RADIUS + 0.2, 64]} />
      </mesh>

      {/* Audience seating either side. */}
      {tiers.map((geometry, index) => (
        <mesh key={index} geometry={geometry} material={mats.riser} />
      ))}

      <Truss metal={mats.metal} />
      <LedSurround />
    </group>
  );
}

/** Two rings of truss over the stage, hung from the ceiling. */
function Truss({ metal }: { metal: THREE.Material }) {
  const verticals = useMemo(() => Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2), []);
  return (
    <group position={TRUSS.center.toArray()}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={metal}>
        <torusGeometry args={[TRUSS.radius, 0.06, 8, 128]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.42, 0]} material={metal}>
        <torusGeometry args={[TRUSS.radius, 0.06, 8, 128]} />
      </mesh>
      {verticals.map((a) => (
        <mesh key={a} position={[Math.sin(a) * TRUSS.radius, -0.21, Math.cos(a) * TRUSS.radius]} material={metal}>
          <cylinderGeometry args={[0.025, 0.025, 0.42, 6]} />
        </mesh>
      ))}
      {[0.6, 2.2, 3.8, 5.4].map((a) => (
        <mesh key={a} position={[Math.sin(a) * TRUSS.radius, 0.55, Math.cos(a) * TRUSS.radius]} material={metal}>
          <cylinderGeometry args={[0.012, 0.012, 1.1, 4]} />
        </mesh>
      ))}
    </group>
  );
}

/** Pillars either side of the LED wall, with light running up them. */
function LedSurround() {
  const frame = useFrameData();
  const strip = useMemo(() => neon('#FF2D7A', 2.6), []);
  const pillar = useMemo(() => new THREE.MeshStandardMaterial({ color: '#F7F2F4', roughness: 0.28 }), []);
  useFrame(() => {
    const c = frame.current.cues;
    if (c) setNeon(strip, c.ledPower * (0.6 + c.clockPulse * 0.6 + c.flash));
  });
  const x = LED_WALL.width / 2 + 0.75;
  return (
    <group position={[0, 0, LED_WALL.center.z + 0.1]}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * x, 0, 0]}>
          <mesh position={[0, 3.5, 0]} material={pillar}>
            <boxGeometry args={[0.9, 7, 0.9]} />
          </mesh>
          <mesh position={[side * -0.46, 3.5, 0.2]} material={strip}>
            <boxGeometry args={[0.04, 6.6, 0.04]} />
          </mesh>
          <mesh position={[side * -0.46, 3.5, -0.2]} material={strip}>
            <boxGeometry args={[0.04, 6.6, 0.04]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export { CORRIDOR };
