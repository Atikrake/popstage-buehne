import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { drawHostOverlay, drawLed, hostScreenKey, ledKey, makeCanvas } from './canvasArt';
import { useFrameData } from './frame';
import { HOST_DESK, LED_WALL } from './layout';
import { canvasTexture, coverScreen, makeScreenMaterial, neon, setNeon } from './materials';

/**
 * The screens with the show on them: the big LED wall behind the
 * contestants, and the host's two desk monitors — one turned to the
 * contestants, one to the host — both showing the host's own picture.
 */

export function LedWall() {
  const frame = useFrameData();
  const { canvas, ctx } = useMemo(() => makeCanvas(1024, 576), []);
  const texture = useMemo(() => canvasTexture(canvas), [canvas]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), [texture]);
  const last = useRef({ key: '', at: 0 });

  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    // Repainted only when what it shows changes: painting and uploading a
    // canvas every frame is what makes a phone stutter.
    const key = ledKey(c.led);
    const wall = performance.now();
    if (key !== last.current.key && wall - last.current.at > 40) {
      drawLed(ctx, 1024, 576, c.led);
      texture.needsUpdate = true;
      last.current = { key, at: wall };
    }
    // A touch above white, so the glow pass catches the bright parts.
    const beat = c.led.kind === 'verdict' || c.led.kind === 'decide' ? 0.12 * Math.sin(frame.current.now * 0.012) : 0;
    material.color.setScalar(c.ledPower * (1.15 + c.flash * 0.4 + beat));
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
    </group>
  );
}

const MONITOR = { width: 0.78, height: 1.02 };

/** One of the host's monitors: the picture, the bar over it, a frame. */
function HostMonitor({
  picture,
  overlay,
  mirror,
  material,
}: {
  picture: THREE.Texture;
  overlay: THREE.Texture;
  mirror: boolean;
  material: THREE.ShaderMaterial;
}) {
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#100C0F', roughness: 0.35, metalness: 0.55 }), []);
  const bar = useMemo(() => new THREE.MeshBasicMaterial({ map: overlay, transparent: true, toneMapped: false }), [overlay]);
  useFrame(() => coverScreen(material, picture, MONITOR.width / MONITOR.height, mirror));
  return (
    <group>
      <RoundedBox args={[MONITOR.width + 0.08, MONITOR.height + 0.08, 0.07]} radius={0.035} smoothness={3} material={dark} />
      <mesh position={[0, 0, 0.037]} material={material}>
        <planeGeometry args={[MONITOR.width, MONITOR.height]} />
      </mesh>
      <mesh position={[0, 0, 0.04]} material={bar}>
        <planeGeometry args={[MONITOR.width, MONITOR.height]} />
      </mesh>
    </group>
  );
}

export function HostDesk({ picture, selfView = true }: { picture: THREE.Texture; selfView?: boolean }) {
  const frame = useFrameData();
  const { canvas, ctx } = useMemo(() => makeCanvas(384, 512), []);
  const overlay = useMemo(() => canvasTexture(canvas), [canvas]);
  const front = useMemo(() => makeScreenMaterial(picture), [picture]);
  const back = useMemo(() => makeScreenMaterial(picture), [picture]);
  const strip = useMemo(() => neon('#FF2D7A', 2.6), []);
  const halo = useMemo(() => neon('#FF2D7A', 2.6), []);
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#F8F3F5', roughness: 0.22, metalness: 0.04 }), []);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#141015', roughness: 0.4, metalness: 0.5 }), []);
  const last = useRef('');
  const lit = useRef(0);

  useFrame((_s, delta) => {
    const c = frame.current.cues;
    if (!c) return;
    const key = hostScreenKey(c.host);
    if (key !== last.current) {
      drawHostOverlay(ctx, 384, 512, c.host);
      overlay.needsUpdate = true;
      last.current = key;
    }
    lit.current += (c.hostLit - lit.current) * Math.min(1, delta * 4);
    const bright = 0.55 + c.house * 0.45 + lit.current * 0.25;
    const live = (picture as THREE.Texture & { isVideoTexture?: boolean }).isVideoTexture === true;
    [front, back].forEach((m) => {
      m.uniforms.uTime.value = frame.current.now / 1000;
      m.uniforms.uBright.value = bright;
      m.uniforms.uBreath.value = live ? 0 : 1;
    });
    setNeon(strip, 0.5 + c.house * 0.5 + c.clockPulse);
    setNeon(halo, lit.current * (0.8 + 0.2 * Math.sin(frame.current.now * 0.005)), 0);
  });

  // The desk faces the stage; the camera usually looks over it from behind.
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
      {/* Towards the contestants: how they see the host. */}
      <group position={[0, 1.72, -0.18]} rotation={[0, Math.PI, 0]}>
        <mesh position={[0, 0, -0.05]} material={halo}>
          <planeGeometry args={[MONITOR.width + 0.22, MONITOR.height + 0.22]} />
        </mesh>
        <HostMonitor picture={picture} overlay={overlay} mirror={false} material={front} />
      </group>
      <mesh position={[0, 1.2, -0.18]} material={dark}>
        <boxGeometry args={[0.12, 0.3, 0.08]} />
      </mesh>
      {/* Towards the host: a self-view, mirrored like a front camera. */}
      {selfView ? (
        <group position={[0.62, 1.36, 0.26]} rotation={[-0.32, -0.12, 0]} scale={0.62}>
          <HostMonitor picture={picture} overlay={overlay} mirror material={back} />
        </group>
      ) : null}
    </group>
  );
}
