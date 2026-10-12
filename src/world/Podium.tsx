import { RoundedBox } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Contestant } from '../show/types';
import { drawAvatar, drawLiveTag, drawNamePlate } from './canvasArt';
import { useFrameData } from './frame';
import { PODIUM } from './layout';
import { canvasTexture, getHeartGeometry, makeScreenMaterial, neon, setNeon } from './materials';

/**
 * One contestant's place on the stage: a white podium with their name on the
 * front and a light band in their colour, a monitor on top showing them live
 * (here: a stand-in), and their heart balloon above it on a string.
 *
 * In the app the monitor shows the player's camera — the picture is a
 * texture slot, nothing else about the podium changes.
 *
 * The podium walks to its seat rather than jumping, with a little hop, so the
 * stage visibly closes ranks after somebody leaves.
 */

const POP_AT = 0.26;
const STATIC_FROM = 0.28;
const POWER_OFF = 0.5;
const SINK_FROM = 0.5;
const SINK_TO = 0.94;

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

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
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const balloon = useRef<THREE.Group>(null);
  const string = useRef<THREE.Mesh>(null);
  const trap = useRef<THREE.Mesh>(null);

  const place = useRef<THREE.Vector3 | null>(null);
  const heading = useRef(0);
  const focus = useRef(1);
  const burst = useRef(false);
  const seed = order * 1.7 + 0.3;

  const avatar = useMemo(() => canvasTexture(drawAvatar(contestant.look)), [contestant]);
  const plate = useMemo(() => canvasTexture(drawNamePlate(contestant)), [contestant]);
  const live = useMemo(() => canvasTexture(drawLiveTag()), []);
  const screen = useMemo(() => makeScreenMaterial(picture ?? avatar), [avatar, picture]);
  const band = useMemo(() => neon(contestant.color, 2.4), [contestant.color]);
  const ring = useMemo(() => neon(contestant.color, 2), [contestant.color]);
  const trapGlow = useMemo(() => neon('#FF2D7A', 3), []);
  const halo = useMemo(() => neon(contestant.color, 2.6), [contestant.color]);
  const spoken = useRef(0);
  const white = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FBF7F9', roughness: 0.2, metalness: 0.03 }), []);
  const cap = useMemo(
    () => new THREE.MeshStandardMaterial({ color: contestant.color, roughness: 0.25, metalness: 0.1 }),
    [contestant.color],
  );
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#100C0F', roughness: 0.35, metalness: 0.55 }), []);
  const balloonMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: contestant.color,
        roughness: 0.16,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        emissive: new THREE.Color(contestant.color),
        emissiveIntensity: 0.18,
      }),
    [contestant.color],
  );
  const stringMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#D9CED3' }), []);
  const tagMaterial = useMemo(() => new THREE.MeshBasicMaterial({ map: live, transparent: true, toneMapped: false }), [live]);
  const plateMaterial = useMemo(() => new THREE.MeshBasicMaterial({ map: plate, toneMapped: false }), [plate]);

  useFrame((_s, delta) => {
    const c = frame.current.cues;
    const group = root.current;
    if (!c || !group) return;
    const now = frame.current.now;
    const dt = Math.min(delta, 0.1);
    const id = contestant.id;
    const seat = c.seats.get(id);
    if (!seat) return;

    // Walking to the seat, with a hop while on the move.
    if (!place.current) {
      place.current = seat.position.clone();
      heading.current = seat.rotationY;
    }
    const before = place.current.clone();
    place.current.lerp(seat.position, 1 - Math.exp(-3.2 * dt));
    heading.current += (seat.rotationY - heading.current) * (1 - Math.exp(-4 * dt));
    const speed = before.distanceTo(place.current) / Math.max(dt, 0.001);
    const hop = Math.min(0.22, speed * 0.12) * Math.abs(Math.sin(now * 0.016));

    // Coming up out of the stage in the intro; going down through it when popped.
    const rise = c.rise(order);
    const popping = c.popId === id;
    const popT = popping ? c.popT : 0;
    const sink = popping ? ease(clamp01((popT - SINK_FROM) / (SINK_TO - SINK_FROM))) : 0;
    group.position.set(place.current.x, place.current.y + (rise - 1) * 2.6 - sink * 2.7 + hop, place.current.z);
    group.rotation.y = heading.current;
    group.visible = rise > 0.001 && sink < 0.999;

    // In the light, or waiting in the dark.
    const wantFocus = c.focusId === null ? 1 : c.focusId === id ? 1 : c.othersDim;
    focus.current += (wantFocus - focus.current) * (1 - Math.exp(-5 * dt));
    const lit = focus.current;

    // A glowing frame round the monitor of whoever has the word.
    const speaking = c.focusId === id && !popping ? 1 : 0;
    spoken.current += (speaking - spoken.current) * (1 - Math.exp(-6 * dt));
    setNeon(halo, spoken.current * (0.75 + 0.25 * Math.sin(now * 0.006)), 0);

    // The monitor: alive, then noise, then off.
    const u = screen.uniforms;
    u.uTime.value = now / 1000 + seed;
    u.uBreath.value = picture ? 0 : 1;
    u.uStatic.value = popping ? clamp01((popT - STATIC_FROM) / 0.06) * (popT < POWER_OFF ? 1 : 0) : 0;
    u.uPower.value = popping && popT >= POWER_OFF ? 0.02 : 1;
    u.uBright.value = (0.3 + 0.75 * lit) * (0.55 + 0.45 * c.house + 0.25 * (1 - c.house) * (c.focusId === id ? 1 : 0));

    // Light band and floor ring: their colour, flashing red when they are popped.
    const alarm = popping && popT > POP_AT && popT < POWER_OFF ? (Math.sin(now * 0.04) > 0 ? 1 : 0.2) : 0;
    (band.userData.base as THREE.Color).set(alarm ? '#FF2340' : contestant.color);
    setNeon(band, popping && popT >= POWER_OFF ? 0.02 : (0.35 + 0.65 * lit) * (0.5 + 0.5 * c.stageEdge) + alarm);
    setNeon(ring, (0.3 + 0.7 * lit) * c.stageEdge * (popping && popT >= POWER_OFF ? 0 : 1));

    // The trapdoor's glow while the podium goes down.
    if (trap.current) {
      trap.current.visible = popping && popT > SINK_FROM - 0.04;
      setNeon(trapGlow, popping ? 1 - sink * 0.6 : 0);
    }

    // The balloon: floating, bouncing for joy, swelling before it bursts.
    const b = balloon.current;
    if (b) {
      const inflate = c.inflate(order);
      let scale = 0.15 + 0.85 * inflate;
      const bounce = c.bounce * Math.abs(Math.sin(now * 0.009 + seed)) * 0.22;
      let wobble = 0;
      if (popping) {
        const k = clamp01(popT / POP_AT);
        scale *= 1 + 0.45 * k * k;
        wobble = k * k * 0.12 * Math.sin(now * 0.09);
      }
      const gone = popping && popT >= POP_AT;
      b.visible = inflate > 0.01 && !gone;
      b.scale.setScalar(scale);
      b.position.set(Math.sin(now * 0.0007 + seed) * 0.04, PODIUM.balloonY + Math.sin(now * 0.0011 + seed) * 0.05 + bounce, 0);
      b.rotation.set(wobble, Math.sin(now * 0.0005 + seed) * 0.35, Math.sin(now * 0.0009 + seed) * 0.08 + wobble);

      // The burst, exactly once.
      if (popping && popT >= POP_AT && !burst.current && frame.current.fx) {
        burst.current = true;
        frame.current.fx.burst(b.getWorldPosition(new THREE.Vector3()), contestant.color);
      }
      if (!popping) burst.current = false;

      // The string from the monitor up to the balloon's knot.
      const s = string.current;
      if (s) {
        const top = new THREE.Vector3(b.position.x, b.position.y - 0.3 * scale, b.position.z);
        const bottom = new THREE.Vector3(0, PODIUM.monitorY + PODIUM.monitorHeight / 2 + 0.02, 0);
        const mid = top.clone().add(bottom).multiplyScalar(0.5);
        const span = top.distanceTo(bottom);
        s.position.copy(mid);
        s.scale.set(1, Math.max(0.01, span), 1);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bottom).normalize());
        s.visible = b.visible && inflate > 0.3;
      }
    }
    if (body.current) body.current.visible = true;
  });

  const tap = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onTap?.(contestant.id);
  };

  const monitorFrame: [number, number, number] = [PODIUM.monitorWidth + 0.08, PODIUM.monitorHeight + 0.08, 0.07];
  return (
    <group ref={root}>
      <group ref={body} onClick={tap}>
        {/* The podium. */}
        <RoundedBox args={[PODIUM.width, PODIUM.height, PODIUM.depth]} radius={0.09} smoothness={4} position={[0, PODIUM.height / 2, 0]} material={white} />
        <mesh position={[0, PODIUM.height + 0.012, 0]} material={cap}>
          <boxGeometry args={[PODIUM.width - 0.04, 0.03, PODIUM.depth - 0.04]} />
        </mesh>
        <mesh position={[0, 0.1, 0]} material={band}>
          <boxGeometry args={[PODIUM.width + 0.015, 0.03, PODIUM.depth + 0.015]} />
        </mesh>
        <mesh position={[0, 0.66, PODIUM.depth / 2 + 0.003]} material={plateMaterial}>
          <planeGeometry args={[0.84, 0.223]} />
        </mesh>
        {/* The monitor on its neck. */}
        <mesh position={[0, PODIUM.height + 0.08, -0.05]} material={dark}>
          <boxGeometry args={[0.14, 0.14, 0.08]} />
        </mesh>
        <group position={[0, PODIUM.monitorY, 0]}>
          <mesh position={[0, 0, -0.045]} material={halo}>
            <planeGeometry args={[PODIUM.monitorWidth + 0.2, PODIUM.monitorHeight + 0.2]} />
          </mesh>
          <RoundedBox args={monitorFrame} radius={0.035} smoothness={3} material={dark} />
          <mesh position={[0, 0, 0.037]} material={screen}>
            <planeGeometry args={[PODIUM.monitorWidth, PODIUM.monitorHeight]} />
          </mesh>
          <mesh position={[-PODIUM.monitorWidth / 2 + 0.15, PODIUM.monitorHeight / 2 - 0.08, 0.04]} material={tagMaterial}>
            <planeGeometry args={[0.22, 0.077]} />
          </mesh>
        </group>
      </group>

      {/* Their ring on the stage floor, and the trapdoor that opens under it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} material={ring}>
        <ringGeometry args={[0.72, 0.76, 64]} />
      </mesh>
      <mesh ref={trap} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} material={trapGlow} visible={false}>
        <ringGeometry args={[0.6, 0.66, 64]} />
      </mesh>

      <group ref={balloon}>
        <mesh geometry={getHeartGeometry()} material={balloonMaterial} />
        <mesh position={[0, -0.33, 0]} material={balloonMaterial}>
          <coneGeometry args={[0.035, 0.06, 10]} />
        </mesh>
      </group>
      <mesh ref={string} material={stringMaterial}>
        <cylinderGeometry args={[0.004, 0.004, 1, 5]} />
      </mesh>
    </group>
  );
}
