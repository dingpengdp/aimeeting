import { getStoredToken } from './session';
import { getServerUrl } from '../lib/config';

interface ApiFetchOptions {
  auth?: boolean;
}

function toAbsolutePath(path: string): string {
  return `${getServerUrl()}${path}`;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    if (typeof data.error === 'string' && data.error.trim()) {
      return data.error;
    }
  } catch {
    try {
      const text = await response.text();
      if (text.trim()) {
        return text;
      }
    } catch {
      // Ignore parse failures.
    }
  }

  return `请求失败 (${response.status})`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, options: ApiFetchOptions = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  const shouldAttachAuth = options.auth !== false;

  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (shouldAttachAuth) {
    const token = getStoredToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(toAbsolutePath(path), {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}