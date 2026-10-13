import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrameData } from './frame';
import { STAGE_CENTER, STAGE_RADIUS, STAGE_TOP } from './layout';
import { getGlow } from './materials';

/**
 * Confetti, balloon shreds, the flash and ring of a burst, cold-spark
 * fountains and the haze in the light.
 *
 * Particles live in fixed pools drawn as instanced meshes — a burst only
 * wakes up particles that already exist, so nothing is created or thrown
 * away while the show runs and a phone never stutters on a POP. The sparks
 * and the haze move entirely on the graphics chip.
 */

type Particle = {
  alive: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
  life: number;
  age: number;
  size: number;
  flutter: number;
};

const CONFETTI_COLORS = ['#FF2D7A', '#FF8FBC', '#FFFFFF', '#FFC23D', '#A97BFF', '#2FC7A8', '#FFE3EF'];

function pool(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    alive: false,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
    r: new THREE.Euler(),
    w: new THREE.Vector3(),
    life: 1,
    // 0, not -1: the first frame tucks every resting particle out of sight.
    age: 0,
    size: 1,
    flutter: 0,
  }));
}

/** A torn strip of balloon: a narrow ribbon, curled. */
function shredGeometry() {
  const g = new THREE.PlaneGeometry(0.035, 0.13, 1, 6);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    // Curl it round a little, so it tumbles like rubber and not like paper.
    const a = y * 9;
    pos.setXYZ(i, pos.getX(i), Math.sin(a) / 9, (1 - Math.cos(a)) / 9);
  }
  g.computeVertexNormals();
  return g;
}

/** The ring of air a burst pushes out: a thin bright ring growing and fading. */
function makeShockMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: { uAge: { value: 9 }, uColor: { value: new THREE.Color('#ffffff') } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy * 2.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAge;
      uniform vec3 uColor;
      varying vec2 vP;
      void main() {
        float t = clamp(uAge / 0.5, 0.0, 1.0);
        float radius = 1.0 - pow(1.0 - t, 3.0);
        float width = 0.03 + 0.1 * t;
        float d = abs(length(vP) - radius * 0.92);
        float k = exp(-d * d / (width * width)) * (1.0 - t) * 1.6;
        gl_FragColor = vec4(uColor * k, k);
      }
    `,
  });
}

export function Effects({ confettiCount, dustCount, sparkCount }: { confettiCount: number; dustCount: number; sparkCount: number }) {
  const frame = useFrameData();
  const { camera } = useThree();
  const confettiMesh = useRef<THREE.InstancedMesh>(null);
  const shardMesh = useRef<THREE.InstancedMesh>(null);
  const flash = useRef<THREE.Mesh>(null);
  const shock = useRef<THREE.Mesh>(null);
  const flashState = useRef({ age: 9, color: new THREE.Color('#ffffff') });

  const confetti = useMemo(() => pool(confettiCount), [confettiCount]);
  const shards = useMemo(() => pool(120), []);
  const cursor = useRef({ confetti: 0, shard: 0 });
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => CONFETTI_COLORS.map((c) => new THREE.Color(c)), []);
  const rainClock = useRef(0);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  const shardGeometry = useMemo(() => shredGeometry(), []);
  const shardMaterial = useMemo(() => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.25, metalness: 0.4 }), []);
  const confettiMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.35, metalness: 0.35, emissive: '#ffffff', emissiveIntensity: 0.18 }),
    [],
  );
  const flashMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: getGlow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [],
  );
  const shockMaterial = useMemo(() => makeShockMaterial(), []);

  // The handles everything else uses to set effects off.
  useEffect(() => {
    const spawnConfetti = (position: THREE.Vector3, count: number, spread: number, burst: number) => {
      for (let i = 0; i < count; i += 1) {
        const index = cursor.current.confetti;
        const one = confetti[index];
        cursor.current.confetti = (cursor.current.confetti + 1) % confetti.length;
        one.alive = true;
        one.age = 0;
        one.life = 3.2 + Math.random() * 2.4;
        one.p.set(position.x + (Math.random() - 0.5) * spread, position.y + (Math.random() - 0.5) * spread * 0.3, position.z + (Math.random() - 0.5) * spread);
        const a = Math.random() * Math.PI * 2;
        const speed = burst * (0.4 + Math.random());
        one.v.set(Math.cos(a) * speed, burst * (0.6 + Math.random() * 1.2), Math.sin(a) * speed);
        one.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        one.w.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
        one.size = 0.7 + Math.random() * 0.6;
        one.flutter = Math.random() * 10;
        confettiMesh.current?.setColorAt(index, colors[Math.floor(Math.random() * colors.length)]);
      }
      if (confettiMesh.current?.instanceColor) confettiMesh.current.instanceColor.needsUpdate = true;
    };

    frame.current.fx = {
      burst: (position, color) => {
        const tint = new THREE.Color(color);
        for (let i = 0; i < 40; i += 1) {
          const index = cursor.current.shard;
          const one = shards[index];
          cursor.current.shard = (cursor.current.shard + 1) % shards.length;
          one.alive = true;
          one.age = 0;
          one.life = 1.3 + Math.random() * 0.9;
          // Out from the balloon's skin, not from a single point.
          const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).normalize();
          one.p.copy(position).addScaledVector(dir, 0.2);
          one.v.copy(dir).multiplyScalar(2.5 + Math.random() * 3.5);
          one.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
          one.w.set((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22);
          one.size = 0.6 + Math.random() * 0.8;
          shardMesh.current?.setColorAt(index, tint.clone().multiplyScalar(0.8 + Math.random() * 0.4));
        }
        if (shardMesh.current?.instanceColor) shardMesh.current.instanceColor.needsUpdate = true;
        spawnConfetti(position, 70, 0.3, 2.6);
        flashState.current.age = 0;
        flashState.current.color.set(color).lerp(new THREE.Color('#ffffff'), 0.5);
        shockMaterial.uniforms.uColor.value.copy(flashState.current.color);
        flash.current?.position.copy(position);
        shock.current?.position.copy(position);
      },
      confetti: (position, count, spread) => spawnConfetti(position, count, spread, 0.6),
    };
    return () => {
      frame.current.fx = null;
    };
  }, [colors, confetti, frame, shards, shockMaterial]);

  useFrame((_s, delta) => {
    const c = frame.current.cues;
    const dt = Math.min(delta, 0.05);

    // Confetti raining from the rig at the finale.
    if (c && c.confettiRain > 0) {
      rainClock.current += dt * c.confettiRain * 70;
      while (rainClock.current > 1) {
        rainClock.current -= 1;
        frame.current.fx?.confetti(scratch.set((Math.random() - 0.5) * 9, 8.3, -3.6 + (Math.random() - 0.5) * 7), 1, 0.2);
      }
    }

    const step = (list: Particle[], mesh: THREE.InstancedMesh | null, drag: number, gravity: number, flutterAmount: number) => {
      if (!mesh) return;
      let touched = false;
      list.forEach((one, index) => {
        // Particles at rest cost nothing: only the living (and the one that
        // has just died, to tuck it away) are written.
        if (!one.alive && one.age < 0) return;
        touched = true;
        if (!one.alive) {
          one.age = -1;
          dummy.position.set(0, -50, 0);
          dummy.scale.setScalar(0.0001);
        } else {
          one.age += dt;
          if (one.age > one.life) {
            one.alive = false;
            one.age = one.life;
          }
          one.v.y -= gravity * dt;
          one.v.multiplyScalar(1 - drag * dt);
          // Paper drifts side to side as it falls.
          one.p.x += (one.v.x + Math.sin(one.age * 6 + one.flutter) * flutterAmount) * dt;
          one.p.y += one.v.y * dt;
          one.p.z += (one.v.z + Math.cos(one.age * 5 + one.flutter) * flutterAmount) * dt;
          if (one.p.y < 0.02) {
            one.p.y = 0.02;
            one.v.set(0, 0, 0);
            one.w.multiplyScalar(0.9);
          }
          one.r.x += one.w.x * dt;
          one.r.y += one.w.y * dt;
          one.r.z += one.w.z * dt;
          const fade = Math.min(1, (one.life - one.age) * 2, one.age * 12);
          dummy.position.copy(one.p);
          dummy.rotation.copy(one.r);
          dummy.scale.setScalar(one.size * Math.max(0.0001, fade));
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      if (touched) mesh.instanceMatrix.needsUpdate = true;
    };
    step(confetti, confettiMesh.current, 1.6, 2.2, 0.5);
    step(shards, shardMesh.current, 1.1, 6, 0.15);

    const f = flashState.current;
    f.age += dt;
    const k = Math.max(0, 1 - f.age / 0.4);
    if (flash.current) {
      // Shrunk rather than hidden, so it is ready the moment it is needed.
      flash.current.scale.setScalar(k > 0 ? 0.5 + (1 - k) * 3.2 : 0.0001);
      flash.current.quaternion.copy(camera.quaternion);
      flashMaterial.color.copy(f.color).multiplyScalar(k * k * 3.2);
    }
    if (shock.current) {
      shock.current.quaternion.copy(camera.quaternion);
      shock.current.scale.setScalar(f.age < 0.6 ? 2.6 : 0.0001);
      shockMaterial.uniforms.uAge.value = f.age;
    }
  });

  return (
    <>
      <instancedMesh ref={confettiMesh} args={[undefined, confettiMaterial, confetti.length]} frustumCulled={false}>
        <planeGeometry args={[0.055, 0.09]} />
      </instancedMesh>
      <instancedMesh ref={shardMesh} args={[shardGeometry, shardMaterial, shards.length]} frustumCulled={false} />
      <mesh ref={flash} material={flashMaterial} scale={0.0001} renderOrder={10}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={shock} material={shockMaterial} scale={0.0001} renderOrder={11}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {sparkCount > 0 ? <Sparks count={sparkCount} /> : null}
      {dustCount > 0 ? <Dust count={dustCount} /> : null}
    </>
  );
}

// --- cold sparks ----------------------------------------------------------------

/** Where the spark fountains stand: along the front edge of the stage. */
const FOUNTAINS = [-0.62, -0.22, 0.22, 0.62].map((a) => new THREE.Vector3(STAGE_CENTER.x + Math.sin(a) * (STAGE_RADIUS - 0.35), STAGE_TOP, STAGE_CENTER.z + Math.cos(a) * (STAGE_RADIUS - 0.35)));

/**
 * Cold-spark fountains, the kind every big TV finale has. Each spark's whole
 * flight is a formula of time — shot up, slowed by the air, falling, cooling
 * from white to gold — so the graphics chip draws all of them without any
 * work per frame. Each is drawn as a short streak along its path, the way a
 * camera sees something that bright and that fast.
 */
function Sparks({ count }: { count: number }) {
  const frame = useFrameData();
  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    // One quad: x across the streak (-1 … 1), y along it (0 tail … 1 head).
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const origin = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      const f = FOUNTAINS[i % FOUNTAINS.length];
      origin.set([f.x, f.y, f.z], i * 3);
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    g.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(STAGE_CENTER.clone().setY(2), 12);
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uTime: { value: 0 }, uLevel: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute vec3 aOrigin;
          attribute vec4 aSeed;
          uniform float uTime;
          uniform float uLevel;
          varying float vHeat;
          varying vec2 vQuad;
          vec3 flight(float age) {
            float a = aSeed.z * 6.2831853;
            float spread = 0.3 + aSeed.w * 0.55;
            vec3 v = vec3(cos(a) * spread, 5.4 + aSeed.x * 2.4, sin(a) * spread);
            // Air slows them, gravity brings them back down.
            float drag = 1.4;
            float s = (1.0 - exp(-drag * age)) / drag;
            return aOrigin + v * s - vec3(0.0, 2.6, 0.0) * age * age;
          }
          void main() {
            float life = 0.85 + aSeed.x * 0.75;
            float t = fract(uTime / life + aSeed.y);
            float age = t * life;
            vec4 head = viewMatrix * vec4(flight(age), 1.0);
            vec4 tail = viewMatrix * vec4(flight(max(0.0, age - 0.06)), 1.0);
            vec2 along = head.xy - tail.xy;
            vec2 dir = length(along) > 1e-5 ? normalize(along) : vec2(0.0, 1.0);
            // Turned so the quad keeps facing the camera (counter-clockwise).
            vec2 side = vec2(dir.y, -dir.x);
            vec4 p = mix(tail, head, position.y);
            p.xy += side * position.x * 0.03;
            vHeat = (1.0 - t) * uLevel;
            vQuad = position.xy;
            // Folded away to nothing while the fountains are off.
            gl_Position = projectionMatrix * p * step(0.001, uLevel);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vHeat;
          varying vec2 vQuad;
          void main() {
            float across = 1.0 - abs(vQuad.x);
            float k = across * across * (0.25 + 0.75 * vQuad.y) * vHeat;
            // White hot, cooling to gold.
            vec3 color = mix(vec3(1.0, 0.6, 0.2), vec3(1.0, 0.96, 0.86), vHeat);
            gl_FragColor = vec4(color * k * 5.0, k);
          }
        `,
      }),
    [],
  );
  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    material.uniforms.uTime.value = frame.current.now / 1000;
    material.uniforms.uLevel.value = c.sparks;
  });
  return <mesh geometry={geometry} material={material} renderOrder={6} frustumCulled={false} />;
}

// --- haze -------------------------------------------------------------------------

/** Haze: tiny specks drifting slowly in the air, glinting in the light. */
function Dust({ count }: { count: number }) {
  const frame = useFrameData();
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = Math.random() * 8;
      positions[i * 3 + 2] = -3.6 + (Math.random() - 0.5) * 14;
      seeds[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: { uTime: { value: 0 }, uLevel: { value: 0.5 }, uScale: { value: 400 } },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          uniform float uScale;
          varying float vTwinkle;
          void main() {
            vec3 p = position;
            float t = uTime * (0.05 + aSeed * 0.05);
            p += vec3(sin(t + aSeed * 40.0), sin(t * 0.7 + aSeed * 13.0) * 0.6, cos(t * 0.8 + aSeed * 27.0)) * 0.6;
            vTwinkle = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * (0.8 + aSeed * 2.0) + aSeed * 60.0), 3.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = uScale * 0.03 / -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uLevel;
          varying float vTwinkle;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float k = (1.0 - smoothstep(0.0, 0.5, d)) * vTwinkle * uLevel;
            gl_FragColor = vec4(vec3(1.0, 0.9, 0.95) * k, k);
          }
        `,
      }),
    [],
  );
  const { size, viewport } = useThree();
  useFrame(() => {
    const c = frame.current.cues;
    if (!c) return;
    material.uniforms.uTime.value = frame.current.now / 1000;
    material.uniforms.uLevel.value = 0.22 + (1 - c.house) * 0.4;
    material.uniforms.uScale.value = size.height * viewport.dpr * 0.5;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
