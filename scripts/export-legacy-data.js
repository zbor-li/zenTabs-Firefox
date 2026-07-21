/*
 * Zen Tab 1.0.x legacy data exporter.
 *
 * Paste this entire file into the DevTools Console while the installed,
 * official Zen Tab page is still showing the data that you want to recover.
 */
(async () => {
  const DATABASE_NAME = 'localforage';
  const STORE_NAME = 'keyvaluepairs';
  const MISSING = Symbol('missing');
  const STORAGE_KEYS = {
    bookmarks: 'zen_bookmarks',
    settings: 'zen_global_settings',
    searchEngines: 'zen_search_engines',
    selectedSearchEngine: 'zen_search_engine',
    customLogo: 'zen_custom_logo',
    customLogoSize: 'zen_custom_logo_size',
  };

  let database = null;

  const openLegacyDatabase = () => new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }

    let request;
    try {
      request = indexedDB.open(DATABASE_NAME);
    } catch {
      resolve(null);
      return;
    }

    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onsuccess = () => {
      const openedDatabase = request.result;
      if (!openedDatabase.objectStoreNames.contains(STORE_NAME)) {
        openedDatabase.close();
        resolve(null);
        return;
      }
      resolve(openedDatabase);
    };
  });

  const readIndexedDbValue = (key) => new Promise((resolve) => {
    if (!database) {
      resolve(MISSING);
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => finish(request.result === undefined ? MISSING : request.result);
      request.onerror = () => finish(MISSING);
      transaction.onabort = () => finish(MISSING);
    } catch {
      finish(MISSING);
    }
  });

  const readLocalStorageValue = (key) => {
    try {
      const rawValue = localStorage.getItem(key);
      if (rawValue === null) return MISSING;
      try {
        return JSON.parse(rawValue);
      } catch {
        return rawValue;
      }
    } catch {
      return MISSING;
    }
  };

  const readLegacyValue = async (key) => {
    const indexedValue = await readIndexedDbValue(key);
    if (indexedValue !== MISSING && indexedValue !== null) return indexedValue;
    return readLocalStorageValue(key);
  };

  try {
    database = await openLegacyDatabase();

    const [
      bookmarksValue,
      settingsValue,
      searchEnginesValue,
      selectedSearchEngineValue,
      customLogoValue,
      customLogoSizeValue,
    ] = await Promise.all([
      readLegacyValue(STORAGE_KEYS.bookmarks),
      readLegacyValue(STORAGE_KEYS.settings),
      readLegacyValue(STORAGE_KEYS.searchEngines),
      readLegacyValue(STORAGE_KEYS.selectedSearchEngine),
      readLegacyValue(STORAGE_KEYS.customLogo),
      readLegacyValue(STORAGE_KEYS.customLogoSize),
    ]);

    if (!Array.isArray(bookmarksValue)) {
      throw new Error(
        '没有读取到有效的 zen_bookmarks 数组。请确认当前正式版 Zen Tab 页面仍能显示旧网页和文件夹后再运行导出。',
      );
    }
    if (bookmarksValue.length === 0) {
      throw new Error('zen_bookmarks 是空数组，已停止导出，避免用空备份覆盖现有数据。');
    }

    const settings = settingsValue
      && settingsValue !== MISSING
      && typeof settingsValue === 'object'
      && !Array.isArray(settingsValue)
      ? settingsValue
      : {};
    const searchEngines = Array.isArray(searchEnginesValue) ? searchEnginesValue : [];
    const selectedSearchEngine = typeof selectedSearchEngineValue === 'string'
      && selectedSearchEngineValue.trim()
      ? selectedSearchEngineValue
      : (searchEngines[0]?.id || 'google');
    const parsedLogoSize = Number(customLogoSizeValue === MISSING ? NaN : customLogoSizeValue);

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      bookmarks: bookmarksValue,
      settings,
      searchEngines,
      selectedSearchEngine,
    };

    if (typeof customLogoValue === 'string' && customLogoValue) {
      backup.customLogo = customLogoValue;
    }
    if (Number.isFinite(parsedLogoSize) && parsedLogoSize > 0) {
      backup.customLogoSize = parsedLogoSize;
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = objectUrl;
    downloadLink.download = `zen-tab-legacy-backup-${new Date().toISOString().slice(0, 10)}.json`;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    const successMessage = `Zen Tab 导出完成：${bookmarksValue.length} 个主页项目。\n文件名：${downloadLink.download}`;
    console.info(`[Zen Tab] ${successMessage.replace('\n', ' ')}`);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(successMessage);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Zen Tab] 导出失败：${message}`, error);
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(`Zen Tab 旧数据导出失败：\n${message}`);
    }
    throw error;
  } finally {
    database?.close();
  }
})();
