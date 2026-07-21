import GOOGLE_SEARCH_ICON from './assets/search-engines/google.png';
import BING_SEARCH_ICON from './assets/search-engines/bing.png';
import DUCKDUCKGO_SEARCH_ICON from './assets/search-engines/duckduckgo.svg';
import BAIDU_SEARCH_ICON from './assets/search-engines/baidu.png';
import BILIBILI_SEARCH_ICON from './assets/search-engines/bilibili.svg';
import type { Language } from './i18n';

export type BookmarkItem = {
  id: string;
  type: 'link' | 'folder';
  title: string;
  url?: string;
  icon?: string;
  iconSource?: 'auto' | 'custom';
  iconTheme?: 'light' | 'dark' | 'transparent';
  iconBlur?: number; // New property for individual icon blur
  children?: BookmarkItem[];
};

export type GlobalSettings = {
  wallpaperUrl?: string;
  wallpaperBlurSources?: Record<string, string>;
  wallpaperBlurSourceVersion?: number;
  /** Kept only so development builds can migrate the earlier single-proxy format. */
  wallpaperBlurSourceUrl?: string;
  wallpaperBlur: number;
  iconTheme: 'light' | 'dark' | 'transparent';
  iconBlur: number;
  iconOpacity: number;
  iconSize: number;
  iconsPerRow: number;
  logoVisible: boolean;
  logoOffsetY: number;
  searchOffsetY: number;
  bookmarkOffsetY: number;
  searchSuggestionsEnabled: boolean;
  searchBoxWidth: number;
  searchBoxHeight: number;
  searchEngineIconSize: number;
  language: Language;
  faviconUrl?: string;
};

export const DEFAULT_SETTINGS: GlobalSettings = {
  wallpaperUrl: '',
  wallpaperBlur: 0,
  iconTheme: 'light',
  iconBlur: 16,
  iconOpacity: 0.3,
  iconSize: 56,
  iconsPerRow: 6,
  logoVisible: true,
  logoOffsetY: 0,
  searchOffsetY: 0,
  bookmarkOffsetY: 0,
  searchSuggestionsEnabled: true,
  searchBoxWidth: 600,
  searchBoxHeight: 68,
  searchEngineIconSize: 30,
  language: 'zh',
};

export function stripWallpaperBlurCache(settings: GlobalSettings): GlobalSettings {
  const cleaned = { ...settings };
  delete cleaned.wallpaperBlurSources;
  delete cleaned.wallpaperBlurSourceVersion;
  delete cleaned.wallpaperBlurSourceUrl;
  return cleaned;
}

export type ZenTabBackup = {
  version: 1;
  exportedAt: string;
  bookmarks: BookmarkItem[];
  settings: GlobalSettings;
  searchEngines: SearchEngine[];
  selectedSearchEngine: string;
  searchHistory?: SearchHistoryEntry[];
  customLogo?: string;
  customLogoSize?: number;
};

export type SearchHistoryEntry = {
  query: string;
  normalizedQuery: string;
  engineId: string;
  useCount: number;
  lastUsedAt: number;
};
export type SearchEngine = {
  id: string;
  name: string;
  url: string; // The search query URL, e.g., "https://www.google.com/search?q="
  iconUrl: string;
};

export const DEFAULT_ENGINES: SearchEngine[] = [
  {
    id: 'google',
    name: 'Google',
    url: 'https://www.google.com/search?q=',
    iconUrl: GOOGLE_SEARCH_ICON
  },
  {
    id: 'bing',
    name: 'Bing',
    url: 'https://www.bing.com/search?q=',
    iconUrl: BING_SEARCH_ICON
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    url: 'https://duckduckgo.com/?q=',
    iconUrl: DUCKDUCKGO_SEARCH_ICON
  },
  {
    id: 'baidu',
    name: 'Baidu',
    url: 'https://www.baidu.com/s?wd=',
    iconUrl: BAIDU_SEARCH_ICON
  },
  {
    id: 'bilibili',
    name: 'Bilibili',
    url: 'https://search.bilibili.com/all?keyword=',
    iconUrl: BILIBILI_SEARCH_ICON
  }
];

export const INITIAL_BOOKMARKS: BookmarkItem[] = [
  { id: '1', type: 'link', title: 'YouTube', url: 'https://youtube.com', icon: '' },
  { id: '2', type: 'link', title: 'GitHub', url: 'https://github.com', icon: '' },
  { id: '3', type: 'link', title: 'Bilibili', url: 'https://bilibili.com', icon: '' },
  { 
    id: '4', 
    type: 'folder', 
    title: 'Social & News', 
    children: [
      { id: '4-1', type: 'link', title: 'X (Twitter)', url: 'https://x.com', icon: '' },
      { id: '4-2', type: 'link', title: 'Reddit', url: 'https://reddit.com', icon: '' },
      { id: '4-3', type: 'link', title: 'Hacker News', url: 'https://news.ycombinator.com', icon: '' }
    ]
  },
  { id: '5', type: 'link', title: 'Vite', url: 'https://vitejs.dev', icon: '' },
];
