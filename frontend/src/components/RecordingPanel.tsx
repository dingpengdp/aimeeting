import { Circle, Download, Loader2, X, Video, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { useRecording } from '../hooks/useRecording';

type RecordingHook = ReturnType<typeof useRecording>;

interface RecordingPanelProps {
  recording: RecordingHook;
  onClose: () => void;
}

export default function RecordingPanel({ recording, onClose }: RecordingPanelProps) {
  const {
    isRecording,
    duration,
    serverFileId,
    isTranscribing,
    transcription,
    isGeneratingMinutes,
    error,
    startRecording,
    stopRecording,
    downloadRecording,
    formatDuration,
  } = recording;
  const { t } = useTranslation();

  const isProcessing = isTranscribing || isGeneratingMinutes;
  const isDone = !isRecording && !isProcessing && serverFileId !== null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-meeting-border flex-shrink-0">
        <div className="flex items-center gap-2 text-white font-medium">
          <Circle className="w-4 h-4 text-meeting-danger" />
          {t('recording.title')}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">

        {/* Idle */}
        {!isRecording && !isProcessing && !serverFileId && !error && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-meeting-surface border border-meeting-border rounded-full flex items-center justify-center mx-auto mb-4">
              <Video className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              {t('recording.idleDesc').split('\n').map((line, i) => (
                <span key={i}>{line}{i === 0 && <br />}</span>
              ))}
            </p>
          </div>
        )}

        {/* Recording in progress */}
        {isRecording && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <Circle className="w-4 h-4 text-red-400 fill-current animate-pulse flex-shrink-0" />
            <div>
              <p className="text-white text-sm font-medium">{t('recording.activeStatus')}</p>
              <p className="text-red-400 text-xl font-mono">{formatDuration(duration)}</p>
            </div>
          </div>
        )}

        {/* Server processing */}
        {isProcessing && (
          <div className={`flex items-center gap-3 rounded-xl p-3 border ${
            isTranscribing
              ? 'bg-blue-500/10 border-blue-500/30'
              : 'bg-meeting-accent/10 border-meeting-accent/30'
          }`}>
            <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-meeting-accent" />
            <div>
              <p className="text-white text-sm font-medium">
                {isTranscribing ? t('recording.transcribing') : t('recording.generatingMinutes')}
              </p>
              <p className="text-slate-400 text-xs mt-0.5">{t('recording.duration', { time: formatDuration(duration) })}</p>
            </div>
          </div>
        )}

        {/* Done */}
        {isDone && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-green-400 text-sm font-medium">{t('recording.done')}</p>
            </div>
            <p className="text-slate-400 text-xs mt-1">{t('recording.duration', { time: formatDuration(duration) })}</p>
          </div>
        )}

        {/* Start / Stop */}
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={isProcessing}
            className="w-full bg-meeting-danger hover:bg-red-600 disabled:opacity-50 text-white font-medium
                       py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Circle className="w-4 h-4" />
            {t('recording.startBtn')}
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="w-full bg-meeting-surface border border-meeting-border hover:bg-meeting-border text-white font-medium
                       py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Circle className="w-4 h-4 fill-current text-meeting-danger" />
            {t('recording.stopBtn')}
          </button>
        )}

        {/* Download */}
        {serverFileId && (
          <button
            onClick={downloadRecording}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 bg-meeting-surface border border-meeting-border
                       hover:bg-meeting-border disabled:opacity-50 text-slate-300 hover:text-white py-2.5 rounded-xl text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('recording.downloadBtn')}
          </button>
        )}

        {/* Transcription preview */}
        {transcription && (
          <div className="space-y-2">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{t('recording.transcriptionPreview')}</p>
            <div className="bg-meeting-bg border border-meeting-border rounded-xl p-3 max-h-40 overflow-y-auto">
              <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">
                {transcription}
              </p>
            </div>
            <p className="text-slate-500 text-xs">{t('recording.transcriptionNote')}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
