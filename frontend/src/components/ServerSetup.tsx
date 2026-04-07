import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setServerUrl } from '../lib/config';
import { tauriInvoke } from '../lib/tauri';

interface ServerSetupProps {
  onConnected: () => void;
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

export default function ServerSetup({ onConnected }: ServerSetupProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('http://');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

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

      onConnected();
    } catch (connectError) {
      setError(getConnectErrorMessage(t('serverSetup.errorUnreachable'), connectError));
    } finally {
      window.clearTimeout(timeoutId);
      setConnecting(false);
    }
  };

  return (
    <div className="server-setup-overlay">
      <div className="server-setup-card">
        <h1>{t('serverSetup.title')}</h1>
        <p className="server-setup-desc">{t('serverSetup.description')}</p>

        <form onSubmit={handleConnect}>
          <label htmlFor="server-url">{t('serverSetup.urlLabel')}</label>
          <input
            id="server-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('serverSetup.urlPlaceholder')}
            disabled={connecting}
            autoFocus
          />
          {error && <p className="server-setup-error">{error}</p>}
          <button type="submit" disabled={connecting || !url.trim()}>
            {connecting ? t('serverSetup.connecting') : t('serverSetup.connectButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
