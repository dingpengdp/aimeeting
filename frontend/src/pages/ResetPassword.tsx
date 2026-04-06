import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Copy, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useTranslation } from 'react-i18next';

interface ForgotPasswordResponse {
  message: string;
  previewResetLink?: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const isResetMode = token.length > 0;
  const presetEmail = searchParams.get('email')?.trim().toLowerCase() ?? '';

  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [previewResetLink, setPreviewResetLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleRequestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');
    setPreviewResetLink('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError(t('resetPassword.errors.invalidEmail'));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch<ForgotPasswordResponse>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: normalizedEmail }),
      }, { auth: false });

      setSuccessMessage(response.message);
      setPreviewResetLink(response.previewResetLink ?? '');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('resetPassword.errors.requestFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    if (password.length < 8 || password.length > 128) {
      setError(t('resetPassword.errors.passwordLength'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('resetPassword.errors.passwordMismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      }, { auth: false });

      setSuccessMessage(response.message);
      setPassword('');
      setConfirmPassword('');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : t('resetPassword.errors.resetFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyPreviewLink = async () => {
    if (!previewResetLink) {
      return;
    }

    await navigator.clipboard.writeText(previewResetLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-meeting-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-meeting-surface rounded-2xl shadow-2xl border border-meeting-border p-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" />
          {t('resetPassword.back')}
        </Link>

        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-meeting-accent" />
          <h1 className="text-white font-semibold text-xl">{isResetMode ? t('resetPassword.titleReset') : t('resetPassword.titleForgot')}</h1>
        </div>

        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          {isResetMode ? t('resetPassword.descReset') : t('resetPassword.descForgot')}
        </p>

        {successMessage && (
          <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded-xl p-3 flex items-start gap-2 text-green-300 text-sm">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div>{successMessage}</div>
              {isResetMode && (
                <Link to={presetEmail ? `/?email=${encodeURIComponent(presetEmail)}` : '/'} className="inline-block mt-2 text-xs text-green-200 hover:text-white transition-colors">
                  {t('resetPassword.backToLogin')}
                </Link>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 text-meeting-danger text-sm py-2 px-3 bg-red-500/10 rounded-lg border border-red-500/20">
            {error}
          </div>
        )}

        {!isResetMode ? (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">{t('resetPassword.emailLabel')}</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="w-full bg-meeting-bg border border-meeting-border rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500
                             focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-meeting-accent hover:bg-blue-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl
                         transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {t('resetPassword.sendBtn')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">{t('resetPassword.newPassword')}</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('resetPassword.passwordPlaceholder')}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  className="w-full bg-meeting-bg border border-meeting-border rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500
                             focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1.5">{t('resetPassword.confirmPassword')}</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder={t('resetPassword.confirmPlaceholder')}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  className="w-full bg-meeting-bg border border-meeting-border rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500
                             focus:outline-none focus:border-meeting-accent focus:ring-1 focus:ring-meeting-accent transition-colors"
                />
              </div>
            </div>

            <p className="text-xs text-slate-500">{t('resetPassword.passwordHint')}</p>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-meeting-accent hover:bg-blue-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl
                         transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {t('resetPassword.updateBtn')}
            </button>
          </form>
        )}

        {previewResetLink && (
          <div className="mt-6 bg-meeting-bg border border-meeting-border rounded-xl p-4 space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('resetPassword.devLinkHint')}
            </p>
            <a href={previewResetLink} className="block text-sm text-meeting-accent break-all hover:text-white transition-colors">
              {previewResetLink}
            </a>
            <button
              type="button"
              onClick={handleCopyPreviewLink}
              className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-white transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? t('resetPassword.copiedLink') : t('resetPassword.copyLink')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}