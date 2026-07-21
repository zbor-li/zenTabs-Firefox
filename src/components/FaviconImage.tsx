import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { sendExtensionMessage } from '../extensionApi';
import {
  getBootstrappedFavicon,
  getFaviconSiteCacheKey,
  setBootstrappedFavicon,
  type FaviconCacheEntry,
} from '../favicon-bootstrap';
import { isAutomaticFaviconUrl } from '../url';

interface FaviconImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  icon?: string;
  url?: string;
  iconSource?: 'auto' | 'custom';
}

type CacheResponse = {
  entry?: FaviconCacheEntry;
};

const DEFAULT_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjEwIj48L2NpcmNsZT48L3N2Zz4=';

function normalizePageUrl(value?: string): URL | null {
  if (!value?.trim()) return null;
  try {
    return new URL(/^[a-z][a-z\d+.-]*:/i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
  } catch {
    return null;
  }
}

function isLegacyAutoRasterIcon(icon?: string, iconSource?: 'auto' | 'custom'): boolean {
  return iconSource !== 'custom'
    && Boolean(icon && /^data:image\/(?!svg\+xml)/i.test(icon) && icon.length < 200000);
}

function isCustomIcon(icon?: string, iconSource?: 'auto' | 'custom'): boolean {
  if (!icon || iconSource === 'auto') return false;
  if (iconSource === 'custom') return true;
  return !isAutomaticFaviconUrl(icon) && !isLegacyAutoRasterIcon(icon, iconSource);
}

function cacheKey(icon: string | undefined, url: string | undefined, customIcon: boolean): string | null {
  if (icon?.startsWith('data:image/')) return null;
  if (icon && customIcon && !icon.startsWith('blob:')) return `custom:${icon}`;
  return getFaviconSiteCacheKey(url);
}

function readImageQuality(src: string): Promise<number> {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(Math.min(image.naturalWidth, image.naturalHeight));
    image.onerror = () => resolve(0);
    image.src = src;
  });
}

function createMonogramIcon(label?: string, url?: string): string {
  const parsed = normalizePageUrl(url);
  const hostname = parsed?.hostname.replace(/^www\./, '') || 'web';
  const text = Array.from((label || hostname).trim())[0]?.toUpperCase() || 'W';
  let hash = 0;
  for (const character of hostname) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  const safeText = text.replace(/[&<>"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="hsl(${hue} 70% 48%)"/><text x="32" y="42" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="700" fill="white">${safeText}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function FaviconImage({ icon, url, iconSource, alt, ...props }: FaviconImageProps) {
  const customIcon = useMemo(() => isCustomIcon(icon, iconSource), [icon, iconSource]);
  const stableKey = useMemo(() => cacheKey(icon, url, customIcon), [customIcon, icon, url]);
  const embeddedIcon = customIcon && icon?.startsWith('data:image/') ? icon : null;
  const label = typeof alt === 'string' ? alt : undefined;
  const stableFallback = useMemo(
    () => (url || label ? createMonogramIcon(label, url) : DEFAULT_SVG),
    [label, url],
  );
  const initialEntry = useMemo(() => getBootstrappedFavicon(stableKey), [stableKey]);
  const [src, setSrc] = useState<string>(embeddedIcon ?? initialEntry?.src ?? stableFallback);
  const repairingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    repairingRef.current = false;
    if (embeddedIcon) {
      setSrc(embeddedIcon);
      return () => { cancelled = true; };
    }

    const cachedEntry = getBootstrappedFavicon(stableKey);
    setSrc(cachedEntry?.src ?? stableFallback);

    const resolveIcon = async () => {
      if (cachedEntry && cachedEntry.updatedAt > 0 && (customIcon || (cachedEntry.quality >= 64 && cachedEntry.source !== 'generated'))) return;
      const result = await sendExtensionMessage<CacheResponse>({
        type: 'cache-favicon',
        iconUrl: customIcon ? icon : undefined,
        pageUrl: url,
        label,
        customIcon,
        forceRefresh: Boolean(cachedEntry && (cachedEntry.quality < 64 || cachedEntry.source === 'generated')),
      }).catch(() => null);
      if (cancelled || !result?.entry?.src) return;
      const actualQuality = await readImageQuality(result.entry.src);
      const effectiveQuality = Math.max(result.entry.quality, actualQuality);
      if (effectiveQuality < (customIcon ? 8 : 32) || cancelled) return;
      const verifiedEntry = { ...result.entry, quality: effectiveQuality };
      setBootstrappedFavicon(stableKey, verifiedEntry);
      setSrc(verifiedEntry.src);
    };

    resolveIcon().catch(() => {
      if (!cancelled) setSrc(getBootstrappedFavicon(stableKey)?.src ?? stableFallback);
    });
    return () => { cancelled = true; };
  }, [customIcon, embeddedIcon, icon, label, stableFallback, stableKey, url]);

  const handleError = () => {
    if (repairingRef.current) {
      setSrc(stableFallback);
      return;
    }
    repairingRef.current = true;
    setSrc(stableFallback);
    sendExtensionMessage<CacheResponse>({
      type: 'cache-favicon',
      iconUrl: customIcon && !icon?.startsWith('data:') && !icon?.startsWith('blob:') ? icon : undefined,
      pageUrl: url,
      label,
      forceRefresh: true,
      customIcon,
    }).then(async result => {
      if (!result?.entry?.src) return;
      const actualQuality = await readImageQuality(result.entry.src);
      const effectiveQuality = Math.max(result.entry.quality, actualQuality);
      if (effectiveQuality < (customIcon ? 8 : 32)) return;
      const verifiedEntry = { ...result.entry, quality: effectiveQuality };
      setBootstrappedFavicon(stableKey, verifiedEntry);
      setSrc(verifiedEntry.src);
    }).catch(() => setSrc(stableFallback));
  };

  return <img src={src} alt={alt} onError={handleError} {...props} />;
}
