import { extensionStorageGet } from './extensionApi';

export const FAVICON_CACHE_VERSION = 8;

export type FaviconCacheEntry = {
  src: string;
  quality: number;
  source: 'custom' | 'official' | 'google' | 'fallback' | 'generated';
  updatedAt: number;
};

const FAVICON_CACHE_KEY = 'zen_favicon_cache';
const FAVICON_CACHE_VERSION_KEY = 'zen_favicon_cache_version';
const BOOKMARKS_KEY = 'zen_bookmarks';
const MAX_PREDECODED_FAVICONS = 32;
let bootstrappedFaviconCache: Record<string, FaviconCacheEntry> = {};

const faviconLink = document.createElement('link');
faviconLink.rel = 'icon';
faviconLink.href = localStorage.getItem('zen_favicon_url')
  || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
document.head.appendChild(faviconLink);

function isFaviconCacheEntry(value: unknown): value is FaviconCacheEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<FaviconCacheEntry>;
  return typeof entry.src === 'string'
    && Boolean(entry.src)
    && typeof entry.quality === 'number'
    && Number.isFinite(entry.quality)
    && typeof entry.source === 'string';
}

export function getFaviconSiteCacheKey(value?: string): string | null {
  if (!value?.trim()) return null;
  try {
    const normalized = /^[a-z][a-z\d+.-]*:/i.test(value.trim())
      ? value.trim()
      : `https://${value.trim()}`;
    const parsed = new URL(normalized);
    parsed.hostname = parsed.hostname.replace(/^www\./i, '');
    return `site:${parsed.origin}`;
  } catch {
    return null;
  }
}

export function getGoogleFaviconUrl(value?: string): string | null {
  if (!value?.trim()) return null;
  try {
    const normalized = /^[a-z][a-z\d+.-]*:/i.test(value.trim())
      ? value.trim()
      : `https://${value.trim()}`;
    const parsed = new URL(normalized);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(parsed.origin)}`;
  } catch {
    return null;
  }
}

function collectBookmarkSites(
  value: unknown,
  sites: Map<string, string>,
): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(item => collectBookmarkSites(item, sites));
    return;
  }
  const item = value as { url?: unknown; children?: unknown };
  if (typeof item.url === 'string') {
    const key = getFaviconSiteCacheKey(item.url);
    if (key) sites.set(key, item.url);
  }
  collectBookmarkSites(item.children, sites);
}

function collectBookmarkFaviconSources(
  value: unknown,
  cache: Record<string, FaviconCacheEntry>,
  sources: Set<string>,
): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(item => collectBookmarkFaviconSources(item, cache, sources));
    return;
  }

  const item = value as { url?: unknown; icon?: unknown; iconSource?: unknown; children?: unknown };
  if (typeof item.url === 'string') {
    const key = getFaviconSiteCacheKey(item.url);
    const entry = key ? cache[key] : null;
    if (entry) sources.add(entry.src);
  }

  if (typeof item.icon === 'string' && item.icon) {
    if (item.iconSource === 'custom' && item.icon.startsWith('data:image/')) {
      sources.add(item.icon);
    } else {
      const customEntry = cache[`custom:${item.icon}`];
      if (customEntry) sources.add(customEntry.src);
    }
  }
  collectBookmarkFaviconSources(item.children, cache, sources);
}

function predecodeImage(src: string): Promise<void> {
  return new Promise(resolve => {
    const image = new Image();
    const finish = () => {
      image.onload = null;
      image.onerror = null;
      resolve();
    };
    image.onload = () => {
      if (typeof image.decode !== 'function') {
        finish();
        return;
      }
      image.decode().catch(() => undefined).finally(finish);
    };
    image.onerror = finish;
    image.src = src;
  });
}

export async function initializeFaviconCache(): Promise<void> {
  try {
    const [cache, version, bookmarks] = await Promise.all([
      extensionStorageGet<Record<string, unknown>>(FAVICON_CACHE_KEY),
      extensionStorageGet<number>(FAVICON_CACHE_VERSION_KEY),
      extensionStorageGet<unknown>(BOOKMARKS_KEY),
    ]);
    bootstrappedFaviconCache = version === FAVICON_CACHE_VERSION && cache
      ? Object.fromEntries(
          Object.entries(cache).filter((entry): entry is [string, FaviconCacheEntry] => isFaviconCacheEntry(entry[1])),
        )
      : {};
    const sites = new Map<string, string>();
    collectBookmarkSites(bookmarks, sites);
    for (const [key, pageUrl] of sites) {
      const existing = bootstrappedFaviconCache[key];
      if (existing && existing.quality >= 64 && existing.source !== 'generated') continue;
      const googleUrl = getGoogleFaviconUrl(pageUrl);
      if (!googleUrl) continue;
      bootstrappedFaviconCache[key] = {
        src: googleUrl,
        quality: 128,
        source: 'google',
        updatedAt: 0,
      };
    }
    const sources = new Set<string>();
    collectBookmarkFaviconSources(bookmarks, bootstrappedFaviconCache, sources);
    void Promise.allSettled(
      Array.from(sources).slice(0, MAX_PREDECODED_FAVICONS).map(predecodeImage),
    );
  } catch {
    bootstrappedFaviconCache = {};
  }
}

export function getBootstrappedFavicon(key: string | null): FaviconCacheEntry | null {
  return key ? bootstrappedFaviconCache[key] ?? null : null;
}

export function setBootstrappedFavicon(key: string | null, entry: FaviconCacheEntry): void {
  if (key) bootstrappedFaviconCache[key] = entry;
}
