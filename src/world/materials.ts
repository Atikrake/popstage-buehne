import * as THREE from 'three';
import { drawGlow } from './canvasArt';

/**
 * Materials shared across the studio.
 *
 * Surfaces are three's physically based materials, extended where the set
 * needs more than a flat colour (see `extend`): inlaid light in the floor,
 * fluted wall panels, the corridor's own lighting. Light beams and screens
 * are small shaders of their own — a real volumetric light would cost a
 * phone far too much, so a beam is a soft cone that fades along its length,
 * towards its rim and close to the camera, with slow haze drifting through.
 */

export function canvasTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

let glowTexture: THREE.Texture | null = null;
/** One shared soft round glow. */
export function getGlow() {
  if (!glowTexture) glowTexture = canvasTexture(drawGlow());
  return glowTexture;
}

// --- extending the standard materials ---------------------------------------

export type Patch = {
  /** Tells three this program differs from the plain material's. */
  key: string;
  uniforms?: Record<string, THREE.IUniform>;
  /** Declarations for the top of each shader. */
  vertexHead?: string;
  fragmentHead?: string;
  /** Code inserted right after an `#include <chunk>` line. */
  vertex?: Record<string, string>;
  fragment?: Record<string, string>;
};

/** World position and normal, handed to every extended fragment shader. */
const WORLD_VARYINGS = /* glsl */ `
  varying vec3 vPsWorld;
  varying vec3 vPsNormal;
`;
const WORLD_VERTEX = /* glsl */ `
  vec4 psWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    psWorld = instanceMatrix * psWorld;
  #endif
  psWorld = modelMatrix * psWorld;
  vPsWorld = psWorld.xyz;
  vPsNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

/**
 * Adds code to one of three's own materials, so it keeps everything they do
 * (lights, shadows, reflections, fog) and gains a pattern or effect of its own.
 * Uniform objects are shared, not copied: change `.value` any time.
 */
export function extend<T extends THREE.Material>(material: T, patch: Patch): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, patch.uniforms ?? {});
    let vs = `${WORLD_VARYINGS}\n${patch.vertexHead ?? ''}\n${shader.vertexShader}`;
    vs = vs.replace('#include <project_vertex>', `#include <project_vertex>\n${WORLD_VERTEX}`);
    for (const [chunk, code] of Object.entries(patch.vertex ?? {})) vs = vs.replace(`#include <${chunk}>`, `#include <${chunk}>\n${code}`);
    let fs = `${WORLD_VARYINGS}\n${SHADER_LIB}\n${patch.fragmentHead ?? ''}\n${shader.fragmentShader}`;
    for (const [chunk, code] of Object.entries(patch.fragment ?? {})) {
      if (!fs.includes(`#include <${chunk}>`)) throw new Error(`extend(${patch.key}): no chunk ${chunk}`);
      fs = fs.replace(`#include <${chunk}>`, `#include <${chunk}>\n${code}`);
    }
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => patch.key;
  return material;
}

/** Small helpers every studio shader uses. */
export const SHADER_LIB = /* glsl */ `
  float psHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float psNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(psHash(i), psHash(i + vec2(1.0, 0.0)), u.x), mix(psHash(i + vec2(0.0, 1.0)), psHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  /** A line of half-width w at distance d, anti-aliased over one pixel. */
  float psLine(float d, float w) {
    float aa = max(fwidth(d), 1e-4);
    return 1.0 - smoothstep(w - aa, w + aa, d);
  }
  /** Signed distance to a rounded box of half-size b and corner radius r. */
  float psRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
`;

// --- surfaces -----------------------------------------------------------------

/** Glossy white lacquer, like a painted set piece under a clear coat. */
export function lacquer(color = '#F6F1F4', roughness = 0.32) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1,
  });
}

/** Polished metal: chrome trim, stands, the rig. */
export function chrome(color = '#E9E4E8', roughness = 0.14) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 1, envMapIntensity: 1.3 });
}

/** Dark anodised metal: lamp bodies, monitor backs. */
export function gunmetal(color = '#1A161B', roughness = 0.38) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.85, envMapIntensity: 1.1 });
}

/** Black glass: desk tops, bezels. Mostly reflection. */
export function darkGlass(color = '#0B080B') {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.08,
    metalness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.6,
  });
}

/** An emissive surface that glows past white — the bloom picks it up. */
export function neon(color: string, strength = 2.4) {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), toneMapped: false });
  material.userData.base = new THREE.Color(color);
  material.userData.strength = strength;
  return material;
}

/** Sets a neon material's brightness, 0 (off) … 1 (full). */
export function setNeon(material: THREE.MeshBasicMaterial, level: number, floor = 0.06) {
  const base = material.userData.base as THREE.Color;
  const strength = material.userData.strength as number;
  material.color.copy(base).multiplyScalar(Math.max(floor, level) * strength);
}

/**
 * A soft ring of light on the floor, drawn by a shader rather than a hard
 * mesh edge: a bright core with a glow falling off either side. `uFill`
 * shows only part of the ring (a countdown), its leading end brightest.
 */
export function makeHaloMaterial(color: string) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uLevel: { value: 1 },
      uRadius: { value: 0.74 },
      uWidth: { value: 0.012 },
      uFill: { value: 1 },
      uHead: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uLevel;
      uniform float uRadius;
      uniform float uWidth;
      uniform float uFill;
      uniform float uHead;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float d = abs(r - uRadius);
        float aa = fwidth(r);
        float core = 1.0 - smoothstep(uWidth - aa, uWidth + aa, d);
        float glow = exp(-d * d / (0.012 + uWidth * uWidth * 4.0)) * 0.45;
        // Clockwise from the front: how much of the ring is still lit.
        float a = fract(atan(vP.x, vP.y) / 6.2831853 + 1.0);
        float lit = 1.0 - smoothstep(uFill - 0.004, uFill + 0.004, a);
        float head = uHead * exp(-pow((a - uFill) * 40.0, 2.0)) * 2.5;
        float k = (core + glow) * (lit + head) * uLevel;
        gl_FragColor = vec4(uColor * k, k);
      }
    `,
  });
}

/**
 * Light spilling out round the edge of a screen: a soft glow that starts at
 * the screen's rounded outline and falls off outwards. Drawn on a plane a
 * little behind the screen.
 */
export function makeGlowFrameMaterial(color: string, half: THREE.Vector2, radius: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uLevel: { value: 0 },
      uHalf: { value: half },
      uRadius: { value: radius },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uLevel;
      uniform vec2 uHalf;
      uniform float uRadius;
      varying vec2 vP;
      ${SHADER_LIB}
      void main() {
        float d = max(psRoundBox(vP, uHalf, uRadius), 0.0);
        float k = (exp(-d * 9.0) * 0.8 + exp(-d * 30.0) * 1.2) * uLevel;
        gl_FragColor = vec4(uColor * k, k);
      }
    `,
  });
}

/** A soft dark patch under something standing on the floor: its contact shadow. */
export function makeContactShadowMaterial(strength = 0.55) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uStrength: { value: strength }, uBox: { value: new THREE.Vector2(0.5, 0.36) }, uSoft: { value: 0.22 } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uStrength;
      uniform vec2 uBox;
      uniform float uSoft;
      varying vec2 vP;
      ${SHADER_LIB}
      void main() {
        float d = psRoundBox(vP, uBox, min(uBox.x, uBox.y) * 0.6);
        float a = 1.0 - smoothstep(-uSoft * 0.35, uSoft, d);
        a = a * a * uStrength;
        gl_FragColor = vec4(0.06, 0.02, 0.04, a);
      }
    `,
  });
}

// --- light in the air -------------------------------------------------------

/**
 * A beam of light through haze: brightest at the lamp, fading towards where
 * it lands and at its rim, with slow drifting haze inside. It also fades out
 * close to the camera, so flying through a beam never shows a hard edge.
 */
export function makeBeamMaterial(color = '#FFE6F1') {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: Math.random() * 10 },
    },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying float vAround;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vDepth;
      void main() {
        vAlong = uv.y;
        vAround = uv.x;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = cameraPosition - world.xyz;
        vec4 view = viewMatrix * world;
        vDepth = -view.z;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uTime;
      uniform float uSeed;
      varying float vAlong;
      varying float vAround;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vDepth;
      ${SHADER_LIB}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vView);
        // Facing the camera square on means looking through the middle of the cone.
        float through = abs(dot(n, v));
        float rim = pow(through, 2.2);
        float along = pow(clamp(vAlong, 0.0, 1.0), 1.35);
        // The lamp's own hot spot and a soft landing at the far end.
        float hot = 1.0 + 1.6 * pow(clamp(vAlong, 0.0, 1.0), 10.0);
        float land = smoothstep(0.0, 0.16, vAlong);
        // Haze rolling slowly through the beam.
        float haze = psNoise(vec2(vAround * 9.0 + uSeed, vAlong * 3.0 - uTime * 0.18));
        haze = 0.62 + 0.76 * haze;
        float near = smoothstep(0.6, 3.2, vDepth);
        float a = uIntensity * along * rim * hot * land * haze * near * 0.24;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  });
}

// --- screens --------------------------------------------------------------------

/**
 * A monitor screen. It shows its picture with fine scanlines, a glass sheen
 * that catches the light at a slant and a slight vignette.
 * `uStatic` turns it into noise (somebody being sent off); `uOff` switches it
 * off the way an old tube does — the picture collapses to a line, then to a
 * dot, then black; `uPower` dims it.
 */
export function makeScreenMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      uMap: { value: map },
      uPower: { value: 1 },
      uStatic: { value: 0 },
      uOff: { value: 0 },
      uTime: { value: 0 },
      uBright: { value: 1 },
      uBreath: { value: 0 },
      uTint: { value: new THREE.Color('#ffffff') },
      // Cover-crop for pictures whose shape is not the screen's (a phone camera).
      uRepeat: { value: new THREE.Vector2(1, 1) },
      uOffset: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = cameraPosition - world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uPower;
      uniform float uStatic;
      uniform float uOff;
      uniform float uTime;
      uniform float uBright;
      uniform float uBreath;
      uniform vec3 uTint;
      uniform vec2 uRepeat;
      uniform vec2 uOffset;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      ${SHADER_LIB}
      void main() {
        vec2 p = vUv - 0.5;
        // Switching off: squeeze to a line, then to a point.
        float sy = mix(1.0, 0.006, smoothstep(0.0, 0.55, uOff));
        float sx = mix(1.0, 0.006, smoothstep(0.5, 0.9, uOff));
        vec2 q = p / vec2(sx, sy);
        float inside = (1.0 - smoothstep(0.5 - fwidth(q.x), 0.5, abs(q.x))) * (1.0 - smoothstep(0.5 - fwidth(q.y), 0.5, abs(q.y)));
        float squeeze = uOff > 0.0 ? clamp(0.7 / sqrt(sx * sy), 1.0, 6.0) : 1.0;

        // A slow breath, so a stand-in reads as a live picture and not a photo.
        vec2 uv = q * (1.0 - uBreath * 0.012) + 0.5;
        uv.y += sin(uTime * 1.3) * 0.003 * uBreath;
        uv = clamp(uv, 0.0, 1.0) * uRepeat + uOffset;
        vec3 color = texture2D(uMap, uv).rgb * uTint;

        float n = psHash(floor(vUv * vec2(160.0, 220.0)) + floor(uTime * 24.0));
        float tear = step(0.92, psHash(vec2(floor(vUv.y * 40.0), floor(uTime * 12.0))));
        color = mix(color, vec3(n) * (0.7 + 0.3 * tear), uStatic);

        // Scanlines, faded out where they would shimmer at a distance.
        float lines = vUv.y * 260.0;
        float fade = 1.0 - smoothstep(0.25, 0.7, fwidth(lines));
        color *= 1.0 - 0.07 * fade * (0.5 + 0.5 * sin(lines * 6.2831853));
        float vignette = smoothstep(0.82, 0.3, length(p * vec2(1.0, 0.9)));
        color *= mix(0.8, 1.0, vignette);
        color *= uBright * uPower * inside * squeeze;
        if (uOff >= 0.999) color = vec3(0.0);

        // The glass in front: a faint sheen across it, stronger at a slant.
        float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 4.0);
        float sheen = smoothstep(-0.1, 0.55, dot(p, vec2(-0.6, 0.8))) * 0.035;
        color += vec3(1.0, 0.93, 0.96) * (sheen + fres * 0.22);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * The LED wall: the picture as seen on real LED panels. Close up the single
 * diodes and the seams between panels show; from further away they blend
 * smoothly into the picture instead of shimmering.
 */
export function makeLedMaterial(map: THREE.Texture, cells = new THREE.Vector2(256, 144), panels = new THREE.Vector2(8, 4.5)) {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      uMap: { value: map },
      uBright: { value: 1 },
      uCells: { value: cells },
      uPanels: { value: panels },
      uReveal: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uBright;
      uniform vec2 uCells;
      uniform vec2 uPanels;
      uniform float uReveal;
      uniform float uTime;
      varying vec2 vUv;
      ${SHADER_LIB}
      void main() {
        vec3 color = texture2D(uMap, vUv).rgb;
        // The diodes: round dots on a dark grid, only where they can be seen.
        vec2 cell = vUv * uCells;
        vec2 f = fract(cell) - 0.5;
        float px = max(fwidth(cell.x), fwidth(cell.y));
        float diode = 1.0 - smoothstep(0.32, 0.32 + px, length(f));
        float show = 1.0 - smoothstep(0.18, 0.55, px);
        float mask = mix(1.0, 0.25 + 1.25 * diode, show);
        // Seams between the panels.
        vec2 pg = vUv * uPanels;
        vec2 pd = abs(fract(pg) - 0.5);
        float seam = max(psLine(0.5 - pd.x, 0.004 * uPanels.x), psLine(0.5 - pd.y, 0.004 * uPanels.y));
        mask *= 1.0 - seam * 0.55 * (1.0 - smoothstep(0.02, 0.06, fwidth(pg.x)));
        // Booting: panels come on from the middle outwards.
        vec2 panel = floor(pg) + 0.5;
        float ring = length((panel / uPanels - 0.5) * vec2(1.6, 1.0));
        float on = smoothstep(ring * 0.9, ring * 0.9 + 0.08, uReveal * 1.1);
        gl_FragColor = vec4(color * mask * uBright * on, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Fills a screen with a picture without stretching it: whatever does not fit
 * the screen's shape is cut off evenly, the way a phone fills its screen with
 * the camera. `mirror` flips it for a self-view.
 */
export function coverScreen(material: THREE.ShaderMaterial, texture: THREE.Texture, screenAspect: number, mirror = false) {
  const image = texture.image as { videoWidth?: number; videoHeight?: number; width?: number; height?: number } | undefined;
  const w = image?.videoWidth || image?.width || 1;
  const h = image?.videoHeight || image?.height || 1;
  const aspect = w / h;
  const repeat = material.uniforms.uRepeat.value as THREE.Vector2;
  const offset = material.uniforms.uOffset.value as THREE.Vector2;
  if (aspect > screenAspect) repeat.set(screenAspect / aspect, 1);
  else repeat.set(1, aspect / screenAspect);
  offset.set((1 - repeat.x) / 2, (1 - repeat.y) / 2);
  if (mirror) {
    offset.x += repeat.x;
    repeat.x = -repeat.x;
  }
  if (material.uniforms.uMap.value !== texture) material.uniforms.uMap.value = texture;
}

// --- the balloon string -------------------------------------------------------

/**
 * A string that hangs in a curve: a thin tube from 0 to 1 along y, bent in
 * the vertex shader along a curve from `uFrom` through `uBend` to `uTo`,
 * so it can sway every frame without new geometry.
 */
export function makeStringMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uFrom: { value: new THREE.Vector3() },
      uBend: { value: new THREE.Vector3() },
      uTo: { value: new THREE.Vector3(0, 1, 0) },
      uColor: { value: new THREE.Color('#E8DDE2') },
      uLight: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uFrom;
      uniform vec3 uBend;
      uniform vec3 uTo;
      varying float vShade;
      void main() {
        float t = clamp(position.y, 0.0, 1.0);
        vec3 a = mix(uFrom, uBend, t);
        vec3 b = mix(uBend, uTo, t);
        vec3 p = mix(a, b, t);
        vec3 tangent = normalize(mix(uBend - uFrom, uTo - uBend, t));
        vec3 side = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
        vec3 other = cross(tangent, side);
        p += side * position.x + other * position.z;
        vShade = 0.65 + 0.35 * normalize(side * normal.x + other * normal.z).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uLight;
      varying float vShade;
      void main() {
        gl_FragColor = vec4(uColor * vShade * uLight, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
