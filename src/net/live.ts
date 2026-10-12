import { useCallback, useEffect, useRef, useState } from 'react';
import type { Participant, RemoteTrack, Room, RoomEvent } from 'livekit-client';

/**
 * The live connection: everybody in one show shares a video room. Each phone
 * sends its camera and microphone; the host's phone also sends the show itself
 * — the state and how long the current phase has been running — and every
 * other phone draws exactly that.
 *
 * It runs on the video service POPSTAGE already uses. The pass into a room
 * comes from the website's own /api/token, which is why the live show only
 * works on popstage.vercel.app and not inside a preview link.
 */

export type Role = 'host' | 'contestant';

/** What a player tells the others about themselves. */
export type PlayerProfile = {
  name: string;
  age: number | null;
  persona: string | null;
  vibes: string[];
  bio: string;
};

export type Peer = { id: string; role: Role; profile: PlayerProfile; stream: MediaStream | null };

export type LiveStatus = 'idle' | 'camera' | 'connecting' | 'live' | 'error';

type Wire =
  | { t: 'hello'; role: Role; profile: PlayerProfile }
  | { t: 'state'; state: unknown; elapsed: number }
  | { t: 'bye' }
  | { t: 'full' };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export function newCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return code;
}

export function tidyCode(input: string) {
  return input
    .toUpperCase()
    .split('')
    .filter((one) => ALPHABET.includes(one))
    .slice(0, CODE_LENGTH)
    .join('');
}

function randomId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const encode = (wire: Wire) => new TextEncoder().encode(JSON.stringify(wire));

export function useLiveShow(onState: (state: unknown, elapsed: number, from: string) => void) {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [code, setCode] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [hostLeft, setHostLeft] = useState(false);
  const [micOn, setMicOn] = useState(true);
  /** What this phone could not open: shown as a warning, the show still goes on. */
  const [missing, setMissing] = useState<'camera' | 'all' | null>(null);

  const roomRef = useRef<Room | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const meRef = useRef<{ role: Role; profile: PlayerProfile } | null>(null);
  const onStateRef = useRef(onState);
  onStateRef.current = onState;
  const profiles = useRef(new Map<string, { role: Role; profile: PlayerProfile }>());
  const streamCache = useRef(new Map<string, { key: string; stream: MediaStream }>());

  const send = useCallback((wire: Wire, to?: string) => {
    const room = roomRef.current;
    if (!room || room.remoteParticipants.size === 0) return;
    void room.localParticipant
      .publishData(encode(wire), { reliable: true, destinationIdentities: to ? [to] : undefined })
      .catch(() => {});
  }, []);

  /** Rebuilds who is here and what each of them is sending. */
  const gather = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next: Record<string, Peer> = {};
    room.remoteParticipants.forEach((participant) => {
      const id = participant.identity;
      const known = profiles.current.get(id);
      const tracks: MediaStreamTrack[] = [];
      participant.trackPublications.forEach((publication) => {
        const track = publication.track as RemoteTrack | undefined;
        if (track?.mediaStreamTrack) tracks.push(track.mediaStreamTrack);
      });
      let stream: MediaStream | null = null;
      if (tracks.length > 0) {
        // The same stream for as long as the tracks stay the same: a new one
        // would restart the picture and the sound built on it.
        const key = tracks.map((track) => track.id).sort().join('|');
        const cached = streamCache.current.get(id);
        stream = cached?.key === key ? cached.stream : new MediaStream(tracks);
        streamCache.current.set(id, { key, stream });
      }
      next[id] = {
        id,
        role: known?.role ?? (id.startsWith('h') ? 'host' : 'contestant'),
        profile: known?.profile ?? { name: '', age: null, persona: null, vibes: [], bio: '' },
        stream,
      };
    });
    setPeers(next);
  }, []);

  /**
   * Opens the camera and the microphone. Without a camera the player still
   * gets in with the microphone; without either, as a picture only — the
   * screens then say so, rather than the show refusing them.
   */
  const openCamera = useCallback(async () => {
    if (localRef.current) return localRef.current;
    setStatus('camera');
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const attempts: [MediaStreamConstraints, 'camera' | 'all' | null][] = [
      [{ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 }, frameRate: { ideal: 24 } }, audio }, null],
      [{ audio }, 'camera'],
    ];
    for (const [constraints, lacking] of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localRef.current = stream;
        setLocalStream(stream);
        setMissing(lacking);
        return stream;
      } catch {
        // Try the next, smaller set.
      }
    }
    const empty = new MediaStream();
    localRef.current = empty;
    setMissing('all');
    return empty;
  }, []);

  const join = useCallback(
    async (as: Role, showCode: string, profile: PlayerProfile) => {
      setError(null);
      setHostLeft(false);
      const stream = await openCamera();
      if (!stream) return false;
      const identity = randomId(as === 'host' ? 'h' : 'c');
      meRef.current = { role: as, profile };
      setMyId(identity);
      setRole(as);
      setCode(showCode);
      setStatus('connecting');

      let pass: { token: string; url: string };
      try {
        const answer = await fetch(`/api/token?room=${encodeURIComponent(`popstage-buehne-${showCode}`)}&identity=${encodeURIComponent(identity)}`);
        if (!answer.ok) throw new Error(String(answer.status));
        pass = await answer.json();
      } catch {
        setError('Die Show konnte nicht geöffnet werden. Das geht nur auf popstage.vercel.app/buehne, nicht in der Vorschau.');
        setStatus('error');
        return false;
      }

      const livekit = await import('livekit-client');
      const room = new livekit.Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;
      const events = livekit.RoomEvent as typeof RoomEvent;
      const hello = (to?: string) => send({ t: 'hello', role: as, profile }, to);

      room.on(events.TrackSubscribed, gather);
      room.on(events.TrackUnsubscribed, gather);
      room.on(events.ParticipantConnected, (participant: Participant) => {
        gather();
        hello(participant.identity);
      });
      room.on(events.ParticipantDisconnected, (participant: Participant) => {
        profiles.current.delete(participant.identity);
        streamCache.current.delete(participant.identity);
        if (participant.identity.startsWith('h') && as === 'contestant') setHostLeft(true);
        gather();
      });
      room.on(events.DataReceived, (payload: Uint8Array, participant?: Participant) => {
        const from = participant?.identity;
        if (!from) return;
        let wire: Wire;
        try {
          wire = JSON.parse(new TextDecoder().decode(payload)) as Wire;
        } catch {
          return;
        }
        if (wire.t === 'hello') {
          profiles.current.set(from, { role: wire.role, profile: wire.profile });
          gather();
        } else if (wire.t === 'state') {
          onStateRef.current(wire.state, wire.elapsed, from);
        } else if (wire.t === 'bye') {
          if (from.startsWith('h') && as === 'contestant') setHostLeft(true);
        } else if (wire.t === 'full') {
          setError('Diese Show ist schon voll oder läuft bereits.');
          setStatus('error');
          void room.disconnect();
        }
      });
      room.on(events.Disconnected, () => {
        if (roomRef.current === room) {
          setError('Die Verbindung ist abgebrochen.');
          setStatus('error');
        }
      });

      try {
        await room.connect(pass.url, pass.token);
        for (const track of stream.getTracks()) await room.localParticipant.publishTrack(track);
      } catch {
        roomRef.current = null;
        void room.disconnect();
        setError('Die Verbindung zur Show ist fehlgeschlagen. Versuche es noch einmal.');
        setStatus('error');
        return false;
      }
      hello();
      gather();
      setStatus('live');
      return true;
    },
    [gather, openCamera, send],
  );

  const leave = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      void room.localParticipant
        .publishData(encode({ t: 'bye' }), { reliable: true })
        .catch(() => {})
        .finally(() => void room.disconnect());
    }
    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
    setLocalStream(null);
    setMissing(null);
    setPeers({});
    profiles.current.clear();
    streamCache.current.clear();
    setStatus('idle');
    setRole(null);
  }, []);

  useEffect(() => () => leave(), [leave]);

  const sendState = useCallback((state: unknown, elapsed: number) => send({ t: 'state', state, elapsed }), [send]);
  const turnAway = useCallback((id: string) => send({ t: 'full' }, id), [send]);

  const toggleMic = useCallback(() => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  return { status, error, myId, role, code, localStream, peers, hostLeft, micOn, missing, join, leave, sendState, turnAway, toggleMic, openCamera };
}
