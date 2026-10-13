import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DISPLAY, heart, makeCanvas, PINK, rgba } from './canvasArt';
import { useFrameData } from './frame';
import { canvasTexture, lacquer, neon, setNeon } from './materials';
import { reflectable } from './reflection';
import { merge, pipe, roundedSlab } from './shapes';

/**
 * The wall behind the host's desk — what the contestants see behind the host.
 * Two lacquered wings with light let into them, the studio entrance in the
 * middle framed by a rounded line of pink light (the intro walks in through
 * it), and the show's name glowing above.
 */

const Z = 12.95;
const DOOR = { width: 3.2, height: 3.0 };
const WING = 3.6;

function drawNeonSign() {
  const { canvas, ctx } = makeCanvas(1024, 256);
  ctx.clearRect(0, 0, 1024, 256);
  ctx.font = `800 150px ${DISPLAY}`;
  ctx.textBaseline = 'middle';
  const pop = 'POP';
  const stage = 'STAGE';
  const w1 = ctx.measureText(pop).width;
  const w2 = ctx.measureText(stage).width;
  const x = (1024 - (w1 + w2) - 120) / 2 + 120;
  heart(ctx, x - 70, 132, 96, PINK);
  ctx.shadowBlur = 30;
  ctx.shadowColor = 'rgba(255,255,255,0.8)';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(pop, x, 134);
  ctx.shadowColor = rgba(PINK, 1);
  ctx.fillStyle = PINK;
  ctx.fillText(stage, x + w1, 134);
  return canvas;
}

export function HostBackdrop() {
  const frame = useFrameData();
  const group = useRef<THREE.Group>(null);
  const mats = useMemo(
    () => ({
      panel: lacquer('#F4EEF1', 0.34),
      edge: neon('#FF2D7A', 2.8),
      strip: neon('#FF8CC0', 2.0),
      sign: new THREE.MeshBasicMaterial({ map: canvasTexture(drawNeonSign()), transparent: true, toneMapped: false, depthWrite: false }),
    }),
    [],
  );
  const shapes = useMemo(() => {
    const rod = new THREE.CapsuleGeometry(0.02, 5.4, 4, 10);
    return {
      wing: roundedSlab(WING, 6.2, 0.24, 0.14, 0.04),
      header: roundedSlab(DOOR.width + 0.2, 6.2 - DOOR.height, 0.22, 0.1, 0.04),
      rods: merge([-0.36, 0, 0.36].map((k) => rod.clone().translate(k * WING, 0, 0))),
      arch: pipe(
        [
          new THREE.Vector3(-DOOR.width / 2, 0, 0),
          new THREE.Vector3(-DOOR.width / 2, DOOR.height, 0),
          new THREE.Vector3(DOOR.width / 2, DOOR.height, 0),
          new THREE.Vector3(DOOR.width / 2, 0, 0),
        ],
        0.032,
        0.45,
        10,
      ),
    };
  }, []);

  useLayoutEffect(() => reflectable(group.current), []);

  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    setNeon(mats.edge, c.cove * (0.8 + c.clockPulse * 0.5 + c.flash), 0.05);
    setNeon(mats.strip, c.slats * 0.85, 0.04);
    mats.sign.color.setScalar(0.2 + c.cove * 1.0);
  });

  return (
    <group ref={group} position={[0, 0, Z]}>
      {[-1, 1].map((dir) => (
        <group key={dir} position={[dir * (DOOR.width / 2 + WING / 2 + 0.02), 3.1, 0.18]} rotation={[0, dir * 0.18, 0]}>
          <mesh geometry={shapes.wing} material={mats.panel} receiveShadow />
          <mesh geometry={shapes.rods} material={mats.strip} position={[0, 0, -0.118]} />
        </group>
      ))}
      <mesh geometry={shapes.header} material={mats.panel} position={[0, DOOR.height + (6.2 - DOOR.height) / 2, 0.02]} />
      {/* The entrance, framed in light. */}
      <mesh geometry={shapes.arch} material={mats.edge} position={[0, 0, -0.13]} />
      {/* The show's name above it. */}
      <mesh position={[0, 4.5, -0.13]} rotation={[0, Math.PI, 0]} material={mats.sign}>
        <planeGeometry args={[3.3, 0.825]} />
      </mesh>
    </group>
  );
}
