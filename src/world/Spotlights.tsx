import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { headPosition } from './director';
import { useFrameData } from './frame';
import { TRUSS } from './layout';
import { getGlow, makeBeamMaterial, neon, setNeon } from './materials';

/**
 * The moving heads on the truss. Each one turns towards where the director
 * wants it, throws a soft beam through the haze and leaves a pool of light
 * where it lands. In the verdict a head jumps from person to person without
 * travelling — that is how a real operator hunts with a spot.
 */

const DOWN = new THREE.Vector3(0, -1, 0);

function Head({ index }: { index: number }) {
  const frame = useFrameData();
  const home = useMemo(() => headPosition(index), [index]);
  const lamp = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const pool = useRef<THREE.Mesh>(null);
  const aim = useRef(new THREE.Vector3(0, 0.3, -3.6));
  const level = useRef(0);
  const color = useRef(new THREE.Color('#FFFFFF'));

  const beamGeometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.07, 1, 1, 28, 1, true);
    g.translate(0, -0.5, 0);
    return g;
  }, []);
  const beamMaterial = useMemo(() => makeBeamMaterial(), []);
  const lens = useMemo(() => neon('#FFFFFF', 3), []);
  const poolMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: getGlow(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: '#141014', roughness: 0.4, metalness: 0.7 }), []);

  useFrame((_s, delta) => {
    const c = frame.current.cues;
    if (!c) return;
    const cue = c.spots[index];
    const dt = Math.min(delta, 0.1);
    if (cue.snap) aim.current.copy(cue.aim);
    else aim.current.lerp(cue.aim, 1 - Math.exp(-5 * dt));
    level.current += (cue.level - level.current) * (1 - Math.exp(-14 * dt));
    color.current.lerp(cue.color, 1 - Math.exp(-6 * dt));

    lamp.current?.lookAt(aim.current);
    const dir = aim.current.clone().sub(home);
    const length = dir.length();
    dir.normalize();
    const strength = level.current * (0.3 + (1 - c.house) * 1.9);
    if (beam.current) {
      beam.current.position.copy(home);
      beam.current.quaternion.setFromUnitVectors(DOWN, dir);
      beam.current.scale.set(length * 0.105, length, length * 0.105);
      beam.current.visible = strength > 0.01;
    }
    beamMaterial.uniforms.uIntensity.value = strength;
    beamMaterial.uniforms.uColor.value.copy(color.current);
    (lens.userData.base as THREE.Color).copy(color.current);
    setNeon(lens, level.current, 0.03);
    if (pool.current) {
      pool.current.position.set(aim.current.x, aim.current.y + 0.012, aim.current.z);
      const size = 1.2 + length * 0.12;
      pool.current.scale.set(size, size, size);
      poolMaterial.color.copy(color.current).multiplyScalar(level.current * 0.55);
      pool.current.visible = level.current > 0.02;
    }
  });

  return (
    <>
      <group position={home}>
        <mesh position={[0, 0.2, 0]} material={body}>
          <boxGeometry args={[0.34, 0.14, 0.34]} />
        </mesh>
        <group ref={lamp}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={body}>
            <cylinderGeometry args={[0.15, 0.19, 0.42, 16]} />
          </mesh>
          <mesh position={[0, 0, 0.215]} material={lens}>
            <circleGeometry args={[0.13, 20]} />
          </mesh>
        </group>
      </group>
      <mesh ref={beam} geometry={beamGeometry} material={beamMaterial} renderOrder={5} />
      <mesh ref={pool} rotation={[-Math.PI / 2, 0, 0]} material={poolMaterial} renderOrder={4}>
        <planeGeometry args={[1, 1]} />
      </mesh>
    </>
  );
}

export function Spotlights() {
  return (
    <group>
      {Array.from({ length: TRUSS.heads }, (_, index) => (
        <Head key={index} index={index} />
      ))}
    </group>
  );
}
