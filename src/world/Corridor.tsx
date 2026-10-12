import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { drawOnAir, drawPoster, drawSign } from './canvasArt';
import { useFrameData } from './frame';
import { CORRIDOR } from './layout';
import { canvasTexture, neon, setNeon } from './materials';

/**
 * The way in: a white backstage corridor whose ceiling lights come on one
 * after another as you walk, show posters on the walls, and at the end the
 * studio doors under a red ON AIR sign. The doors slide open onto the dark
 * studio — that is where the intro begins.
 */

const PANELS = 11;

export function Corridor() {
  const frame = useFrameData();
  const length = CORRIDOR.start - CORRIDOR.end;
  const midZ = (CORRIDOR.start + CORRIDOR.end) / 2;
  const half = CORRIDOR.width / 2;

  const mats = useMemo(() => {
    const surface = (color: string) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: new THREE.Color(color), emissiveIntensity: 0 });
    return {
      wall: surface('#F2ECEF'),
      floor: new THREE.MeshStandardMaterial({ color: '#E9E2E6', roughness: 0.15, metalness: 0.1, emissive: new THREE.Color('#E9E2E6'), emissiveIntensity: 0 }),
      ceiling: surface('#F7F3F5'),
      door: surface('#FAF7F8'),
      panel: neon('#FFF4F8', 2.2),
      strip: neon('#FF2D7A', 2.4),
      onAir: new THREE.MeshBasicMaterial({ map: canvasTexture(drawOnAir()), toneMapped: false }),
      sign: new THREE.MeshBasicMaterial({ map: canvasTexture(drawSign('STUDIO 3', 'POPSTAGE · LIVE')), toneMapped: false }),
      frame: new THREE.MeshStandardMaterial({ color: '#141015', roughness: 0.4, metalness: 0.5 }),
      seam: new THREE.MeshBasicMaterial({ color: '#B9AEB4' }),
      wainscot: surface('#E4DADF'),
      window: neon('#FFB3D2', 1.6),
    };
  }, []);
  const panels = useMemo(() => Array.from({ length: PANELS }, () => neon('#FFF4F8', 2.2)), []);
  const posters = useMemo(
    () => ([0, 1, 2, 1, 0, 2] as const).map((kind) => new THREE.MeshBasicMaterial({ map: canvasTexture(drawPoster(kind)), toneMapped: false })),
    [],
  );
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);

  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    const lit = Math.min(1, c.corridorLights / PANELS);
    panels.forEach((material, index) => {
      const on = THREE.MathUtils.clamp(c.corridorLights - index, 0, 1);
      setNeon(material, on, 0.02);
    });
    const glow = 0.05 + lit * 0.55;
    mats.wall.emissiveIntensity = glow;
    mats.ceiling.emissiveIntensity = glow * 0.8;
    mats.floor.emissiveIntensity = glow * 0.35;
    mats.door.emissiveIntensity = glow;
    mats.wainscot.emissiveIntensity = glow * 0.75;
    setNeon(mats.strip, lit, 0.05);
    setNeon(mats.window, lit * 0.8, 0.05);
    posters.forEach((material) => material.color.setScalar(0.12 + lit * 0.88));
    mats.sign.color.setScalar(0.2 + lit * 0.9);
    // ON AIR blinks once the walk starts.
    mats.onAir.color.setScalar(lit > 0.2 ? (Math.sin(frame.current.now * 0.004) > -0.6 ? 1.6 : 0.6) : 0.2);
    const open = c.doorOpen * 1.72;
    if (left.current) left.current.position.x = -0.8 - open;
    if (right.current) right.current.position.x = 0.8 + open;
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, midZ]} material={mats.floor}>
        <planeGeometry args={[CORRIDOR.width, length]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, midZ]} material={mats.strip}>
        <planeGeometry args={[0.06, length]} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CORRIDOR.height, midZ]} material={mats.ceiling}>
        <planeGeometry args={[CORRIDOR.width, length]} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh rotation={[0, (-side * Math.PI) / 2, 0]} position={[side * half, CORRIDOR.height / 2, midZ]} material={mats.wall}>
            <planeGeometry args={[length, CORRIDOR.height]} />
          </mesh>
          {/* Pink light along the foot of each wall. */}
          <mesh position={[side * (half - 0.02), 0.08, midZ]} material={mats.strip}>
            <boxGeometry args={[0.02, 0.03, length]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, CORRIDOR.height / 2, CORRIDOR.start]} rotation={[0, Math.PI, 0]} material={mats.wall}>
        <planeGeometry args={[CORRIDOR.width, CORRIDOR.height]} />
      </mesh>

      {/* Wall panels: a lower band, seams every 1.6 m, light along the ceiling edge. */}
      {[-1, 1].map((side) => (
        <group key={`trim${side}`}>
          <mesh rotation={[0, (-side * Math.PI) / 2, 0]} position={[side * (half - 0.01), 0.55, midZ]} material={mats.wainscot}>
            <planeGeometry args={[length, 1.1]} />
          </mesh>
          <mesh position={[side * (half - 0.04), CORRIDOR.height - 0.06, midZ]} material={mats.strip}>
            <boxGeometry args={[0.03, 0.03, length]} />
          </mesh>
          {Array.from({ length: Math.floor(length / 1.6) }, (_, i) => (
            <mesh key={i} position={[side * (half - 0.012), CORRIDOR.height / 2, CORRIDOR.end + 0.8 + i * 1.6]} material={mats.seam}>
              <boxGeometry args={[0.012, CORRIDOR.height, 0.018]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Ceiling lights, nearest first. */}
      {panels.map((material, index) => (
        <mesh key={index} rotation={[Math.PI / 2, 0, 0]} position={[0, CORRIDOR.height - 0.01, CORRIDOR.start - 1.6 - index * 2.4]} material={material}>
          <planeGeometry args={[1.5, 0.5]} />
        </mesh>
      ))}

      {/* Posters, three a side, in light frames. */}
      {posters.map((material, index) => {
        const side = index % 2 ? 1 : -1;
        const z = CORRIDOR.start - 6 - Math.floor(index / 2) * 6.5 - (side > 0 ? 3 : 0);
        return (
          <group key={index} position={[side * (half - 0.03), 1.75, z]} rotation={[0, (-side * Math.PI) / 2, 0]}>
            <mesh position={[0, 0, -0.01]} material={mats.frame}>
              <planeGeometry args={[1.12, 1.6]} />
            </mesh>
            <mesh material={material}>
              <planeGeometry args={[1.0, 1.5]} />
            </mesh>
          </group>
        );
      })}

      {/* The studio doors, the sign and the ON AIR light above them. */}
      <group position={[0, 0, CORRIDOR.end + 0.05]}>
        <mesh position={[0, 3.05, 0.06]} material={mats.sign}>
          <planeGeometry args={[1.8, 0.45]} />
        </mesh>
        <mesh position={[0, 3.36, 0.07]} material={mats.onAir}>
          <planeGeometry args={[0.6, 0.19]} />
        </mesh>
        <mesh position={[0, 2.72, 0.02]} material={mats.frame}>
          <boxGeometry args={[3.4, 0.12, 0.1]} />
        </mesh>
        {[left, right].map((ref, index) => (
          <group key={index} ref={ref} position={[index ? 0.8 : -0.8, 0, 0]}>
            <mesh position={[0, 1.33, 0]} material={mats.door}>
              <boxGeometry args={[1.6, 2.66, 0.08]} />
            </mesh>
            <mesh position={[index ? -0.55 : 0.55, 1.6, 0.045]} material={mats.window}>
              <circleGeometry args={[0.16, 24]} />
            </mesh>
            <mesh position={[index ? -0.78 : 0.78, 1.33, 0.045]} material={mats.strip}>
              <boxGeometry args={[0.03, 2.5, 0.01]} />
            </mesh>
          </group>
        ))}
        {/* Above the doors, up to the ceiling: wall. */}
        <mesh position={[0, 3.1, 0]} material={mats.wall}>
          <boxGeometry args={[3.4, 0.8, 0.05]} />
        </mesh>
      </group>
    </group>
  );
}
