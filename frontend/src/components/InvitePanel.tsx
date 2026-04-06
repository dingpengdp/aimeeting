import { useState } from 'react';
import { X, Copy, Check, Send, Loader2, Mail, Calendar } from 'lucide-react';
import type { RoomInviteResponse } from '../types';

interface InvitePanelProps {
  roomId: string;
  roomTitle: string;
  inviteLink: string;
  invitedEmails: string[];
  canInvite: boolean;
  scheduledAt?: string;
  onInvite: (emails: string[]) => Promise<RoomInviteResponse>;
  onClose: () => void;
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function InvitePanel({
  roomId,
  roomTitle,
  inviteLink,
  invitedEmails,
  canInvite,
  scheduledAt,
  onInvite,
  onClose,
}: InvitePanelProps) {
  const [copied, setCopied] = useState(false);
  const [emailsInput, setEmailsInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sentCount, setSentCount] = useState<number | null>(null);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for browsers without clipboard API
      const el = document.createElement('textarea');
      el.value = inviteLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendInvites = async () => {
    setSendError('');
    setSentCount(null);

    const emails = parseEmails(emailsInput);
    if (emails.length === 0) {
      setSendError('请输入至少一个邮箱地址');
      return;
    }

    const invalid = emails.filter((e) => !isValidEmail(e));
    if (invalid.length > 0) {
      setSendError(`以下邮箱格式有误：${invalid.join(', ')}`);
      return;
    }

    setIsSending(true);
    try {
      const result = await onInvite(emails);
      const delivered = result.deliveredEmails?.length ?? emails.length;
      setSentCount(delivered);
      setEmailsInput('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : '发送邀请失败，请重试');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-meeting-border flex-shrink-0">
        <h3 className="text-white font-semibold">邀请参与者</h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors p-1 rounded"
          aria-label="关闭"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Room info */}
        <div className="bg-meeting-bg border border-meeting-border rounded-xl p-3">
          <p className="text-xs text-slate-500 mb-1">会议室</p>
          <p className="text-white font-medium text-sm">{roomTitle}</p>
          <p className="text-slate-400 text-xs font-mono mt-0.5">{roomId}</p>
          {scheduledAt && (
            <p className="flex items-center gap-1.5 text-slate-400 text-xs mt-1.5">
              <Calendar className="w-3.5 h-3.5 text-meeting-accent flex-shrink-0" />
              {new Date(scheduledAt).toLocaleString('zh-CN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>

        {/* Invite link */}
        <div>
          <label className="block text-sm text-slate-400 mb-2">邀请链接</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteLink}
              className="flex-1 min-w-0 bg-meeting-bg border border-meeting-border rounded-lg px-3 py-2 text-slate-300 text-xs font-mono
                         focus:outline-none focus:border-meeting-accent truncate"
            />
            <button
              onClick={handleCopyLink}
              title="复制链接"
              className="flex-shrink-0 bg-meeting-accent/20 hover:bg-meeting-accent/40 text-meeting-accent border border-meeting-accent/40
                         px-3 rounded-lg transition-colors flex items-center gap-1.5 text-xs"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>

        {/* Email invite — only shown to host/owner */}
        {canInvite && (
          <div>
            <label className="block text-sm text-slate-400 mb-2 flex items-center gap-1.5">
              <Mail className="w-4 h-4" />
              邮件邀请
            </label>
            <textarea
              value={emailsInput}
              onChange={(e) => setEmailsInput(e.target.value)}
              placeholder={'输入邮箱，多个用逗号、分号或换行分隔\n例如：alice@example.com, bob@example.com'}
              rows={4}
              className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm
                         focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors resize-none"
            />

            {sendError && (
              <p className="mt-1.5 text-meeting-danger text-xs px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
                {sendError}
              </p>
            )}

            {sentCount !== null && (
              <p className="mt-1.5 text-green-400 text-xs px-3 py-2 bg-green-500/10 rounded-lg border border-green-500/20">
                成功发送邀请邮件 {sentCount} 封
              </p>
            )}

            <button
              onClick={handleSendInvites}
              disabled={isSending}
              className="mt-2 w-full bg-meeting-accent hover:bg-blue-600 disabled:opacity-60 text-white text-sm font-medium
                         py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isSending ? '发送中…' : '发送邀请'}
            </button>
          </div>
        )}

        {/* Already-invited list */}
        {invitedEmails.length > 0 && (
          <div>
            <p className="text-sm text-slate-400 mb-2">已邀请（{invitedEmails.length}）</p>
            <ul className="space-y-1.5">
              {invitedEmails.map((em) => (
                <li
                  key={em}
                  className="flex items-center gap-2 bg-meeting-bg border border-meeting-border rounded-lg px-3 py-2 text-xs text-slate-300"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span className="truncate">{em}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
