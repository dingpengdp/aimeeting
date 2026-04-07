import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getSocket } from '../services/socket';
import { getStoredDevicePreferences, persistDevicePreferences } from '../services/devicePreferences';
import type { PeerData, DataChannelMessage, MediaStatePayload, ScreenShareStatePayload } from '../types';

type MediaAccessState = 'full' | 'audio-only' | 'video-only' | 'none';
type TrackKind = 'audio' | 'video';

interface UseWebRTCOptions {
  roomId: string;
  displayName: string;
  mediaEnabled?: boolean;
  connectionEnabled?: boolean;
  joinPasscode?: string;
  iceServers?: RTCIceServer[];
  onDataMessage?: (fromId: string, msg: DataChannelMessage) => void;
}

interface UseWebRTCReturn {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  peers: Map<string, PeerData>;
  localParticipantId: string;
  isHost: boolean;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  screenSharingPeerIds: Set<string>;
  localAgentEnabled: boolean;
  mediaAccess: MediaAccessState;
  mediaAccessErrorName: string | null;
  isMediaInitializing: boolean;
  hasInitializedMedia: boolean;
  audioInputDevices: MediaDeviceInfo[];
  videoInputDevices: MediaDeviceInfo[];
  selectedAudioInputId: string | null;
  selectedVideoInputId: string | null;
  toggleAudio: () => void | Promise<void>;
  toggleVideo: () => void | Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  selectAudioInput: (deviceId: string) => Promise<void>;
  selectVideoInput: (deviceId: string) => Promise<void>;
  refreshDeviceOptions: () => Promise<void>;
  retryMediaAccess: () => Promise<void>;
  sendDataMessage: (targetId: string | 'all', msg: DataChannelMessage) => void;
  leave: () => void;
}

function deriveMediaAccess(audioTrack: MediaStreamTrack | null, videoTrack: MediaStreamTrack | null): MediaAccessState {
  if (audioTrack && videoTrack) return 'full';
  if (audioTrack) return 'audio-only';
  if (videoTrack) return 'video-only';
  return 'none';
}

function getErrorName(error: unknown): string | null {
  return error instanceof Error && error.name ? error.name : null;
}

function resolvePreferredDeviceId(devices: MediaDeviceInfo[], preferredId: string | null): string | null {
  if (preferredId && devices.some((device) => device.deviceId === preferredId)) {
    return preferredId;
  }

  return devices[0]?.deviceId ?? null;
}

function buildTrackConstraint(deviceId: string | null): MediaTrackConstraints | boolean {
  return deviceId ? { deviceId: { exact: deviceId } } : true;
}

export function useWebRTC({
  roomId,
  displayName,
  mediaEnabled = true,
  connectionEnabled = false,
  joinPasscode,
  iceServers = [] as RTCIceServer[],
  onDataMessage,
}: UseWebRTCOptions): UseWebRTCReturn {
  const localParticipantId = useRef(uuidv4()).current;
  const storedPreferences = useRef(getStoredDevicePreferences()).current;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Map<string, PeerData>>(new Map());
  const [isHost, setIsHost] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSharingPeerIds, setScreenSharingPeerIds] = useState<Set<string>>(new Set());
  const [localAgentEnabled, setLocalAgentEnabled] = useState(false);
  const [mediaAccess, setMediaAccess] = useState<MediaAccessState>('none');
  const [mediaAccessErrorName, setMediaAccessErrorName] = useState<string | null>(null);
  const [isMediaInitializing, setIsMediaInitializing] = useState(false);
  const [hasInitializedMedia, setHasInitializedMedia] = useState(false);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInputId, setSelectedAudioInputId] = useState<string | null>(storedPreferences.audioInputId);
  const [selectedVideoInputId, setSelectedVideoInputId] = useState<string | null>(storedPreferences.videoInputId);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const screenStreamRef = useRef<MediaStream | null>(null);
  const onDataMessageRef = useRef(onDataMessage);
  const rtcConfigRef = useRef<RTCConfiguration>({ iceServers });
  const selectedAudioInputIdRef = useRef<string | null>(storedPreferences.audioInputId);
  const selectedVideoInputIdRef = useRef<string | null>(storedPreferences.videoInputId);
  const pendingIceCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  onDataMessageRef.current = onDataMessage;

  useEffect(() => {
    if (peersRef.current.size === 0) {
      rtcConfigRef.current = { iceServers };
    }
  }, [iceServers]);

  const syncDevicePreferences = useCallback((audioInputId: string | null, videoInputId: string | null) => {
    selectedAudioInputIdRef.current = audioInputId;
    selectedVideoInputIdRef.current = videoInputId;
    setSelectedAudioInputId(audioInputId);
    setSelectedVideoInputId(videoInputId);
    persistDevicePreferences({ audioInputId, videoInputId });
  }, []);

  const updatePeers = useCallback((updater: (prev: Map<string, PeerData>) => Map<string, PeerData>) => {
    setPeers((prev) => {
      const next = updater(new Map(prev));
      peersRef.current = next;
      return next;
    });
  }, []);

  const getTransceiverForKind = useCallback((connection: RTCPeerConnection, kind: TrackKind) => (
    connection.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === kind || transceiver.sender.track?.kind === kind)
  ), []);

  const replacePeerTrack = useCallback((kind: TrackKind, track: MediaStreamTrack | null) => {
    for (const peer of peersRef.current.values()) {
      const transceiver = getTransceiverForKind(peer.connection, kind);
      transceiver?.sender.replaceTrack(track).catch(console.error);
    }
  }, [getTransceiverForKind]);

  const sendToDataChannel = (dataChannel: RTCDataChannel | null, msg: DataChannelMessage) => {
    if (dataChannel && dataChannel.readyState === 'open') {
      try {
        dataChannel.send(JSON.stringify(msg));
      } catch {
        // ignore send errors
      }
    }
  };

  const broadcastMediaState = useCallback((audioEnabled: boolean, videoEnabled: boolean) => {
    const msg: DataChannelMessage = {
      type: 'media-state',
      payload: { isAudioEnabled: audioEnabled, isVideoEnabled: videoEnabled } as MediaStatePayload,
    };

    for (const peer of peersRef.current.values()) {
      sendToDataChannel(peer.dataChannel, msg);
    }
  }, []);

  const applyLocalTracks = useCallback((options: { audioTrack?: MediaStreamTrack | null; videoTrack?: MediaStreamTrack | null; }) => {
    const previousAudioTrack = localStreamRef.current?.getAudioTracks()[0] ?? null;
    const previousVideoTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;

    const nextAudioTrack = options.audioTrack === undefined ? previousAudioTrack : options.audioTrack;
    const nextVideoTrack = options.videoTrack === undefined ? previousVideoTrack : options.videoTrack;

    if (options.audioTrack !== undefined && nextAudioTrack && nextAudioTrack !== previousAudioTrack) {
      nextAudioTrack.enabled = previousAudioTrack?.enabled ?? true;
    }
    if (options.videoTrack !== undefined && nextVideoTrack && nextVideoTrack !== previousVideoTrack) {
      nextVideoTrack.enabled = previousVideoTrack?.enabled ?? true;
    }

    const nextStream = new MediaStream();
    if (nextAudioTrack) nextStream.addTrack(nextAudioTrack);
    if (nextVideoTrack) nextStream.addTrack(nextVideoTrack);

    localStreamRef.current = nextStream;
    setLocalStream(nextStream);
    setIsAudioEnabled(nextAudioTrack?.enabled ?? false);
    setIsVideoEnabled(nextVideoTrack?.enabled ?? false);
    setMediaAccess(deriveMediaAccess(nextAudioTrack, nextVideoTrack));

    if (options.audioTrack !== undefined) {
      replacePeerTrack('audio', nextAudioTrack);
    }
    if (options.videoTrack !== undefined && !screenStreamRef.current) {
      replacePeerTrack('video', nextVideoTrack);
    }

    if (previousAudioTrack && previousAudioTrack !== nextAudioTrack) {
      previousAudioTrack.stop();
    }
    if (previousVideoTrack && previousVideoTrack !== nextVideoTrack) {
      previousVideoTrack.stop();
    }

    broadcastMediaState(nextAudioTrack?.enabled ?? false, nextVideoTrack?.enabled ?? false);
  }, [broadcastMediaState, replacePeerTrack]);

  const refreshDeviceOptions = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      setAudioInputDevices([]);
      setVideoInputDevices([]);
      syncDevicePreferences(null, null);
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextAudioInputDevices = devices.filter((device) => device.kind === 'audioinput');
    const nextVideoInputDevices = devices.filter((device) => device.kind === 'videoinput');

    setAudioInputDevices(nextAudioInputDevices);
    setVideoInputDevices(nextVideoInputDevices);

    const currentAudioTrackId = localStreamRef.current?.getAudioTracks()[0]?.getSettings().deviceId ?? null;
    const currentVideoTrackId = localStreamRef.current?.getVideoTracks()[0]?.getSettings().deviceId ?? null;

    const resolvedAudioInputId = resolvePreferredDeviceId(nextAudioInputDevices, currentAudioTrackId ?? selectedAudioInputIdRef.current);
    const resolvedVideoInputId = resolvePreferredDeviceId(nextVideoInputDevices, currentVideoTrackId ?? selectedVideoInputIdRef.current);

    syncDevicePreferences(resolvedAudioInputId, resolvedVideoInputId);

    return {
      audioInputDevices: nextAudioInputDevices,
      videoInputDevices: nextVideoInputDevices,
      resolvedAudioInputId,
      resolvedVideoInputId,
    };
  }, [syncDevicePreferences]);

  const handleDataChannelMessage = useCallback((fromId: string, event: MessageEvent<string>) => {
    try {
      const msg = JSON.parse(event.data) as DataChannelMessage;
      onDataMessageRef.current?.(fromId, msg);

      if (msg.type === 'media-state') {
        const payload = msg.payload as MediaStatePayload;
        updatePeers((prev) => {
          const peer = prev.get(fromId);
          if (!peer) return prev;
          prev.set(fromId, {
            ...peer,
            isAudioEnabled: payload.isAudioEnabled,
            isVideoEnabled: payload.isVideoEnabled,
          });
          return prev;
        });
      }

      if (msg.type === 'screen-share-state') {
        const payload = msg.payload as ScreenShareStatePayload;
        setScreenSharingPeerIds((prev) => {
          const next = new Set(prev);
          if (payload.isSharing) next.add(fromId);
          else next.delete(fromId);
          return next;
        });
      }
    } catch {
      // ignore malformed messages
    }
  }, [updatePeers]);

  const createPeerConnection = useCallback((participantId: string, name: string, isParticipantHost: boolean, isInitiator: boolean): RTCPeerConnection => {
    const pc = new RTCPeerConnection(rtcConfigRef.current);
    const socket = getSocket();

    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
    const localAudioTrack = localStreamRef.current?.getAudioTracks()[0] ?? null;
    const localVideoTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;

    if (localAudioTrack) {
      audioTransceiver.sender.replaceTrack(localAudioTrack).catch(console.error);
    }
    if (localVideoTrack) {
      videoTransceiver.sender.replaceTrack(localVideoTrack).catch(console.error);
    }

    const remoteStream = new MediaStream();
    pc.ontrack = (event) => {
      const tracks = event.streams[0]?.getTracks() ?? [event.track];
      for (const track of tracks) {
        remoteStream.addTrack(track);
      }
      updatePeers((prev) => {
        const peer = prev.get(participantId);
        if (!peer) return prev;
        prev.set(participantId, { ...peer, stream: remoteStream });
        return prev;
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          targetId: participantId,
          candidate: event.candidate.toJSON(),
          fromId: localParticipantId,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        updatePeers((prev) => {
          prev.delete(participantId);
          return prev;
        });
      }
    };

    let dataChannel: RTCDataChannel | null = null;
    if (isInitiator) {
      dataChannel = pc.createDataChannel('app', { ordered: true });
      dataChannel.onmessage = (event) => handleDataChannelMessage(participantId, event);
    } else {
      pc.ondatachannel = (event) => {
        const nextDataChannel = event.channel;
        nextDataChannel.onmessage = (messageEvent) => handleDataChannelMessage(participantId, messageEvent);
        updatePeers((prev) => {
          const peer = prev.get(participantId);
          if (!peer) return prev;
          prev.set(participantId, { ...peer, dataChannel: nextDataChannel });
          return prev;
        });
      };
    }

    const peerData: PeerData = {
      participantId,
      name,
      isHost: isParticipantHost,
      connection: pc,
      dataChannel,
      stream: null,
      isAudioEnabled: true,
      isVideoEnabled: true,
      agentEnabled: false,
    };

    updatePeers((prev) => {
      prev.set(participantId, peerData);
      return prev;
    });

    return pc;
  }, [handleDataChannelMessage, localParticipantId, updatePeers]);

  const replaceVideoTrack = useCallback((newTrack: MediaStreamTrack | null) => {
    const fallbackTrack = newTrack ?? localStreamRef.current?.getVideoTracks()[0] ?? null;
    replacePeerTrack('video', fallbackTrack);
  }, [replacePeerTrack]);

  const getInputTrack = useCallback(async (kind: TrackKind, deviceId: string | null): Promise<MediaStreamTrack> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Media devices are not supported in this environment.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: kind === 'audio' ? buildTrackConstraint(deviceId) : false,
      video: kind === 'video' ? buildTrackConstraint(deviceId) : false,
    });

    const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((nextTrack) => nextTrack.stop());
      throw new Error(`Failed to acquire ${kind} input track.`);
    }

    return track;
  }, []);

  const initializeLocalMedia = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMediaAccess('none');
      setMediaAccessErrorName('UnsupportedError');
      setHasInitializedMedia(true);
      setIsMediaInitializing(false);
      return;
    }

    setIsMediaInitializing(true);
    setHasInitializedMedia(false);

    let nextAudioTrack: MediaStreamTrack | null = null;
    let nextVideoTrack: MediaStreamTrack | null = null;
    let errorName: string | null = null;

    try {
      const snapshot = await refreshDeviceOptions();
      const audioInputId = snapshot?.resolvedAudioInputId ?? selectedAudioInputIdRef.current;
      const videoInputId = snapshot?.resolvedVideoInputId ?? selectedVideoInputIdRef.current;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: buildTrackConstraint(audioInputId),
          video: buildTrackConstraint(videoInputId),
        });
        nextAudioTrack = stream.getAudioTracks()[0] ?? null;
        nextVideoTrack = stream.getVideoTracks()[0] ?? null;
      } catch (combinedError) {
        errorName = getErrorName(combinedError);

        try {
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
            audio: buildTrackConstraint(audioInputId),
            video: false,
          });
          nextAudioTrack = audioOnlyStream.getAudioTracks()[0] ?? null;
        } catch (audioOnlyError) {
          try {
            const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
              audio: false,
              video: buildTrackConstraint(videoInputId),
            });
            nextVideoTrack = videoOnlyStream.getVideoTracks()[0] ?? null;
            errorName = getErrorName(audioOnlyError) ?? errorName;
          } catch (videoOnlyError) {
            errorName = getErrorName(videoOnlyError) ?? getErrorName(audioOnlyError) ?? errorName;
          }
        }
      }

      applyLocalTracks({ audioTrack: nextAudioTrack, videoTrack: nextVideoTrack });
      setMediaAccessErrorName(deriveMediaAccess(nextAudioTrack, nextVideoTrack) === 'full' ? null : errorName);
      await refreshDeviceOptions();
    } finally {
      setHasInitializedMedia(true);
      setIsMediaInitializing(false);
    }
  }, [applyLocalTracks, refreshDeviceOptions]);

  const selectAudioInput = useCallback(async (deviceId: string) => {
    const nextTrack = await getInputTrack('audio', deviceId);
    applyLocalTracks({ audioTrack: nextTrack });
    setMediaAccessErrorName(null);
    await refreshDeviceOptions();
  }, [applyLocalTracks, getInputTrack, refreshDeviceOptions]);

  const selectVideoInput = useCallback(async (deviceId: string) => {
    const nextTrack = await getInputTrack('video', deviceId);
    applyLocalTracks({ videoTrack: nextTrack });
    setMediaAccessErrorName(null);
    await refreshDeviceOptions();
  }, [applyLocalTracks, getInputTrack, refreshDeviceOptions]);

  const retryMediaAccess = useCallback(async () => {
    await initializeLocalMedia();
  }, [initializeLocalMedia]);

  const refreshAvailableDevices = useCallback(async () => {
    await refreshDeviceOptions();
  }, [refreshDeviceOptions]);

  const toggleAudio = useCallback(async () => {
    const track = localStreamRef.current?.getAudioTracks()[0] ?? null;

    if (!track || track.readyState === 'ended') {
      try {
        const nextTrack = await getInputTrack('audio', selectedAudioInputIdRef.current);
        nextTrack.enabled = true;
        applyLocalTracks({ audioTrack: nextTrack });
        setMediaAccessErrorName(null);
        await refreshDeviceOptions();
      } catch {
        console.error('Unable to reacquire microphone input');
      }
      return;
    }

    track.enabled = !track.enabled;
    setIsAudioEnabled(track.enabled);
    broadcastMediaState(track.enabled, localStreamRef.current?.getVideoTracks()[0]?.enabled ?? false);
  }, [applyLocalTracks, broadcastMediaState, getInputTrack, refreshDeviceOptions]);

  const toggleVideo = useCallback(async () => {
    const track = localStreamRef.current?.getVideoTracks()[0] ?? null;

    if (!track || track.readyState === 'ended') {
      try {
        const nextTrack = await getInputTrack('video', selectedVideoInputIdRef.current);
        nextTrack.enabled = true;
        applyLocalTracks({ videoTrack: nextTrack });
        setMediaAccessErrorName(null);
        await refreshDeviceOptions();
      } catch {
        console.error('Unable to reacquire camera input');
      }
      return;
    }

    track.enabled = !track.enabled;
    setIsVideoEnabled(track.enabled);
    broadcastMediaState(localStreamRef.current?.getAudioTracks()[0]?.enabled ?? false, track.enabled);
  }, [applyLocalTracks, broadcastMediaState, getInputTrack, refreshDeviceOptions]);

  const sendDataMessage = useCallback((targetId: string | 'all', msg: DataChannelMessage) => {
    if (targetId === 'all') {
      for (const peer of peersRef.current.values()) {
        sendToDataChannel(peer.dataChannel, msg);
      }
    } else {
      const peer = peersRef.current.get(targetId);
      if (peer) sendToDataChannel(peer.dataChannel, msg);
    }
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);
      const videoTrack = stream.getVideoTracks()[0];
      replaceVideoTrack(videoTrack);
      videoTrack.onended = () => stopScreenShare();
      const msg: DataChannelMessage = {
        type: 'screen-share-state',
        payload: { isSharing: true } as ScreenShareStatePayload,
      };
      for (const peer of peersRef.current.values()) {
        sendToDataChannel(peer.dataChannel, msg);
      }
    } catch {
      // user cancelled or denied
    }
  }, [replaceVideoTrack]);

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setIsScreenSharing(false);
    replaceVideoTrack(null);
    const msg: DataChannelMessage = {
      type: 'screen-share-state',
      payload: { isSharing: false } as ScreenShareStatePayload,
    };
    for (const peer of peersRef.current.values()) {
      sendToDataChannel(peer.dataChannel, msg);
    }
  }, [replaceVideoTrack]);

  const leave = useCallback(() => {
    for (const peer of peersRef.current.values()) {
      peer.dataChannel?.close();
      peer.connection.close();
    }
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    peersRef.current.clear();
    pendingIceCandidates.current.clear();
    localStreamRef.current = null;
    screenStreamRef.current = null;
    setPeers(new Map());
    setLocalStream(null);
    setScreenStream(null);
    setIsScreenSharing(false);
    setIsHost(false);
    setLocalAgentEnabled(false);
    setMediaAccess('none');
    setMediaAccessErrorName(null);
    setHasInitializedMedia(false);
    setIsMediaInitializing(false);
  }, []);

  useEffect(() => {
    if (!mediaEnabled) {
      return;
    }

    void initializeLocalMedia();

    const handleDeviceChange = () => {
      const previousAudioInputId = selectedAudioInputIdRef.current;
      const previousVideoInputId = selectedVideoInputIdRef.current;

      void (async () => {
        const snapshot = await refreshDeviceOptions();
        if (!snapshot) {
          return;
        }

        const hasPreviousAudioInput = previousAudioInputId && snapshot.audioInputDevices.some((device) => device.deviceId === previousAudioInputId);
        const hasPreviousVideoInput = previousVideoInputId && snapshot.videoInputDevices.some((device) => device.deviceId === previousVideoInputId);

        if (previousAudioInputId && !hasPreviousAudioInput) {
          if (snapshot.resolvedAudioInputId) {
            try {
              await selectAudioInput(snapshot.resolvedAudioInputId);
            } catch {
              applyLocalTracks({ audioTrack: null });
              await refreshDeviceOptions();
            }
          } else {
            applyLocalTracks({ audioTrack: null });
            await refreshDeviceOptions();
          }
        }

        if (previousVideoInputId && !hasPreviousVideoInput) {
          if (snapshot.resolvedVideoInputId) {
            try {
              await selectVideoInput(snapshot.resolvedVideoInputId);
            } catch {
              applyLocalTracks({ videoTrack: null });
              await refreshDeviceOptions();
            }
          } else {
            applyLocalTracks({ videoTrack: null });
            await refreshDeviceOptions();
          }
        }
      })();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      leave();
    };
  }, [applyLocalTracks, initializeLocalMedia, leave, mediaEnabled, refreshDeviceOptions, selectAudioInput, selectVideoInput]);

  useEffect(() => {
    if (!connectionEnabled || !hasInitializedMedia) {
      return;
    }

    let mounted = true;
    const socket = getSocket();

    socket.on('room-joined', async ({ participants, isHost: host }: {
      participants: Array<{ participantId: string; name: string; isHost: boolean; agentEnabled?: boolean }>;
      isHost: boolean;
    }) => {
      if (!mounted) return;
      setIsHost(host);

      for (const participant of participants) {
        const pc = createPeerConnection(participant.participantId, participant.name, participant.isHost, true);
        if (participant.agentEnabled) {
          updatePeers((prev) => {
            const peer = prev.get(participant.participantId);
            if (peer) prev.set(participant.participantId, { ...peer, agentEnabled: true });
            return prev;
          });
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { targetId: participant.participantId, offer, fromId: localParticipantId });
      }
    });

    socket.on('participant-joined', ({ participantId, name, isHost: nextIsHost, agentEnabled }: {
      participantId: string; name: string; isHost: boolean; agentEnabled?: boolean;
    }) => {
      if (!mounted) return;
      createPeerConnection(participantId, name, nextIsHost, false);
      if (agentEnabled) {
        updatePeers((prev) => {
          const peer = prev.get(participantId);
          if (peer) prev.set(participantId, { ...peer, agentEnabled: true });
          return prev;
        });
      }
    });

    const flushPendingCandidates = async (fromId: string, connection: RTCPeerConnection) => {
      const queued = pendingIceCandidates.current.get(fromId) ?? [];
      pendingIceCandidates.current.delete(fromId);
      for (const candidate of queued) {
        try {
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // ignore invalid queued ICE candidates
        }
      }
    };

    socket.on('offer', async ({ fromId, offer }: { fromId: string; offer: RTCSessionDescriptionInit }) => {
      if (!mounted) return;
      const peer = peersRef.current.get(fromId);
      const connection = peer?.connection ?? createPeerConnection(fromId, 'Unknown', false, false);

      await connection.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates(fromId, connection);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      socket.emit('answer', { targetId: fromId, answer, fromId: localParticipantId });
    });

    socket.on('answer', async ({ fromId, answer }: { fromId: string; answer: RTCSessionDescriptionInit }) => {
      if (!mounted) return;
      const peer = peersRef.current.get(fromId);
      if (peer && peer.connection.signalingState !== 'stable') {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingCandidates(fromId, peer.connection);
      }
    });

    socket.on('ice-candidate', async ({ fromId, candidate }: { fromId: string; candidate: RTCIceCandidateInit }) => {
      if (!mounted) return;
      const peer = peersRef.current.get(fromId);
      if (!peer) return;
      if (!peer.connection.remoteDescription) {
        const queue = pendingIceCandidates.current.get(fromId) ?? [];
        queue.push(candidate);
        pendingIceCandidates.current.set(fromId, queue);
      } else {
        try {
          await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // ignore invalid ICE candidates
        }
      }
    });

    socket.on('participant-left', ({ participantId }: { participantId: string }) => {
      if (!mounted) return;
      const peer = peersRef.current.get(participantId);
      if (peer) {
        peer.dataChannel?.close();
        peer.connection.close();
      }
      updatePeers((prev) => {
        prev.delete(participantId);
        return prev;
      });
      setScreenSharingPeerIds((prev) => {
        const next = new Set(prev);
        next.delete(participantId);
        return next;
      });
    });

    socket.on('host-changed', ({ participantId }: { participantId: string }) => {
      if (!mounted) return;
      setIsHost(participantId === localParticipantId);
      updatePeers((prev) => {
        for (const [peerId, peer] of prev.entries()) {
          prev.set(peerId, { ...peer, isHost: peerId === participantId });
        }
        return prev;
      });
    });

    socket.on('participant-agent-state', ({ participantId, agentEnabled }: { participantId: string; agentEnabled: boolean }) => {
      if (!mounted) return;
      if (participantId === localParticipantId) {
        setLocalAgentEnabled(agentEnabled);
      } else {
        updatePeers((prev) => {
          const peer = prev.get(participantId);
          if (peer) prev.set(participantId, { ...peer, agentEnabled });
          return prev;
        });
      }
    });

    socket.emit('join-room', {
      roomId,
      participantId: localParticipantId,
      name: displayName,
      passcode: joinPasscode,
    });

    return () => {
      mounted = false;
      socket.off('room-joined');
      socket.off('participant-joined');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('participant-left');
      socket.off('host-changed');
      socket.off('participant-agent-state');
      leave();
    };
  }, [connectionEnabled, createPeerConnection, displayName, hasInitializedMedia, joinPasscode, leave, localParticipantId, roomId, updatePeers]);

  return {
    localStream,
    screenStream,
    peers,
    localParticipantId,
    isHost,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    screenSharingPeerIds,
    localAgentEnabled,
    mediaAccess,
    mediaAccessErrorName,
    isMediaInitializing,
    hasInitializedMedia,
    audioInputDevices,
    videoInputDevices,
    selectedAudioInputId,
    selectedVideoInputId,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    selectAudioInput,
    selectVideoInput,
    refreshDeviceOptions: refreshAvailableDevices,
    retryMediaAccess,
    sendDataMessage,
    leave,
  };
}
