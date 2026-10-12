import { clock } from '../show/clock';
import { useFrame, useThree } from '@react-three/fiber';
import React, { createContext, useContext, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
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

export function Director({ state, children }: { state: ShowState; children: React.ReactNode }) {
  const frame = useRef<Frame>({ cues: null, now: 0, state, fx: null });
  frame.current.state = state;
  const { camera, size } = useThree();
  const position = useRef(new THREE.Vector3(0, 6, 14));
  const target = useRef(new THREE.Vector3(0, 2, -3));
  const fov = useRef(50);
  const lastPhase = useRef<Phase | null>(null);
  const lastStart = useRef(0);

  useFrame((_three, delta) => {
    const now = clock();
    const current = frame.current.state;
    const cues = computeCues(current, now, size.width / Math.max(1, size.height));
    frame.current.cues = cues;
    frame.current.now = now;

    const cut = isCut(lastPhase.current, current.phase) && (lastPhase.current !== current.phase || lastStart.current !== current.phaseStart);
    lastPhase.current = current.phase;
    lastStart.current = current.phaseStart;

    const k = cut || cues.follow >= 50 ? 1 : 1 - Math.exp(-cues.follow * Math.min(delta, 0.1));
    position.current.lerp(cues.shot.position, k);
    target.current.lerp(cues.shot.target, k);
    fov.current += (cues.shot.fov - fov.current) * k;

    // A camera operator's hands: never quite still.
    const s = now * 0.001;
    const hand = cues.handheld * 0.018;
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(
      position.current.x + Math.sin(s * 0.9) * hand + Math.sin(s * 2.3) * hand * 0.3,
      position.current.y + Math.sin(s * 1.3 + 1) * hand * 0.7,
      position.current.z,
    );
    cam.lookAt(target.current.x + Math.sin(s * 0.7) * hand * 0.5, target.current.y, target.current.z);
    if (Math.abs(cam.fov - fov.current) > 0.01) {
      cam.fov = fov.current;
      cam.updateProjectionMatrix();
    }
  }, -1);

  return <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>;
}
