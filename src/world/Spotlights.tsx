import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { headPosition } from './director';
import { useFrameData } from './frame';
import { TRUSS } from './layout';
import { chrome, gunmetal, makeBeamMaterial, neon, setNeon } from './materials';
import { reflectable } from './reflection';
import { pipe, profile, turned } from './shapes';

/**
 * The moving heads on the truss. Each one pans on its yoke and tilts its
 * head towards where the director wants it, throws a soft beam through the
 * haze and leaves a pool of light where it lands. In the verdict a head jumps
 * from person to person without travelling — that is how a real operator
 * hunts with a spot.
 */

const DOWN = new THREE.Vector3(0, -1, 0);
const LENS_AHEAD = 0.24;

/** The pool of light a beam leaves: a bright core, a soft edge, stretched where it lands at a slant. */
function makePoolMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uLevel: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy * 2.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uLevel;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float body = 1.0 - smoothstep(0.55, 1.0, r);
        float core = 1.0 - smoothstep(0.0, 0.6, r);
        float k = (body * 0.55 + core * 0.45) * uLevel;
        gl_FragColor = vec4(uColor * k, k);
      }
    `,
  });
}

type HeadKit = ReturnType<typeof buildHead>;
let headKit: HeadKit | null = null;

function buildHead() {
  return {
    base: turned(
      profile([
        [0, 0.26],
        [0.2, 0.26, 0.03],
        [0.2, 0.12, 0.04],
        [0.08, 0.1, 0.02],
        [0.08, 0.02],
        [0, 0.02],
      ]),
      32,
    ),
    yoke: pipe(
      [new THREE.Vector3(-0.21, -0.32, 0), new THREE.Vector3(-0.21, 0.02, 0), new THREE.Vector3(0.21, 0.02, 0), new THREE.Vector3(0.21, -0.32, 0)],
      0.026,
      0.08,
      10,
    ),
    // The head: rounded at the back, widening to the lens.
    can: (() => {
      const g = turned(
        profile([
          [0, -0.2],
          [0.13, -0.2, 0.06],
          [0.155, 0.08, 0.04],
          [0.175, 0.2, 0.015],
          [0.15, 0.215, 0.01],
          [0.15, 0.2],
        ]),
        40,
      );
      g.rotateX(Math.PI / 2);
      return g;
    })(),
    lens: (() => {
      const g = new THREE.CircleGeometry(0.135, 40);
      g.translate(0, 0, 0.205);
      return g;
    })(),
    bezel: (() => {
      const g = new THREE.TorusGeometry(0.15, 0.012, 8, 40);
      g.translate(0, 0, 0.215);
      return g;
    })(),
    body: gunmetal('#151116', 0.36),
    trim: chrome('#BDB6BB', 0.25),
    beam: (() => {
      const g = new THREE.CylinderGeometry(0.07, 1, 1, 40, 1, true);
      g.translate(0, -0.5, 0);
      return g;
    })(),
    pool: new THREE.PlaneGeometry(1, 1),
  };
}

function Head({ index }: { index: number }) {
  const frame = useFrameData();
  if (!headKit) headKit = buildHead();
  const k = headKit;
  const home = useMemo(() => headPosition(index), [index]);
  const fixture = useRef<THREE.Group>(null);
  const yoke = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const pool = useRef<THREE.Mesh>(null);
  const aim = useRef(new THREE.Vector3(0, 0.3, -3.6));
  const level = useRef(0);
  const color = useRef(new THREE.Color('#FFFFFF'));
  const pan = useRef(0);
  const tilt = useRef(0);

  const beamMaterial = useMemo(() => makeBeamMaterial(), []);
  const lens = useMemo(() => neon('#FFFFFF', 3.2), []);
  const poolMaterial = useMemo(() => makePoolMaterial(), []);

  useLayoutEffect(() => reflectable(fixture.current), []);

  useFrame((_s, delta) => {
    const c = frame.current.cues;
    if (!c) return;
    const cue = c.spots[index];
    const dt = Math.min(delta, 0.1);
    if (cue.snap) aim.current.copy(cue.aim);
    else aim.current.lerp(cue.aim, 1 - Math.exp(-5 * dt));
    level.current += (cue.level - level.current) * (1 - Math.exp(-14 * dt));
    color.current.lerp(cue.color, 1 - Math.exp(-6 * dt));

    // Pan the yoke, tilt the head: a real moving head never rolls.
    const dir = aim.current.clone().sub(home);
    const length = dir.length();
    dir.normalize();
    const wantPan = Math.atan2(dir.x, dir.z);
    // The shortest way round, so a head never spins a full turn.
    let dp = wantPan - pan.current;
    dp = Math.atan2(Math.sin(dp), Math.cos(dp));
    pan.current = cue.snap ? wantPan : pan.current + dp * (1 - Math.exp(-12 * dt));
    tilt.current = Math.atan2(-dir.y, Math.hypot(dir.x, dir.z));
    if (yoke.current) yoke.current.rotation.y = pan.current;
    if (head.current) head.current.rotation.x = tilt.current;

    const strength = level.current * (0.3 + (1 - c.house) * 1.9);
    const lensAt = home.clone().addScaledVector(dir, LENS_AHEAD);
    if (beam.current) {
      beam.current.position.copy(lensAt);
      beam.current.quaternion.setFromUnitVectors(DOWN, dir);
      const reach = Math.max(0.1, length - LENS_AHEAD);
      beam.current.scale.set(reach * 0.1, reach, reach * 0.1);
      beam.current.visible = strength > 0.01;
    }
    beamMaterial.uniforms.uIntensity.value = strength;
    beamMaterial.uniforms.uTime.value = frame.current.now / 1000;
    beamMaterial.uniforms.uColor.value.copy(color.current);
    (lens.userData.base as THREE.Color).copy(color.current);
    setNeon(lens, level.current, 0.03);
    if (pool.current) {
      // A slanted beam lands as an ellipse, longer the flatter it comes in.
      const flat = Math.max(0.35, -dir.y);
      const size = 1.0 + length * 0.18;
      pool.current.position.set(aim.current.x, aim.current.y + 0.012, aim.current.z);
      pool.current.rotation.set(-Math.PI / 2, 0, Math.atan2(dir.x, dir.z));
      pool.current.scale.set(size, size / flat, 1);
      poolMaterial.uniforms.uColor.value.copy(color.current);
      poolMaterial.uniforms.uLevel.value = level.current * (0.35 + (1 - c.house) * 0.4);
      pool.current.visible = level.current > 0.02;
    }
  });

  return (
    <>
      <group ref={fixture} position={home}>
        <mesh geometry={k.base} material={k.body} />
        <group ref={yoke}>
          <mesh geometry={k.yoke} material={k.body} />
          <group ref={head} position={[0, -0.24, 0]}>
            <mesh geometry={k.can} material={k.body} />
            <mesh geometry={k.bezel} material={k.trim} />
            <mesh geometry={k.lens} material={lens} />
          </group>
        </group>
      </group>
      <mesh ref={beam} geometry={k.beam} material={beamMaterial} renderOrder={5} frustumCulled={false} />
      <mesh ref={pool} geometry={k.pool} material={poolMaterial} renderOrder={4} />
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
