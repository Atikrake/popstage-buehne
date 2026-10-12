import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrameData } from './frame';
import { getGlow } from './materials';

/**
 * Confetti, balloon shreds, the flash of a burst and the haze in the light.
 *
 * Particles live in fixed pools drawn as instanced meshes — a burst only
 * wakes up particles that already exist, so nothing is created or thrown
 * away while the show runs and a phone never stutters on a POP.
 */

type Particle = {
  alive: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
  life: number;
  age: number;
  size: number;
  flutter: number;
};

const CONFETTI_COLORS = ['#FF2D7A', '#FF8FBC', '#FFFFFF', '#FFC23D', '#A97BFF', '#2FC7A8', '#FFE3EF'];

function pool(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    alive: false,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    r: new THREE.Euler(),
    w: new THREE.Vector3(),
    life: 1,
    age: 0,
    size: 1,
    flutter: 0,
  }));
}

export function Effects({ confettiCount, dustCount }: { confettiCount: number; dustCount: number }) {
  const frame = useFrameData();
  const { camera } = useThree();
  const confettiMesh = useRef<THREE.InstancedMesh>(null);
  const shardMesh = useRef<THREE.InstancedMesh>(null);
  const flash = useRef<THREE.Mesh>(null);
  const flashState = useRef({ age: 9, color: new THREE.Color('#ffffff') });

  const confetti = useMemo(() => pool(confettiCount), [confettiCount]);
  const shards = useMemo(() => pool(140), []);
  const cursor = useRef({ confetti: 0, shard: 0 });
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => CONFETTI_COLORS.map((c) => new THREE.Color(c)), []);
  const rainClock = useRef(0);

  const shardGeometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.06, 0, -0.05, -0.04, 0, 0.05, -0.03, 0.01], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  const shardMaterial = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.3 }), []);
  const flashMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: getGlow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [],
  );

  // The handles everything else uses to set effects off.
  useEffect(() => {
    const spawnConfetti = (position: THREE.Vector3, count: number, spread: number, burst: number) => {
      for (let i = 0; i < count; i += 1) {
        const index = cursor.current.confetti;
        const one = confetti[index];
        cursor.current.confetti = (cursor.current.confetti + 1) % confetti.length;
        one.alive = true;
        one.age = 0;
        one.life = 3.2 + Math.random() * 2.4;
        one.p.set(position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread * 0.3, position.z + (Math.random() - 0.5) * spread);
        const a = Math.random() * Math.PI * 2;
        const speed = burst * (0.4 + Math.random());
        one.v.set(Math.cos(a) * speed, burst * (0.6 + Math.random() * 1.2), Math.sin(a) * speed);
        one.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        one.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        one.size = 0.7 + Math.random() * 0.6;
        one.flutter = Math.random() * 10;
        confettiMesh.current?.setColorAt(index, colors[Math.floor(Math.random() * colors.length)]);
      }
      if (confettiMesh.current?.instanceColor) confettiMesh.current.instanceColor.needsUpdate = true;
    };

    frame.current.fx = {
      burst: (position, color) => {
        const tint = new THREE.Color(color);
        for (let i = 0; i < 46; i += 1) {
          const one = shards[cursor.current.shard];
          const index = cursor.current.shard;
          cursor.current.shard = (cursor.current.shard + 1) % shards.length;
          one.alive = true;
          one.age = 0;
          one.life = 1.4 + Math.random() * 0.8;
          one.p.copy(position);
          one.v.set((Math.random() - 0.5) * 7, Math.random() * 5 - 0.5, (Math.random() - 0.5) * 7);
          one.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
          one.w.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
          one.size = 0.45 + Math.random() * 0.75;
          shardMesh.current?.setColorAt(index, tint.clone().multiplyScalar(0.8 + Math.random() * 0.4));
        }
        if (shardMesh.current?.instanceColor) shardMesh.current.instanceColor.needsUpdate = true;
        spawnConfetti(position, 70, 0.3, 2.6);
        flashState.current.age = 0;
        flashState.current.color.set(color).lerp(new THREE.Color('#ffffff'), 0.5);
        if (flash.current) flash.current.position.copy(position);
      },
      confetti: (position, count, spread) => spawnConfetti(position, count, spread, 0.6),
    };
    return () => {
      frame.current.fx = null;
    };
  }, [colors, confetti, frame, shards]);

  useFrame((_s, delta) => {
    const c = frame.current.cues;
    const dt = Math.min(delta, 0.05);

    // Confetti raining from the rig at the finale, and a puff when everybody stays.
    if (c && c.confettiRain > 0) {
      rainClock.current += dt * c.confettiRain * 70;
      while (rainClock.current > 1) {
        rainClock.current -= 1;
        frame.current.fx?.confetti(new THREE.Vector3((Math.random() - 0.5) * 9, 8.3, -3.6 + (Math.random() - 0.5) * 7), 1, 0.2);
      }
    }

    const step = (list: Particle[], mesh: THREE.InstancedMesh | null, drag: number, gravity: number, flutterAmount: number, scale: number) => {
      if (!mesh) return;
      list.forEach((one, index) => {
        if (!one.alive) {
          dummy.position.set(0, -50, 0);
          dummy.scale.setScalar(0.0001);
        } else {
          one.age += dt;
          if (one.age > one.life) one.alive = false;
          one.v.y -= gravity * dt;
          one.v.multiplyScalar(1 - drag * dt);
          // Paper drifts side to side as it falls.
          one.p.x += (one.v.x + Math.sin(one.age * 6 + one.flutter) * flutterAmount) * dt;
          one.p.y += one.v.y * dt;
          one.p.z += (one.v.z + Math.cos(one.age * 5 + one.flutter) * flutterAmount) * dt;
          if (one.p.y < 0.02) {
            one.p.y = 0.02;
            one.v.set(0, 0, 0);
            one.w.multiplyScalar(0.9);
          }
          one.r.x += one.w.x * dt;
          one.r.y += one.w.y * dt;
          one.r.z += one.w.z * dt;
          const fade = Math.min(1, (one.life - one.age) * 2);
          dummy.position.copy(one.p);
          dummy.rotation.copy(one.r);
          dummy.scale.setScalar(one.size * scale * Math.max(0, fade));
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    step(confetti, confettiMesh.current, 1.6, 2.2, 0.5, 1);
    step(shards, shardMesh.current, 0.8, 7, 0, 1);

    const f = flashState.current;
    f.age += dt;
    if (flash.current) {
      const k = Math.max(0, 1 - f.age / 0.45);
      flash.current.visible = k > 0;
      flash.current.scale.setScalar(0.6 + (1 - k) * 3.4);
      flash.current.quaternion.copy(camera.quaternion);
      flashMaterial.color.copy(f.color).multiplyScalar(k * 3);
    }
  });

  return (
    <>
      <instancedMesh ref={confettiMesh} args={[undefined, undefined, confetti.length]} frustumCulled={false}>
        <planeGeometry args={[0.055, 0.09]} />
        <meshStandardMaterial side={THREE.DoubleSide} roughness={0.5} emissive="#ffffff" emissiveIntensity={0.25} />
      </instancedMesh>
      <instancedMesh ref={shardMesh} args={[shardGeometry, shardMaterial, shards.length]} frustumCulled={false} />
      <mesh ref={flash} material={flashMaterial} visible={false} renderOrder={10}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {dustCount > 0 ? <Dust count={dustCount} /> : null}
    </>
  );
}

/** Haze: tiny specks drifting in the air, catching the beams. */
function Dust({ count }: { count: number }) {
  const frame = useFrameData();
  const points = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = -3.6 + (Math.random() - 0.5) * 14;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.05,
        map: getGlow(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: new THREE.Color('#FFE6F0'),
        sizeAttenuation: true,
      }),
    [],
  );
  useFrame((_s, delta) => {
    const c = frame.current.cues;
    if (!points.current || !c) return;
    points.current.rotation.y += delta * 0.01;
    points.current.position.y = Math.sin(frame.current.now * 0.0002) * 0.2;
    material.opacity = 0.25 + (1 - c.house) * 0.45;
  });
  return <points ref={points} geometry={geometry} material={material} />;
}
