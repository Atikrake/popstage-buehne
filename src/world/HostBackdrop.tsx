import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { DISPLAY, heart, makeCanvas, PINK, rgba } from './canvasArt';
import { useFrameData } from './frame';
import { canvasTexture, neon, setNeon } from './materials';

/**
 * The wall behind the host's desk — what the contestants see behind the host.
 * White panels with light running down them, the studio entrance in the middle
 * as a frame of pink light (the intro walks in through it), and the show's
 * name glowing above.
 */

const Z = 12.95;
const DOOR = { width: 3.2, height: 3.0 };

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
  const mats = useMemo(
    () => ({
      panel: new THREE.MeshStandardMaterial({ color: '#F4EEF1', roughness: 0.4 }),
      edge: neon('#FF2D7A', 2.8),
      strip: neon('#FF8CC0', 2.0),
      sign: new THREE.MeshBasicMaterial({ map: canvasTexture(drawNeonSign()), transparent: true, toneMapped: false, depthWrite: false }),
    }),
    [],
  );

  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    setNeon(mats.edge, c.cove * (0.8 + c.clockPulse * 0.5 + c.flash), 0.05);
    setNeon(mats.strip, c.slats * 0.85, 0.04);
    mats.sign.color.setScalar(0.25 + c.cove * 1.35);
  });

  const side = (5.2 - DOOR.width / 2) / 1;
  return (
    <group position={[0, 0, Z]}>
      {[-1, 1].map((dir) => (
        <group key={dir} position={[dir * (DOOR.width / 2 + side / 2), 0, 0]} rotation={[0, -dir * 0.18, 0]}>
          <mesh position={[0, 3.1, 0]} material={mats.panel}>
            <boxGeometry args={[side, 6.2, 0.2]} />
          </mesh>
          {[-0.36, 0, 0.36].map((k) => (
            <mesh key={k} position={[k * side, 3.1, -0.11]} material={mats.strip}>
              <boxGeometry args={[0.05, 5.6, 0.02]} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, DOOR.height + (6.2 - DOOR.height) / 2, 0]} material={mats.panel}>
        <boxGeometry args={[DOOR.width, 6.2 - DOOR.height, 0.2]} />
      </mesh>
      {/* The entrance, framed in light. */}
      <mesh position={[0, DOOR.height + 0.04, -0.11]} material={mats.edge}>
        <boxGeometry args={[DOOR.width + 0.08, 0.06, 0.04]} />
      </mesh>
      {[-1, 1].map((dir) => (
        <mesh key={dir} position={[dir * (DOOR.width / 2 + 0.02), DOOR.height / 2, -0.11]} material={mats.edge}>
          <boxGeometry args={[0.06, DOOR.height, 0.04]} />
        </mesh>
      ))}
      {/* The show's name above it. */}
      <mesh position={[0, 4.55, -0.13]} rotation={[0, Math.PI, 0]} material={mats.sign}>
        <planeGeometry args={[4.6, 1.15]} />
      </mesh>
    </group>
  );
}
