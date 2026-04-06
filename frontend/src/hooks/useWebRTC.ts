import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getSocket } from '../services/socket';
import type { PeerData, DataChannelMessage, MediaStatePayload, ScreenShareStatePayload } from '../types';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

interface UseWebRTCOptions {
  roomId: string;
  displayName: string;
  enabled?: boolean;
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
  toggleAudio: () => void;
  toggleVideo: () => void | Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  sendDataMessage: (targetId: string | 'all', msg: DataChannelMessage) => void;
  leave: () => void;
}

export function useWebRTC({
  roomId,
  displayName,
  enabled = true,
  joinPasscode,
  iceServers = DEFAULT_ICE_SERVERS,
  onDataMessage,
}: UseWebRTCOptions): UseWebRTCReturn {
  const localParticipantId = useRef(uuidv4()).current;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Map<string, PeerData>>(new Map());
  const [isHost, setIsHost] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenSharingPeerIds, setScreenSharingPeerIds] = useState<Set<string>>(new Set());

  // Refs to avoid stale closures in socket callbacks
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerData>>(new Map());
  const screenStreamRef = useRef<MediaStream | null>(null);
  const onDataMessageRef = useRef(onDataMessage);
  const rtcConfigRef = useRef<RTCConfiguration>({ iceServers });
  onDataMessageRef.current = onDataMessage;

  useEffect(() => {
    rtcConfigRef.current = {
      iceServers: iceServers.length > 0 ? iceServers : DEFAULT_ICE_SERVERS,
    };
  }, [iceServers]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const updatePeers = useCallback((updater: (prev: Map<string, PeerData>) => Map<string, PeerData>) => {
    setPeers((prev) => {
      const next = updater(new Map(prev));
      peersRef.current = next;
      return next;
    });
  }, []);

  const handleDataChannelMessage = useCallback(
    (fromId: string, event: MessageEvent<string>) => {
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
            if (payload.isSharing) {
              next.add(fromId);
            } else {
              next.delete(fromId);
            }
            return next;
          });
        }
      } catch {
        // ignore malformed messages
      }
    },
    [updatePeers]
  );

  // ── Peer connection factory ───────────────────────────────────────────────
  const createPeerConnection = useCallback(
    (participantId: string, name: string, isParticipantHost: boolean, isInitiator: boolean): RTCPeerConnection => {
      const pc = new RTCPeerConnection(rtcConfigRef.current);
      const socket = getSocket();

      // Add local tracks
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      // Remote stream assembly
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

      // ICE
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

      // Data channel
      let dataChannel: RTCDataChannel | null = null;
      if (isInitiator) {
        dataChannel = pc.createDataChannel('app', { ordered: true });
        dataChannel.onmessage = (e) => handleDataChannelMessage(participantId, e);
      } else {
        pc.ondatachannel = (event) => {
          const dc = event.channel;
          dc.onmessage = (e) => handleDataChannelMessage(participantId, e);
          updatePeers((prev) => {
            const peer = prev.get(participantId);
            if (!peer) return prev;
            prev.set(participantId, { ...peer, dataChannel: dc });
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
      };

      updatePeers((prev) => {
        prev.set(participantId, peerData);
        return prev;
      });

      return pc;
    },
    [localParticipantId, handleDataChannelMessage, updatePeers]
  );

  // ── Screen share track replacement ────────────────────────────────────────
  const replaceVideoTrack = useCallback((newTrack: MediaStreamTrack | null) => {
    for (const peer of peersRef.current.values()) {
      const sender = peer.connection.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        if (newTrack) {
          sender.replaceTrack(newTrack).catch(console.error);
        } else if (localStreamRef.current) {
          const camTrack = localStreamRef.current.getVideoTracks()[0];
          if (camTrack) sender.replaceTrack(camTrack).catch(console.error);
        }
      }
    }
  }, []);

  // ── Media controls ────────────────────────────────────────────────────────
  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsAudioEnabled(track.enabled);
    broadcastMediaState(track.enabled, localStreamRef.current?.getVideoTracks()[0]?.enabled ?? true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];

    // Re-enabling video: if track is missing or already ended, get a fresh camera track
    if (!track || track.readyState === 'ended') {
      if (!isVideoEnabled) {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const newTrack = newStream.getVideoTracks()[0];
          // Replace in localStream so the local preview updates
          stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
          stream.addTrack(newTrack);
          // Replace in all peer senders
          for (const peer of peersRef.current.values()) {
            const sender = peer.connection.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(newTrack).catch(console.error);
          }
          setIsVideoEnabled(true);
          broadcastMediaState(stream.getAudioTracks()[0]?.enabled ?? true, true);
        } catch {
          console.error('无法重新获取摄像头权限');
        }
      }
      return;
    }

    track.enabled = !track.enabled;
    setIsVideoEnabled(track.enabled);
    broadcastMediaState(stream.getAudioTracks()[0]?.enabled ?? true, track.enabled);
  }, [isVideoEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const broadcastMediaState = (audioEnabled: boolean, videoEnabled: boolean) => {
    const msg: DataChannelMessage = {
      type: 'media-state',
      payload: { isAudioEnabled: audioEnabled, isVideoEnabled: videoEnabled } as MediaStatePayload,
    };
    for (const peer of peersRef.current.values()) {
      sendToDataChannel(peer.dataChannel, msg);
    }
  };

  const sendToDataChannel = (dc: RTCDataChannel | null, msg: DataChannelMessage) => {
    if (dc && dc.readyState === 'open') {
      try {
        dc.send(JSON.stringify(msg));
      } catch {
        // ignore send errors
      }
    }
  };

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
      // Notify peers that we started screen sharing
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
  }, [replaceVideoTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setIsScreenSharing(false);
    replaceVideoTrack(null);
    // Notify peers that we stopped screen sharing
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
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    peersRef.current.clear();
    setPeers(new Map());
    setLocalStream(null);
    setScreenStream(null);
    setIsScreenSharing(false);
    setIsHost(false);
  }, []);

  // ── Socket setup & WebRTC signaling ───────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let mounted = true;
    const socket = getSocket();

    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch {
        // Try audio-only fallback
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
          localStreamRef.current = stream;
          setLocalStream(stream);
        } catch {
          console.error('Media access denied');
        }
      }

      // Join room after media is ready
      socket.emit('join-room', {
        roomId,
        participantId: localParticipantId,
        name: displayName,
        passcode: joinPasscode,
      });
    };

    // ── Socket event handlers ─────────────────────────────────────────────
    socket.on('room-joined', async ({ participants, isHost: host }: {
      participants: Array<{ participantId: string; name: string; isHost: boolean }>;
      isHost: boolean;
    }) => {
      if (!mounted) return;
      setIsHost(host);

      // As the joining participant, send offers to all existing participants
      for (const p of participants) {
        const pc = createPeerConnection(p.participantId, p.name, p.isHost, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { targetId: p.participantId, offer, fromId: localParticipantId });
      }
    });

    socket.on('participant-joined', ({ participantId, name, isHost: pIsHost }: {
      participantId: string; name: string; isHost: boolean;
    }) => {
      if (!mounted) return;
      // Existing participant: prepare to receive offer (don't initiate)
      createPeerConnection(participantId, name, pIsHost, false);
    });

    socket.on('offer', async ({ fromId, offer }: { fromId: string; offer: RTCSessionDescriptionInit }) => {
      if (!mounted) return;
      let peer = peersRef.current.get(fromId);
      let pc: RTCPeerConnection;

      if (!peer) {
        pc = createPeerConnection(fromId, 'Unknown', false, false);
      } else {
        pc = peer.connection;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { targetId: fromId, answer, fromId: localParticipantId });
    });

    socket.on('answer', async ({ fromId, answer }: { fromId: string; answer: RTCSessionDescriptionInit }) => {
      if (!mounted) return;
      const peer = peersRef.current.get(fromId);
      if (peer && peer.connection.signalingState !== 'stable') {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on('ice-candidate', async ({ fromId, candidate }: { fromId: string; candidate: RTCIceCandidateInit }) => {
      if (!mounted) return;
      const peer = peersRef.current.get(fromId);
      if (peer) {
        try {
          await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // ignore
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
      // Clean up screen sharing state for departed peer
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
          prev.set(peerId, {
            ...peer,
            isHost: peerId === participantId,
          });
        }
        return prev;
      });
    });

    initMedia();

    return () => {
      mounted = false;
      socket.off('room-joined');
      socket.off('participant-joined');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('participant-left');
      socket.off('host-changed');
      leave();
    };
  }, [enabled, roomId, localParticipantId, displayName, joinPasscode, createPeerConnection, updatePeers, leave]);

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
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    sendDataMessage,
    leave,
  };
}
