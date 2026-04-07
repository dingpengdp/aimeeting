import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Video,
  Users,
  Plus,
  LogIn,
  Menu,
  Sparkles,
  Loader2,
  LogOut,
  Mail,
  ShieldCheck,
  UserCircle2,
  KeyRound,
  Calendar,
  SlidersHorizontal,
  Settings2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import type { RoomSummary } from '../types';
import AiSettingsPanel from '../components/AiSettingsPanel';
import HomeDeviceSettingsModal from '../components/HomeDeviceSettingsModal';
import LanguageSwitcher from '../components/LanguageSwitcher';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, login, register, logout, isAdmin, isLoading } = useAuth();
  const { t } = useTranslation();

  const [showAiSettings, setShowAiSettings] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [meetingEntryView, setMeetingEntryView] = useState<'shortcut' | 'create' | 'join'>('shortcut');

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
    setRoomTitle((current) => current || t('meeting.defaultTitle', { name: user.name }));
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
    if (user) {
      setMeetingEntryView('join');
    }
  }, [searchParams, user]);

  useEffect(() => {
    setShowToolsMenu(false);
    if (!user) {
      setMeetingEntryView('shortcut');
    }
  }, [user]);

  useEffect(() => {
    if (!showToolsMenu) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowToolsMenu(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showToolsMenu]);

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError('');

    const normalizedName = authName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (authMode === 'register') {
      if (normalizedName.length < 2 || normalizedName.length > 50) {
        setAuthError(t('auth.errors.nameLength'));
        return;
      }

      if (!isValidEmail(normalizedEmail)) {
        setAuthError(t('auth.errors.invalidEmail'));
        return;
      }

      if (password.length < 8 || password.length > 128) {
        setAuthError(t('auth.errors.passwordLength'));
        return;
      }
    } else {
      if (!normalizedEmail) {
        setAuthError(t('auth.errors.emailRequired'));
        return;
      }

      if (!password) {
        setAuthError(t('auth.errors.passwordRequired'));
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
      setAuthError(authActionError instanceof Error ? authActionError.message : t('auth.errors.loginFailed'));
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsMeetingSubmitting(true);

    if (!user) {
      setError(t('meeting.errors.loginRequired'));
      setIsMeetingSubmitting(false);
      return;
    }

    if (!name.trim()) {
      setError(t('meeting.errors.nameRequired'));
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
            setError(t('meeting.errors.scheduleRequired'));
            setIsMeetingSubmitting(false);
            return;
          }
          if (new Date(scheduledAt) <= new Date()) {
            setError(t('meeting.errors.schedulePast'));
            setIsMeetingSubmitting(false);
            return;
          }
        }
        const response = await apiFetch<{ room: RoomSummary; inviteLink?: string }>('/api/rooms', {
          method: 'POST',
          body: JSON.stringify({
            roomId,
            title: roomTitle.trim() || t('meeting.defaultTitle', { name: user.name }),
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
        setError(meetingError instanceof Error ? meetingError.message : t('meeting.errors.createFailed'));
        setIsMeetingSubmitting(false);
        return;
      }
    } else {
      if (!roomInput.trim()) {
        setError(t('meeting.errors.roomIdRequired'));
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
        setError(meetingError instanceof Error ? meetingError.message : t('meeting.errors.joinFailed'));
        setIsMeetingSubmitting(false);
        return;
      }
    }
  };

  const handleLogout = () => {
    setShowToolsMenu(false);
    logout();
  };

  const handleOpenAiSettings = () => {
    setShowToolsMenu(false);
    setShowAiSettings(true);
  };

  const handleOpenDeviceSettings = () => {
    setShowToolsMenu(false);
    setShowDeviceSettings(true);
  };

  const handleOpenMeetingEntry = (nextMode: 'create' | 'join', nextMeetingType?: 'instant' | 'scheduled') => {
    setError('');
    setMode(nextMode);
    if (nextMode === 'create' && nextMeetingType) {
      setMeetingType(nextMeetingType);
    }
    setMeetingEntryView(nextMode);
  };

  const handleBackToShortcuts = () => {
    setError('');
    setMeetingEntryView('shortcut');
  };

  const featureBadges = [
    { icon: <Video className="w-4 h-4" />, label: t('meeting.features.hdVideo') },
    { icon: <Users className="w-4 h-4" />, label: t('meeting.features.multiParty') },
    { icon: <Sparkles className="w-4 h-4" />, label: t('meeting.features.aiMinutes') },
  ];

  const meetingHighlights = [
    {
      icon: <Plus className="w-4 h-4" />,
      title: t('meeting.create'),
      detail: t('meeting.instant'),
      onClick: () => handleOpenMeetingEntry('create', 'instant'),
    },
    {
      icon: <LogIn className="w-4 h-4" />,
      title: t('meeting.join'),
      detail: t('meeting.roomId'),
      onClick: () => handleOpenMeetingEntry('join'),
    },
    {
      icon: <Calendar className="w-4 h-4" />,
      title: t('meeting.scheduled'),
      detail: t('meeting.scheduledTime'),
      onClick: () => handleOpenMeetingEntry('create', 'scheduled'),
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-meeting-bg">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.28),_transparent_55%)]" />
      <div className="pointer-events-none absolute left-[-8rem] top-32 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-16 right-[-6rem] h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="fixed right-4 top-4 z-20">
        {user && showToolsMenu && (
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-slate-950/30 backdrop-blur-[1px]"
            onClick={() => setShowToolsMenu(false)}
          />
        )}

        {!user ? (
          <div className="rounded-full bg-black/15 p-1 backdrop-blur-sm">
            <LanguageSwitcher iconOnly />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-black/15 p-1 backdrop-blur-sm">
              <LanguageSwitcher iconOnly />
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowToolsMenu((current) => !current)}
                className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/15 text-slate-200 backdrop-blur-sm transition-colors hover:bg-black/25 hover:text-white"
                aria-expanded={showToolsMenu}
                aria-label={t('common.tools')}
                title={t('common.tools')}
              >
                {showToolsMenu ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>

              {showToolsMenu && (
                <div className="absolute right-0 top-full z-10 mt-2 w-[min(16rem,calc(100vw-2rem))] rounded-2xl bg-slate-950/88 p-2 shadow-xl shadow-slate-950/35 backdrop-blur">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-medium text-white">{user.name}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                    {isAdmin && <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-amber-300/80">{t('auth.admin')}</p>}
                  </div>

                  {(user && isAdmin) && <div className="mx-1 h-px bg-white/5" />}

                  <button
                    type="button"
                    onClick={handleOpenDeviceSettings}
                    className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <Settings2 className="h-4 w-4" />
                    <span>{t('controls.devices')}</span>
                  </button>

                  {user && isAdmin && (
                    <button
                      type="button"
                      onClick={handleOpenAiSettings}
                      className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                      <span>{t('auth.aiSettings')}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>{t('auth.logout')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-4 pt-10 sm:pb-6 sm:pt-12">
        <div className="mb-5 text-center sm:mb-6">
          <div className="mb-2.5 flex items-center justify-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-meeting-accent shadow-lg shadow-blue-500/30">
              <Video className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ai<span className="text-meeting-accent">Meeting</span>
            </h1>
          </div>
          <p className="text-xs text-slate-400 sm:text-sm">{t('app.subtitle')}</p>
        </div>

        {!user ? (
          <div className="flex flex-1 items-start justify-center">
            <div className="w-full max-w-sm rounded-2xl border border-meeting-border bg-meeting-surface/90 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-7">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-meeting-accent" />
                <h2 className="text-base font-semibold text-white">{t('auth.title')}</h2>
              </div>

              <div className="mb-4 flex gap-2 rounded-lg bg-meeting-bg p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                  }}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                    authMode === 'login' ? 'bg-meeting-accent text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t('auth.login')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError('');
                  }}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
                    authMode === 'register' ? 'bg-meeting-accent text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t('auth.register')}
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-3">
                {authMode === 'register' && (
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">{t('auth.name')}</label>
                    <input
                      type="text"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder={t('auth.namePlaceholder')}
                      maxLength={50}
                      className="w-full rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm text-white placeholder-slate-500 transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t('auth.email')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                      className="w-full rounded-lg border border-meeting-border bg-meeting-bg py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t('auth.password')}</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('auth.passwordPlaceholder')}
                      autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                      minLength={authMode === 'register' ? 8 : undefined}
                      maxLength={128}
                      required
                      className="w-full rounded-lg border border-meeting-border bg-meeting-bg py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent"
                    />
                  </div>
                  {authMode === 'login' && (
                    <div className="mt-1.5 text-right">
                      <Link
                        to={email.trim() ? `/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}` : '/reset-password'}
                        className="text-xs text-meeting-accent transition-colors hover:text-white"
                      >
                        {t('auth.forgotPassword')}
                      </Link>
                    </div>
                  )}
                  {authMode === 'register' && <p className="mt-1 text-[11px] text-slate-500">{t('auth.passwordHint')}</p>}
                </div>

                {authError && (
                  <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-meeting-danger">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isAuthSubmitting || isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-meeting-accent py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-600 disabled:opacity-60"
                >
                  {isAuthSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  {authMode === 'login' ? t('auth.loginBtn') : t('auth.registerBtn')}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-start justify-center">
            {meetingEntryView === 'shortcut' ? (
              <div className="w-full max-w-4xl rounded-2xl border border-meeting-border bg-meeting-surface/80 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-7">
                <div className="inline-flex items-center gap-2 rounded-full border border-meeting-accent/30 bg-meeting-accent/10 px-2.5 py-1 text-[11px] text-meeting-accent">
                  <Video className="w-3.5 h-3.5" />
                  {t('meeting.title')}
                </div>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{user.name}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{t('meeting.subtitle')}</p>

                <div className="mt-5 grid gap-2.5 md:grid-cols-3">
                  {meetingHighlights.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={item.onClick}
                      className="rounded-xl border border-meeting-border bg-meeting-bg/70 px-4 py-4 text-left text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white sm:text-sm"
                    >
                      <div className="mb-2 inline-flex rounded-lg bg-meeting-accent/10 p-2 text-meeting-accent">
                        {item.icon}
                      </div>
                      <p className="font-medium text-white">{item.title}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{item.detail}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {featureBadges.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-1.5 rounded-full border border-meeting-border bg-meeting-bg/70 px-2.5 py-1 text-[11px] text-slate-400"
                    >
                      {item.icon}
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-full max-w-xl rounded-2xl border border-meeting-border bg-meeting-surface/90 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-6">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-meeting-accent/30 bg-meeting-accent/10 px-2.5 py-1 text-[11px] text-meeting-accent">
                      {mode === 'create' ? <Plus className="w-3.5 h-3.5" /> : <LogIn className="w-3.5 h-3.5" />}
                      {mode === 'create'
                        ? meetingType === 'scheduled'
                          ? t('meeting.scheduled')
                          : t('meeting.create')
                        : t('meeting.join')}
                    </div>
                    <h2 className="mt-2.5 text-lg font-semibold text-white sm:text-xl">
                      {mode === 'create'
                        ? meetingType === 'scheduled'
                          ? t('meeting.scheduled')
                          : t('meeting.create')
                        : t('meeting.join')}
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">{t('meeting.subtitle')}</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleBackToShortcuts}
                    className="inline-flex items-center gap-2 rounded-lg border border-meeting-border px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {t('common.back')}
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">{t('meeting.displayName')}</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('meeting.displayNamePlaceholder')}
                        maxLength={50}
                        className="w-full rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm text-white placeholder-slate-500 transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent"
                      />
                    </div>

                    {mode === 'create' ? (
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">{t('meeting.passcode')}</label>
                        <input
                          type="password"
                          value={roomPasscode}
                          onChange={(e) => setRoomPasscode(e.target.value)}
                          placeholder={t('meeting.passcodePlaceholderCreate')}
                          maxLength={32}
                          className="w-full rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm text-white placeholder-slate-500 transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">{t('meeting.roomId')}</label>
                        <input
                          type="text"
                          value={roomInput}
                          onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                          placeholder={t('meeting.roomIdPlaceholder')}
                          maxLength={32}
                          className="w-full rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm tracking-wider text-white placeholder-slate-500 transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent"
                        />
                      </div>
                    )}

                    {mode === 'create' ? (
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs text-slate-400">{t('meeting.meetingTitle')}</label>
                        <input
                          type="text"
                          value={roomTitle}
                          onChange={(e) => setRoomTitle(e.target.value)}
                          placeholder={t('meeting.meetingTitlePlaceholder')}
                          maxLength={80}
                          className="w-full rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm text-white placeholder-slate-500 transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="mb-1 block text-xs text-slate-400">{t('meeting.passcode')}</label>
                        <input
                          type="password"
                          value={roomPasscode}
                          onChange={(e) => setRoomPasscode(e.target.value)}
                          placeholder={t('meeting.passcodePlaceholderJoin')}
                          maxLength={32}
                          className="w-full rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm text-white placeholder-slate-500 transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent"
                        />
                      </div>
                    )}

                    {mode === 'create' && meetingType === 'scheduled' && (
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs text-slate-400">{t('meeting.scheduledTime')}</label>
                        <input
                          type="datetime-local"
                          value={scheduledAt}
                          onChange={(e) => setScheduledAt(e.target.value)}
                          min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                          className="w-full rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm text-white transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">{t('meeting.scheduledTimeHint')}</p>
                      </div>
                    )}

                    {mode === 'create' && (
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs text-slate-400">{t('meeting.inviteEmails')}</label>
                        <textarea
                          value={inviteEmailsInput}
                          onChange={(e) => setInviteEmailsInput(e.target.value)}
                          placeholder={t('meeting.inviteEmailsPlaceholder')}
                          rows={2}
                          className="w-full resize-none rounded-lg border border-meeting-border bg-meeting-bg px-3 py-2.5 text-sm text-white placeholder-slate-500 transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">{t('meeting.inviteEmailsHint')}</p>
                      </div>
                    )}
                  </div>

                  {error && (
                    <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-meeting-danger">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isMeetingSubmitting}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-meeting-accent py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-600 disabled:opacity-50"
                  >
                    {isMeetingSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : mode === 'create' ? (
                      <Plus className="h-4 w-4" />
                    ) : (
                      <LogIn className="h-4 w-4" />
                    )}
                    {mode === 'create' ? t('meeting.createBtn') : t('meeting.joinBtn')}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin: AI Settings modal */}
      {showAiSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAiSettings(false); }}
        >
          <div className="bg-meeting-surface border border-meeting-border rounded-2xl shadow-2xl w-full max-w-md h-[80vh] flex flex-col overflow-hidden">
            <AiSettingsPanel onClose={() => setShowAiSettings(false)} />
          </div>
        </div>
      )}

      {user && showDeviceSettings && (
        <HomeDeviceSettingsModal
          displayName={name.trim() || user.name}
          onClose={() => setShowDeviceSettings(false)}
        />
      )}
    </div>
  );
}
