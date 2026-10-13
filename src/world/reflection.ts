import * as THREE from 'three';

/**
 * A real mirror image in the studio floor. Before the floor is drawn, the
 * studio is drawn once more from below — the camera mirrored in the floor —
 * into a small picture, which the floor's shader then blends in, blurred
 * and weighted by the angle you look at it, as a polished floor does.
 *
 * Only what is worth seeing in the floor is drawn into the mirror (whatever
 * is on the REFLECT layer): the stage, the podiums, the screens and the
 * light, not the audience or the specks in the air. That and the reduced
 * size keep the extra picture cheap enough for a phone.
 */

export const REFLECT_LAYER = 1;

/** Puts a whole piece of the set (and its lights) into the floor's mirror. */
export function reflectable(object: THREE.Object3D | null) {
  object?.traverse((one) => one.layers.enable(REFLECT_LAYER));
}

export class FloorMirror {
  readonly target: THREE.WebGLRenderTarget;
  readonly textureMatrix = new THREE.Matrix4();
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly clip = new THREE.Vector4();
  private readonly q = new THREE.Vector4();
  private readonly plane = new THREE.Plane();
  private readonly size = new THREE.Vector2();
  private readonly rotation = new THREE.Matrix4();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(
    private readonly scale: number,
    private readonly height = 0,
  ) {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    this.camera.layers.set(REFLECT_LAYER);
  }

  /** Draws the mirror image for this camera. Call right before the floor is drawn. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, floor: THREE.Object3D) {
    const cam = camera as THREE.PerspectiveCamera;
    // Looking at the floor from below shows nothing.
    if (cam.position.y <= this.height + 0.01) return;

    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(64, Math.round(this.size.x * this.scale));
    const h = Math.max(64, Math.round(this.size.y * this.scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);

    // The camera mirrored in the floor plane: same lens, position, aim and
    // up direction all reflected. Built with lookAt so it stays a proper
    // camera (a mirrored matrix would turn every triangle inside out).
    const mirror = this.camera;
    this.rotation.extractRotation(cam.matrixWorld);
    this.from.setFromMatrixPosition(cam.matrixWorld);
    this.to.set(0, 0, -1).applyMatrix4(this.rotation).add(this.from);
    this.up.set(0, 1, 0).applyMatrix4(this.rotation);
    this.from.y = 2 * this.height - this.from.y;
    this.to.y = 2 * this.height - this.to.y;
    this.up.y = -this.up.y;
    mirror.position.copy(this.from);
    mirror.up.copy(this.up);
    mirror.lookAt(this.to);
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(cam.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);

    // Nothing below the floor may show up in the mirror (a podium sinking
    // through a trapdoor): an oblique near plane cuts it away.
    this.plane.set(new THREE.Vector3(0, 1, 0), -this.height).applyMatrix4(mirror.matrixWorldInverse);
    const p = mirror.projectionMatrix.elements;
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    this.q.set((Math.sign(this.clip.x) + p[8]) / p[0], (Math.sign(this.clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    p[2] = this.clip.x;
    p[6] = this.clip.y;
    p[10] = this.clip.z + 1;
    p[14] = this.clip.w;
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();

    const previous = renderer.getRenderTarget();
    const shadows = renderer.shadowMap.autoUpdate;
    floor.visible = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, mirror);
    renderer.setRenderTarget(previous);
    renderer.shadowMap.autoUpdate = shadows;
    // The main picture's viewport, which drawing into the mirror replaced.
    const viewport = (camera as THREE.Camera & { viewport?: THREE.Vector4 }).viewport;
    if (viewport) renderer.state.viewport(viewport);
    floor.visible = true;
  }

  dispose() {
    this.target.dispose();
  }
}

/** Shader code for a floor that shows a FloorMirror: declarations, then the sampling. */
export const MIRROR_HEAD = /* glsl */ `
  uniform sampler2D uMirror;
  uniform mat4 uMirrorMatrix;
  uniform float uMirrorStrength;
  vec3 psMirror(vec3 world, vec3 n, vec3 viewDir, float blur) {
    vec4 c = uMirrorMatrix * vec4(world, 1.0);
    vec2 uv = c.xy / c.w;
    // A polished floor is never perfectly flat: a faint ripple in the image.
    uv += (vec2(psNoise(world.xz * 3.1), psNoise(world.zx * 2.7 + 7.0)) - 0.5) * 0.004;
    vec3 sum = vec3(0.0);
    float lod = blur * 4.0;
    vec2 px = vec2(blur * 0.012);
    sum += textureLod(uMirror, uv, lod).rgb * 0.28;
    sum += textureLod(uMirror, uv + vec2(px.x, 0.0), lod).rgb * 0.18;
    sum += textureLod(uMirror, uv - vec2(px.x, 0.0), lod).rgb * 0.18;
    sum += textureLod(uMirror, uv + vec2(0.0, px.y * 1.6), lod).rgb * 0.18;
    sum += textureLod(uMirror, uv - vec2(0.0, px.y * 1.6), lod).rgb * 0.18;
    float cosT = clamp(dot(n, viewDir), 0.0, 1.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
    // Fade out at the edge of the mirror picture rather than cutting off.
    vec2 edge = smoothstep(0.0, 0.04, uv) * smoothstep(1.0, 0.96, uv);
    return sum * fresnel * uMirrorStrength * edge.x * edge.y;
  }
`;
