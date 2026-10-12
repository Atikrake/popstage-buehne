import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useMemo } from 'react';
import * as THREE from 'three';
import { QUALITY, type Quality } from '../quality';
import { HOST_LOOK } from '../show/cast';
import type { ShowState } from '../show/types';
import { drawAvatar } from './canvasArt';
import { Corridor } from './Corridor';
import { Crowd } from './Crowd';
import { Effects } from './Effects';
import { Director } from './frame';
import { canvasTexture } from './materials';
import { Podium } from './Podium';
import { HostBackdrop } from './HostBackdrop';
import { HostDesk, LedWall } from './Screens';
import { Spotlights } from './Spotlights';
import { Environment, Lights, Studio } from './Studio';

/**
 * The whole studio, ready to drop into a <Canvas>. It needs the show's state
 * and nothing else: every movement, light and screen follows from it.
 *
 * `pictures` is where a live camera per player comes in, by id — the host's
 * under the host's id. Anybody without one is drawn as a stand-in.
 */
export function StudioWorld({
  state,
  quality,
  onTap,
  pictures = {},
}: {
  state: ShowState;
  quality: Quality;
  onTap?: (id: string) => void;
  pictures?: Record<string, THREE.Texture | null>;
}) {
  const q = QUALITY[quality];
  // On stage: everybody still standing, and whoever is on their way out.
  const onStage = state.contestants.filter(
    (c) => state.standing.includes(c.id) || (state.target === c.id && (state.phase === 'verdict' || state.phase === 'pop')),
  );
  const hostStandIn = useMemo(() => canvasTexture(drawAvatar(HOST_LOOK)), []);
  const hostPicture = pictures[state.host.id] ?? hostStandIn;

  return (
    <Director state={state}>
      <Environment />
      <Lights />
      <Studio quality={quality} />
      <Corridor />
      <LedWall />
      <HostDesk picture={hostPicture} />
      <HostBackdrop />
      <Spotlights />
      <Crowd count={q.audience} />
      {onStage.map((c) => (
        <Podium key={c.id} contestant={c} order={state.contestants.indexOf(c)} onTap={onTap} picture={pictures[c.id] ?? null} />
      ))}
      <Effects confettiCount={q.confetti} dustCount={q.dust} />
      {q.composer ? (
        <EffectComposer multisampling={quality === 'high' ? 4 : 0} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={0.85} luminanceThreshold={1.0} luminanceSmoothing={0.25} radius={0.72} resolutionScale={quality === 'high' ? 1 : 0.5} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
          <Vignette offset={0.32} darkness={0.5} />
        </EffectComposer>
      ) : (
        <PlainToneMapping />
      )}
    </Director>
  );
}

/** Without the glow pass the renderer does the colour mapping itself. */
function PlainToneMapping() {
  useFrame(({ gl }) => {
    if (gl.toneMapping !== THREE.NeutralToneMapping) gl.toneMapping = THREE.NeutralToneMapping;
  });
  return null;
}
