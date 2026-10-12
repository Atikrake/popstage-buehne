import { useFrame, useThree } from '@react-three/fiber';
import React, { createContext, useContext, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { clock } from '../show/clock';
import type { Phase, ShowState } from '../show/types';
import { computeCues, type Cues } from './director';

/**
 * What every part of the studio reads once per frame: the director's cues
 * for this moment and a handle on the effects. Worked out once, before
 * anything else draws, and handed round through a ref so no frame ever makes
 * React render.
 */

export type Fx = {
  burst: (position: THREE.Vector3, color: string) => void;
  confetti: (position: THREE.Vector3, count: number, spread: number) => void;
};

export type Frame = {
  cues: Cues | null;
  now: number;
  state: ShowState;
  fx: Fx | null;
};

const FrameContext = createContext<MutableRefObject<Frame> | null>(null);

export function useFrameData() {
  const frame = useContext(FrameContext);
  if (!frame) throw new Error('useFrameData outside <Director>');
  return frame;
}

/** Phases the camera cuts into rather than travelling to. */
function isCut(from: Phase | null, to: Phase) {
  if (from === null) return true;
  if (to === 'intro' || to === 'title') return true;
  if (from === 'intro' || from === 'title' || from === 'end') return true;
  return false;
}

/**
 * Glides a value towards a goal the way a camera operator would: it speeds up
 * gently, travels, and settles without overshooting — never a jolt, even when
 * the goal jumps somewhere else halfway through a move.
 */
function smoothDamp(current: number, goal: number, velocity: { v: number }, smoothTime: number, dt: number) {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - goal;
  const temp = (velocity.v + omega * change) * dt;
  velocity.v = (velocity.v - omega * temp) * exp;
  return goal + (change + temp) * exp;
}

class DampedVector {
  value = new THREE.Vector3();
  private vel = [{ v: 0 }, { v: 0 }, { v: 0 }];
  set(to: THREE.Vector3) {
    this.value.copy(to);
    this.vel.forEach((one) => (one.v = 0));
  }
  step(goal: THREE.Vector3, smoothTime: number, dt: number) {
    this.value.set(
      smoothDamp(this.value.x, goal.x, this.vel[0], smoothTime, dt),
      smoothDamp(this.value.y, goal.y, this.vel[1], smoothTime, dt),
      smoothDamp(this.value.z, goal.z, this.vel[2], smoothTime, dt),
    );
  }
}

export function Director({ state, children }: { state: ShowState; children: React.ReactNode }) {
  const frame = useRef<Frame>({ cues: null, now: 0, state, fx: null });
  frame.current.state = state;
  const { camera, size } = useThree();
  const position = useRef(new DampedVector());
  const target = useRef(new DampedVector());
  const fov = useRef({ value: 50, v: { v: 0 } });
  const lastPhase = useRef<Phase | null>(null);
  const lastStart = useRef(0);

  useFrame((_three, delta) => {
    const now = clock();
    const current = frame.current.state;
    const cues = computeCues(current, now, size.width / Math.max(1, size.height));
    frame.current.cues = cues;
    frame.current.now = now;

    const changed = lastPhase.current !== current.phase || lastStart.current !== current.phaseStart;
    const cut = changed && isCut(lastPhase.current, current.phase);
    lastPhase.current = current.phase;
    lastStart.current = current.phaseStart;

    const dt = Math.min(delta, 0.05);
    if (cut || cues.ease <= 0) {
      // Cuts and scripted moves (the intro, the title) are followed exactly.
      position.current.set(cues.shot.position);
      target.current.set(cues.shot.target);
      fov.current.value = cues.shot.fov;
      fov.current.v.v = 0;
    } else {
      // About a third of the travel time as smoothing time feels like a real dolly.
      const st = cues.ease * 0.38;
      position.current.step(cues.shot.position, st, dt);
      target.current.step(cues.shot.target, st * 0.9, dt);
      fov.current.value = smoothDamp(fov.current.value, cues.shot.fov, fov.current.v, st, dt);
    }

    // A camera operator's hands: never quite still.
    const s = now * 0.001;
    const hand = cues.handheld * 0.016;
    const cam = camera as THREE.PerspectiveCamera;
    const p = position.current.value;
    const tg = target.current.value;
    cam.position.set(p.x + Math.sin(s * 0.9) * hand + Math.sin(s * 2.3) * hand * 0.3, p.y + Math.sin(s * 1.3 + 1) * hand * 0.7, p.z);
    cam.lookAt(tg.x + Math.sin(s * 0.7) * hand * 0.5, tg.y, tg.z);
    if (Math.abs(cam.fov - fov.current.value) > 0.01) {
      cam.fov = fov.current.value;
      cam.updateProjectionMatrix();
    }
  }, -1);

  return <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>;
}
