import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * Cameras into textures, and the others' voices into the speaker.
 *
 * Every picture on the stage comes from a hidden, muted video element: a
 * browser only starts a video by itself when it makes no sound. The sound
 * therefore gets elements of its own, holding the sound alone — given a stream
 * with a picture in it, phone browsers treat it as a video and refuse.
 */

type Entry = { stream: MediaStream; video: HTMLVideoElement; texture: THREE.VideoTexture };

export function useVideoTextures(streams: Record<string, MediaStream | null>) {
  const made = useRef(new Map<string, Entry>());
  const [textures, setTextures] = useState<Record<string, THREE.VideoTexture>>({});

  useEffect(() => {
    let changed = false;
    made.current.forEach((entry, id) => {
      if (streams[id] !== entry.stream) {
        entry.texture.dispose();
        entry.video.srcObject = null;
        entry.video.remove();
        made.current.delete(id);
        changed = true;
      }
    });
    Object.entries(streams).forEach(([id, stream]) => {
      if (!stream || made.current.has(id) || stream.getVideoTracks().length === 0) return;
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute('playsinline', 'true');
      video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0';
      video.srcObject = new MediaStream(stream.getVideoTracks());
      document.body.appendChild(video);
      void video.play().catch(() => {});
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      made.current.set(id, { stream, video, texture });
      changed = true;
    });
    if (changed) {
      const next: Record<string, THREE.VideoTexture> = {};
      made.current.forEach((entry, id) => (next[id] = entry.texture));
      setTextures(next);
    }
  });

  useEffect(
    () => () => {
      made.current.forEach((entry) => {
        entry.texture.dispose();
        entry.video.srcObject = null;
        entry.video.remove();
      });
      made.current.clear();
    },
    [],
  );

  return textures;
}

/**
 * The others' voices. Returns whether the browser is still holding the sound
 * back; any tap on the page tries again.
 */
export function useRemoteAudio(streams: MediaStream[]) {
  const elements = useRef(new Map<string, HTMLAudioElement>());
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const wanted = new Map<string, MediaStreamTrack[]>();
    streams.forEach((stream) => {
      const tracks = stream.getAudioTracks();
      if (tracks.length) wanted.set(tracks.map((t) => t.id).sort().join('|'), tracks);
    });
    elements.current.forEach((audio, key) => {
      if (!wanted.has(key)) {
        audio.srcObject = null;
        audio.remove();
        elements.current.delete(key);
      }
    });
    wanted.forEach((tracks, key) => {
      if (elements.current.has(key)) return;
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', 'true');
      audio.srcObject = new MediaStream(tracks);
      audio.style.display = 'none';
      document.body.appendChild(audio);
      elements.current.set(key, audio);
      audio.play().then(
        () => setBlocked(false),
        () => setBlocked(true),
      );
    });
  });

  useEffect(() => {
    if (!blocked) return undefined;
    const retry = () => {
      const plays = [...elements.current.values()].map((audio) => audio.play());
      Promise.all(plays).then(
        () => setBlocked(false),
        () => setBlocked(true),
      );
    };
    window.addEventListener('pointerdown', retry, true);
    return () => window.removeEventListener('pointerdown', retry, true);
  }, [blocked]);

  useEffect(
    () => () => {
      elements.current.forEach((audio) => {
        audio.srcObject = null;
        audio.remove();
      });
      elements.current.clear();
    },
    [],
  );

  return blocked;
}

/** The player's own POPSTAGE profile, when this browser has one from the app. */
export function readAppProfile(): { name: string; age: number | null; bio: string; vibes: string[]; persona: string | null } | null {
  try {
    const raw = localStorage.getItem('popstage.me.v2');
    if (!raw) return null;
    const saved = JSON.parse(raw) as { profile?: { name?: string; age?: number | null; bio?: string; vibes?: string[]; persona?: string | null } };
    const p = saved.profile;
    if (!p || !p.name) return null;
    const personas: Record<string, string> = { secretfan: 'Secret Fan', romantic: 'Romantic', wildcard: 'Wildcard', showstopper: 'Showstopper' };
    return {
      name: p.name.trim().slice(0, 24),
      age: typeof p.age === 'number' ? p.age : null,
      bio: (p.bio ?? '').slice(0, 150),
      vibes: (p.vibes ?? []).slice(0, 3),
      persona: p.persona ? (personas[p.persona] ?? null) : null,
    };
  } catch {
    return null;
  }
}
