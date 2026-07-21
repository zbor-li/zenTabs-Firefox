export function normalizeNavigationUrl(value?: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getSiteFaviconUrl(value?: string): string | null {
  try {
    const parsed = new URL(normalizeNavigationUrl(value));
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return new URL('/favicon.ico', parsed.origin).href;
  } catch {
    return null;
  }
}

export function isAutomaticFaviconUrl(value?: string): boolean {
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
