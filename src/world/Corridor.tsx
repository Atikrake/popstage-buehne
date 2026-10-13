import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { drawOnAir, drawPoster, drawSign } from './canvasArt';
import { useFrameData } from './frame';
import { CORRIDOR } from './layout';
import { canvasTexture, chrome, extend, gunmetal, neon, setNeon } from './materials';
import { fillet, merge, orientFaces, pipe, roundedPlane, roundedSlab } from './shapes';

/**
 * The way in: a white backstage corridor with rounded corners, whose ceiling
 * lights come on one after another as you walk, show posters on the walls,
 * and at the end the studio doors under a red ON AIR sign. The doors slide
 * open onto the dark studio — that is where the intro begins.
 *
 * The corridor lights itself: every ceiling panel lights the walls and the
 * floor around it with a real falloff, and the polished floor mirrors the
 * panels exactly — worked out in the shader from where you look, so it costs
 * no extra drawing at all.
 */

const PANELS = 11;
const PANEL_STEP = 2.4;
const FIRST_PANEL = CORRIDOR.start - 1.6;
const DOORWAY = { width: 2.3, height: 2.75, radius: 0.35 };

type CorridorUniforms = {
  uLights: THREE.IUniform<number>;
  uLit: THREE.IUniform<number>;
  uDoor: THREE.IUniform<number>;
};

/** The corridor's cross-section, counter-clockwise from the middle of the floor. */
function crossSection() {
  const W = CORRIDOR.width / 2;
  const H = CORRIDOR.height;
  return fillet(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(W, 0),
      new THREE.Vector2(W, H),
      new THREE.Vector2(-W, H),
      new THREE.Vector2(-W, 0),
      new THREE.Vector2(0, 0),
    ],
    [0, 0.05, 0.6, 0.6, 0.05, 0],
    10,
  );
}

/** The tube of the corridor, its faces turned inwards. */
function tunnelGeometry() {
  const points = crossSection();
  points.pop(); // closed: the last point is the first
  const n = points.length;
  const normals = points.map((_, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const t = next.clone().sub(prev).normalize();
    // Counter-clockwise: the inside is on the left.
    return new THREE.Vector2(-t.y, t.x);
  });
  const along = [0];
  for (let i = 1; i <= n; i += 1) along.push(along[i - 1] + points[i % n].distanceTo(points[i - 1]));
  const positions: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  for (const z of [CORRIDOR.end, CORRIDOR.start]) {
    for (let i = 0; i <= n; i += 1) {
      const p = points[i % n];
      const q = normals[i % n];
      positions.push(p.x, p.y, z);
      nor.push(q.x, q.y, 0);
      uvs.push(along[i], z);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = i;
    const b = n + 1 + i;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  orientFaces(geometry);
  return geometry;
}

/** Closing walls: the far end, and the end with the doorway cut out of it. */
function endWalls() {
  const outline = crossSection();
  outline.pop();
  const far = new THREE.ShapeGeometry(new THREE.Shape(outline), 2);
  far.rotateY(Math.PI);
  far.translate(0, 0, CORRIDOR.start);
  // Round the outside, then up, over and down round the doorway.
  const W = CORRIDOR.width / 2;
  const H = CORRIDOR.height;
  const w = DOORWAY.width / 2;
  const h = DOORWAY.height;
  const r = DOORWAY.radius;
  const around = fillet(
    [
      new THREE.Vector2(w, 0),
      new THREE.Vector2(W, 0),
      new THREE.Vector2(W, H),
      new THREE.Vector2(-W, H),
      new THREE.Vector2(-W, 0),
      new THREE.Vector2(-w, 0),
      new THREE.Vector2(-w, h),
      new THREE.Vector2(w, h),
      new THREE.Vector2(w, 0),
    ],
    [0, 0.05, 0.6, 0.6, 0.05, 0, r, r, 0],
    10,
  );
  around.pop();
  const near = new THREE.ShapeGeometry(new THREE.Shape(around), 2);
  near.translate(0, 0, CORRIDOR.end);
  return merge([far, near]);
}

/**
 * The corridor's own light: ceiling panels that switch on one by one, their
 * light on walls and floor, their mirror image in the floor, pink lines
 * along the walls and the floor, and the studio's glow spilling in through
 * the doors. `trim` adds the wall panelling.
 */
function makeCorridorMaterial(color: string, roughness: number, trim: boolean, uniforms: CorridorUniforms) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  return extend(material, {
    key: `corridor-${trim ? 'trim' : 'plain'}`,
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    fragmentHead: /* glsl */ `
      uniform float uLights;
      uniform float uLit;
      uniform float uDoor;
      const float PANELS = ${PANELS.toFixed(1)};
      const float STEP = ${PANEL_STEP.toFixed(2)};
      const float FIRST = ${FIRST_PANEL.toFixed(2)};
      const float HEIGHT = ${CORRIDOR.height.toFixed(2)};
      const float DOOR_Z = ${CORRIDOR.end.toFixed(2)};
      const vec3 PANEL_COLOR = vec3(1.0, 0.95, 0.97);
      const vec3 PINK_LIGHT = vec3(1.0, 0.18, 0.48);
      float panelIndex(float z) { return floor((FIRST - z) / STEP + 0.5); }
      float panelOn(float i) {
        return clamp(uLights - i, 0.0, 1.0) * step(-0.5, i) * step(i, PANELS - 0.5);
      }
      float panelShape(vec3 p, float i, float blur) {
        vec2 q = vec2(p.x, p.z - (FIRST - i * STEP));
        float d = psRoundBox(q, vec2(0.62, 0.24), 0.12);
        return 1.0 - smoothstep(-blur, blur, d);
      }
      float psFloor = 0.0;
      float psCeiling = 0.0;
    `,
    fragment: {
      color_fragment: /* glsl */ `
        {
          vec3 N = normalize(vPsNormal);
          psFloor = smoothstep(0.5, 0.8, N.y);
          psCeiling = smoothstep(0.5, 0.8, -N.y);
          ${
            trim
              ? `float wall = (1.0 - psFloor) * (1.0 - psCeiling) * step(abs(N.z), 0.5);
          // Panel seams every 1.6 m, a dado rail at 1.1 m, a slightly darker band below it.
          float seam = psLine(abs(fract((vPsWorld.z - DOOR_Z) / 1.6 + 0.5) - 0.5) * 1.6, 0.005);
          float rail = psLine(abs(vPsWorld.y - 1.1), 0.007);
          float low = 1.0 - smoothstep(1.09, 1.11, vPsWorld.y);
          diffuseColor.rgb *= 1.0 - wall * (seam * 0.3 + rail * 0.25 + low * 0.06);`
              : ''
          }
        }
      `,
      emissivemap_fragment: /* glsl */ `
        {
          vec3 P = vPsWorld;
          vec3 N = normalize(vPsNormal);
          float i0 = panelIndex(P.z);
          // Light from the three nearest panels, falling off with distance.
          vec3 light = vec3(0.0);
          for (int k = -1; k <= 1; k++) {
            float i = i0 + float(k);
            float on = panelOn(i);
            vec3 L = vec3(0.0, HEIGHT - 0.02, FIRST - i * STEP) - P;
            float d2 = dot(L, L);
            vec3 l = L * inversesqrt(d2);
            light += PANEL_COLOR * on * max(dot(N, l), 0.0) * max(l.y, 0.0) / (d2 + 0.4);
          }
          light += PANEL_COLOR * uLit * 0.05;
          totalEmissiveRadiance += diffuseColor.rgb * light * 7.0;

          // The panels themselves.
          totalEmissiveRadiance += PANEL_COLOR * panelShape(P, i0, fwidth(P.z) + 0.004) * panelOn(i0) * psCeiling * 3.2;

          // The floor mirrors them: follow the reflected ray up to the ceiling.
          if (psFloor > 0.0) {
            vec3 V = normalize(P - cameraPosition);
            vec3 R = reflect(V, vec3(0.0, 1.0, 0.0));
            float t = (HEIGHT - P.y) / max(R.y, 1e-3);
            vec3 Q = P + R * t;
            float j = panelIndex(Q.z);
            float m = panelShape(Q, j, 0.015 + t * 0.012) * panelOn(j);
            float cosT = max(-V.y, 0.0);
            float F = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
            totalEmissiveRadiance += PANEL_COLOR * m * (F * 2.4 + 0.1) * psFloor;
          }

          // Pink lines: along the foot of each wall and down the middle of the floor.
          float foot = psLine(abs(P.y - 0.09), 0.01) * step(abs(N.z), 0.5) * (1.0 - psFloor);
          float middle = psLine(abs(P.x), 0.025) * psFloor;
          totalEmissiveRadiance += PINK_LIGHT * (foot + middle) * (0.15 + uLit * 2.2);

          // The studio's glow, coming in through the open doors.
          float spill = uDoor * exp(-max(P.z - DOOR_Z, 0.0) * 0.5);
          totalEmissiveRadiance += diffuseColor.rgb * PINK_LIGHT * spill * (0.2 + psFloor * 0.25);
        }
      `,
    },
  });
}

/** The glow of the studio standing in the open doorway. */
function makeDoorwayGlow() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { uOpen: { value: 0 }, uColor: { value: new THREE.Color('#FF4F98') } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vDepth = -view.z;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpen;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        // Brightest low in the middle, where the gap between the doors widens.
        float across = 1.0 - smoothstep(0.0, 0.5 * uOpen + 0.02, abs(vUv.x - 0.5));
        float up = smoothstep(1.0, 0.0, vUv.y) * 0.7 + 0.3;
        // Gone by the time the camera walks through it.
        float k = across * up * uOpen * 0.9 * smoothstep(0.4, 2.6, vDepth);
        gl_FragColor = vec4(uColor * k, k);
      }
    `,
  });
}

export function Corridor() {
  const frame = useFrameData();
  const half = CORRIDOR.width / 2;

  const uniforms = useMemo<CorridorUniforms>(() => ({ uLights: { value: 0 }, uLit: { value: 0 }, uDoor: { value: 0 } }), []);
  const mats = useMemo(
    () => ({
      shell: makeCorridorMaterial('#EFE9EC', 0.2, true, uniforms),
      door: makeCorridorMaterial('#FAF7F8', 0.3, false, uniforms),
      metal: chrome('#DCD6DA', 0.2),
      dark: gunmetal('#141015', 0.4),
      strip: neon('#FF2D7A', 2.4),
      porthole: neon('#FF6FAE', 1.4),
      onAir: new THREE.MeshBasicMaterial({ map: canvasTexture(drawOnAir()), toneMapped: false }),
      sign: new THREE.MeshBasicMaterial({ map: canvasTexture(drawSign('STUDIO 3', 'POPSTAGE · LIVE')), toneMapped: false }),
      glow: makeDoorwayGlow(),
    }),
    [uniforms],
  );
  const posters = useMemo(
    () => ([0, 1, 2, 1, 0, 2] as const).map((kind) => new THREE.MeshBasicMaterial({ map: canvasTexture(drawPoster(kind)), toneMapped: false })),
    [],
  );
  const shapes = useMemo(() => {
    const w = DOORWAY.width / 2;
    const frameLine = (grow: number) => [
      new THREE.Vector3(w + grow, 0, 0),
      new THREE.Vector3(w + grow, DOORWAY.height + grow, 0),
      new THREE.Vector3(-w - grow, DOORWAY.height + grow, 0),
      new THREE.Vector3(-w - grow, 0, 0),
    ];
    return {
      tunnel: tunnelGeometry(),
      ends: endWalls(),
      jamb: pipe(frameLine(0.02), 0.045, DOORWAY.radius + 0.02, 12),
      jambLight: pipe(frameLine(0.1), 0.014, DOORWAY.radius + 0.1, 8),
      leaf: roundedSlab(w + 0.03, DOORWAY.height + 0.02, 0.07, 0.05, 0.015),
      portholeRing: new THREE.TorusGeometry(0.16, 0.022, 10, 40),
      portholeGlass: new THREE.CircleGeometry(0.16, 40),
      plate: roundedSlab(0.08, 0.42, 0.02, 0.03, 0.006),
      posterFrame: roundedSlab(1.14, 1.62, 0.04, 0.04, 0.012),
      poster: roundedPlane(1.0, 1.48, 0.015),
      onAirBox: roundedSlab(0.56, 0.19, 0.08, 0.05, 0.015),
      onAirFace: roundedPlane(0.5, 0.15, 0.03),
      sign: roundedPlane(1.22, 0.27, 0.035),
      signPlate: roundedSlab(1.3, 0.32, 0.03, 0.06, 0.01),
      opening: new THREE.PlaneGeometry(DOORWAY.width, DOORWAY.height),
    };
  }, []);
  const posterPlaces = useMemo(
    () =>
      posters.map((_, index) => {
        const side = index % 2 ? 1 : -1;
        const z = CORRIDOR.start - 6 - Math.floor(index / 2) * 6.5 - (side > 0 ? 3 : 0);
        return { side, z, panel: Math.round((FIRST_PANEL - z) / PANEL_STEP) };
      }),
    [posters],
  );
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);

  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    const lit = Math.min(1, c.corridorLights / PANELS);
    uniforms.uLights.value = c.corridorLights;
    uniforms.uLit.value = lit;
    uniforms.uDoor.value = c.doorOpen;
    setNeon(mats.strip, lit, 0.05);
    setNeon(mats.porthole, 0.35 + c.cove * 0.65, 0.2);
    posters.forEach((material, index) => {
      const on = THREE.MathUtils.clamp(c.corridorLights - posterPlaces[index].panel, 0, 1);
      material.color.setScalar(0.08 + on * 0.92);
    });
    mats.sign.color.setScalar(0.15 + lit * 0.95);
    // ON AIR: dark, then on with a little stutter as the walk starts.
    const t = c.corridorLights;
    const onAir = t < 1 ? 0.15 : t < 1.3 ? 1.6 : t < 1.6 ? 0.4 : 1.7 + 0.15 * Math.sin(frame.current.now * 0.006);
    mats.onAir.color.setScalar(onAir);
    mats.glow.uniforms.uOpen.value = c.doorOpen;
    // Sliding doors, easing into the walls.
    const open = c.doorOpen * (DOORWAY.width / 2 + 0.08);
    if (left.current) left.current.position.x = -DOORWAY.width / 4 - 0.025 - open;
    if (right.current) right.current.position.x = DOORWAY.width / 4 + 0.025 + open;
  });

  const doorZ = CORRIDOR.end;
  return (
    // Lifted a hair, so where the corridor meets the studio floor the two never fight.
    <group position={[0, 0.004, 0]}>
      <mesh geometry={shapes.tunnel} material={mats.shell} />
      <mesh geometry={shapes.ends} material={mats.shell} />

      {/* Posters, three a side, in dark frames. */}
      {posters.map((material, index) => {
        const { side, z } = posterPlaces[index];
        return (
          <group key={index} position={[side * (half - 0.025), 1.75, z]} rotation={[0, (-side * Math.PI) / 2, 0]}>
            <mesh geometry={shapes.posterFrame} material={mats.dark} />
            <mesh geometry={shapes.poster} material={material} position={[0, 0, 0.021]} />
          </group>
        );
      })}

      {/* The doorway: chrome frame, a line of pink light round it, the glow beyond. */}
      <group position={[0, 0, doorZ]}>
        <mesh geometry={shapes.jamb} material={mats.metal} position={[0, 0, 0.02]} />
        <mesh geometry={shapes.jambLight} material={mats.strip} position={[0, 0, 0.012]} />
        <mesh geometry={shapes.opening} material={mats.glow} position={[0, DOORWAY.height / 2, -0.14]} renderOrder={3} />
        {/* The studio sign and the ON AIR light above it. */}
        <mesh geometry={shapes.signPlate} material={mats.dark} position={[0, 3.08, 0.016]} />
        <mesh geometry={shapes.sign} material={mats.sign} position={[0, 3.08, 0.0315]} />
        <mesh geometry={shapes.onAirBox} material={mats.dark} position={[0, 3.385, 0.04]} />
        <mesh geometry={shapes.onAirFace} material={mats.onAir} position={[0, 3.385, 0.0805]} />

        {/* Two sliding leaves just behind the wall, each with a porthole onto the studio. */}
        {[left, right].map((ref, index) => (
          <group key={index} ref={ref} position={[(index ? 1 : -1) * (DOORWAY.width / 4 + 0.025), 0, -0.06]}>
            <mesh geometry={shapes.leaf} material={mats.door} position={[0, DOORWAY.height / 2 + 0.01, 0]} />
            <group position={[0, 1.62, 0.036]}>
              <mesh geometry={shapes.portholeRing} material={mats.metal} />
              <mesh geometry={shapes.portholeGlass} material={mats.porthole} position={[0, 0, -0.004]} />
            </group>
            <mesh geometry={shapes.plate} material={mats.metal} position={[(index ? -1 : 1) * (DOORWAY.width / 4 - 0.12), 1.12, 0.044]} />
          </group>
        ))}
      </group>
    </group>
  );
}
