import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Contestant } from '../show/types';
import { drawAvatar, drawLiveTag, drawNamePlate } from './canvasArt';
import { useFrameData } from './frame';
import { ARC_CENTER, ARC_RADIUS, PODIUM } from './layout';
import {
  canvasTexture,
  chrome,
  coverScreen,
  darkGlass,
  gunmetal,
  lacquer,
  makeContactShadowMaterial,
  makeGlowFrameMaterial,
  makeHaloMaterial,
  makeScreenMaterial,
  makeStringMaterial,
  neon,
  setNeon,
  SHADER_LIB,
} from './materials';
import { clamp01, smoothDamp, smoother } from './motion';
import { reflectable } from './reflection';
import { balloonKnot, cap, heartBalloon, offsetOutline, profile, roundedPlane, roundedRectOutline, roundedSlab, solid, sweep, turned } from './shapes';

/**
 * One contestant's place on the stage: a white lacquered pedestal with a
 * line of light in their colour round its foot and their name on a backlit
 * plate, a monitor on a chrome stem showing them live (here: a stand-in),
 * and their heart balloon above it on a string.
 *
 * In the app the monitor shows the player's camera — the picture is a
 * texture slot, nothing else about the podium changes.
 *
 * Podiums glide along the arc to their seats, the balloon trailing on its
 * string, so the stage visibly closes ranks after somebody leaves.
 */

/** Moments of the pop, as shares of the pop phase. */
const POP_AT = 0.26;
const STATIC_FROM = 0.28;
const OFF_FROM = 0.42;
const OFF_TO = 0.5;
const TRAP_FROM = 0.44;
const SINK_FROM = 0.5;
const SINK_TO = 0.94;

/** A balloon filling: quick, a little past full, settling back. */
const inflateEase = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.exp(-7 * t) * Math.cos(11 * t));

// --- shared pieces --------------------------------------------------------------

const BODY = { width: 1.0, depth: 0.72, radius: 0.2 };
const PLATE = { width: 0.68, height: 0.18, y: 0.62 };
const SCREEN = { width: PODIUM.monitorWidth, height: PODIUM.monitorHeight };

type Kit = ReturnType<typeof buildKit>;
let kit: Kit | null = null;

function buildKit() {
  const outline = roundedRectOutline(BODY.width, BODY.depth, BODY.radius, 12);
  // Side view, from the floor up: a flared foot, a groove with the light in
  // it, the body widening gently towards a rounded lip, the top.
  const body = solid(
    outline,
    profile([
      [0.05, 0],
      [0.05, 0.075, 0.03],
      [-0.035, 0.095, 0.012],
      [-0.035, 0.145, 0.012],
      [-0.012, 0.17, 0.02],
      [0, PODIUM.height - 0.11, 0.06],
      [0.035, PODIUM.height - 0.05, 0.025],
      [0.035, PODIUM.height, 0.022],
      [-0.02, PODIUM.height],
    ]),
  );
  const band = sweep(
    outline,
    profile(
      [
        [-0.034, 0.1],
        [-0.016, 0.104, 0.01],
        [-0.016, 0.136, 0.01],
        [-0.034, 0.14],
      ],
      3,
    ),
  );
  const top = cap(offsetOutline(outline, -0.075), PODIUM.height + 0.002);
  const lip = sweep(
    outline,
    profile(
      [
        [-0.074, PODIUM.height + 0.001],
        [-0.062, PODIUM.height + 0.006, 0.004],
        [-0.05, PODIUM.height + 0.001],
      ],
      2,
    ),
  );
  // Where the plate sits, the body stands out by this much.
  const plateZ = BODY.depth / 2 - 0.012 * (1 - (PLATE.y - 0.17) / (PODIUM.height - 0.28)) + 0.004;

  const monitorBottom = PODIUM.monitorY - SCREEN.height / 2;
  const stem = turned(
    profile([
      [0, PODIUM.height],
      [0.1, PODIUM.height, 0.004],
      [0.1, PODIUM.height + 0.018, 0.012],
      [0.03, PODIUM.height + 0.03, 0.012],
      [0.024, monitorBottom + 0.12],
      [0.036, monitorBottom + 0.14, 0.012],
      [0.036, monitorBottom + 0.2, 0.012],
      [0, monitorBottom + 0.2],
    ]),
    28,
  );
  stem.translate(0, 0, -0.08);
  return {
    body,
    band,
    top,
    lip,
    plateZ,
    stem,
    plate: roundedPlane(PLATE.width, PLATE.height, 0.03),
    housing: roundedSlab(SCREEN.width + 0.07, SCREEN.height + 0.07, 0.06, 0.07, 0.02),
    bezel: roundedSlab(SCREEN.width + 0.045, SCREEN.height + 0.045, 0.014, 0.055, 0.006),
    screen: roundedPlane(SCREEN.width, SCREEN.height, 0.035),
    tag: roundedPlane(0.22, 0.077, 0.038),
    glowPlane: new THREE.PlaneGeometry(SCREEN.width + 0.7, SCREEN.height + 0.7),
    floorPlane: new THREE.PlaneGeometry(2.2, 2.2),
    shadowPlane: new THREE.PlaneGeometry(1.8, 1.5),
    heart: heartBalloon(0.66),
    knot: balloonKnot(),
    string: (() => {
      const g = new THREE.CylinderGeometry(0.0035, 0.0035, 1, 5, 20, true);
      g.translate(0, 0.5, 0);
      return g;
    })(),
    live: canvasTexture(drawLiveTag()),
    white: lacquer('#FAF6F8', 0.26),
    metal: chrome(),
    back: gunmetal('#18131A', 0.42),
    glass: darkGlass(),
  };
}

function getKit() {
  if (!kit) kit = buildKit();
  return kit;
}

/** The trapdoor: an opening in the stage floor with light round its edge. */
function makeTrapMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uOpen: { value: 0 }, uGlow: { value: 0 }, uColor: { value: new THREE.Color('#FF2D7A') } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpen;
      uniform float uGlow;
      uniform vec3 uColor;
      varying vec2 vP;
      ${SHADER_LIB}
      void main() {
        vec2 size = vec2(0.62, 0.46) * uOpen;
        float d = psRoundBox(vP, size, 0.18 * uOpen + 0.001);
        float aa = fwidth(d);
        float hole = 1.0 - smoothstep(-aa, aa, d);
        float rim = exp(-abs(d) * 26.0) * uGlow * step(0.001, uOpen);
        vec3 color = mix(uColor * rim * 3.0, vec3(0.0), hole * (1.0 - rim * 0.3));
        float a = clamp(hole + rim, 0.0, 1.0);
        gl_FragColor = vec4(color, a);
      }
    `,
  });
}

// --- the podium -------------------------------------------------------------------

export function Podium({
  contestant,
  order,
  onTap,
  picture,
}: {
  contestant: Contestant;
  /** Their place in the line-up, for when they come up during the intro. */
  order: number;
  onTap?: (id: string) => void;
  /** A live camera, once there is one; otherwise the stand-in is drawn. */
  picture?: THREE.Texture | null;
}) {
  const frame = useFrameData();
  const k = getKit();
  const root = useRef<THREE.Group>(null);
  const balloon = useRef<THREE.Group>(null);
  const string = useRef<THREE.Mesh>(null);
  const trap = useRef<THREE.Mesh>(null);

  const angle = useRef<number | null>(null);
  const angleVel = useRef({ v: 0 });
  const focus = useRef(1);
  const spoken = useRef(0);
  const burst = useRef(false);
  // The balloon's sway: an offset from where it would hang, and its speed.
  const sway = useMemo(() => ({ p: new THREE.Vector3(), v: new THREE.Vector3() }), []);
  // Reused every frame, so the frame loop leaves nothing for the garbage collector.
  const tmp = useMemo(
    () => ({ trail: new THREE.Vector3(), force: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), limp: new THREE.Vector3(), bend: new THREE.Vector3(), world: new THREE.Vector3() }),
    [],
  );
  const seed = order * 1.7 + 0.3;

  const avatar = useMemo(() => canvasTexture(drawAvatar(contestant.look)), [contestant]);
  const plate = useMemo(() => canvasTexture(drawNamePlate(contestant)), [contestant]);
  const screen = useMemo(() => makeScreenMaterial(avatar), [avatar]);
  const band = useMemo(() => neon(contestant.color, 2.6), [contestant.color]);
  const ring = useMemo(() => {
    const material = makeHaloMaterial(contestant.color);
    material.uniforms.uRadius.value = 0.86;
    material.uniforms.uWidth.value = 0.014;
    return material;
  }, [contestant.color]);
  const halo = useMemo(() => makeGlowFrameMaterial(contestant.color, new THREE.Vector2(SCREEN.width / 2 + 0.035, SCREEN.height / 2 + 0.035), 0.07), [contestant.color]);
  const trapMaterial = useMemo(() => makeTrapMaterial(), []);
  const shadow = useMemo(() => makeContactShadowMaterial(0.5), []);
  const topMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: contestant.color,
        roughness: 0.22,
        metalness: 0.1,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [contestant.color],
  );
  const balloonMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: contestant.color,
        // Foil, not mirror: soft enough that the studio's lights smear across it.
        roughness: 0.3,
        metalness: 0.4,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2,
        emissive: new THREE.Color(contestant.color),
        emissiveIntensity: 0.12,
        envMapIntensity: 1.4,
      }),
    [contestant.color],
  );
  const stringMaterial = useMemo(() => makeStringMaterial(), []);
  const tagMaterial = useMemo(() => new THREE.MeshBasicMaterial({ map: k.live, transparent: true, toneMapped: false }), [k.live]);
  const plateMaterial = useMemo(() => new THREE.MeshBasicMaterial({ map: plate, toneMapped: false }), [plate]);
  const gold = useMemo(() => new THREE.Color('#FFC86A'), []);
  const own = useMemo(() => new THREE.Color(contestant.color), [contestant.color]);
  const red = useMemo(() => new THREE.Color('#FF2340'), []);

  useLayoutEffect(() => reflectable(root.current), []);

  useFrame((_s, delta) => {
    const c = frame.current.cues;
    const group = root.current;
    if (!c || !group) return;
    const now = frame.current.now;
    const dt = Math.min(delta, 0.05);
    const id = contestant.id;
    const seat = c.seats.get(id);
    if (!seat) return;

    // Gliding along the arc to the seat.
    const goal = Math.atan2(seat.position.x - ARC_CENTER.x, ARC_CENTER.z - seat.position.z);
    if (angle.current === null) angle.current = goal;
    angle.current = smoothDamp(angle.current, goal, angleVel.current, 0.6, dt);
    const a = angle.current;
    const x = ARC_CENTER.x + Math.sin(a) * ARC_RADIUS;
    const z = ARC_CENTER.z - Math.cos(a) * ARC_RADIUS;

    // Coming up out of the stage in the intro; going down through it when popped.
    const rise = smoother(c.rise(order));
    const popping = c.popId === id;
    const popT = popping ? c.popT : 0;
    const sink = popping ? smoother((popT - SINK_FROM) / (SINK_TO - SINK_FROM)) : 0;
    const y = seat.position.y + (rise - 1) * 2.6 - sink * 2.7;
    group.position.set(x, y, z);
    group.rotation.y = -a;
    group.visible = rise > 0.001 && sink < 0.999;

    // In the light, or waiting in the dark.
    const wantFocus = c.focusId === null ? 1 : c.focusId === id ? 1 : c.othersDim;
    focus.current += (wantFocus - focus.current) * (1 - Math.exp(-5 * dt));
    const lit = focus.current;

    // A glow round the monitor of whoever has the word.
    const speaking = c.focusId === id && !popping ? 1 : 0;
    spoken.current += (speaking - spoken.current) * (1 - Math.exp(-6 * dt));
    halo.uniforms.uLevel.value = spoken.current * (0.8 + 0.2 * Math.sin(now * 0.006)) + c.gold * 0.6;
    (halo.uniforms.uColor.value as THREE.Color).copy(own).lerp(gold, c.gold);

    // The monitor: their camera once it is there, the stand-in until then.
    coverScreen(screen, picture ?? avatar, SCREEN.width / SCREEN.height);
    const u = screen.uniforms;
    u.uTime.value = now / 1000 + seed;
    u.uBreath.value = picture ? 0 : 1;
    u.uStatic.value = popping ? clamp01((popT - STATIC_FROM) / 0.05) : 0;
    u.uOff.value = popping ? clamp01((popT - OFF_FROM) / (OFF_TO - OFF_FROM)) : 0;
    // The LIVE tag goes out with the picture.
    tagMaterial.opacity = 1 - smoother((u.uOff.value - 0.4) / 0.5);
    u.uBright.value = (0.3 + 0.75 * lit) * (0.55 + 0.45 * c.house + 0.25 * (1 - c.house) * (c.focusId === id ? 1 : 0));

    // The light round the foot: their colour, pulsing red while they are sent off.
    const alarm = popping && popT > POP_AT && popT < OFF_TO ? 0.5 + 0.5 * Math.sin(now * 0.03) : 0;
    const dark = popping && popT >= OFF_TO;
    (band.userData.base as THREE.Color).copy(own).lerp(gold, c.gold * 0.8).lerp(red, alarm > 0 ? 1 : 0);
    setNeon(band, dark ? 0.02 : (0.35 + 0.65 * lit) * (0.5 + 0.5 * c.stageEdge) * (1 + rise * (1 - rise) * 4) + alarm, 0.02);

    // The ring on the floor: full while waiting, a countdown while they answer.
    const timer = c.timer && c.timer.id === id ? c.timer.fraction : 1;
    ring.uniforms.uFill.value = timer;
    ring.uniforms.uHead.value = c.timer && c.timer.id === id ? 1 : 0;
    const answering = c.timer !== null && c.timer.id === id;
    ring.uniforms.uLevel.value = dark ? 0 : (answering ? 1.4 : 0.2 + 0.6 * lit) * c.stageEdge * (popping ? 1 + alarm : 1);
    (ring.uniforms.uColor.value as THREE.Color).copy(own).lerp(gold, c.gold).lerp(red, alarm > 0 ? 1 : 0);
    shadow.uniforms.uStrength.value = 0.5 * (1 - sink) * rise;

    // The trapdoor opens under them, glows, and closes once they are gone.
    if (trap.current) {
      const open = popping ? smoother((popT - TRAP_FROM) / 0.06) * (1 - smoother((popT - 0.95) / 0.05)) : 0;
      trapMaterial.uniforms.uOpen.value = open;
      trapMaterial.uniforms.uGlow.value = open > 0 ? 1 - sink * 0.5 : 0;
      // Kept where it opens rather than going down with the podium.
      trap.current.position.set(x, seat.position.y + 0.004, z);
      trap.current.rotation.set(-Math.PI / 2, 0, -a);
    }

    // The balloon: floating on its string, trailing when the podium moves,
    // bouncing for joy, swelling before it bursts.
    const b = balloon.current;
    if (b) {
      const inflate = inflateEase(c.inflate(order));
      let scale = 0.12 + 0.88 * inflate;
      // Gliding sideways, the podium leaves its balloon a little behind: a
      // soft spring pulls it towards a point trailing the movement. The glide
      // speed comes straight from the smooth move, so the balloon never twitches.
      const glide = angleVel.current.v * ARC_RADIUS;
      tmp.trail.set(-glide * 0.14, 0, 0).clampLength(0, 0.3);
      tmp.force.copy(tmp.trail).sub(sway.p).multiplyScalar(16).addScaledVector(sway.v, -3.4);
      sway.v.addScaledVector(tmp.force, dt);
      sway.p.addScaledVector(sway.v, dt);

      const bounce = c.bounce * Math.abs(Math.sin(now * 0.009 + seed)) * 0.2;
      let wobble = 0;
      let stretch = 1;
      if (popping) {
        const swell = clamp01(popT / POP_AT);
        scale *= 1 + 0.42 * swell * swell;
        // Faster and faster trembling, then it goes.
        wobble = swell * swell * 0.14 * Math.sin(now * (0.05 + swell * 0.08));
        stretch = 1 + swell * swell * 0.08 * Math.sin(now * 0.11);
      }
      const gone = popping && popT >= POP_AT;
      b.visible = inflate > 0.005 && !gone;
      b.scale.set(scale / Math.sqrt(stretch), scale * stretch, scale / Math.sqrt(stretch));
      const idleX = Math.sin(now * 0.0007 + seed) * 0.035;
      const idleY = Math.sin(now * 0.0011 + seed) * 0.04;
      b.position.set(idleX + sway.p.x, PODIUM.balloonY + idleY + bounce, sway.p.z);
      b.rotation.set(wobble, Math.sin(now * 0.0005 + seed) * 0.35, Math.sin(now * 0.0009 + seed) * 0.08 + wobble - sway.p.x * 0.8);
      balloonMaterial.emissiveIntensity = 0.12 + 0.25 * (popping ? clamp01(popT / POP_AT) : 0) + c.gold * 0.15 + c.bounce * 0.08;

      // The burst, exactly once.
      if (popping && popT >= POP_AT && !burst.current && frame.current.fx) {
        burst.current = true;
        frame.current.fx.burst(b.getWorldPosition(tmp.world), contestant.color);
      }
      if (!popping) burst.current = false;

      // The string, from the top of the monitor up to the knot. After the
      // burst its end drops and it hangs down the back of the monitor.
      const from = tmp.from.set(0, PODIUM.monitorY + SCREEN.height / 2 + 0.03, -0.02);
      const fall = popping ? smoother((popT - POP_AT) / 0.07) : 0;
      const limp = tmp.limp.set(Math.sin(now * 0.004) * 0.02 * (1 - fall), -0.34, -0.05).add(from);
      const to = tmp.to.set(b.position.x, b.position.y + k.heart.bottom * scale * stretch - 0.012, b.position.z).lerp(limp, fall);
      // A taut string bows a little against the way the balloon swings.
      const bend = tmp.bend.copy(from).add(to).multiplyScalar(0.5);
      bend.x -= sway.v.x * 0.05 + (to.x - from.x) * 0.25;
      bend.z -= sway.v.z * 0.05;
      bend.y -= fall * 0.05;
      const su = stringMaterial.uniforms;
      su.uFrom.value.copy(from);
      su.uTo.value.copy(to);
      su.uBend.value.copy(bend);
      su.uLight.value = 0.4 + 0.6 * lit;
      if (string.current) string.current.visible = inflate > 0.25 && (!dark || sink < 0.2);
    }
  });

  const tap = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onTap?.(contestant.id);
  };

  return (
    <>
      <group ref={root}>
        <group onClick={tap}>
          {/* The pedestal. */}
          <mesh geometry={k.body} material={k.white} castShadow receiveShadow />
          <mesh geometry={k.band} material={band} />
          <mesh geometry={k.top} material={topMaterial} receiveShadow />
          <mesh geometry={k.lip} material={k.metal} />
          <mesh geometry={k.plate} material={plateMaterial} position={[0, PLATE.y, k.plateZ]} />
          {/* The monitor on its stem. */}
          <mesh geometry={k.stem} material={k.metal} castShadow />
          <group position={[0, PODIUM.monitorY, 0]}>
            <mesh geometry={k.glowPlane} material={halo} position={[0, 0, -0.07]} renderOrder={2} />
            <mesh geometry={k.housing} material={k.back} position={[0, 0, -0.025]} castShadow />
            <mesh geometry={k.bezel} material={k.glass} position={[0, 0, 0.012]} />
            <mesh geometry={k.screen} material={screen} position={[0, 0, 0.0195]} />
            <mesh geometry={k.tag} material={tagMaterial} position={[-SCREEN.width / 2 + 0.15, SCREEN.height / 2 - 0.08, 0.021]} />
          </group>
        </group>

        {/* Their ring of light on the stage, and a soft shadow underneath. */}
        <mesh geometry={k.shadowPlane} material={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} renderOrder={1} />
        <mesh geometry={k.floorPlane} material={ring} rotation={[-Math.PI / 2, 0, Math.PI]} position={[0, 0.005, 0]} renderOrder={2} />

        <group ref={balloon}>
          <mesh geometry={k.heart.geometry} material={balloonMaterial} castShadow />
          <mesh geometry={k.knot} material={balloonMaterial} position={[0, k.heart.bottom + 0.006, 0]} />
        </group>
        <mesh ref={string} geometry={k.string} material={stringMaterial} frustumCulled={false} />
      </group>
      {/* Not inside the podium: the trapdoor stays put while the podium goes down through it. */}
      <mesh ref={trap} material={trapMaterial} renderOrder={3}>
        <planeGeometry args={[1.8, 1.5]} />
      </mesh>
    </>
  );
}
