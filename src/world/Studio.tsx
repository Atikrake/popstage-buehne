import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { QUALITY, type Quality } from '../quality';
import { useFrameData } from './frame';
import { HOST_DESK, LED_WALL, STAGE_CENTER, STAGE_RADIUS, STAGE_TOP, STUDIO_RADIUS, TRUSS } from './layout';
import { chrome, extend, gunmetal, lacquer, neon, setNeon } from './materials';
import { FloorMirror, MIRROR_HEAD, reflectable } from './reflection';
import { merge, orientFaces, profile, roundedRectOutline, solid, trussRing, turned } from './shapes';

/**
 * The studio itself: a round white room with a polished floor, a raised round
 * stage that seems to float on a line of pink light, fluted wall panels with
 * light between them, a dark starry ceiling with a glowing cove, and a ring of
 * truss over the stage. The look follows POPSTAGE's own studio pictures —
 * white, pink, glossy.
 */

const DOOR_GAP = 0.125;
const PINK = new THREE.Color('#FF2D7A');
const GOLD = new THREE.Color('#FFC86A');

// --- the light the studio reflects -------------------------------------------

/**
 * What shiny things in the studio see reflected: a dark room with the rig's
 * soft boxes overhead, the pink cove all round and the LED wall glowing at the
 * back. Built once as its own little scene and blurred into an environment map.
 */
function studioReflections(gl: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const disposables: { dispose: () => void }[] = [];
  const add = (geometry: THREE.BufferGeometry, color: string, strength: number, place: (m: THREE.Mesh) => void, side: THREE.Side = THREE.FrontSide) => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), side });
    const mesh = new THREE.Mesh(geometry, material);
    place(mesh);
    scene.add(mesh);
    disposables.push(geometry, material);
  };
  add(new THREE.SphereGeometry(40, 32, 16), '#1C0B14', 1, () => undefined, THREE.BackSide);
  add(new THREE.CircleGeometry(40, 48), '#4A3540', 1, (m) => {
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.5;
  });
  // Soft boxes hung round the rig, looking down.
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    add(new THREE.PlaneGeometry(2.6, 1.1), '#FFF6FA', 7, (m) => {
      m.position.set(Math.sin(a) * 7.5, 9.5, -3.4 + Math.cos(a) * 7.5);
      m.lookAt(m.position.x * 0.6, 0, m.position.z * 0.6);
    });
  }
  // The big key light out front, and the warm fill from the side.
  add(new THREE.PlaneGeometry(8, 3), '#FFF1F4', 4.5, (m) => {
    m.position.set(0, 7, 16);
    m.lookAt(0, 1, 0);
  });
  add(new THREE.PlaneGeometry(4, 6), '#FFD9E6', 1.6, (m) => {
    m.position.set(-16, 4, 2);
    m.lookAt(0, 2, 0);
  });
  // The pink cove and the light strips in the walls.
  // Pink stays an accent: bright enough to tint a reflection, too small to colour the light.
  add(new THREE.TorusGeometry(13, 0.25, 8, 96), '#FF4F98', 1.6, (m) => {
    m.rotation.x = Math.PI / 2;
    m.position.y = 6.4;
  });
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    add(new THREE.PlaneGeometry(0.18, 5.4), '#FF7AB4', 1.2, (m) => {
      m.position.set(Math.sin(a) * 15, 3, Math.cos(a) * 15);
      m.lookAt(0, 3, 0);
    });
  }
  add(new THREE.PlaneGeometry(8, 4.5), '#FF5AA0', 0.7, (m) => {
    m.position.set(0, 4.7, -9);
  });
  const pmrem = new THREE.PMREMGenerator(gl);
  const env = pmrem.fromScene(scene, 0.04).texture;
  pmrem.dispose();
  disposables.forEach((one) => one.dispose());
  return env;
}

export function Environment() {
  const { gl, scene } = useThree();
  const frame = useFrameData();
  const dark = useMemo(() => new THREE.Color('#14070F'), []);
  const lit = useMemo(() => new THREE.Color('#E8D5DE'), []);
  useEffect(() => {
    const env = studioReflections(gl);
    scene.environment = env;
    scene.background = new THREE.Color('#0C0509');
    // A breath of haze: depth in the dark, airiness when the lights are up.
    scene.fog = new THREE.FogExp2(dark.getHex(), 0.011);
    return () => {
      env.dispose();
      scene.environment = null;
      scene.fog = null;
    };
  }, [dark, gl, scene]);
  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    scene.environmentIntensity = 0.12 + c.house * 0.9;
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) fog.color.copy(dark).lerp(lit, c.house * 0.35);
  });
  return null;
}

// --- light ----------------------------------------------------------------------

export function Lights({ quality }: { quality: Quality }) {
  const frame = useFrameData();
  const q = QUALITY[quality];
  const hemi = useRef<THREE.HemisphereLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const wash = useRef<THREE.PointLight>(null);
  const focus = useRef<THREE.SpotLight>(null);
  const group = useRef<THREE.Group>(null);
  const focusTarget = useMemo(() => new THREE.Object3D(), []);
  const gold = useMemo(() => new THREE.Color('#FFE2A8'), []);
  const white = useMemo(() => new THREE.Color('#FFFFFF'), []);
  const aim = useRef(new THREE.Vector3(0, 0.3, -3.6));
  const level = useRef(0);
  const deskAim = useMemo(() => HOST_DESK.clone().setY(1.1), []);

  useLayoutEffect(() => reflectable(group.current), []);
  useLayoutEffect(() => {
    const spot = focus.current;
    if (!spot) return;
    spot.castShadow = q.shadows > 0;
    if (q.shadows > 0) {
      spot.shadow.mapSize.set(q.shadows, q.shadows);
      spot.shadow.bias = -0.00035;
      spot.shadow.normalBias = 0.025;
      spot.shadow.radius = 3.5;
      spot.shadow.camera.near = 3;
      spot.shadow.camera.far = 22;
    }
  }, [q.shadows]);

  useFrame((_s, delta) => {
    const c = frame.current.cues;
    if (!c) return;
    const dt = Math.min(delta, 0.1);
    const lift = c.flash * 1.6 + c.clockPulse * 0.25;
    if (hemi.current) hemi.current.intensity = 0.04 + c.house * 0.65 + lift;
    if (key.current) {
      key.current.intensity = c.house * 1.2 + lift;
      key.current.color.copy(white).lerp(gold, c.gold * 0.6);
    }
    if (fill.current) fill.current.intensity = c.house * 0.5;
    // Pink light washing up from the stage, mostly once the show lights are on.
    if (wash.current) wash.current.intensity = (1 + c.cove * 6) * (0.35 + 0.65 * c.house);
    // A real light, with real shadows, on whoever is in the spotlight — or on
    // the host's desk while the host has the floor.
    const s = c.focusId ? c.seats.get(c.focusId) : null;
    const onDesk = !s && c.hostLit > 0.01;
    const want = s ? 1 : onDesk ? c.hostLit * 0.8 : 0;
    level.current += (want - level.current) * (1 - Math.exp(-5 * dt));
    if (s) aim.current.lerp(s.position.clone().setY(1.4), c.focusSnap ? 1 : 1 - Math.exp(-7 * dt));
    else if (onDesk) aim.current.lerp(deskAim, 1 - Math.exp(-5 * dt));
    focusTarget.position.copy(aim.current);
    if (focus.current) {
      focus.current.intensity = 80 * level.current;
      focus.current.position.set(aim.current.x * 0.55, 8.4, aim.current.z + (onDesk ? -6 : 6.5));
    }
  });

  return (
    <group ref={group}>
      <hemisphereLight ref={hemi} args={['#FFF6FA', '#E4CBD7', 1]} />
      <directionalLight ref={key} position={[3, 10, 12]} intensity={1.2} />
      <directionalLight ref={fill} position={[-8, 5, 2]} intensity={0.5} color="#FFD9E8" />
      <pointLight ref={wash} position={[0, 1.4, -1]} distance={14} decay={1.6} color="#FF5A9E" />
      <primitive object={focusTarget} />
      <spotLight ref={focus} angle={0.3} penumbra={0.85} decay={1.2} distance={26} color="#FFF4F8" target={focusTarget} />
    </group>
  );
}

// --- the floor and the stage ------------------------------------------------------

type Ring = { x: number; z: number; radius: number; width: number; level: number };

/**
 * A polished floor with lines of light set into it — rings round the stage
 * and the desk — and faint seams between its slabs. With a mirror, the studio
 * shows in it, blurred and strongest at a slant.
 */
function makeInlayFloor(rings: Ring[], color: string, roughness: number, mirror: FloorMirror | null, seams: { x: number; z: number; count: number; from: number } | null) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, envMapIntensity: mirror ? 0.45 : 1 });
  const uniforms = {
    uRings: { value: rings.map((r) => new THREE.Vector4(r.x, r.z, r.radius, r.width)) },
    uRingLevel: { value: rings.map((r) => r.level) },
    uInlay: { value: PINK.clone() },
    uGlow: { value: 1 },
    uReveal: { value: 1 },
    uSeams: { value: seams ? new THREE.Vector4(seams.x, seams.z, seams.count, seams.from) : new THREE.Vector4(0, 0, 0, 0) },
    uMirror: { value: mirror?.target.texture ?? null },
    uMirrorMatrix: { value: mirror?.textureMatrix ?? new THREE.Matrix4() },
    uMirrorStrength: { value: 1 },
  };
  const n = rings.length;
  extend(material, {
    key: `inlay-floor-${n}-${mirror ? 'mirror' : 'plain'}`,
    uniforms,
    fragmentHead: /* glsl */ `
      #define RINGS ${n}
      uniform vec4 uRings[RINGS];
      uniform float uRingLevel[RINGS];
      uniform vec3 uInlay;
      uniform float uGlow;
      uniform float uReveal;
      uniform vec4 uSeams;
      ${mirror ? MIRROR_HEAD : ''}
      float psInlay = 0.0;
      float psSeam = 0.0;
    `,
    fragment: {
      color_fragment: /* glsl */ `
        for (int i = 0; i < RINGS; i++) {
          float r = length(vPsWorld.xz - uRings[i].xy);
          // The light comes on outwards from the middle as the studio wakes up.
          float on = smoothstep(uRings[i].z - 0.6, uRings[i].z + 0.6, uReveal * 16.0);
          psInlay += psLine(abs(r - uRings[i].z), uRings[i].w) * uRingLevel[i] * on;
        }
        if (uSeams.z > 0.0) {
          vec2 d = vPsWorld.xz - uSeams.xy;
          float r = length(d);
          float a = atan(d.x, d.y) / 6.2831853 * uSeams.z;
          float toSeam = min(fract(a), 1.0 - fract(a)) * 6.2831853 * r / uSeams.z;
          psSeam = psLine(toSeam, 0.004) * step(uSeams.w, r);
        }
        diffuseColor.rgb *= 1.0 - psSeam * 0.18 - psInlay * 0.5;
      `,
      roughnessmap_fragment: /* glsl */ `
        roughnessFactor = clamp(roughnessFactor * (0.8 + 0.4 * psNoise(vPsWorld.xz * 0.45)) + psSeam * 0.3, 0.04, 1.0);
      `,
      emissivemap_fragment: /* glsl */ `
        totalEmissiveRadiance += uInlay * psInlay * uGlow * 2.2;
        ${
          mirror
            ? `{
          vec3 viewDir = normalize(cameraPosition - vPsWorld);
          totalEmissiveRadiance += psMirror(vPsWorld, vec3(0.0, 1.0, 0.0), viewDir, roughnessFactor);
        }`
            : ''
        }
      `,
    },
  });
  return { material, uniforms };
}

export function Studio({ quality }: { quality: Quality }) {
  const frame = useFrameData();
  const q = QUALITY[quality];
  const { gl, scene } = useThree();
  const studio = useRef<THREE.Group>(null);
  const floorMesh = useRef<THREE.Mesh>(null);

  const mirror = useMemo(() => (q.mirror > 0 ? new FloorMirror(q.mirror) : null), [q.mirror]);
  useEffect(() => () => mirror?.dispose(), [mirror]);

  const floor = useMemo(
    () =>
      makeInlayFloor(
        [
          { x: STAGE_CENTER.x, z: STAGE_CENTER.z, radius: 7.6, width: 0.03, level: 1 },
          { x: STAGE_CENTER.x, z: STAGE_CENTER.z, radius: 9.1, width: 0.016, level: 0.7 },
          { x: HOST_DESK.x, z: HOST_DESK.z + 0.55, radius: 2.05, width: 0.022, level: 1 },
          { x: HOST_DESK.x, z: HOST_DESK.z + 0.55, radius: 2.5, width: 0.01, level: 0.6 },
        ],
        '#D3CACF',
        0.16,
        mirror,
        { x: STAGE_CENTER.x, z: STAGE_CENTER.z, count: 48, from: STAGE_RADIUS + 0.7 },
      ),
    [mirror],
  );
  const stageTop = useMemo(
    () =>
      makeInlayFloor(
        [
          { x: STAGE_CENTER.x, z: STAGE_CENTER.z, radius: 2.2, width: 0.02, level: 0.8 },
          { x: STAGE_CENTER.x, z: STAGE_CENTER.z, radius: 3.9, width: 0.014, level: 0.6 },
          { x: STAGE_CENTER.x, z: STAGE_CENTER.z, radius: STAGE_RADIUS - 0.22, width: 0.012, level: 0.9 },
        ],
        '#ECE5E9',
        0.14,
        null,
        null,
      ),
    [],
  );

  useEffect(() => {
    const mesh = floorMesh.current;
    if (!mesh || !mirror) return;
    mesh.onBeforeRender = (renderer, sc, camera) => mirror.render(renderer, sc as THREE.Scene, camera, mesh);
    return () => {
      mesh.onBeforeRender = () => undefined;
    };
  }, [gl, mirror, scene]);

  const mats = useMemo(() => {
    const stars = { uStars: { value: 1 }, uTime: { value: 0 } };
    const ceiling = extend(new THREE.MeshStandardMaterial({ color: '#100810', roughness: 0.95, side: THREE.DoubleSide }), {
      key: 'star-ceiling',
      uniforms: stars,
      fragmentHead: 'uniform float uStars; uniform float uTime;',
      fragment: {
        emissivemap_fragment: /* glsl */ `
          {
            // Fibre-optic stars in the dark ceiling, twinkling slowly.
            vec2 cell = floor(vPsWorld.xz * 1.6);
            vec2 f = fract(vPsWorld.xz * 1.6) - 0.5;
            float h = psHash(cell);
            vec2 jitter = (vec2(psHash(cell + 3.1), psHash(cell + 7.7)) - 0.5) * 0.6;
            float d = length(f - jitter);
            float size = 0.018 + 0.02 * fract(h * 13.0);
            float star = step(0.9, h) * (1.0 - smoothstep(size * 0.3, size + fwidth(d) * 1.5, d));
            float tw = 0.65 + 0.35 * sin(uTime * (0.6 + h * 1.8) + h * 40.0);
            totalEmissiveRadiance += vec3(1.0, 0.88, 0.94) * star * tw * uStars * 1.4;
          }
        `,
      },
    });
    return {
      stars,
      lacquer: lacquer('#F6F0F3', 0.3),
      wall: makeFlutedWall(),
      band: new THREE.MeshStandardMaterial({ color: '#2A1220', roughness: 0.75, side: THREE.BackSide }),
      ceiling,
      truss: chrome('#C9C3C8', 0.28),
      motor: gunmetal(),
      riser: lacquer('#EFE5EA', 0.38),
      edge: neon('#FF2D7A', 2.6),
      cove: neon('#FF5AA0', 2.2),
      soffit: neon('#FFF1F6', 1.5),
      halo: neon('#FF4F98', 2.4),
      tierLight: neon('#FF6FAE', 2.0),
    };
  }, []);

  // --- the pieces, built once
  const shapes = useMemo(() => {
    const R = STAGE_RADIUS;
    // The plinth, then a shadow gap with light in it, then the stage disc —
    // so the stage seems to float.
    const plinth = turned(
      profile([
        [R + 0.62, 0],
        [R + 0.62, 0.14, 0.04],
        [R - 0.3, 0.14],
      ]),
      160,
    );
    const rim = turned(
      profile([
        [R - 0.07, 0.165],
        [R, 0.165, 0.02],
        [R, STAGE_TOP, 0.04],
        [R - 0.04, STAGE_TOP],
      ]),
      160,
    );
    const disc = new THREE.CircleGeometry(R - 0.04, 160);
    disc.rotateX(-Math.PI / 2);
    disc.translate(0, STAGE_TOP, 0);

    // Audience tiers either side, with rounded noses and light along each.
    const tiers: THREE.BufferGeometry[] = [];
    const tierLights: THREE.BufferGeometry[] = [];
    for (const side of [1, -1]) {
      for (let i = 0; i < 3; i += 1) {
        const start = side > 0 ? Math.PI * 0.3 : -Math.PI * 0.64;
        const end = side > 0 ? Math.PI * 0.64 : -Math.PI * 0.3;
        const inner = 10.4 + i * 1.05;
        const top = 0.42 * (i + 1);
        tiers.push(tierGeometry(inner, inner + 1.05, start, end, top));
        const light = new THREE.TorusGeometry(inner + 0.02, 0.016, 6, 64, end - start);
        // A torus arc starts on +x; turned so it spans start…end like the tier.
        light.rotateX(Math.PI / 2);
        light.rotateY(end - Math.PI / 2);
        light.translate(0, top - 0.06, 0);
        tierLights.push(light);
      }
    }

    // Columns either side of the LED wall: rounded, with light inlaid.
    const columnOutline = roundedRectOutline(0.9, 0.9, 0.3, 10);
    const column = solid(
      columnOutline,
      profile([
        [0.08, 0],
        [0.08, 0.16, 0.05],
        [0, 0.24, 0.04],
        [0, 6.8, 0.08],
        [0.05, 6.9, 0.03],
        [0.05, 7.0, 0.03],
        [-0.1, 7.0],
      ]),
    );
    // Two tubes of light let into each column's inner front edge.
    const rod = new THREE.CapsuleGeometry(0.018, 5.9, 4, 10);
    const columnStrip = (side: number) =>
      merge([
        rod.clone().translate(-side * 0.24, 3.6, 0.448),
        rod.clone().translate(-side * 0.448, 3.6, 0.24),
      ]);

    return {
      plinth,
      rim,
      disc,
      tiers: merge(tiers),
      tierLights: merge(tierLights),
      truss: trussRing(TRUSS.radius, 0.44, 144),
      halo: (() => {
        const g = new THREE.TorusGeometry(TRUSS.radius, 0.03, 8, 192);
        g.rotateX(Math.PI / 2);
        return g;
      })(),
      motor: turned(
        profile([
          [0, 0],
          [0.12, 0, 0.03],
          [0.12, 0.26, 0.03],
          [0, 0.26],
        ], 3),
        20,
      ),
      column,
      columnStrips: { left: columnStrip(-1), right: columnStrip(1) },
    };
  }, []);

  useLayoutEffect(() => reflectable(studio.current), []);

  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    const pulse = c.clockPulse * 0.6 + c.flash;
    setNeon(mats.edge, c.stageEdge * (0.75 + pulse));
    setNeon(mats.cove, c.cove * (0.85 + pulse * 0.5), 0.02);
    setNeon(mats.soffit, c.cove * 0.9, 0.02);
    setNeon(mats.halo, c.stageEdge * (0.55 + pulse * 0.6), 0.02);
    setNeon(mats.tierLight, c.slats * 0.7, 0.03);
    // Gold creeps into the room for the finale.
    (mats.cove.userData.base as THREE.Color).set('#FF5AA0').lerp(GOLD, c.gold * 0.7);
    (mats.halo.userData.base as THREE.Color).set('#FF4F98').lerp(GOLD, c.gold * 0.8);
    const w = mats.wall.userData.uniforms as WallUniforms;
    w.uGlow.value = c.slats * (0.7 + pulse * 0.4);
    w.uReveal.value = c.reveal;
    w.uTime.value = frame.current.now / 1000;
    w.uColor.value.set('#FF7AB4').lerp(GOLD, c.gold * 0.6);
    for (const f of [floor, stageTop]) {
      f.uniforms.uGlow.value = c.stageEdge * (0.85 + pulse * 0.5);
      f.uniforms.uReveal.value = c.reveal;
      f.uniforms.uInlay.value.copy(PINK).lerp(GOLD, c.gold * 0.7);
    }
    mats.stars.uStars.value = 0.25 + (1 - c.house) * 0.75;
    mats.stars.uTime.value = frame.current.now / 1000;
  });

  const R = STAGE_RADIUS;
  return (
    <group ref={studio}>
      {/* The floor. */}
      <mesh ref={floorMesh} rotation={[-Math.PI / 2, 0, 0]} material={floor.material} receiveShadow>
        <circleGeometry args={[STUDIO_RADIUS + 0.3, 160]} />
      </mesh>

      {/* The stage, floating on its line of light. */}
      <group position={[STAGE_CENTER.x, 0, STAGE_CENTER.z]}>
        <mesh geometry={shapes.plinth} material={mats.lacquer} receiveShadow />
        <mesh geometry={shapes.rim} material={mats.lacquer} receiveShadow />
        <mesh geometry={shapes.disc} material={stageTop.material} receiveShadow />
        <mesh position={[0, 0.152, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.edge}>
          <torusGeometry args={[R - 0.05, 0.011, 6, 200]} />
        </mesh>
        <mesh position={[0, 0.143, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.edge}>
          <torusGeometry args={[R + 0.6, 0.01, 6, 200]} />
        </mesh>
      </group>

      {/* The wall, fluted, with a gap where the corridor comes in. */}
      <mesh position={[0, 3.1, 0]} material={mats.wall}>
        <cylinderGeometry args={[STUDIO_RADIUS, STUDIO_RADIUS, 6.2, 192, 1, true, DOOR_GAP, Math.PI * 2 - DOOR_GAP * 2]} />
      </mesh>
      <mesh position={[0, 7.9, 0]} material={mats.band}>
        <cylinderGeometry args={[STUDIO_RADIUS, STUDIO_RADIUS, 3.4, 128, 1, true]} />
      </mesh>
      {/* Skirting along the foot of the wall. */}
      <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.lacquer}>
        <torusGeometry args={[STUDIO_RADIUS - 0.04, 0.07, 8, 192]} />
      </mesh>
      {/* The soffit and cove where wall meets ceiling. */}
      <mesh position={[0, 6.22, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.soffit}>
        <torusGeometry args={[STUDIO_RADIUS - 0.25, 0.045, 8, 192]} />
      </mesh>
      <mesh position={[0, 6.5, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.ceiling}>
        <ringGeometry args={[STUDIO_RADIUS - 1.4, STUDIO_RADIUS, 128]} />
      </mesh>
      <mesh position={[0, 6.48, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.cove}>
        <torusGeometry args={[STUDIO_RADIUS - 1.4, 0.06, 8, 192]} />
      </mesh>
      <mesh position={[0, 9.6, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.ceiling}>
        <circleGeometry args={[STUDIO_RADIUS + 0.2, 96]} />
      </mesh>

      {/* Audience seating either side. */}
      <mesh geometry={shapes.tiers} material={mats.riser} receiveShadow />
      <mesh geometry={shapes.tierLights} material={mats.tierLight} />

      {/* The rig over the stage, hung from four motors, with a ring of light under it. */}
      <group position={TRUSS.center.toArray()}>
        <mesh geometry={shapes.truss} material={mats.truss} />
        <mesh geometry={shapes.halo} material={mats.halo} position={[0, -0.32, 0]} />
        {[0.6, 2.2, 3.8, 5.4].map((a) => (
          <group key={a} position={[Math.sin(a) * TRUSS.radius, 0.3, Math.cos(a) * TRUSS.radius]}>
            <mesh geometry={shapes.motor} material={mats.motor} />
            <mesh position={[0, 0.3 + 0.32, 0]} material={mats.truss}>
              <cylinderGeometry args={[0.012, 0.012, 0.64, 6]} />
            </mesh>
          </group>
        ))}
      </group>

      <LedSurround column={shapes.column} strips={shapes.columnStrips} material={mats.lacquer} />
    </group>
  );
}

/** A flat ring sector lifted into a solid tier with a rounded nose. */
function tierGeometry(inner: number, outer: number, start: number, end: number, height: number) {
  const steps = 48;
  // Profile of the tier's front, from the floor up and back over the top.
  const nose = profile([
    [0, 0],
    [0, height, 0.06],
    [-(outer - inner), height],
  ], 4);
  const parts: THREE.BufferGeometry[] = [];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const m = nose.length;
  for (let i = 0; i <= steps; i += 1) {
    const a = start + ((end - start) * i) / steps;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    for (let j = 0; j < m; j += 1) {
      // The front faces the stage (inwards), so offsets grow outwards.
      const r = inner - nose[j].x;
      positions.push(dir.x * r, nose[j].y, dir.z * r);
      const a0 = nose[Math.max(0, j - 1)];
      const a1 = nose[Math.min(m - 1, j + 1)];
      const t = a1.clone().sub(a0).normalize();
      const n = new THREE.Vector3(-dir.x * t.y, -t.x, -dir.z * t.y).normalize();
      normals.push(n.x, n.y, n.z);
      uvs.push(i / steps, j / (m - 1));
    }
  }
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < m - 1; j += 1) {
      const a = i * m + j;
      const b = (i + 1) * m + j;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const front = new THREE.BufferGeometry();
  front.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  front.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  front.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  front.setIndex(index);
  orientFaces(front);
  parts.push(front);
  // The back and the ends are rarely seen; plain flat faces.
  const back = new THREE.CylinderGeometry(outer, outer, height, steps, 1, true, start, end - start);
  back.translate(0, height / 2, 0);
  parts.push(back);
  // The ends, each facing away from the tier.
  const first = new THREE.PlaneGeometry(outer - inner, height);
  first.translate((inner + outer) / 2, height / 2, 0);
  first.rotateY(start - Math.PI / 2);
  const last = new THREE.PlaneGeometry(outer - inner, height);
  last.translate(-(inner + outer) / 2, height / 2, 0);
  last.rotateY(end + Math.PI / 2);
  parts.push(first, last);
  return merge(parts);
}

// --- the wall ---------------------------------------------------------------------

type WallUniforms = {
  uGlow: THREE.IUniform<number>;
  uReveal: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uColor: THREE.IUniform<THREE.Color>;
};

/**
 * The round wall: white fluted panels, a line of pink light between every
 * third flute. The flutes are in the shading only — one smooth cylinder,
 * lit as if it were carved. In the intro the light runs round the room from
 * behind the LED wall towards the doors.
 */
function makeFlutedWall() {
  const uniforms: WallUniforms = {
    uGlow: { value: 1 },
    uReveal: { value: 1 },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color('#FF7AB4') },
  };
  const material = extend(new THREE.MeshStandardMaterial({ color: '#F1EAEE', roughness: 0.42, side: THREE.BackSide }), {
    key: 'fluted-wall',
    uniforms,
    fragmentHead: /* glsl */ `
      uniform float uGlow;
      uniform float uReveal;
      uniform float uTime;
      uniform vec3 uColor;
      const float FLUTES = 192.0;
      float psGap = 0.0;
      float psChase = 0.0;
    `,
    fragment: {
      normal_fragment_maps: /* glsl */ `
        {
          float theta = atan(vPsWorld.x, vPsWorld.z);
          float phi = (theta / 6.2831853 + 0.5) * FLUTES;
          float f = fract(phi);
          float fw = fwidth(phi);
          // Rounded flutes: tilt the normal across each one, less where they would shimmer.
          float slope = cos(3.14159265 * f) * 0.55 * (1.0 - smoothstep(0.12, 0.45, fw));
          vec3 tangent = normalize((viewMatrix * vec4(cos(theta), 0.0, -sin(theta), 0.0)).xyz);
          normal = normalize(normal + tangent * slope * faceDirection);
          // A line of light between every third flute.
          float k = mod(floor(phi + 0.5), 3.0);
          float edge = min(f, 1.0 - f);
          psGap = (k < 0.5 ? 1.0 : 0.0) * (1.0 - smoothstep(0.03, 0.03 + fw * 1.5, edge));
          // Strongest in the middle of the wall's height.
          float y = vPsWorld.y / 6.2;
          psGap *= smoothstep(0.02, 0.12, y) * smoothstep(0.98, 0.86, y);
          // The intro: light running round from the back (theta = pi) both ways.
          float fromBack = 1.0 - abs(theta) / 3.14159265;
          float front = uReveal * 1.15;
          psChase = smoothstep(front, front - 0.06, fromBack);
          float head = exp(-pow((fromBack - front) * 22.0, 2.0)) * step(uReveal, 0.999);
          psGap = psGap * psChase + psGap * head * 2.5;
          // Shadow in the groove.
          diffuseColor.rgb *= 0.9 + 0.1 * sin(3.14159265 * f);
        }
      `,
      emissivemap_fragment: /* glsl */ `
        totalEmissiveRadiance += uColor * psGap * uGlow * 2.0;
      `,
    },
  });
  material.userData.uniforms = uniforms;
  return material;
}

// --- either side of the LED wall ------------------------------------------------

/** Columns either side of the LED wall, with light running up them. */
function LedSurround({
  column,
  strips,
  material,
}: {
  column: THREE.BufferGeometry;
  strips: { left: THREE.BufferGeometry; right: THREE.BufferGeometry };
  material: THREE.Material;
}) {
  const frame = useFrameData();
  const light = useMemo(() => neon('#FF2D7A', 2.6), []);
  useFrame(() => {
    const c = frame.current.cues;
    if (c) setNeon(light, c.ledPower * (0.6 + c.clockPulse * 0.6 + c.flash), 0.03);
  });
  const x = LED_WALL.width / 2 + 0.95;
  return (
    <group position={[0, 0, LED_WALL.center.z + 0.1]}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * x, 0, 0]}>
          <mesh geometry={column} material={material} receiveShadow />
          <mesh geometry={side < 0 ? strips.left : strips.right} material={light} />
        </group>
      ))}
    </group>
  );
}

