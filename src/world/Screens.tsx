import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { drawDesk, drawLed, makeCanvas } from './canvasArt';
import { useFrameData } from './frame';
import { HOST_DESK, LED_WALL } from './layout';
import { canvasTexture, neon, setNeon } from './materials';

/**
 * The two screens with words on them: the big LED wall behind the
 * contestants, which tells the room what is happening, and the small monitor
 * on the host's desk, turned towards the camera.
 */

export function LedWall({ redrawMs = 90 }: { redrawMs?: number }) {
  const frame = useFrameData();
  const { canvas, ctx } = useMemo(() => makeCanvas(1024, 576), []);
  const texture = useMemo(() => canvasTexture(canvas), [canvas]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), [texture]);
  const glow = useRef<THREE.PointLight>(null);
  const last = useRef({ at: 0, kind: '' });

  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    // Redraws are paced by the wall clock; what is drawn follows the show's clock.
    const wall = performance.now();
    const kind = c.led.kind;
    if (kind !== last.current.kind || wall - last.current.at > (kind === 'boot' ? 50 : redrawMs)) {
      drawLed(ctx, 1024, 576, c.led, frame.current.now / 1000);
      texture.needsUpdate = true;
      last.current = { at: wall, kind };
    }
    // A touch above white, so the glow pass catches the bright parts.
    material.color.setScalar(c.ledPower * (1.18 + c.flash * 0.4));
    if (glow.current) glow.current.intensity = c.ledPower * 7;
  });

  const { center, width, height } = LED_WALL;
  return (
    <group position={center.toArray()}>
      <RoundedBox args={[width + 0.36, height + 0.36, 0.3]} radius={0.08} smoothness={3} position={[0, 0, -0.16]}>
        <meshStandardMaterial color="#0F0A0D" roughness={0.45} metalness={0.4} />
      </RoundedBox>
      <mesh material={material}>
        <planeGeometry args={[width, height]} />
      </mesh>
      <pointLight ref={glow} position={[0, -0.6, 2.4]} distance={9} decay={1.8} color="#FF6FAE" />
    </group>
  );
}

export function HostDesk() {
  const frame = useFrameData();
  const { canvas, ctx } = useMemo(() => makeCanvas(512, 288), []);
  const texture = useMemo(() => canvasTexture(canvas), [canvas]);
  const screen = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), [texture]);
  const strip = useMemo(() => neon('#FF2D7A', 2.6), []);
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#F8F3F5', roughness: 0.22, metalness: 0.04 }), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#141015', roughness: 0.4, metalness: 0.5 }), []);
  const last = useRef(0);

  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    const wall = performance.now();
    if (wall - last.current > 200) {
      drawDesk(ctx, 512, 288, c.desk);
      texture.needsUpdate = true;
      last.current = wall;
    }
    screen.color.setScalar(0.25 + c.house * 0.85);
    setNeon(strip, 0.5 + c.house * 0.5 + c.clockPulse);
  });

  // The desk faces the stage; the camera looks over it from behind.
  return (
    <group position={HOST_DESK.toArray()}>
      <RoundedBox args={[1.9, 1.04, 0.86]} radius={0.12} smoothness={4} position={[0, 0.52, 0]} material={white} />
      <mesh position={[0, 1.07, 0]} material={dark}>
        <boxGeometry args={[2.0, 0.06, 0.96]} />
      </mesh>
      <mesh position={[0, 0.16, 0.44]} material={strip}>
        <boxGeometry args={[1.9, 0.035, 0.02]} />
      </mesh>
      <mesh position={[0, 0.16, -0.44]} material={strip}>
        <boxGeometry args={[1.9, 0.035, 0.02]} />
      </mesh>
      {/* The host's monitor, tilted towards whoever stands behind the desk. */}
      <group position={[0, 1.36, 0.22]} rotation={[-0.38, 0, 0]}>
        <RoundedBox args={[1.12, 0.66, 0.05]} radius={0.03} smoothness={2} material={dark} />
        <mesh position={[0, 0, 0.027]} material={screen}>
          <planeGeometry args={[1.04, 0.585]} />
        </mesh>
      </group>
      <mesh position={[0, 1.18, 0.2]} material={dark}>
        <boxGeometry args={[0.12, 0.2, 0.06]} />
      </mesh>
    </group>
  );
}
