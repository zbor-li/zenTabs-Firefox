const extensionApi = typeof browser !== 'undefined' ? browser : chrome;
const BOOKMARKS_KEY = 'zen_bookmarks';
const SETTINGS_KEY = 'zen_global_settings';
const FAVICON_CACHE_KEY = 'zen_favicon_cache';
const FAVICON_CACHE_VERSION_KEY = 'zen_favicon_cache_version';
const FAVICON_CACHE_VERSION = 8;
const faviconRequests = new Map();
let cacheWriteQueue = Promise.resolve();
let cacheVersionReady = null;

function normalizePageUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function isAutomaticFaviconUrl(value) {
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return false;
  try {
    const parsed = new URL(value);
    const target = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
    return target.includes('favicon')
      || target.includes('apple-touch-icon')
      || (parsed.hostname.includes('google.') && parsed.pathname.includes('/s2/favicons'))
      || parsed.hostname === 'icons.duckduckgo.com'
      || parsed.hostname === 'favicon.yandex.net';
  } catch {
    return false;
  }
}

function isThirdPartyFaviconServiceUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (parsed.hostname.includes('google.') && parsed.pathname.includes('/s2/favicons'))
      || parsed.hostname === 'icons.duckduckgo.com'
      || parsed.hostname === 'favicon.yandex.net';
  } catch {
    return false;
  }
}

function faviconCacheKey(iconUrl, pageUrl, customIcon = false) {
  if (iconUrl && !iconUrl.startsWith('blob:') && (customIcon || !isAutomaticFaviconUrl(iconUrl))) {
    return `custom:${iconUrl}`;
  }
  const parsed = normalizePageUrl(pageUrl);
  if (parsed) parsed.hostname = parsed.hostname.replace(/^www\./i, '');
  return parsed ? `site:${parsed.origin}` : null;
}

function googleFaviconUrl(parsed) {
  return `https://www.google.com/s2/favicons?sz=256&domain_url=${encodeURIComponent(parsed.origin)}`;
}

function toDataUrl(buffer, contentType) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${contentType || 'image/png'};base64,${btoa(binary)}`;
}

function detectImageType(bytes, declaredType) {
  const type = (declaredType || '').split(';')[0].trim().toLowerCase();
  if (type.startsWith('image/') || type.includes('icon')) return type;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && String.fromCharCode(...bytes.subarray(0, 6)).startsWith('GIF8')) return 'image/gif';
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) return 'image/x-icon';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  const preview = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024))).trimStart();
  if (preview.startsWith('<svg') || (preview.startsWith('<?xml') && preview.includes('<svg'))) return 'image/svg+xml';
  return null;
}

function readEncodedDimensions(bytes, contentType) {
  if (contentType === 'image/svg+xml') return { width: 4096, height: 4096 };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (contentType === 'image/png' && bytes.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if ((contentType === 'image/x-icon' || contentType.includes('icon')) && bytes.length >= 22) {
    const count = view.getUint16(4, true);
    let width = 0;
    let height = 0;
    for (let index = 0; index < count; index += 1) {
      const offset = 6 + index * 16;
      if (offset + 1 >= bytes.length) break;
      width = Math.max(width, bytes[offset] || 256);
      height = Math.max(height, bytes[offset + 1] || 256);
    }
    return width && height ? { width, height } : null;
  }
  if (contentType === 'image/gif' && bytes.length >= 10) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  return null;
}

async function readImageDimensions(buffer, contentType) {
  const encoded = readEncodedDimensions(new Uint8Array(buffer), contentType);
  if (encoded) return encoded;
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(new Blob([buffer], { type: contentType }));
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return null;
  }
}

async function fetchImageDataUrl(url) {
  if (!url || url.startsWith('chrome:') || url.startsWith('moz-extension:') || url.startsWith('blob:')) return null;
  if (url.startsWith('data:image/')) {
    const vector = url.startsWith('data:image/svg+xml');
    return { src: url, quality: vector ? 4096 : 64, vector };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  let response;
  try {
    response = await fetch(url, {
      cache: 'force-cache',
      credentials: 'omit',
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) return null;
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > 2 * 1024 * 1024) return null;
  const bytes = new Uint8Array(buffer);
  const contentType = detectImageType(bytes, response.headers.get('content-type'));
  if (!contentType) return null;
  const dimensions = await readImageDimensions(buffer, contentType);
  if (dimensions && (dimensions.width < 8 || dimensions.height < 8)) return null;
  const vector = contentType === 'image/svg+xml';
  return {
    src: toDataUrl(buffer, contentType),
    quality: dimensions ? Math.min(dimensions.width, dimensions.height) : 0,
    vector,
  };
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[1] || match?.[2] || match?.[3] || '';
}

async function discoverPageIcons(pageUrl) {
  const parsed = normalizePageUrl(pageUrl);
  if (!parsed || !/^https?:$/.test(parsed.protocol)) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(parsed.href, {
      cache: 'force-cache',
      credentials: 'omit',
      headers: { Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('html')) return [];
    const html = (await response.text()).slice(0, 750000);
    const tags = html.match(/<link\b[^>]*>/gi) || [];
    const icons = [];
    for (const tag of tags) {
      const rel = readAttribute(tag, 'rel').toLowerCase();
      if (!rel.includes('icon')) continue;
      const href = readAttribute(tag, 'href').replaceAll('&amp;', '&');
      if (!href) continue;
      try {
        const resolved = new URL(href, response.url || parsed.href).href;
        if (icons.some(icon => icon.url === resolved)) continue;
        const sizes = readAttribute(tag, 'sizes').toLowerCase();
        const type = readAttribute(tag, 'type').toLowerCase();
        const declaredSize = sizes === 'any'
          ? Number.POSITIVE_INFINITY
          : Math.max(0, ...Array.from(sizes.matchAll(/(\d+)\s*x\s*(\d+)/g), match => Math.min(Number(match[1]), Number(match[2]))));
        const isVector = type.includes('svg') || /\.svg(?:[?#]|$)/i.test(resolved) || sizes === 'any';
        const isTouchIcon = rel.includes('apple-touch-icon');
        const isStandardIcon = rel.split(/\s+/).includes('icon');
        icons.push({
          url: resolved,
          highResolution: isVector || declaredSize >= 64 || isTouchIcon,
          score: (isVector ? 100000 : 0) + (isStandardIcon ? 20000 : 0) + (isTouchIcon ? 10000 : 0) + (Number.isFinite(declaredSize) ? declaredSize : 1000),
        });
      } catch {
        // Ignore malformed icon links.
      }
      if (icons.length >= 12) break;
    }
    return icons.sort((left, right) => right.score - left.score);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function createMonogramIcon(label, pageUrl) {
  const parsed = normalizePageUrl(pageUrl);
  const hostname = parsed?.hostname.replace(/^www\./, '') || 'web';
  const text = Array.from((label || hostname).trim())[0]?.toUpperCase() || 'W';
  let hash = 0;
  for (const character of hostname) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 78% 58%)"/><stop offset="1" stop-color="hsl(${(hue + 42) % 360} 72% 42%)"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><text x="32" y="42" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="700" fill="white">${escapeXml(text)}</text></svg>`;
  return toDataUrl(new TextEncoder().encode(svg).buffer, 'image/svg+xml');
}

function createGeneratedCacheEntry(label, pageUrl) {
  return {
    src: createMonogramIcon(label, pageUrl),
    quality: 4096,
    source: 'generated',
    updatedAt: Date.now(),
  };
}

function isFaviconCacheEntry(value) {
  return value
    && typeof value === 'object'
    && typeof value.src === 'string'
    && Boolean(value.src)
    && typeof value.quality === 'number'
    && Number.isFinite(value.quality)
    && typeof value.source === 'string';
}

function ensureFaviconCacheVersion() {
  if (!cacheVersionReady) {
    cacheVersionReady = (async () => {
      const stored = await extensionApi.storage.local.get(FAVICON_CACHE_VERSION_KEY);
      if (stored[FAVICON_CACHE_VERSION_KEY] === FAVICON_CACHE_VERSION) return;
      await extensionApi.storage.local.set({
        [FAVICON_CACHE_KEY]: {},
        [FAVICON_CACHE_VERSION_KEY]: FAVICON_CACHE_VERSION,
      });
    })();
  }
  return cacheVersionReady;
}

async function readFaviconCache() {
  await ensureFaviconCacheVersion();
  const stored = await extensionApi.storage.local.get(FAVICON_CACHE_KEY);
  return stored[FAVICON_CACHE_KEY] && typeof stored[FAVICON_CACHE_KEY] === 'object'
    ? stored[FAVICON_CACHE_KEY]
    : {};
}

function persistCacheEntry(key, value) {
  cacheWriteQueue = cacheWriteQueue.then(async () => {
    const cache = await readFaviconCache();
    cache[key] = value;
    await extensionApi.storage.local.set({
      [FAVICON_CACHE_KEY]: cache,
      [FAVICON_CACHE_VERSION_KEY]: FAVICON_CACHE_VERSION,
    });
  });
  return cacheWriteQueue;
}

function removeCacheEntry(key) {
  cacheWriteQueue = cacheWriteQueue.then(async () => {
    const cache = await readFaviconCache();
    delete cache[key];
    await extensionApi.storage.local.set({ [FAVICON_CACHE_KEY]: cache });
  });
  return cacheWriteQueue;
}

async function resolveFavicon(iconUrl, pageUrl, label, forceRefresh, customIcon = false) {
  const key = faviconCacheKey(iconUrl, pageUrl, customIcon);
  if (key && forceRefresh) await removeCacheEntry(key);
  if (key && !forceRefresh) {
    const cache = await readFaviconCache();
    if (isFaviconCacheEntry(cache[key])) return cache[key];
  }

  const parsed = normalizePageUrl(pageUrl);
  const automaticIconUrl = !customIcon && isAutomaticFaviconUrl(iconUrl);

  if (iconUrl && !iconUrl.startsWith('blob:') && !automaticIconUrl) {
    try {
      const result = await fetchImageDataUrl(iconUrl);
      if (result) {
        const entry = {
          src: result.src,
          quality: result.quality,
          source: 'custom',
          updatedAt: Date.now(),
        };
        if (key) await persistCacheEntry(key, entry);
        return entry;
      }
    } catch {
      // Continue with automatic sources if an explicit remote icon is unavailable.
    }
  }

  const discoveredIcons = await discoverPageIcons(pageUrl);
  const candidates = [];
  if (parsed && /^https?:$/.test(parsed.protocol)) {
    candidates.push(...discoveredIcons.slice(0, 6).map(icon => ({ url: icon.url, source: 'official' })));
    if (automaticIconUrl) {
      candidates.push({
        url: iconUrl,
        source: isThirdPartyFaviconServiceUrl(iconUrl)
          ? (iconUrl.includes('google.') ? 'google' : 'fallback')
          : 'official',
      });
    }
    candidates.push(
      { url: `${parsed.origin}/favicon.png`, source: 'official' },
      { url: `${parsed.origin}/favicon.ico`, source: 'official' },
      { url: googleFaviconUrl(parsed), source: 'google' },
      { url: `https://icons.duckduckgo.com/ip3/${encodeURIComponent(parsed.hostname)}.ico`, source: 'fallback' },
      { url: `https://favicon.yandex.net/favicon/${encodeURIComponent(parsed.hostname)}`, source: 'fallback' },
    );
  }

  const uniqueCandidates = [...new Map(candidates.map(candidate => [candidate.url, candidate])).values()];
  const resolved = (await Promise.all(uniqueCandidates.map(async candidate => {
    try {
      const result = await fetchImageDataUrl(candidate.url);
      return result ? { ...result, source: candidate.source } : null;
    } catch {
      return null;
    }
  }))).filter(Boolean);

  const sourcePriority = { official: 3, google: 2, fallback: 1 };
  const qualityTier = result => {
    if (result.vector) return 4;
    if (result.quality >= 128) return 3;
    if (result.quality >= 64) return 2;
    if (result.quality >= 32) return 1;
    return 0;
  };
  resolved.sort((left, right) => (
    qualityTier(right) - qualityTier(left)
    || sourcePriority[right.source] - sourcePriority[left.source]
    || right.quality - left.quality
  ));

  const best = resolved[0];
  const entry = best && (best.vector || best.quality >= 64)
    ? {
        src: best.src,
        quality: best.quality,
        source: best.source,
        updatedAt: Date.now(),
      }
    : parsed && /^https?:$/.test(parsed.protocol)
      ? {
          src: googleFaviconUrl(parsed),
          quality: 128,
          source: 'google',
          updatedAt: Date.now(),
        }
    : createGeneratedCacheEntry(label, pageUrl);
  if (key) await persistCacheEntry(key, entry);
  return entry;
}

function cacheFavicon(iconUrl, pageUrl, label, forceRefresh = false, customIcon = false) {
  const key = faviconCacheKey(iconUrl, pageUrl, customIcon) || `${pageUrl || ''}:${label || ''}`;
  if (forceRefresh) return resolveFavicon(iconUrl, pageUrl, label, true, customIcon);
  if (faviconRequests.has(key)) return faviconRequests.get(key);
  const request = resolveFavicon(iconUrl, pageUrl, label, false, customIcon)
    .finally(() => faviconRequests.delete(key));
  faviconRequests.set(key, request);
  return request;
}

function containsUrl(items, url) {
  const target = normalizePageUrl(url)?.href;
  if (!target) return false;
  const visit = entries => entries.some(item => (
    normalizePageUrl(item.url)?.href === target
    || (Array.isArray(item.children) && visit(item.children))
  ));
  return visit(items);
}

function showAddBookmarkDialog(options) {
  const normalizeHttpUrl = value => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    const normalized = trimmed.startsWith('//')
      ? `https:${trimmed}`
      : (/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    try {
      const parsed = new URL(normalized);
      return /^https?:$/.test(parsed.protocol) && parsed.hostname ? parsed.href : null;
    } catch {
      return null;
    }
  };
  const dialogId = 'zentab-quick-add-dialog';
  const existing = document.getElementById(dialogId);
  if (existing) {
    existing.shadowRoot?.querySelector('input')?.focus();
    return;
  }

  const host = document.createElement('div');
  host.id = dialogId;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; color-scheme: dark; }
    .overlay { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: rgba(8, 10, 16, .42); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); animation: zentab-overlay-in 180ms ease-out both; }
    .dialog { width: min(420px, calc(100vw - 48px)); padding: 24px; box-sizing: border-box; border: 1px solid rgba(255,255,255,.22); border-radius: 22px; background: linear-gradient(145deg, rgba(36,39,48,.88), rgba(20,22,29,.78)); box-shadow: 0 24px 80px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.12); transform-origin: center; animation: zentab-dialog-in 220ms cubic-bezier(.16,1,.3,1) both; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    h2 { margin: 0 0 8px; color: #fff; font-size: 20px; line-height: 1.3; font-weight: 650; }
    .field + .field { margin-top: 14px; }
    label { display: block; margin-bottom: 7px; color: rgba(255,255,255,.78); font-size: 13px; }
    input { width: 100%; padding: 12px 14px; box-sizing: border-box; border: 1px solid rgba(255,255,255,.18); border-radius: 12px; outline: none; background: rgba(0,0,0,.26); color: #fff; font: 15px system-ui, sans-serif; transition: border-color 150ms ease, box-shadow 150ms ease; }
    input:focus { border-color: rgba(126,189,255,.78); box-shadow: 0 0 0 3px rgba(80,157,255,.18); }
    input[aria-invalid="true"] { border-color: rgba(255,105,105,.88); box-shadow: 0 0 0 3px rgba(255,76,76,.14); }
    .error { min-height: 18px; margin-top: 8px; color: #ff9b9b; font-size: 12px; line-height: 1.5; }
    .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
    button { min-width: 82px; padding: 10px 16px; border-radius: 11px; border: 1px solid rgba(255,255,255,.16); cursor: pointer; font: 600 13px system-ui, sans-serif; }
    button:disabled { cursor: wait; opacity: .58; }
    .cancel { background: rgba(255,255,255,.08); color: rgba(255,255,255,.78); }
    .confirm { border-color: transparent; background: #fff; color: #17191f; }
    .closing { animation: zentab-overlay-out 140ms ease-in both; }
    .closing .dialog { animation: zentab-dialog-out 140ms ease-in both; }
    @keyframes zentab-overlay-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes zentab-overlay-out { from { opacity: 1; } to { opacity: 0; } }
    @keyframes zentab-dialog-in { from { opacity: 0; transform: scale(.78); } to { opacity: 1; transform: scale(1); } }
    @keyframes zentab-dialog-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.82); } }
  `;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const dialog = document.createElement('form');
  dialog.className = 'dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', `${dialogId}-title`);
  const heading = document.createElement('h2');
  heading.id = `${dialogId}-title`;
  heading.textContent = options.heading;
  const nameField = document.createElement('div');
  nameField.className = 'field';
  const nameLabel = document.createElement('label');
  nameLabel.htmlFor = `${dialogId}-name`;
  nameLabel.textContent = options.label;
  const nameInput = document.createElement('input');
  nameInput.id = `${dialogId}-name`;
  nameInput.type = 'text';
  nameInput.value = options.defaultName;
  nameInput.placeholder = options.placeholder;
  nameInput.autocomplete = 'off';
  nameField.append(nameLabel, nameInput);
  const urlField = document.createElement('div');
  urlField.className = 'field';
  const urlLabel = document.createElement('label');
  urlLabel.htmlFor = `${dialogId}-url`;
  urlLabel.textContent = options.urlLabel;
  const urlInput = document.createElement('input');
  urlInput.id = `${dialogId}-url`;
  urlInput.type = 'text';
  urlInput.inputMode = 'url';
  urlInput.value = options.url;
  urlInput.placeholder = options.urlPlaceholder;
  urlInput.autocomplete = 'url';
  urlInput.spellcheck = false;
  urlField.append(urlLabel, urlInput);
  const error = document.createElement('div');
  error.className = 'error';
  error.setAttribute('role', 'status');
  error.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div');
  actions.className = 'actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'cancel';
  cancel.textContent = options.cancel;
  const confirm = document.createElement('button');
  confirm.type = 'submit';
  confirm.className = 'confirm';
  confirm.textContent = options.confirm;
  actions.append(cancel, confirm);
  dialog.append(heading, nameField, urlField, error, actions);
  overlay.append(dialog);
  shadow.append(style, overlay);
  document.documentElement.append(host);

  let closing = false;
  const handleKeydown = event => {
    if (event.key === 'Escape' && host.isConnected) close();
  };
  const close = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', handleKeydown);
    overlay.classList.add('closing');
    window.setTimeout(() => host.remove(), 150);
  };
  cancel.addEventListener('click', close);
  overlay.addEventListener('pointerdown', event => {
    if (event.target === overlay) close();
  });
  const showError = (message, markInvalid = false) => {
    error.textContent = message;
    if (markInvalid) urlInput.setAttribute('aria-invalid', 'true');
    else urlInput.removeAttribute('aria-invalid');
    urlInput.focus();
  };
  urlInput.addEventListener('input', () => {
    error.textContent = '';
    urlInput.removeAttribute('aria-invalid');
  });
  dialog.addEventListener('submit', async event => {
    event.preventDefault();
    const pageUrl = normalizeHttpUrl(urlInput.value);
    if (!pageUrl) {
      showError(options.invalidUrl, true);
      return;
    }
    const title = nameInput.value.trim() || options.defaultName;
    const api = typeof browser !== 'undefined' ? browser : chrome;
    confirm.disabled = true;
    try {
      const result = await Promise.resolve(api.runtime.sendMessage({
        type: 'confirm-add-current-page',
        title,
        pageUrl,
      }));
      if (result?.added) {
        close();
        return;
      }
      showError(
        result?.reason === 'duplicate'
          ? options.duplicateUrl
          : result?.reason === 'invalid-url'
            ? options.invalidUrl
            : options.saveFailed,
        result?.reason === 'invalid-url',
      );
    } catch {
      showError(options.saveFailed);
    } finally {
      confirm.disabled = false;
    }
  });
  document.addEventListener('keydown', handleKeydown);
  window.setTimeout(() => {
    nameInput.focus();
    nameInput.select();
  });
}

async function saveCurrentPage(pageUrl, title) {
  const parsed = normalizePageUrl(pageUrl);
  if (!parsed || !/^https?:$/.test(parsed.protocol)) return { added: false, reason: 'invalid-url' };
  const normalizedUrl = parsed.href;
  const stored = await extensionApi.storage.local.get(BOOKMARKS_KEY);
  const bookmarks = Array.isArray(stored[BOOKMARKS_KEY]) ? stored[BOOKMARKS_KEY] : [];
  if (containsUrl(bookmarks, normalizedUrl)) return { added: false, reason: 'duplicate' };
  bookmarks.push({
    id: `link-${Date.now()}`,
    type: 'link',
    title: title.trim() || parsed.hostname,
    url: normalizedUrl,
    icon: '',
    iconSource: 'auto',
  });
  await extensionApi.storage.local.set({ [BOOKMARKS_KEY]: bookmarks });
  cacheFavicon(undefined, normalizedUrl, title).catch(() => undefined);
  return { added: true };
}

async function openAddCurrentPageDialog(tabFromCommand) {
  const tab = tabFromCommand?.url
    ? tabFromCommand
    : (await extensionApi.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url) || !extensionApi.scripting?.executeScript) return;
  const stored = await extensionApi.storage.local.get(SETTINGS_KEY);
  const language = stored[SETTINGS_KEY]?.language === 'en' ? 'en' : 'zh';
  const defaultName = tab.title || new URL(tab.url).hostname;
  await extensionApi.scripting.executeScript({
    target: { tabId: tab.id },
    func: showAddBookmarkDialog,
    args: [{
      heading: language === 'en' ? 'Add to Zen Tab' : '添加到 Zen Tab',
      label: language === 'en' ? 'Name' : '名称',
      placeholder: language === 'en' ? 'Enter a shortcut name' : '输入快捷方式名称',
      urlLabel: language === 'en' ? 'URL' : '网址',
      urlPlaceholder: language === 'en' ? 'Enter an HTTP or HTTPS URL' : '输入 HTTP 或 HTTPS 网址',
      invalidUrl: language === 'en' ? 'Enter a valid HTTP or HTTPS URL.' : '请输入有效的 HTTP 或 HTTPS 网址。',
      duplicateUrl: language === 'en' ? 'This URL is already on your Zen Tab.' : '该网址已存在于 Zen Tab。',
      saveFailed: language === 'en' ? 'Unable to add this page. Please try again.' : '添加失败，请重试。',
      confirm: language === 'en' ? 'Add' : '添加',
      cancel: language === 'en' ? 'Cancel' : '取消',
      defaultName,
      url: tab.url,
    }],
  });
}

extensionApi.commands.onCommand.addListener((command, tab) => {
  if (command === 'add-current-page') openAddCurrentPageDialog(tab).catch(() => undefined);
});

function handleRuntimeMessage(message, sender) {
  if (message?.type === 'cache-favicon') {
    return cacheFavicon(message.iconUrl, message.pageUrl, message.label, Boolean(message.forceRefresh), Boolean(message.customIcon))
      .then(entry => ({ entry }))
      .catch(() => ({ entry: createGeneratedCacheEntry(message.label, message.pageUrl) }));
  }
  if (message?.type === 'open-shortcut-settings') {
    return extensionApi.tabs.create({ url: 'chrome://extensions/shortcuts' })
      .then(() => ({ ok: true }))
      .catch(() => ({ ok: false }));
  }
  if (message?.type === 'open-add-current-page-dialog') {
    const requestedTab = Number.isInteger(message.tabId)
      ? extensionApi.tabs.get(message.tabId).catch(() => undefined)
      : Promise.resolve(undefined);
    return requestedTab
      .then(tab => openAddCurrentPageDialog(tab))
      .then(() => ({ ok: true }))
      .catch(error => ({ ok: false, error: String(error?.message || error) }));
  }
  if (message?.type === 'confirm-add-current-page') {
    const pageUrl = typeof message.pageUrl === 'string'
      ? message.pageUrl
      : sender?.tab?.url;
    return saveCurrentPage(pageUrl, String(message.title || ''));
  }
  return undefined;
}

if (typeof browser !== 'undefined') {
  extensionApi.runtime.onMessage.addListener((message, sender) => handleRuntimeMessage(message, sender));
} else {
  extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const response = handleRuntimeMessage(message, sender);
    if (!response) return false;
    response.then(sendResponse);
    return true;
  });
}
