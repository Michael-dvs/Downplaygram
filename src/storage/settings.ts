/**
 * Downplaygram Settings & Storage Layer
 * Manages persistent extension preferences via chrome.storage.local.
 */

export interface DownplaygramSettings {
  ghostModeEnabled: boolean;
  autoReloadOnToggle: boolean;
  downloadThrottleMs: number;
}

const DEFAULT_SETTINGS: DownplaygramSettings = {
  ghostModeEnabled: false,
  autoReloadOnToggle: true,
  downloadThrottleMs: 500,
};

const STORAGE_KEYS = {
  GHOST_MODE: 'ghost_mode_enabled',
  SETTINGS: 'downplaygram_settings',
};

/**
 * Retrieves whether Ghost Mode is enabled.
 */
export async function getGhostMode(): Promise<boolean> {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local?.get) {
      const res = await chrome.storage.local.get(STORAGE_KEYS.GHOST_MODE);
      return Boolean(res?.[STORAGE_KEYS.GHOST_MODE]);
    }
  } catch (err) {
    console.warn('[Downplaygram] Error reading ghost mode from storage:', err);
  }
  return DEFAULT_SETTINGS.ghostModeEnabled;
}

/**
 * Persists Ghost Mode state to chrome.storage.local.
 */
export async function setGhostMode(enabled: boolean): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local?.set) {
      await chrome.storage.local.set({ [STORAGE_KEYS.GHOST_MODE]: enabled });
    }
  } catch (err) {
    console.error('[Downplaygram] Error saving ghost mode to storage:', err);
  }
}

/**
 * Retrieves user settings or specific key.
 */
export async function getSettings(key?: string): Promise<any> {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local?.get) {
      const storageKey = key || STORAGE_KEYS.SETTINGS;
      const res = await chrome.storage.local.get(storageKey);
      if (key) {
        return res?.[key] ?? null;
      }
      return {
        ...DEFAULT_SETTINGS,
        ...(res?.[STORAGE_KEYS.SETTINGS] || {}),
      };
    }
  } catch (err) {
    console.warn('[Downplaygram] Error reading settings:', err);
  }
  return key ? null : DEFAULT_SETTINGS;
}

/**
 * Updates user settings.
 */
export async function updateSettings(newSettings: Partial<DownplaygramSettings>): Promise<void> {
  try {
    const current = await getSettings();
    const merged = { ...current, ...newSettings };
    if (typeof chrome !== 'undefined' && chrome?.storage?.local?.set) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
    }
  } catch (err) {
    console.error('[Downplaygram] Error updating settings:', err);
  }
}

