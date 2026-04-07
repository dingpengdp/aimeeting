import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWebRTC } from '../hooks/useWebRTC';
import DeviceSettingsPanel from './DeviceSettingsPanel';

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

interface HomeDeviceSettingsModalProps {
  displayName: string;
  onClose: () => void;
}

export default function HomeDeviceSettingsModal({ displayName, onClose }: HomeDeviceSettingsModalProps) {
  const { t } = useTranslation();
  const {
    localStream,
    isAudioEnabled,
    isVideoEnabled,
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
    selectAudioInput,
    selectVideoInput,
    retryMediaAccess,
  } = useWebRTC({
    roomId: 'home-device-settings',
    displayName,
    mediaEnabled: true,
    connectionEnabled: false,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const mediaWarning = describeMediaAccessWarning(t, mediaAccess, mediaAccessErrorName);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative h-[min(85vh,720px)] w-full max-w-md overflow-hidden rounded-2xl border border-meeting-border bg-meeting-surface shadow-2xl shadow-slate-950/40">
        {!hasInitializedMedia && isMediaInitializing && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-meeting-surface/75 backdrop-blur-sm">
            <div className="flex items-center gap-2 rounded-xl border border-meeting-border bg-meeting-bg/90 px-4 py-3 text-sm text-slate-200">
              <Loader2 className="h-4 w-4 animate-spin text-meeting-accent" />
              <span>{t('devices.preparing')}</span>
            </div>
          </div>
        )}

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
          onClose={onClose}
        />
      </div>
    </div>
  );
}