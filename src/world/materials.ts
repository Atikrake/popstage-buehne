import * as THREE from 'three';
import { drawGlow } from './canvasArt';

/**
 * Materials shared across the studio. Light beams and screens are small
 * shaders of their own: a real volumetric light would cost a phone far too
 * much, so a beam is a soft additive cone that fades along its length and at
 * its edges, which reads as light in haze for almost nothing.
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

/** A beam of light: brightest at the lamp, fading out towards the floor and at its edges. */
export function makeBeamMaterial(color = '#FFE6F1') {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vAlong = uv.y;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vAlong;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float along = pow(clamp(vAlong, 0.0, 1.0), 1.6);
        float edge = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.8);
        float a = uIntensity * along * edge * 0.26;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  });
}

/**
 * A monitor screen. It shows its picture with scanlines and a slight glow;
 * `uStatic` turns it into noise (somebody being sent off), `uPower` switches it off.
 */
export function makeScreenMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      uMap: { value: map },
      uPower: { value: 1 },
      uStatic: { value: 0 },
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
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uPower;
      uniform float uStatic;
      uniform float uTime;
      uniform float uBright;
      uniform float uBreath;
      uniform vec3 uTint;
      uniform vec2 uRepeat;
      uniform vec2 uOffset;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        // A slow breath, so a stand-in reads as a live picture and not a photo.
        vec2 uv = (vUv - 0.5) * (1.0 - uBreath * 0.012) + 0.5;
        uv.y += sin(uTime * 1.3) * 0.003 * uBreath;
        uv = uv * uRepeat + uOffset;
        vec3 color = texture2D(uMap, uv).rgb * uTint;
        float n = hash(floor(vUv * vec2(160.0, 220.0)) + floor(uTime * 24.0));
        float tear = step(0.92, hash(vec2(floor(vUv.y * 40.0), floor(uTime * 12.0))));
        vec3 noise = vec3(n) * (0.7 + 0.3 * tear);
        color = mix(color, noise, uStatic);
        color *= 0.94 + 0.06 * sin(vUv.y * 900.0);
        float vignette = smoothstep(0.85, 0.35, length(vUv - 0.5));
        color *= mix(0.78, 1.0, vignette);
        gl_FragColor = vec4(color * uBright * uPower, 1.0);
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

// --- the heart balloon --------------------------------------------------------

let heartGeometry: THREE.BufferGeometry | null = null;

/** A puffy heart, point down, about 0.6 units across. */
export function getHeartGeometry() {
  if (heartGeometry) return heartGeometry;
  const shape = new THREE.Shape();
  shape.moveTo(25, 25);
  shape.bezierCurveTo(25, 25, 20, 0, 0, 0);
  shape.bezierCurveTo(-30, 0, -30, 35, -30, 35);
  shape.bezierCurveTo(-30, 55, -10, 77, 25, 95);
  shape.bezierCurveTo(60, 77, 80, 55, 80, 35);
  shape.bezierCurveTo(80, 35, 80, 0, 50, 0);
  shape.bezierCurveTo(35, 0, 25, 25, 25, 25);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 6,
    bevelEnabled: true,
    bevelThickness: 16,
    bevelSize: 12,
    bevelSegments: 10,
    curveSegments: 28,
  });
  geometry.center();
  geometry.rotateZ(Math.PI);
  const scale = 0.62 / 134;
  geometry.scale(scale, scale, scale);
  geometry.computeVertexNormals();
  heartGeometry = geometry;
  return geometry;
}
