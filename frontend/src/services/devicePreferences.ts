import type { MediaDevicePreferences } from '../types';

const DEVICE_PREFERENCES_KEY = 'aimeeting.media.devices';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getStoredDevicePreferences(): MediaDevicePreferences {
  if (!canUseStorage()) {
    return {
      audioInputId: null,
      videoInputId: null,
    };
  }

  const raw = window.localStorage.getItem(DEVICE_PREFERENCES_KEY);
  if (!raw) {
    return {
      audioInputId: null,
      videoInputId: null,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MediaDevicePreferences>;
    return {
      audioInputId: typeof parsed.audioInputId === 'string' ? parsed.audioInputId : null,
      videoInputId: typeof parsed.videoInputId === 'string' ? parsed.videoInputId : null,
    };
  } catch {
    clearStoredDevicePreferences();
    return {
      audioInputId: null,
      videoInputId: null,
    };
  }
}

export function persistDevicePreferences(preferences: MediaDevicePreferences): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(DEVICE_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function clearStoredDevicePreferences(): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(DEVICE_PREFERENCES_KEY);
}