import type { BookmarkItem, GlobalSettings, SearchEngine, SearchHistoryEntry, ZenTabBackup } from './types';
import {
  DEFAULT_ENGINES,
  DEFAULT_SETTINGS,
  INITIAL_BOOKMARKS,
  stripWallpaperBlurCache,
} from './types';
import type { Language } from './i18n';
import { t } from './i18n';
import {
  getStoredValue,
  removeStoredValue,
  setStoredValues,
  STORAGE_KEYS,
  writeSettingsSnapshot,
} from './storage';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readField(source: UnknownRecord, field: string, storageKey: string): unknown {
  return source[field] ?? source[storageKey];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : undefined;
}

function hasSameStoredValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => hasSameStoredValue(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && hasSameStoredValue(left[key], right[key]));
}

type StoredSnapshot = Record<string, unknown | null>;

async function captureStoredSnapshot(keys: readonly string[]): Promise<StoredSnapshot> {
  const entries = await Promise.all(keys.map(async key => [key, await getStoredValue<unknown>(key)] as const));
  return Object.fromEntries(entries);
}

async function applyStoredSnapshot(snapshot: StoredSnapshot): Promise<void> {
  const values: Record<string, unknown> = {};
  const removals: string[] = [];
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === null) removals.push(key);
    else values[key] = value;
  }
  if (Object.keys(values).length > 0) await setStoredValues(values);
  await Promise.all(removals.map(key => removeStoredValue(key)));
}

/**
 * Creates a portable backup. Derived wallpaper/favicon caches are intentionally
 * excluded: user-supplied bookmark icons are already stored with the bookmarks,
 * while automatic favicons can be rebuilt on the destination device.
 */
export async function createBackup(): Promise<ZenTabBackup> {
  const [bookmarks, settings, searchEngines, selectedSearchEngine, searchHistory, customLogo, customLogoSize] = await Promise.all([
    getStoredValue<BookmarkItem[]>(STORAGE_KEYS.bookmarks),
    getStoredValue<GlobalSettings>(STORAGE_KEYS.settings),
    getStoredValue<SearchEngine[]>(STORAGE_KEYS.searchEngines),
    getStoredValue<string>(STORAGE_KEYS.selectedEngine),
    getStoredValue<SearchHistoryEntry[]>(STORAGE_KEYS.searchHistory),
    getStoredValue<string>(STORAGE_KEYS.customLogo),
    getStoredValue<number>(STORAGE_KEYS.customLogoSize),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks: bookmarks ?? INITIAL_BOOKMARKS,
    settings: stripWallpaperBlurCache({ ...DEFAULT_SETTINGS, ...settings }),
    searchEngines: searchEngines?.length ? searchEngines : DEFAULT_ENGINES,
    selectedSearchEngine: selectedSearchEngine ?? DEFAULT_ENGINES[0].id,
    searchHistory: searchHistory ?? undefined,
    customLogo: customLogo ?? undefined,
    customLogoSize: customLogoSize ?? undefined,
  };
}

/** Accepts the full v1 format plus the two formats exported by earlier builds. */
export function normalizeBackup(value: unknown, language: Language = 'zh'): ZenTabBackup {
  const source: UnknownRecord = Array.isArray(value)
    ? { bookmarks: value }
    : isRecord(value)
      ? value
      : {};

  if (!Array.isArray(value) && !isRecord(value)) {
    throw new Error(t(language, 'backupInvalid'));
  }
  if (source.version !== undefined && source.version !== 1) {
    throw new Error(t(language, 'backupUnsupported'));
  }

  const bookmarks = readField(source, 'bookmarks', STORAGE_KEYS.bookmarks);
  if (!Array.isArray(bookmarks)) {
    throw new Error(t(language, 'backupMissingBookmarks'));
  }

  const settingsValue = readField(source, 'settings', STORAGE_KEYS.settings);
  const settings = isRecord(settingsValue)
    ? { ...DEFAULT_SETTINGS, ...settingsValue } as GlobalSettings
    : DEFAULT_SETTINGS;

  const enginesValue = readField(source, 'searchEngines', STORAGE_KEYS.searchEngines);
  const searchEngines = Array.isArray(enginesValue) && enginesValue.length > 0
    ? enginesValue as SearchEngine[]
    : DEFAULT_ENGINES;

  const selectedValue = readField(source, 'selectedSearchEngine', STORAGE_KEYS.selectedEngine);
  const selectedSearchEngine = optionalString(selectedValue) ?? searchEngines[0].id;
  const searchHistoryValue = readField(source, 'searchHistory', STORAGE_KEYS.searchHistory);
  const searchHistory = Array.isArray(searchHistoryValue)
    ? searchHistoryValue as SearchHistoryEntry[]
    : undefined;
  const customLogo = optionalString(readField(source, 'customLogo', STORAGE_KEYS.customLogo));
  const customLogoSize = optionalNumber(readField(source, 'customLogoSize', STORAGE_KEYS.customLogoSize));

  return {
    version: 1,
    exportedAt: optionalString(source.exportedAt) ?? new Date().toISOString(),
    bookmarks: bookmarks as BookmarkItem[],
    settings: stripWallpaperBlurCache(settings),
    searchEngines,
    selectedSearchEngine,
    searchHistory,
    customLogo,
    customLogoSize,
  };
}

export async function restoreBackup(value: unknown, language: Language = 'zh'): Promise<ZenTabBackup> {
  const backup = normalizeBackup(value, language);
  const previousValues = await captureStoredSnapshot([
    STORAGE_KEYS.bookmarks,
    STORAGE_KEYS.settings,
    STORAGE_KEYS.searchEngines,
    STORAGE_KEYS.selectedEngine,
    STORAGE_KEYS.searchHistory,
    STORAGE_KEYS.customLogo,
    STORAGE_KEYS.customLogoSize,
  ]);

  const restoredValues: Record<string, unknown> = {
    [STORAGE_KEYS.bookmarks]: backup.bookmarks,
    [STORAGE_KEYS.settings]: backup.settings,
    [STORAGE_KEYS.searchEngines]: backup.searchEngines,
    [STORAGE_KEYS.selectedEngine]: backup.selectedSearchEngine,
    // Favicon data is derived and can be rebuilt. Writing its current version
    // in the same transaction prevents the background worker racing a version
    // reset while the restored bookmarks begin rendering.
    [STORAGE_KEYS.faviconCache]: {},
    [STORAGE_KEYS.faviconCacheVersion]: 8,
  };
  if (backup.searchHistory !== undefined) restoredValues[STORAGE_KEYS.searchHistory] = backup.searchHistory;
  if (backup.customLogo) restoredValues[STORAGE_KEYS.customLogo] = backup.customLogo;
  if (backup.customLogoSize !== undefined) restoredValues[STORAGE_KEYS.customLogoSize] = backup.customLogoSize;

  try {
    await setStoredValues(restoredValues);
    await Promise.all([
      backup.customLogo ? Promise.resolve() : removeStoredValue(STORAGE_KEYS.customLogo),
      backup.customLogoSize !== undefined
        ? Promise.resolve()
        : removeStoredValue(STORAGE_KEYS.customLogoSize),
    ]);

    const [
      storedBookmarks,
      storedSettings,
      storedSearchEngines,
      storedSelectedEngine,
      storedSearchHistory,
      storedCustomLogo,
      storedCustomLogoSize,
    ] = await Promise.all([
      getStoredValue<BookmarkItem[]>(STORAGE_KEYS.bookmarks),
      getStoredValue<GlobalSettings>(STORAGE_KEYS.settings),
      getStoredValue<SearchEngine[]>(STORAGE_KEYS.searchEngines),
      getStoredValue<string>(STORAGE_KEYS.selectedEngine),
      backup.searchHistory !== undefined
        ? getStoredValue<SearchHistoryEntry[]>(STORAGE_KEYS.searchHistory)
        : Promise.resolve(null),
      getStoredValue<string>(STORAGE_KEYS.customLogo),
      getStoredValue<number>(STORAGE_KEYS.customLogoSize),
    ]);

    const verified = hasSameStoredValue(storedBookmarks, backup.bookmarks)
      && hasSameStoredValue(storedSettings, backup.settings)
      && hasSameStoredValue(storedSearchEngines, backup.searchEngines)
      && storedSelectedEngine === backup.selectedSearchEngine
      && (backup.searchHistory === undefined || hasSameStoredValue(storedSearchHistory, backup.searchHistory))
      && (storedCustomLogo ?? undefined) === backup.customLogo
      && (storedCustomLogoSize ?? undefined) === backup.customLogoSize;

    if (!verified) {
      const detail = language === 'zh'
        ? '恢复后的本地配置校验失败，请重试。'
        : 'The restored local configuration could not be verified. Please try again.';
      throw new Error(`${t(language, 'githubActionFailed')}: ${detail}`);
    }
  } catch (error) {
    try {
      await applyStoredSnapshot(previousValues);
    } catch {
      const originalMessage = error instanceof Error ? error.message : t(language, 'githubActionFailed');
      const rollbackMessage = language === 'zh'
        ? '本地旧配置回滚也失败，请立即使用本地导出备份恢复。'
        : 'Rolling back the previous local configuration also failed. Restore from a local export immediately.';
      throw new Error(`${originalMessage} ${rollbackMessage}`);
    }
    throw error;
  }

  writeSettingsSnapshot(backup.settings);
  localStorage.setItem('zen_favicon_url', backup.settings.faviconUrl ?? '');
  return backup;
}
