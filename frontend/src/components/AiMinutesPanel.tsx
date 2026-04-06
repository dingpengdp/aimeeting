import { Sparkles, Loader2, X, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { useRecording } from '../hooks/useRecording';

type RecordingHook = ReturnType<typeof useRecording>;

interface AiMinutesPanelProps {
  recording: RecordingHook;
  onClose: () => void;
}

export default function AiMinutesPanel({ recording, onClose }: AiMinutesPanelProps) {
  const { transcription, minutes, isGeneratingMinutes, error, generateMinutes } = recording;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!minutes) return;
    await navigator.clipboard.writeText(minutes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-meeting-border">
        <div className="flex items-center gap-2 text-white font-medium">
          <Sparkles className="w-4 h-4 text-meeting-accent" />
          AI 会议纪要
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* No transcription yet */}
        {!transcription && !minutes && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-meeting-surface border border-meeting-border rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              开始会议录制后，服务端将自动转录并生成 AI 会议纪要，完成后结果会显示在这里。
            </p>
          </div>
        )}

        {/* Has transcription, no minutes yet */}
        {transcription && !minutes && (
          <div className="space-y-4">
            <div className="bg-meeting-accent/10 border border-meeting-accent/30 rounded-xl p-3">
              <p className="text-meeting-accent text-sm font-medium">✓ 转录完成，可以生成纪要</p>
            </div>

            <div className="space-y-2">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">转录文本预览</p>
              <div className="bg-meeting-bg border border-meeting-border rounded-xl p-3 max-h-32 overflow-y-auto">
                <p className="text-slate-400 text-xs leading-relaxed line-clamp-5">{transcription}</p>
              </div>
            </div>

            <button
              onClick={generateMinutes}
              disabled={isGeneratingMinutes}
              className="w-full flex items-center justify-center gap-2 bg-meeting-accent hover:bg-blue-600
                         disabled:opacity-50 text-white py-3 rounded-xl font-medium transition-colors"
            >
              {isGeneratingMinutes ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI 正在生成纪要…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  生成 AI 会议纪要
                </>
              )}
            </button>
          </div>
        )}

        {/* Minutes ready */}
        {minutes && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">AI 生成纪要</p>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-meeting-success" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    复制全文
                  </>
                )}
              </button>
            </div>

            <div className="bg-meeting-bg border border-meeting-border rounded-xl p-4 prose prose-sm prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-white text-base font-bold mb-2">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-white text-sm font-semibold mt-4 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-slate-200 text-sm font-medium mt-3 mb-1">{children}</h3>,
                  p: ({ children }) => <p className="text-slate-300 text-sm leading-relaxed mb-2">{children}</p>,
                  ul: ({ children }) => <ul className="text-slate-300 text-sm list-disc list-inside space-y-1 mb-2">{children}</ul>,
                  ol: ({ children }) => <ol className="text-slate-300 text-sm list-decimal list-inside space-y-1 mb-2">{children}</ol>,
                  li: ({ children }) => <li className="text-slate-300">{children}</li>,
                  strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-3">
                      <table className="w-full text-xs border-collapse">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => <th className="border border-meeting-border px-2 py-1 text-left text-slate-200 bg-meeting-surface">{children}</th>,
                  td: ({ children }) => <td className="border border-meeting-border px-2 py-1 text-slate-300">{children}</td>,
                  hr: () => <hr className="border-meeting-border my-3" />,
                  em: ({ children }) => <em className="text-slate-400 text-xs not-italic">{children}</em>,
                }}
              >
                {minutes}
              </ReactMarkdown>
            </div>

            <button
              onClick={generateMinutes}
              disabled={isGeneratingMinutes}
              className="w-full flex items-center justify-center gap-2 bg-meeting-surface border border-meeting-border
                         hover:bg-meeting-border disabled:opacity-50 text-slate-300 hover:text-white text-sm
                         py-2 rounded-xl transition-colors"
            >
              {isGeneratingMinutes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              重新生成
            </button>
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
