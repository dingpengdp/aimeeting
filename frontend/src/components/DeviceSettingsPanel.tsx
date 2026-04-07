import { useMemo, useState } from 'react';
import { X, Loader2, RefreshCw, Camera, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import VideoTile from './VideoTile';

interface DeviceSettingsPanelProps {
  localStream: MediaStream | null;
  displayName: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isMediaInitializing?: boolean;
  mediaWarning: string;
  audioInputDevices: MediaDeviceInfo[];
  videoInputDevices: MediaDeviceInfo[];
  selectedAudioInputId: string | null;
  selectedVideoInputId: string | null;
  onToggleAudio?: () => void | Promise<void>;
  onToggleVideo?: () => void | Promise<void>;
  onSelectAudioInput: (deviceId: string) => Promise<void>;
  onSelectVideoInput: (deviceId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}

export default function DeviceSettingsPanel({
  localStream,
  displayName,
  isAudioEnabled,
  isVideoEnabled,
  isMediaInitializing = false,
  mediaWarning,
  audioInputDevices,
  videoInputDevices,
  selectedAudioInputId,
  selectedVideoInputId,
  onToggleAudio,
  onToggleVideo,
  onSelectAudioInput,
  onSelectVideoInput,
  onRefresh,
  onClose,
}: DeviceSettingsPanelProps) {
  const { t } = useTranslation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isApplyingAudio, setIsApplyingAudio] = useState(false);
  const [isApplyingVideo, setIsApplyingVideo] = useState(false);
  const [actionError, setActionError] = useState('');

  const audioOptions = useMemo(() => audioInputDevices.map((device, index) => ({
    value: device.deviceId,
    label: device.label || `${t('devices.microphone')} ${index + 1}`,
  })), [audioInputDevices, t]);

  const videoOptions = useMemo(() => videoInputDevices.map((device, index) => ({
    value: device.deviceId,
    label: device.label || `${t('devices.camera')} ${index + 1}`,
  })), [videoInputDevices, t]);

  const handleRefresh = async () => {
    setActionError('');
    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('devices.refreshFailed'));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectAudio = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    setActionError('');
    setIsApplyingAudio(true);
    try {
      await onSelectAudioInput(event.target.value);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('devices.switchFailed'));
    } finally {
      setIsApplyingAudio(false);
    }
  };

  const handleSelectVideo = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    setActionError('');
    setIsApplyingVideo(true);
    try {
      await onSelectVideoInput(event.target.value);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t('devices.switchFailed'));
    } finally {
      setIsApplyingVideo(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-meeting-border px-4 py-3 flex-shrink-0">
        <h3 className="text-white font-semibold">{t('devices.title')}</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors p-1 rounded"
          aria-label={t('invite.close')}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="rounded-xl overflow-hidden border border-meeting-border bg-meeting-bg aspect-video min-h-[180px]">
          <VideoTile
            stream={localStream}
            participantId="device-preview"
            name={displayName}
            isAudioEnabled={isAudioEnabled}
            isVideoEnabled={isVideoEnabled}
            isLocal
            isMirror
            className="h-full"
          />
        </div>

        {mediaWarning && (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {mediaWarning}
          </p>
        )}

        {actionError && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-meeting-danger">
            {actionError}
          </p>
        )}

        {(onToggleAudio || onToggleVideo) && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void onToggleAudio?.()}
              disabled={isMediaInitializing}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors disabled:opacity-60 ${isAudioEnabled
                ? 'border-meeting-border bg-meeting-bg text-slate-200 hover:border-slate-500 hover:text-white'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-400/40'}`}
            >
              {isAudioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              <span>{isAudioEnabled ? t('controls.mute') : t('controls.unmute')}</span>
            </button>
            <button
              type="button"
              onClick={() => void onToggleVideo?.()}
              disabled={isMediaInitializing}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors disabled:opacity-60 ${isVideoEnabled
                ? 'border-meeting-border bg-meeting-bg text-slate-200 hover:border-slate-500 hover:text-white'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-200 hover:border-amber-400/40'}`}
            >
              {isVideoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              <span>{isVideoEnabled ? t('controls.cameraOff') : t('controls.cameraOn')}</span>
            </button>
          </div>
        )}

        <div>
          <label className="mb-1.5 flex items-center gap-2 text-sm text-slate-300">
            <Camera className="w-4 h-4 text-meeting-accent" />
            {t('devices.camera')}
          </label>
          <select
            value={selectedVideoInputId ?? ''}
            onChange={handleSelectVideo}
            disabled={isApplyingVideo || videoOptions.length === 0}
            className="w-full rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm text-white transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent disabled:opacity-60"
          >
            {videoOptions.length === 0 ? (
              <option value="">{t('devices.noneDetected')}</option>
            ) : videoOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#111827] text-white">
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 flex items-center gap-2 text-sm text-slate-300">
            <Mic className="w-4 h-4 text-meeting-accent" />
            {t('devices.microphone')}
          </label>
          <select
            value={selectedAudioInputId ?? ''}
            onChange={handleSelectAudio}
            disabled={isApplyingAudio || audioOptions.length === 0}
            className="w-full rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm text-white transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent disabled:opacity-60"
          >
            {audioOptions.length === 0 ? (
              <option value="">{t('devices.noneDetected')}</option>
            ) : audioOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-[#111827] text-white">
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-meeting-border px-3 py-2.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-60"
        >
          {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t('devices.refresh')}
        </button>
      </div>
    </div>
  );
}