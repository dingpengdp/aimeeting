import { useEffect, useState } from 'react';
import { Globe, Loader2, Settings2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getServerUrl, setServerUrl } from '../lib/config';
import { tauriInvoke } from '../lib/tauri';

interface ServerSetupProps {
  onConnected: (serverUrl: string) => void;
  onClose?: () => void;
  initialUrl?: string;
}

function normalizeServerUrl(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname === '/' ? '' : pathname}`;
  } catch {
    return null;
  }
}

function getConnectErrorMessage(fallback: string, error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return `${fallback} (request timed out after 5s)`;
  }

  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }

  return fallback;
}

export default function ServerSetup({ onConnected, onClose, initialUrl }: ServerSetupProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(() => initialUrl ?? getServerUrl() ?? 'http://');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const isModal = Boolean(onClose);

  useEffect(() => {
    if (!isModal || !onClose) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModal, onClose]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalized = normalizeServerUrl(url);
    if (!normalized) {
      setError(t('serverSetup.errorInvalidUrl'));
      return;
    }

    setConnecting(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);

    try {
      // Probe the backend health endpoint to verify connectivity
      const res = await fetch(`${normalized}/api/health`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Persist to localStorage so getServerUrl() picks it up
      setServerUrl(normalized);
      setUrl(normalized);

      // Also persist to Tauri plugin-store for the Rust agent to read later
      await tauriInvoke('set_server_url', { url: normalized });

      onConnected(normalized);
    } catch (connectError) {
      setError(getConnectErrorMessage(t('serverSetup.errorUnreachable'), connectError));
    } finally {
      window.clearTimeout(timeoutId);
      setConnecting(false);
    }
  };

  return (
    <div
      className={isModal ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm' : 'server-setup-overlay'}
      onClick={(event) => {
        if (isModal && onClose && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`w-full max-w-sm rounded-2xl border border-meeting-border bg-meeting-surface/90 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-7 ${isModal ? 'relative' : ''}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-meeting-accent" />
              <h1 className="text-base font-semibold text-white">{t('serverSetup.title')}</h1>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{t('serverSetup.description')}</p>
          </div>
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-meeting-border bg-meeting-bg/70 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
              aria-label={t('common.cancel')}
              title={t('common.cancel')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleConnect} className="space-y-3">
          <div>
            <label htmlFor="server-url" className="mb-1 block text-xs text-slate-400">
              {t('serverSetup.urlLabel')}
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                id="server-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t('serverSetup.urlPlaceholder')}
                disabled={connecting}
                autoFocus
                className="w-full rounded-lg border border-meeting-border bg-meeting-bg py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 transition-colors focus:border-meeting-accent focus:outline-none focus:ring-1 focus:ring-meeting-accent"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-meeting-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={connecting || !url.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-meeting-accent py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-600 disabled:opacity-60"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
            {connecting ? t('serverSetup.connecting') : t('serverSetup.connectButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
