import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { drawHostOverlay, drawLed, heart, hostScreenKey, ledKey, makeCanvas, PINK } from './canvasArt';
import { useFrameData } from './frame';
import { HOST_DESK, LED_WALL } from './layout';
import {
  canvasTexture,
  chrome,
  coverScreen,
  darkGlass,
  gunmetal,
  lacquer,
  makeGlowFrameMaterial,
  makeLedMaterial,
  makeScreenMaterial,
} from './materials';
import { reflectable } from './reflection';
import { cap, crescentOutline, offsetOutline, profile, roundedPlane, roundedSlab, solid, sweep, turned } from './shapes';

/**
 * The screens with the show on them: the big LED wall behind the
 * contestants, and the host's curved desk with two monitors — one turned to
 * the contestants, one to the host — both showing the host's own picture.
 */

export function LedWall() {
  const frame = useFrameData();
  const group = useRef<THREE.Group>(null);
  const { canvas, ctx } = useMemo(() => makeCanvas(1024, 576), []);
  const texture = useMemo(() => canvasTexture(canvas), [canvas]);
  const material = useMemo(() => makeLedMaterial(texture, new THREE.Vector2(288, 162), new THREE.Vector2(8, 4.5)), [texture]);
  const last = useRef({ key: '', at: 0 });
  const { center, width, height } = LED_WALL;
  const shapes = useMemo(
    () => ({
      frame: roundedSlab(width + 0.42, height + 0.42, 0.34, 0.16, 0.05),
      bezel: roundedSlab(width + 0.12, height + 0.12, 0.04, 0.06, 0.015),
      screen: roundedPlane(width, height, 0.03),
    }),
    [height, width],
  );
  const mats = useMemo(() => ({ frame: gunmetal('#141016', 0.34), bezel: darkGlass('#060406') }), []);

  useLayoutEffect(() => reflectable(group.current), []);

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
    material.uniforms.uBright.value = c.ledPower * (1.15 + c.flash * 0.4 + beat);
    material.uniforms.uReveal.value = c.ledReveal;
  });

  return (
    <group ref={group} position={center.toArray()}>
      <mesh geometry={shapes.frame} material={mats.frame} position={[0, 0, -0.2]} receiveShadow />
      <mesh geometry={shapes.bezel} material={mats.bezel} position={[0, 0, -0.012]} />
      <mesh geometry={shapes.screen} material={material} position={[0, 0, 0.0095]} />
    </group>
  );
}

// --- the host's desk -----------------------------------------------------------

const MONITOR = { width: 0.78, height: 1.02 };

/**
 * A strip of light that can run: a steady glow, and while `uChase` is up,
 * bright pulses travelling along it. `u` is the distance along the strip.
 */
function makeChaseMaterial(color: string) {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uLevel: { value: 1 },
      uChase: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying float vU;
      void main() {
        vU = uv.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uLevel;
      uniform float uChase;
      uniform float uTime;
      varying float vU;
      void main() {
        float wave = pow(0.5 + 0.5 * sin(vU * 5.0 - uTime * 7.0), 8.0);
        float k = uLevel * (0.7 + uChase * wave * 2.2);
        gl_FragColor = vec4(uColor * k * 2.4, 1.0);
      }
    `,
  });
}

let deskKit: ReturnType<typeof buildDesk> | null = null;

function buildDesk() {
  // A crescent round the host, its front curving towards the stage.
  const outline = crescentOutline(new THREE.Vector2(0, 1.4), 1.12, 1.95, 0.62, 56);
  const H = 1.04;
  const body = solid(
    outline,
    profile([
      [-0.07, 0],
      [-0.07, 0.1, 0.02],
      [0, 0.15, 0.03],
      [0, H - 0.14, 0.09],
      [0.06, H - 0.07, 0.03],
      [0.06, H, 0.02],
      [-0.02, H],
    ]),
  );
  const strip = sweep(
    outline,
    profile(
      [
        [-0.07, 0.035],
        [-0.054, 0.04, 0.008],
        [-0.054, 0.075, 0.008],
        [-0.07, 0.08],
      ],
      3,
    ),
  );
  const lip = sweep(
    outline,
    profile(
      [
        [0.061, H - 0.045],
        [0.068, H - 0.035, 0.005],
        [0.068, H - 0.025, 0.005],
        [0.061, H - 0.015],
      ],
      2,
    ),
  );
  const top = cap(offsetOutline(outline, -0.08), H + 0.002);
  const arm = turned(
    profile([
      [0, H],
      [0.11, H, 0.004],
      [0.11, H + 0.02, 0.012],
      [0.032, H + 0.034, 0.012],
      [0.026, 1.25],
      [0.04, 1.27, 0.012],
      [0.04, 1.33, 0.012],
      [0, 1.33],
    ]),
    28,
  );
  return {
    body,
    strip,
    lip,
    top,
    arm,
    housing: roundedSlab(MONITOR.width + 0.07, MONITOR.height + 0.07, 0.06, 0.07, 0.02),
    bezel: roundedSlab(MONITOR.width + 0.045, MONITOR.height + 0.045, 0.014, 0.055, 0.006),
    screen: roundedPlane(MONITOR.width, MONITOR.height, 0.035),
    glowPlane: new THREE.PlaneGeometry(MONITOR.width + 0.7, MONITOR.height + 0.7),
    white: lacquer('#F8F3F6', 0.26),
    glass: darkGlass(),
    // The desk top: dark satin, so the room does not mirror in it and the monitors stand out.
    deskTop: new THREE.MeshStandardMaterial({ color: '#1C161A', roughness: 0.4, metalness: 0.35, envMapIntensity: 0.6 }),
    logo: (() => {
      const { canvas, ctx } = makeCanvas(128, 128);
      heart(ctx, 64, 66, 96, PINK);
      return new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), transparent: true, toneMapped: false, depthWrite: false });
    })(),
    logoPlane: new THREE.PlaneGeometry(0.16, 0.16),
    metal: chrome(),
    back: gunmetal('#18131A', 0.42),
  };
}

/** One of the host's monitors: housing, glass, the picture and the bar over it. */
function HostMonitor({ overlay, material }: { overlay: THREE.Material; material: THREE.ShaderMaterial }) {
  const k = deskKit!;
  return (
    <group>
      <mesh geometry={k.housing} material={k.back} position={[0, 0, -0.025]} castShadow />
      <mesh geometry={k.bezel} material={k.glass} position={[0, 0, 0.012]} />
      <mesh geometry={k.screen} material={material} position={[0, 0, 0.0195]} />
      <mesh geometry={k.screen} material={overlay} position={[0, 0, 0.021]} />
      {/* The show's heart on the back. */}
      <mesh geometry={k.logoPlane} material={k.logo} position={[0, 0.06, -0.0565]} rotation={[0, Math.PI, 0]} />
    </group>
  );
}

export function HostDesk({ picture, selfView = true }: { picture: THREE.Texture; selfView?: boolean }) {
  const frame = useFrameData();
  if (!deskKit) deskKit = buildDesk();
  const k = deskKit;
  const group = useRef<THREE.Group>(null);
  const { canvas, ctx } = useMemo(() => makeCanvas(384, 512), []);
  const overlayTexture = useMemo(() => canvasTexture(canvas), [canvas]);
  const overlay = useMemo(() => new THREE.MeshBasicMaterial({ map: overlayTexture, transparent: true, toneMapped: false }), [overlayTexture]);
  const front = useMemo(() => makeScreenMaterial(picture), [picture]);
  const back = useMemo(() => makeScreenMaterial(picture), [picture]);
  const strip = useMemo(() => makeChaseMaterial('#FF2D7A'), []);
  const halo = useMemo(() => makeGlowFrameMaterial('#FF2D7A', new THREE.Vector2(MONITOR.width / 2 + 0.035, MONITOR.height / 2 + 0.035), 0.07), []);
  const last = useRef('');
  const lit = useRef(0);

  useLayoutEffect(() => reflectable(group.current), []);

  useFrame((_s, delta) => {
    const c = frame.current.cues;
    if (!c) return;
    const key = hostScreenKey(c.host);
    if (key !== last.current) {
      drawHostOverlay(ctx, 384, 512, c.host);
      overlayTexture.needsUpdate = true;
      last.current = key;
    }
    lit.current += (c.hostLit - lit.current) * (1 - Math.exp(-4 * Math.min(delta, 0.1)));
    const bright = 0.55 + c.house * 0.45 + lit.current * 0.25;
    const live = (picture as THREE.Texture & { isVideoTexture?: boolean }).isVideoTexture === true;
    coverScreen(front, picture, MONITOR.width / MONITOR.height, false);
    coverScreen(back, picture, MONITOR.width / MONITOR.height, true);
    [front, back].forEach((m) => {
      m.uniforms.uTime.value = frame.current.now / 1000;
      m.uniforms.uBright.value = bright;
      m.uniforms.uBreath.value = live ? 0 : 1;
    });
    strip.uniforms.uLevel.value = 0.45 + c.house * 0.4 + c.clockPulse + c.flash;
    strip.uniforms.uChase.value = lit.current;
    strip.uniforms.uTime.value = frame.current.now / 1000;
    halo.uniforms.uLevel.value = lit.current * (0.85 + 0.15 * Math.sin(frame.current.now * 0.005));
  });

  // The desk faces the stage; the camera usually looks over it from behind.
  return (
    <group ref={group} position={HOST_DESK.toArray()}>
      <mesh geometry={k.body} material={k.white} castShadow receiveShadow />
      <mesh geometry={k.top} material={k.deskTop} />
      <mesh geometry={k.lip} material={k.metal} />
      <mesh geometry={k.strip} material={strip} />
      {/* Towards the contestants: how they see the host. */}
      <mesh geometry={k.arm} material={k.metal} position={[0, 0, -0.12]} castShadow />
      <group position={[0, 1.72, -0.18]} rotation={[0, Math.PI, 0]}>
        <mesh geometry={k.glowPlane} material={halo} position={[0, 0, -0.07]} renderOrder={2} />
        <HostMonitor overlay={overlay} material={front} />
      </group>
      {/* Towards the host: a self-view, mirrored like a front camera. */}
      {selfView ? (
        <group position={[0.62, 1.36, 0.26]} rotation={[-0.32, -0.12, 0]} scale={0.62}>
          <HostMonitor overlay={overlay} material={back} />
        </group>
      ) : null}
    </group>
  );
}
