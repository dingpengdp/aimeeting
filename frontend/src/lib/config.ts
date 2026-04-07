import { isTauri } from './tauri';

const STORAGE_KEY = 'aimeeting.server.url';

/**
 * Returns the backend base URL.
 * - In web/dev mode: honours VITE_BACKEND_URL env var or returns '' (Vite proxy handles it).
 * - In Tauri mode: reads from localStorage (set by ServerSetup).
 */
export function getServerUrl(): string {
  const env = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (env) return env;
  if (isTauri()) {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  }
  return ''; // relative URLs work via Vite dev-server proxy
}

/** Persists the backend URL chosen in the Tauri setup screen. */
export function setServerUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url);
}

/**
 * Returns true when the app has enough configuration to proceed.
 * In web mode this is always true; in Tauri mode we need the user to have entered a server URL.
 */
export function isServerConfigured(): boolean {
  if (!isTauri()) return true;
  return Boolean(localStorage.getItem(STORAGE_KEY));
}
