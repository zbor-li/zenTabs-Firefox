import localforage from 'localforage';
import {
  extensionStorageGetMany,
  extensionStorageRemove,
  extensionStorageSetMany,
  hasExtensionStorage,
} from './extensionApi';

const SETTINGS_SNAPSHOT_KEY = 'zen_settings_snapshot';
const AUTHORITY_MARKER_PREFIX = '__zen_storage_authority_v1__:';

export const STORAGE_KEYS = {
  bookmarks: 'zen_bookmarks',
  settings: 'zen_global_settings',
  searchEngines: 'zen_search_engines',
  selectedEngine: 'zen_search_engine',
  searchHistory: 'zen_search_history',
  customLogo: 'zen_custom_logo',
  customLogoSize: 'zen_custom_logo_size',
  faviconCache: 'zen_favicon_cache',
  faviconCacheVersion: 'zen_favicon_cache_version',
  githubToken: 'zen_github_token',
  githubGistId: 'zen_github_gist_id',
} as const;

function readLocalStorage<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  } catch {
    return null;
  }
}

function authorityMarkerKey(key: string): string {
  return `${AUTHORITY_MARKER_PREFIX}${key}`;
}

export function readSettingsSnapshot<T>(): T | null {
  try {
    const value = localStorage.getItem(SETTINGS_SNAPSHOT_KEY);
    return value === null ? null : JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function writeSettingsSnapshot<T>(value: T): void {
  try {
    localStorage.setItem(SETTINGS_SNAPSHOT_KEY, JSON.stringify(value));
  } catch {
    // The extension storage remains authoritative if the synchronous snapshot
    // cannot be written (for example, when localStorage is unavailable).
  }
}

export async function getStoredValue<T>(key: string): Promise<T | null> {
  if (hasExtensionStorage()) {
    try {
      const markerKey = authorityMarkerKey(key);
      const stored = await extensionStorageGetMany([key, markerKey]);
      const extensionValue = stored[key] as T | null | undefined;
      if (extensionValue !== null && extensionValue !== undefined) return extensionValue;
      const isAuthoritative = stored[markerKey] === true;
      if (isAuthoritative) return null;
    } catch {
      // Continue with the legacy stores only when extension storage could not
      // be read. An explicit authority marker prevents deleted mirror values
      // from being migrated back into Firefox storage later.
    }
  }

  let indexedValue: T | null = null;
  try {
    indexedValue = await localforage.getItem<T>(key);
  } catch {
    // Continue with localStorage migration.
  }
  if (indexedValue !== null) {
    if (hasExtensionStorage()) {
      await extensionStorageSetMany({
        [key]: indexedValue,
        [authorityMarkerKey(key)]: true,
      });
    }
    return indexedValue;
  }

  const localValue = readLocalStorage<T>(key);
  if (localValue !== null) {
    if (hasExtensionStorage()) {
      await extensionStorageSetMany({
        [key]: localValue,
        [authorityMarkerKey(key)]: true,
      });
      await localforage.setItem(key, localValue).catch(() => undefined);
    } else {
      await localforage.setItem(key, localValue);
    }
  }
  return localValue;
}

export async function setStoredValue<T>(key: string, value: T): Promise<void> {
  if (hasExtensionStorage()) {
    // Extension storage is the read authority in installed builds. Do not hide
    // a failed primary write behind a successful IndexedDB mirror write.
    await extensionStorageSetMany({
      [key]: value,
      [authorityMarkerKey(key)]: true,
    });
    await localforage.setItem(key, value).catch(() => undefined);
    return;
  }

  await localforage.setItem(key, value);
}

/** Writes a restore snapshot as one extension-storage change transaction. */
export async function setStoredValues(values: Record<string, unknown>): Promise<void> {
  if (hasExtensionStorage()) {
    const authoritativeValues: Record<string, unknown> = { ...values };
    for (const key of Object.keys(values)) authoritativeValues[authorityMarkerKey(key)] = true;
    await extensionStorageSetMany(authoritativeValues);
    await Promise.all(
      Object.entries(values).map(([key, value]) => localforage.setItem(key, value).catch(() => undefined)),
    );
    return;
  }

  await Promise.all(Object.entries(values).map(([key, value]) => localforage.setItem(key, value)));
}

export async function removeStoredValue(key: string): Promise<void> {
  try {
    localStorage.removeItem(key);
  } catch {
    // Continue with the authoritative stores when localStorage is unavailable.
  }
  if (hasExtensionStorage()) {
    // Write the tombstone first. If IndexedDB cleanup later fails, a missing
    // extension key must still remain deleted instead of being re-migrated.
    await extensionStorageSetMany({ [authorityMarkerKey(key)]: true });
    await extensionStorageRemove(key);
    // Extension storage is authoritative. IndexedDB is only a migration mirror
    // and can be unavailable in hardened Firefox profiles, so its cleanup must
    // not turn a successful primary deletion into a failed cloud restore.
    await localforage.removeItem(key).catch(() => undefined);
    return;
  }

  await localforage.removeItem(key);
}
