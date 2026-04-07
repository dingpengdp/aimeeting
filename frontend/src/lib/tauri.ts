/**
 * Detects whether the app is running inside a Tauri WebView.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function tauriInvokeOrThrow<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) {
    throw new Error('Not running in Tauri');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

/**
 * Calls a Tauri IPC command. Returns undefined when not in Tauri context.
 * Lazy-imports @tauri-apps/api/core to avoid bundling it in web-only builds.
 */
export async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T | undefined> {
  try {
    return await tauriInvokeOrThrow<T>(cmd, args);
  } catch (e) {
    console.error('[tauri] invoke error', cmd, e);
    return undefined;
  }
}
