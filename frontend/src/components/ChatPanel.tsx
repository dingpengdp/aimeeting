import { useRef, useState, useEffect } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  localParticipantId: string;
  onSend: (message: string) => void;
  onClose: () => void;
}

export default function ChatPanel({ messages, localParticipantId, onSend, onClose }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-meeting-border">
        <div className="flex items-center gap-2 text-white font-medium">
          <MessageSquare className="w-4 h-4 text-meeting-accent" />
          {t('chat.title')}
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 text-sm mt-8">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {t('chat.empty')}
          </div>
        )}
        {messages.map((msg) => {
          const isOwn = msg.fromId === localParticipantId;
          return (
            <div key={msg.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
              {!isOwn && (
                <span className="text-xs text-slate-500 mb-1">{msg.fromName}</span>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words ${
                  isOwn
                    ? 'bg-meeting-accent text-white rounded-br-sm'
                    : 'bg-meeting-bg text-slate-200 rounded-bl-sm'
                }`}
              >
                {msg.message}
              </div>
              <span className="text-xs text-slate-600 mt-0.5">{formatTime(msg.timestamp)}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-meeting-border">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            rows={2}
            maxLength={2000}
            className="flex-1 bg-meeting-bg border border-meeting-border rounded-xl px-3 py-2 text-sm text-white
                       placeholder-slate-500 focus:outline-none focus:border-meeting-accent resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="self-end bg-meeting-accent hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed
                       text-white rounded-xl p-2.5 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
