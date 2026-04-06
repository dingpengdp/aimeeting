import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Video,
  Users,
  Plus,
  LogIn,
  Sparkles,
  Loader2,
  LogOut,
  Mail,
  ShieldCheck,
  UserCircle2,
  KeyRound,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import type { RoomSummary } from '../types';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, login, register, logout, isLoading } = useAuth();

  const [name, setName] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [roomTitle, setRoomTitle] = useState('');
  const [roomPasscode, setRoomPasscode] = useState('');
  const [inviteEmailsInput, setInviteEmailsInput] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [meetingType, setMeetingType] = useState<'instant' | 'scheduled'>('instant');
  const [scheduledAt, setScheduledAt] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [authError, setAuthError] = useState('');
  const [isMeetingSubmitting, setIsMeetingSubmitting] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  const generateRoomId = () => Math.random().toString(36).substring(2, 9).toUpperCase();

  const parseInviteEmails = (raw: string): string[] =>
    raw
      .split(/[,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);

  useEffect(() => {
    if (!user) {
      return;
    }

    setName((current) => current || user.name);
    setAuthName(user.name);
    setRoomTitle((current) => current || `${user.name} 的会议`);
  }, [user]);

  useEffect(() => {
    const presetEmail = searchParams.get('email')?.trim().toLowerCase();
    if (!presetEmail) {
      return;
    }

    setEmail((current) => current || presetEmail);
    setAuthMode('login');
  }, [searchParams]);

  useEffect(() => {
    const presetRoomId = searchParams.get('roomId')?.trim().toUpperCase();
    if (!presetRoomId) {
      return;
    }
    setMode('join');
    setRoomInput(presetRoomId);
  }, [searchParams]);

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError('');

    const normalizedName = authName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (authMode === 'register') {
      if (normalizedName.length < 2 || normalizedName.length > 50) {
        setAuthError('姓名长度需在 2 到 50 个字符之间');
        return;
      }

      if (!isValidEmail(normalizedEmail)) {
        setAuthError('请输入有效的邮箱地址');
        return;
      }

      if (password.length < 8 || password.length > 128) {
        setAuthError('密码长度需在 8 到 128 个字符之间');
        return;
      }
    } else {
      if (!normalizedEmail) {
        setAuthError('请输入邮箱地址');
        return;
      }

      if (!password) {
        setAuthError('请输入密码');
        return;
      }
    }

    setIsAuthSubmitting(true);

    try {
      if (authMode === 'login') {
        await login(normalizedEmail, password);
      } else {
        await register(normalizedName, normalizedEmail, password);
      }

      setPassword('');
    } catch (authActionError) {
      setAuthError(authActionError instanceof Error ? authActionError.message : '登录失败');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsMeetingSubmitting(true);

    if (!user) {
      setError('请先登录账号，再创建或加入会议');
      setIsMeetingSubmitting(false);
      return;
    }

    if (!name.trim()) {
      setError('请输入您的姓名');
      setIsMeetingSubmitting(false);
      return;
    }

    let roomId: string;

    if (mode === 'create') {
      roomId = generateRoomId();
      try {
        const invitedEmails = parseInviteEmails(inviteEmailsInput);
        if (meetingType === 'scheduled') {
          if (!scheduledAt) {
            setError('请选择预约会议的时间');
            setIsMeetingSubmitting(false);
            return;
          }
          if (new Date(scheduledAt) <= new Date()) {
            setError('预约时间必须在当前时间之后');
            setIsMeetingSubmitting(false);
            return;
          }
        }
        const response = await apiFetch<{ room: RoomSummary; inviteLink?: string }>('/api/rooms', {
          method: 'POST',
          body: JSON.stringify({
            roomId,
            title: roomTitle.trim() || `${user.name} 的会议`,
            passcode: roomPasscode.trim() || undefined,
            invitedEmails: invitedEmails.length > 0 ? invitedEmails : undefined,
            roomType: meetingType,
            scheduledAt: meetingType === 'scheduled' && scheduledAt
              ? new Date(scheduledAt).toISOString()
              : undefined,
          }),
        });
        navigate(`/meeting/${roomId}`, {
          state: {
            displayName: name.trim(),
            passcode: roomPasscode.trim(),
            roomTitle: response.room.title,
            inviteLink: response.inviteLink,
          },
        });
        return;
      } catch (meetingError) {
        setError(meetingError instanceof Error ? meetingError.message : '创建会议室失败，请重试');
        setIsMeetingSubmitting(false);
        return;
      }
    } else {
      if (!roomInput.trim()) {
        setError('请输入会议室 ID');
        setIsMeetingSubmitting(false);
        return;
      }

      roomId = roomInput.trim().toUpperCase();

      try {
        const response = await apiFetch<{ room: RoomSummary }>(`/api/rooms/${encodeURIComponent(roomId)}/access`, {
          method: 'POST',
          body: JSON.stringify({
            passcode: roomPasscode.trim() || undefined,
          }),
        });

        navigate(`/meeting/${roomId}`, {
          state: {
            displayName: name.trim(),
            passcode: roomPasscode.trim(),
            roomTitle: response.room.title,
          },
        });
        return;
      } catch (meetingError) {
        setError(meetingError instanceof Error ? meetingError.message : '加入会议失败，请重试');
        setIsMeetingSubmitting(false);
        return;
      }
    }
  };

  return (
    <div className="min-h-screen bg-meeting-bg flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-12 h-12 bg-meeting-accent rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Video className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">
            Ai<span className="text-meeting-accent">Meeting</span>
          </h1>
        </div>
        <p className="text-slate-400 text-sm">
          视频会议 · 会议录制 · <span className="text-meeting-accent">AI 纪要</span> · 远程控制
        </p>
      </div>

      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[360px_1fr]">
        <div className="bg-meeting-surface rounded-2xl shadow-2xl border border-meeting-border p-8">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-meeting-accent" />
            <h2 className="text-white font-semibold text-lg">账号与身份</h2>
          </div>

          {!user ? (
            <>
              <div className="flex gap-2 mb-6 bg-meeting-bg rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    authMode === 'login' ? 'bg-meeting-accent text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    authMode === 'register' ? 'bg-meeting-accent text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  注册
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === 'register' && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">姓名</label>
                    <input
                      type="text"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="请输入姓名"
                      maxLength={50}
                      className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-4 py-3 text-white placeholder-slate-500
                                 focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">邮箱</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                      className="w-full bg-meeting-bg border border-meeting-border rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500
                                 focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">密码</label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="至少 8 位"
                      autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                      minLength={authMode === 'register' ? 8 : undefined}
                      maxLength={128}
                      required
                      className="w-full bg-meeting-bg border border-meeting-border rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500
                                 focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors"
                    />
                  </div>
                  {authMode === 'login' && (
                    <div className="mt-2 text-right">
                      <Link
                        to={email.trim() ? `/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}` : '/reset-password'}
                        className="text-xs text-meeting-accent hover:text-white transition-colors"
                      >
                        忘记密码？
                      </Link>
                    </div>
                  )}
                  {authMode === 'register' && (
                    <p className="mt-1 text-xs text-slate-500">密码长度需在 8 到 128 个字符之间</p>
                  )}
                </div>

                {authError && (
                  <p className="text-meeting-danger text-sm py-2 px-3 bg-red-500/10 rounded-lg border border-red-500/20">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isAuthSubmitting || isLoading}
                  className="w-full bg-meeting-accent hover:bg-blue-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl
                             transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                >
                  {isAuthSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                  {authMode === 'login' ? '登录账号' : '注册并登录'}
                </button>
              </form>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-meeting-bg border border-meeting-border rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-meeting-accent/20 flex items-center justify-center">
                    <UserCircle2 className="w-6 h-6 text-meeting-accent" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{user.name}</p>
                    <p className="text-slate-400 text-sm">{user.email}</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="w-full bg-meeting-bg border border-meeting-border hover:bg-meeting-border text-slate-300 hover:text-white py-3 rounded-xl
                           transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          )}
        </div>

        <div className="bg-meeting-surface rounded-2xl shadow-2xl border border-meeting-border p-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-white font-semibold text-lg">会议入口</h2>
              <p className="text-slate-400 text-sm mt-1">支持账号登录、房间口令和主持人权限控制</p>
            </div>
            {!user && (
              <span className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-3 py-1">
                需先登录
              </span>
            )}
          </div>

          <div className="flex gap-2 mb-6 bg-meeting-bg rounded-xl p-1">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'create'
                  ? 'bg-meeting-accent text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Plus className="w-4 h-4" />
              创建会议
            </button>
            <button
              type="button"
              onClick={() => setMode('join')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'join'
                  ? 'bg-meeting-accent text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn className="w-4 h-4" />
              加入会议
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">会议显示名</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="会议内显示名称"
                maxLength={50}
                disabled={!user}
                className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-4 py-3 text-white placeholder-slate-500 disabled:opacity-50
                           focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors"
              />
            </div>

            {mode === 'create' ? (
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">会议标题</label>
                <input
                  type="text"
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  placeholder="例如：产品评审会"
                  maxLength={80}
                  disabled={!user}
                  className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-4 py-3 text-white placeholder-slate-500 disabled:opacity-50
                             focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">会议室 ID</label>
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  placeholder="例如：ABC1234"
                  maxLength={32}
                  disabled={!user}
                  className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-4 py-3 text-white placeholder-slate-500 disabled:opacity-50
                             focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors tracking-wider"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-slate-400 mb-1.5">会议口令（可选）</label>
              <input
                type="password"
                value={roomPasscode}
                onChange={(e) => setRoomPasscode(e.target.value)}
                placeholder={mode === 'create' ? '为空则不启用房间口令' : '如房间设置口令，请输入'}
                maxLength={32}
                disabled={!user}
                className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-4 py-3 text-white placeholder-slate-500 disabled:opacity-50
                           focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors"
              />
            </div>

            {mode === 'create' && (
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">邀请参与者（可选）</label>
                <textarea
                  value={inviteEmailsInput}
                  onChange={(e) => setInviteEmailsInput(e.target.value)}
                  placeholder={'输入参与者邮箱，多个用逗号、分号或换行分隔'}
                  rows={3}
                  disabled={!user}
                  className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-4 py-3 text-white placeholder-slate-500 disabled:opacity-50
                             focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors resize-none text-sm"
                />
                <p className="mt-1 text-xs text-slate-500">创建后将自动向受邀者发送邀请邮件</p>
              </div>
            )}
            {mode === 'create' && (
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">会议类型</label>
                <div className="flex gap-2 bg-meeting-bg rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setMeetingType('instant')}
                    disabled={!user}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                      meetingType === 'instant' ? 'bg-meeting-accent text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    即时会议
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeetingType('scheduled')}
                    disabled={!user}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                      meetingType === 'scheduled' ? 'bg-meeting-accent text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    预约会议
                  </button>
                </div>
              </div>
            )}

            {mode === 'create' && meetingType === 'scheduled' && (
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">会议时间</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  disabled={!user}
                  className="w-full bg-meeting-bg border border-meeting-border rounded-lg px-4 py-3 text-white disabled:opacity-50
                             focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors"
                />
                <p className="mt-1 text-xs text-slate-500">邀请邮件将包含日历邀请（.ics）附件</p>
              </div>
            )}
            {error && (
              <p className="text-meeting-danger text-sm py-2 px-3 bg-red-500/10 rounded-lg border border-red-500/20">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!user || isMeetingSubmitting}
              className="w-full bg-meeting-accent hover:bg-blue-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl
                         transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
            >
              {isMeetingSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : mode === 'create' ? (
                <Plus className="w-5 h-5" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              {mode === 'create' ? '创建并进入会议' : '验证后加入会议'}
            </button>
          </form>
        </div>
      </div>

      {/* Feature badges */}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {[
          { icon: <Video className="w-4 h-4" />, label: 'HD 视频通话' },
          { icon: <Users className="w-4 h-4" />, label: '多人会议' },
          { icon: <Sparkles className="w-4 h-4" />, label: 'AI 会议纪要' },
        ].map((f) => (
          <div
            key={f.label}
            className="flex items-center gap-1.5 bg-meeting-surface border border-meeting-border
                       rounded-full px-3 py-1.5 text-xs text-slate-400"
          >
            {f.icon}
            {f.label}
          </div>
        ))}
      </div>
    </div>
  );
}
