import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, ShieldAlert, Camera, Mic, MicOff, RefreshCw, Settings2, Video, VideoOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getSocket, disconnectSocket } from '../services/socket';
import { getStoredDevicePreferences } from '../services/devicePreferences';
import { useWebRTC } from '../hooks/useWebRTC';
import { useRecording } from '../hooks/useRecording';
import { useRemoteControl } from '../hooks/useRemoteControl';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import { getServerUrl } from '../lib/config';
import { isTauri, tauriInvoke, tauriInvokeOrThrow } from '../lib/tauri';
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
import DeviceSettingsPanel from '../components/DeviceSettingsPanel';
import LanguageSwitcher from '../components/LanguageSwitcher';
import VideoTile from '../components/VideoTile';
import { v4 as uuidv4 } from 'uuid';

type SidePanel = 'chat' | 'recording' | 'minutes' | 'remote' | 'invite' | 'security' | 'devices' | 'ai-settings' | null;
type MeetingStage = 'setup' | 'active';

interface MeetingLocationState {
  displayName?: string;
  passcode?: string;
  roomTitle?: string;
  inviteLink?: string;
}

function describeMediaAccessWarning(
  t: ReturnType<typeof useTranslation>['t'],
  mediaAccess: 'full' | 'audio-only' | 'video-only' | 'none',
  errorName: string | null,
): string {
  const isPermissionError = errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError' || errorName === 'SecurityError';
  const isDeviceMissing = errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError' || errorName === 'OverconstrainedError';

  if (mediaAccess === 'audio-only') {
    if (isPermissionError) {
      return t('meetingPage.mediaAudioOnlyPermission');
    }
    if (isDeviceMissing) {
      return t('meetingPage.mediaAudioOnlyDeviceMissing');
    }
    return t('meetingPage.mediaAudioOnly');
  }

  if (mediaAccess === 'video-only') {
    if (isPermissionError) {
      return t('meetingPage.mediaVideoOnlyPermission');
    }
    if (isDeviceMissing) {
      return t('meetingPage.mediaVideoOnlyDeviceMissing');
    }
    return t('meetingPage.mediaVideoOnly');
  }

  if (mediaAccess === 'none') {
    if (isPermissionError) {
      return t('meetingPage.mediaNonePermission');
    }
    if (isDeviceMissing) {
      return t('meetingPage.mediaNoneDeviceMissing');
    }
    return t('meetingPage.mediaNone');
  }

  return '';
}

function getDeviceLabel(
  t: ReturnType<typeof useTranslation>['t'],
  device: MediaDeviceInfo,
  index: number,
  kind: 'camera' | 'microphone',
): string {
  if (device.label) {
    return device.label;
  }

  return `${kind === 'camera' ? t('devices.camera') : t('devices.microphone')} ${index + 1}`;
}

function getInvokeErrorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return '';
}

export default function Meeting() {
  const { user, token, isAdmin, isLoading: isAuthLoading } = useAuth();
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const initialStoredDevicePreferences = useRef(getStoredDevicePreferences()).current;
  const hasSavedDevicePreference = Boolean(
    initialStoredDevicePreferences.audioInputId || initialStoredDevicePreferences.videoInputId,
  );

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
  const [agentWarning, setAgentWarning] = useState('');
  const [meetingStage, setMeetingStage] = useState<MeetingStage>('setup');
  const [setupError, setSetupError] = useState('');
  const [isSetupDevicesOpen, setIsSetupDevicesOpen] = useState(false);

  useEffect(() => {
    setMeetingStage('setup');
    setSidePanel(null);
    setSetupError('');
    setIsSetupDevicesOpen(false);
  }, [roomId]);

  useEffect(() => {
    if (!isSetupDevicesOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSetupDevicesOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSetupDevicesOpen]);

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
    retryMediaAccess,
    sendDataMessage,
    leave,
  } = useWebRTC({
    roomId: roomId ?? '',
    displayName,
    mediaEnabled: !pageLoading && !pageError && Boolean(rtcConfig),
    connectionEnabled: !pageLoading && !pageError && Boolean(rtcConfig) && meetingStage === 'active',
    joinPasscode,
    iceServers: rtcConfig?.iceServers ?? [],
    onDataMessage: handleDataMessage,
  });

  // ── Remote Control ─────────────────────────────────────────────────────────
  const rc = useRemoteControl({ localParticipantId, localName: displayName, peers, sendDataMessage });

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
  const mediaWarning = describeMediaAccessWarning(t, mediaAccess, mediaAccessErrorName);
  const requiresSetupSelection = !hasSavedDevicePreference
    && hasInitializedMedia
    && !isMediaInitializing
    && (audioInputDevices.length > 1 || videoInputDevices.length > 1);

  const endActiveRemoteControl = () => {
    if (rc.rcState.controllerId && (rc.rcState.isControlling || rc.rcState.isBeingControlled)) {
      rc.stopControl(rc.rcState.controllerId);
    }
  };

  // ── Chat via socket ────────────────────────────────────────────────────────
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    if (pageLoading || pageError || meetingStage !== 'active') {
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
      endActiveRemoteControl();
      leave();
      disconnectSocket();
      navigate('/', { replace: true });
    });
    socket.on('room-error', ({ message }: { message: string }) => {
      setPageError(message);
      endActiveRemoteControl();
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
  }, [meetingStage, pageLoading, pageError, sidePanel, rc.handleRemoteControlRequest, rc.handleRemoteControlResponse, rc.handleRemoteControlEnd, rc.rcState.controllerId, rc.rcState.isBeingControlled, rc.rcState.isControlling, leave, navigate, t]);

  // ── Tauri native agent – joins room for real mouse control ─────────────────
  useEffect(() => {
    if (pageLoading || pageError || meetingStage !== 'active' || !roomId || !isTauri() || !token) {
      setAgentWarning('');
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const serverUrl = getServerUrl();
        if (!serverUrl) {
          throw new Error('No server URL configured');
        }

        await tauriInvokeOrThrow('agent_set_credentials', { serverUrl, token });
        await tauriInvokeOrThrow('agent_join_room', { roomId });
        if (!cancelled) {
          setAgentWarning('');
        }
      } catch (error) {
        console.error('[meeting] agent join failed', error);
        const detail = getInvokeErrorMessage(error);
        if (!cancelled) {
          setAgentWarning(detail ? `${t('meetingPage.agentUnavailable')} (${detail})` : t('meetingPage.agentUnavailable'));
        }
      }
    })();

    return () => {
      cancelled = true;
      void tauriInvoke('agent_leave_room');
    };
  }, [meetingStage, pageLoading, pageError, roomId, t, token]);

  useEffect(() => {
    if (pageLoading || pageError || meetingStage !== 'setup') {
      return;
    }

    if (hasSavedDevicePreference) {
      setIsSetupDevicesOpen(false);
      setMeetingStage('active');
      return;
    }

    if (!hasInitializedMedia || isMediaInitializing) {
      return;
    }

    if (audioInputDevices.length <= 1 && videoInputDevices.length <= 1) {
      setIsSetupDevicesOpen(false);
      setMeetingStage('active');
    }
  }, [
    audioInputDevices.length,
    hasInitializedMedia,
    hasSavedDevicePreference,
    isMediaInitializing,
    meetingStage,
    pageError,
    pageLoading,
    videoInputDevices.length,
  ]);

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
    endActiveRemoteControl();
    leave();
    disconnectSocket();
    navigate('/');
  };

  const openPanel = (panel: SidePanel) => {
    setSidePanel((prev) => (prev === panel ? null : panel));
    if (panel === 'chat') setUnreadChat(0);
  };

  const handleSetupSelectAudio = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSetupError('');
    try {
      await selectAudioInput(event.target.value);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : t('devices.switchFailed'));
    }
  };

  const handleSetupSelectVideo = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSetupError('');
    try {
      await selectVideoInput(event.target.value);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : t('devices.switchFailed'));
    }
  };

  const handleRefreshSetupDevices = async () => {
    setSetupError('');
    try {
      await retryMediaAccess();
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : t('devices.refreshFailed'));
    }
  };

  const handleEnterMeeting = () => {
    setSetupError('');
    setIsSetupDevicesOpen(false);
    setMeetingStage('active');
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
          {((meetingStage === 'active') || (meetingStage === 'setup' && hasInitializedMedia)) && (
            <button
              type="button"
              onClick={() => {
                if (meetingStage === 'setup') {
                  setIsSetupDevicesOpen(true);
                  return;
                }
                openPanel('devices');
              }}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${meetingStage === 'active' && sidePanel === 'devices'
                ? 'border-meeting-accent/50 bg-meeting-accent/15 text-meeting-accent'
                : 'border-meeting-border bg-meeting-bg text-slate-300 hover:border-slate-500 hover:text-white'}`}
            >
              <Settings2 className="h-4 w-4" />
              <span>{t('controls.devices')}</span>
            </button>
          )}
          <LanguageSwitcher />
          <span className="text-slate-400 text-sm">{displayName}</span>
        </div>
      </div>

      {/* Pending remote control request */}
      {meetingStage === 'active' && agentWarning && (
        <div className="flex-shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-amber-200 text-sm">
          {agentWarning}
        </div>
      )}

      {meetingStage === 'active' && mediaWarning && (
        <div className={`flex-shrink-0 px-4 py-2 text-sm border-b ${mediaAccess === 'none'
          ? 'bg-red-500/10 border-red-500/30 text-red-200'
          : 'bg-amber-500/10 border-amber-500/30 text-amber-200'}`}>
          {mediaWarning}
        </div>
      )}

      {meetingStage === 'active' && rc.rcState.pendingRequest && (
        <div className="flex-shrink-0 bg-yellow-500/10 border-b border-yellow-500/30 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-yellow-300 text-sm shrink-0">
              <strong>{rc.rcState.pendingRequest.fromName}</strong> {t('meetingPage.remoteControlRequestSuffix')}
            </span>
            {/* Show what type of control is requested */}
            <span className={`text-xs flex items-center gap-1 ${rc.rcState.pendingRequest.agentMode ? 'text-green-300' : 'text-yellow-400'}`}>
              {rc.rcState.pendingRequest.agentMode
                ? `🤖 ${t('meetingPage.requestModeFullNotice')}`
                : `👁 ${t('meetingPage.requestModePointerNotice')}`}
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
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

      {meetingStage === 'setup' && requiresSetupSelection ? (
        <div className="flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-6">
          <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1.1fr)_360px]">
            <div className="overflow-hidden rounded-2xl border border-meeting-border bg-meeting-surface/80">
              <div className="border-b border-meeting-border px-4 py-3">
                <p className="text-sm font-medium text-white">{roomInfo?.title ?? meetingState.roomTitle ?? roomId}</p>
                <p className="mt-1 text-xs text-slate-400">{t('devices.previewDescription')}</p>
              </div>
              <div className="p-4">
                <div className="aspect-video min-h-[260px] overflow-hidden rounded-xl border border-meeting-border bg-meeting-bg">
                  <VideoTile
                    stream={localStream}
                    participantId="meeting-setup-preview"
                    name={displayName}
                    isAudioEnabled={isAudioEnabled}
                    isVideoEnabled={isVideoEnabled}
                    isLocal
                    isMirror
                    className="h-full"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-meeting-border bg-meeting-surface/90 p-5 shadow-2xl shadow-slate-950/20">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">{t('devices.setupTitle')}</h2>
                  <p className="mt-1 text-sm text-slate-400">{t('devices.setupDescription')}</p>
                </div>
                <span className="rounded-full border border-meeting-accent/30 bg-meeting-accent/10 px-2.5 py-1 text-xs text-meeting-accent">
                  {t('devices.title')}
                </span>
              </div>

              {mediaWarning && (
                <p className={`mt-4 rounded-lg border px-3 py-2 text-xs ${mediaAccess === 'none'
                  ? 'border-red-500/20 bg-red-500/10 text-red-200'
                  : 'border-amber-500/20 bg-amber-500/10 text-amber-200'}`}>
                  {mediaWarning}
                </p>
              )}

              {setupError && (
                <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-meeting-danger">
                  {setupError}
                </p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void toggleAudio()}
                  disabled={isMediaInitializing}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors disabled:opacity-60 ${isAudioEnabled
                    ? 'border-meeting-border bg-meeting-bg text-slate-200 hover:border-slate-500 hover:text-white'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-400/40'}`}
                >
                  {isAudioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  <span>{isAudioEnabled ? t('controls.mute') : t('controls.unmute')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void toggleVideo()}
                  disabled={isMediaInitializing}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors disabled:opacity-60 ${isVideoEnabled
                    ? 'border-meeting-border bg-meeting-bg text-slate-200 hover:border-slate-500 hover:text-white'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-400/40'}`}
                >
                  {isVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  <span>{isVideoEnabled ? t('controls.cameraOff') : t('controls.cameraOn')}</span>
                </button>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-sm text-slate-300">
                    <Camera className="h-4 w-4 text-meeting-accent" />
                    {t('devices.camera')}
                  </label>
                  <select
                    value={selectedVideoInputId ?? ''}
                    onChange={handleSetupSelectVideo}
                    disabled={isMediaInitializing || videoInputDevices.length === 0}
                    className="w-full rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm text-white transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent disabled:opacity-60"
                  >
                    {videoInputDevices.length === 0 ? (
                      <option value="">{t('devices.noneDetected')}</option>
                    ) : videoInputDevices.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId} className="bg-[#111827] text-white">
                        {getDeviceLabel(t, device, index, 'camera')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-sm text-slate-300">
                    <Mic className="h-4 w-4 text-meeting-accent" />
                    {t('devices.microphone')}
                  </label>
                  <select
                    value={selectedAudioInputId ?? ''}
                    onChange={handleSetupSelectAudio}
                    disabled={isMediaInitializing || audioInputDevices.length === 0}
                    className="w-full rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm text-white transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent disabled:opacity-60"
                  >
                    {audioInputDevices.length === 0 ? (
                      <option value="">{t('devices.noneDetected')}</option>
                    ) : audioInputDevices.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId} className="bg-[#111827] text-white">
                        {getDeviceLabel(t, device, index, 'microphone')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRefreshSetupDevices}
                disabled={isMediaInitializing}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-meeting-border px-3 py-2.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-60"
              >
                {isMediaInitializing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t('devices.refresh')}
              </button>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="rounded-xl border border-meeting-border px-3 py-2.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                >
                  {t('meetingPage.backHome')}
                </button>
                <button
                  type="button"
                  onClick={handleEnterMeeting}
                  disabled={isMediaInitializing || !hasInitializedMedia}
                  className="rounded-xl bg-meeting-accent px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
                >
                  {isMediaInitializing ? t('devices.preparing') : t('devices.continue')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : meetingStage === 'setup' ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-meeting-border bg-meeting-surface px-8 py-10 text-center shadow-2xl shadow-slate-950/30">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-meeting-accent" />
            <p className="text-white font-medium">{t('devices.preparing')}</p>
            <p className="mt-2 text-sm text-slate-400">{roomInfo?.title ?? meetingState.roomTitle ?? roomId}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-1 overflow-hidden">
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
                screenSharingPeerIds={screenSharingPeerIds}
                controllingPeerId={rc.rcState.isControlling ? rc.rcState.controllerId : null}
                onPointerEvent={(peerId, x, y, clicking) => {
                  if (clicking) rc.sendPointerClick(peerId, x, y);
                  else rc.sendPointerMove(peerId, x, y);
                }}
              />
            </div>

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
                    localAgentEnabled={localAgentEnabled}
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
                {sidePanel === 'devices' && (
                  <DeviceSettingsPanel
                    localStream={localStream}
                    displayName={displayName}
                    isAudioEnabled={isAudioEnabled}
                    isVideoEnabled={isVideoEnabled}
                    isMediaInitializing={isMediaInitializing}
                    mediaWarning={mediaWarning}
                    audioInputDevices={audioInputDevices}
                    videoInputDevices={videoInputDevices}
                    selectedAudioInputId={selectedAudioInputId}
                    selectedVideoInputId={selectedVideoInputId}
                    onToggleAudio={toggleAudio}
                    onToggleVideo={toggleVideo}
                    onSelectAudioInput={selectAudioInput}
                    onSelectVideoInput={selectVideoInput}
                    onRefresh={retryMediaAccess}
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
            onToggleDevices={() => openPanel('devices')}
            onToggleAiSettings={() => openPanel('ai-settings')}
            isAdmin={isAdmin}
            onLeave={handleLeave}
          />
        </>
      )}

      {meetingStage === 'setup' && isSetupDevicesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setIsSetupDevicesOpen(false)}
        >
          <div
            className="h-[min(85vh,720px)] w-full max-w-md overflow-hidden rounded-2xl border border-meeting-border bg-meeting-surface shadow-2xl shadow-slate-950/40"
            onClick={(event) => event.stopPropagation()}
          >
            <DeviceSettingsPanel
              localStream={localStream}
              displayName={displayName}
              isAudioEnabled={isAudioEnabled}
              isVideoEnabled={isVideoEnabled}
              isMediaInitializing={isMediaInitializing}
              mediaWarning={mediaWarning}
              audioInputDevices={audioInputDevices}
              videoInputDevices={videoInputDevices}
              selectedAudioInputId={selectedAudioInputId}
              selectedVideoInputId={selectedVideoInputId}
              onToggleAudio={toggleAudio}
              onToggleVideo={toggleVideo}
              onSelectAudioInput={selectAudioInput}
              onSelectVideoInput={selectVideoInput}
              onRefresh={retryMediaAccess}
              onClose={() => setIsSetupDevicesOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
