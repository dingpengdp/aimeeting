import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getSocket, disconnectSocket } from '../services/socket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useRecording } from '../hooks/useRecording';
import { useRemoteControl } from '../hooks/useRemoteControl';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import type { ChatMessage, ClientConfig, DataChannelMessage, RoomSummary, RoomInviteResponse } from '../types';
import VideoGrid from '../components/VideoGrid';
import Controls from '../components/Controls';
import ChatPanel from '../components/ChatPanel';
import RecordingPanel from '../components/RecordingPanel';
import AiMinutesPanel from '../components/AiMinutesPanel';
import RemoteControlPanel from '../components/RemoteControlPanel';
import SecurityPanel from '../components/SecurityPanel';
import InvitePanel from '../components/InvitePanel';
import AiSettingsPanel from '../components/AiSettingsPanel';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { v4 as uuidv4 } from 'uuid';

type SidePanel = 'chat' | 'recording' | 'minutes' | 'remote' | 'invite' | 'security' | 'ai-settings' | null;

interface MeetingLocationState {
  displayName?: string;
  passcode?: string;
  roomTitle?: string;
  inviteLink?: string;
}

export default function Meeting() {
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const meetingState = ((location.state as MeetingLocationState | null) ?? {});
  const displayName = meetingState.displayName || user?.name || 'Guest';
  const joinPasscode = meetingState.passcode || '';

  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChat, setUnreadChat] = useState(0);
  const [roomInfo, setRoomInfo] = useState<RoomSummary | null>(null);
  const [roomLocked, setRoomLocked] = useState(false);
  const [inviteLink, setInviteLink] = useState(meetingState.inviteLink ?? '');
  const [rtcConfig, setRtcConfig] = useState<ClientConfig | null>(null);
  const [pageError, setPageError] = useState('');
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!user) {
      navigate('/', { replace: true });
      return;
    }

    if (!roomId) {
      setPageError(t('meeting.errors.roomNotExist'));
      setPageLoading(false);
      return;
    }

    let cancelled = false;
    setPageLoading(true);
    setPageError('');

    Promise.all([
      apiFetch<ClientConfig>('/api/config/client', { method: 'GET' }),
      apiFetch<{ room: RoomSummary }>(`/api/rooms/${encodeURIComponent(roomId)}/access`, {
        method: 'POST',
        body: JSON.stringify({ passcode: joinPasscode || undefined }),
      }),
    ])
      .then(([config, access]) => {
        if (cancelled) {
          return;
        }

        setRtcConfig(config);
        setRoomInfo(access.room);
        setRoomLocked(access.room.isLocked);
        if (!inviteLink) {
          const { origin, pathname } = window.location;
          setInviteLink(`${origin}${pathname}`);
        }
        setPageLoading(false);
      })
      .catch((accessError) => {
        if (cancelled) {
          return;
        }

        setPageError(accessError instanceof Error ? accessError.message : t('meetingPage.errors.accessFailed'));
        setPageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, user, roomId, joinPasscode, navigate]);

  // ── WebRTC ─────────────────────────────────────────────────────────────────
  const {
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
  } = useWebRTC({
    roomId: roomId ?? '',
    displayName,
    enabled: !pageLoading && !pageError && Boolean(rtcConfig),
    joinPasscode,
    iceServers: rtcConfig?.iceServers ?? [],
    onDataMessage: handleDataMessage,
  });

  // ── Remote Control ─────────────────────────────────────────────────────────
  const rc = useRemoteControl({ localParticipantId, localName: displayName, sendDataMessage });

  function handleDataMessage(fromId: string, msg: DataChannelMessage) {
    rc.handleDataMessage(fromId, msg);
  }

  // ── Recording ──────────────────────────────────────────────────────────────
  const remoteStreams = Array.from(peers.values())
    .map((p) => p.stream)
    .filter((s): s is MediaStream => s !== null);

  // Determine which remote stream should dominate the recording canvas:
  // 1. When controlling a remote peer's screen via remote control
  // 2. When a remote peer is sharing their screen
  const remotePresenterStream = (() => {
    if (rc.rcState.isControlling && rc.rcState.controllerId) {
      return peers.get(rc.rcState.controllerId)?.stream ?? null;
    }
    for (const peerId of screenSharingPeerIds) {
      const stream = peers.get(peerId)?.stream;
      if (stream) return stream;
    }
    return null;
  })();

  const recording = useRecording({ localStream, screenStream, remoteStreams, remotePresenterStream });

  // ── Chat via socket ────────────────────────────────────────────────────────
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    if (pageLoading || pageError) {
      return;
    }

    const socket = getSocket();
    socketRef.current = socket;

    socket.on('chat-message', (msg: { fromId: string; fromName: string; message: string; timestamp: number }) => {
      const chatMsg: ChatMessage = { id: uuidv4(), ...msg };
      setChatMessages((prev) => [...prev, chatMsg]);
      if (sidePanel !== 'chat') setUnreadChat((n) => n + 1);
    });

    socket.on('remote-control-request', rc.handleRemoteControlRequest);
    socket.on('remote-control-response', rc.handleRemoteControlResponse);
    socket.on('remote-control-end', rc.handleRemoteControlEnd);
    socket.on('room-locked-state', ({ isLocked }: { isLocked: boolean }) => {
      setRoomLocked(isLocked);
    });
    socket.on('participant-kicked', () => {
      window.alert(t('meetingPage.kickedMessage'));
      leave();
      disconnectSocket();
      navigate('/', { replace: true });
    });
    socket.on('room-error', ({ message }: { message: string }) => {
      setPageError(message);
      leave();
      disconnectSocket();
    });

    return () => {
      socket.off('chat-message');
      socket.off('remote-control-request');
      socket.off('remote-control-response');
      socket.off('remote-control-end');
      socket.off('room-locked-state');
      socket.off('participant-kicked');
      socket.off('room-error');
    };
  }, [pageLoading, pageError, sidePanel, rc.handleRemoteControlRequest, rc.handleRemoteControlResponse, rc.handleRemoteControlEnd, leave, navigate]);

  const sendChatMessage = (message: string) => {
    const socket = socketRef.current ?? getSocket();
    socketRef.current = socket;
    socket.emit('chat-message', {
      roomId,
      message,
      fromId: localParticipantId,
      fromName: displayName,
    });
  };

  const toggleRoomLock = () => {
    if (!roomId) {
      return;
    }

    const socket = socketRef.current ?? getSocket();
    socketRef.current = socket;
    socket.emit('toggle-room-lock', {
      roomId,
      locked: !roomLocked,
    });
  };

  const kickParticipant = (participantId: string) => {
    const socket = socketRef.current ?? getSocket();
    socketRef.current = socket;
    socket.emit('kick-participant', { participantId });
  };

  const transferHost = (participantId: string) => {
    const socket = socketRef.current ?? getSocket();
    socketRef.current = socket;
    socket.emit('transfer-host', { participantId });
  };

  const inviteParticipants = async (emails: string[]): Promise<RoomInviteResponse> => {
    if (!roomId) throw new Error(t('meeting.errors.roomNotExist'));
    const result = await apiFetch<RoomInviteResponse>(`/api/rooms/${encodeURIComponent(roomId)}/invite`, {
      method: 'POST',
      body: JSON.stringify({ emails }),
    });
    setRoomInfo(result.room);
    return result;
  };

  // ── Leave ──────────────────────────────────────────────────────────────────
  const handleLeave = () => {
    leave();
    disconnectSocket();
    navigate('/');
  };

  const openPanel = (panel: SidePanel) => {
    setSidePanel((prev) => (prev === panel ? null : panel));
    if (panel === 'chat') setUnreadChat(0);
  };

  if (isAuthLoading || pageLoading) {
    return (
      <div className="min-h-screen bg-meeting-bg flex items-center justify-center p-6">
        <div className="bg-meeting-surface border border-meeting-border rounded-2xl px-8 py-10 text-center shadow-2xl">
          <Loader2 className="w-8 h-8 text-meeting-accent animate-spin mx-auto mb-4" />
          <p className="text-white font-medium">{t('meetingPage.loading')}</p>
          <p className="text-slate-400 text-sm mt-2">{t('meetingPage.loadingSubtitle')}</p>
        </div>
      </div>
    );
  }

  if (pageError || !roomId) {
    return (
      <div className="min-h-screen bg-meeting-bg flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-meeting-surface border border-meeting-border rounded-2xl p-8 text-center shadow-2xl">
          <ShieldAlert className="w-10 h-10 text-meeting-danger mx-auto mb-4" />
          <h1 className="text-white text-xl font-semibold mb-2">{t('meetingPage.errorTitle')}</h1>
          <p className="text-slate-400 text-sm leading-relaxed">{pageError || t('meetingPage.errorDefault')}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 w-full bg-meeting-accent hover:bg-blue-600 text-white font-medium py-3 rounded-xl transition-colors"
          >
            {t('meetingPage.backHome')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-meeting-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-meeting-surface border-b border-meeting-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-lg">AiMeeting</span>
          <span className="text-slate-400 text-sm">|</span>
          <span className="text-slate-300 text-sm">{roomInfo?.title ?? meetingState.roomTitle ?? roomId}</span>
          <span className="text-slate-500 text-sm font-mono">{roomId}</span>
          {isHost && (
            <span className="bg-meeting-accent/20 text-meeting-accent text-xs px-2 py-0.5 rounded-full border border-meeting-accent/30">
              {t('meetingPage.host')}
            </span>
          )}
          {roomLocked && (
            <span className="bg-red-500/10 text-red-300 text-xs px-2 py-0.5 rounded-full border border-red-500/30">
              {t('meetingPage.locked')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <span className="text-slate-400 text-sm">{displayName}</span>
        </div>
      </div>

      {/* Pending remote control request */}
      {rc.rcState.pendingRequest && (
        <div className="flex-shrink-0 bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-3 flex items-center justify-between">
          <span className="text-yellow-300 text-sm">
            <strong>{rc.rcState.pendingRequest.fromName}</strong> {t('meetingPage.remoteControlRequestSuffix')}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => rc.respondToRequest(rc.rcState.pendingRequest!.fromId, true)}
              className="bg-meeting-success text-white text-sm px-3 py-1 rounded-lg hover:bg-green-600 transition-colors"
            >
              {t('meetingPage.accept')}
            </button>
            <button
              onClick={() => rc.respondToRequest(rc.rcState.pendingRequest!.fromId, false)}
              className="bg-meeting-danger text-white text-sm px-3 py-1 rounded-lg hover:bg-red-600 transition-colors"
            >
              {t('meetingPage.reject')}
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Video area */}
        <div className="flex-1 overflow-hidden">
          <VideoGrid
            localStream={localStream}
            localParticipantId={localParticipantId}
            localName={displayName}
            isLocalAudioEnabled={isAudioEnabled}
            isLocalVideoEnabled={isVideoEnabled}
            peers={peers}
            pointers={rc.rcState.pointers}
            isScreenSharing={isScreenSharing}
            controllingPeerId={rc.rcState.isControlling ? rc.rcState.controllerId : null}
            onPointerEvent={(peerId, x, y, clicking) => {
              if (clicking) rc.sendPointerClick(peerId, x, y);
              else rc.sendPointerMove(peerId, x, y);
            }}
          />
        </div>

        {/* Side panel */}
        {sidePanel && (
          <div className="w-80 flex-shrink-0 bg-meeting-surface border-l border-meeting-border flex flex-col animate-slide-in">
            {sidePanel === 'chat' && (
              <ChatPanel
                messages={chatMessages}
                localParticipantId={localParticipantId}
                onSend={sendChatMessage}
                onClose={() => setSidePanel(null)}
              />
            )}
            {sidePanel === 'recording' && (
              <RecordingPanel
                recording={recording}
                onClose={() => setSidePanel(null)}
              />
            )}
            {sidePanel === 'minutes' && (
              <AiMinutesPanel
                recording={recording}
                onClose={() => setSidePanel(null)}
              />
            )}
            {sidePanel === 'remote' && (
              <RemoteControlPanel
                rcState={rc.rcState}
                peers={Array.from(peers.values())}
                screenSharingPeerIds={Array.from(screenSharingPeerIds)}
                onRequestControl={rc.requestControl}
                onStopControl={rc.stopControl}
                onClose={() => setSidePanel(null)}
              />
            )}
            {sidePanel === 'security' && (
              <SecurityPanel
                isHost={isHost}
                roomTitle={roomInfo?.title ?? roomId}
                roomLocked={roomLocked}
                peers={Array.from(peers.values())}
                onToggleLock={toggleRoomLock}
                onKickParticipant={kickParticipant}
                onTransferHost={transferHost}
                onClose={() => setSidePanel(null)}
              />
            )}
            {sidePanel === 'ai-settings' && isAdmin && (
              <AiSettingsPanel
                onClose={() => setSidePanel(null)}
              />
            )}
            {sidePanel === 'invite' && (
              <InvitePanel
                roomId={roomId}
                roomTitle={roomInfo?.title ?? meetingState.roomTitle ?? roomId}
                inviteLink={inviteLink}
                invitedEmails={roomInfo?.invitedEmails ?? []}
                canInvite={isHost || roomInfo?.ownerUserId === user?.id}
                scheduledAt={roomInfo?.scheduledAt}
                onInvite={inviteParticipants}
                onClose={() => setSidePanel(null)}
              />
            )}
          </div>
        )}
      </div>

      {/* Controls bar */}
      <Controls
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isScreenSharing={isScreenSharing}
        isRecording={recording.isRecording}
        unreadChat={unreadChat}
        activePanelKey={sidePanel}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreenShare={() => isScreenSharing ? stopScreenShare() : startScreenShare()}
        onToggleChat={() => openPanel('chat')}
        onToggleRecording={() => openPanel('recording')}
        onToggleMinutes={() => openPanel('minutes')}
        onToggleRemoteControl={() => openPanel('remote')}
        onToggleInvite={() => openPanel('invite')}
        onToggleSecurity={() => openPanel('security')}
        onToggleAiSettings={() => openPanel('ai-settings')}
        isAdmin={isAdmin}
        onLeave={handleLeave}
      />
    </div>
  );
}
