import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { SearchBox } from './components/SearchBox';
import { BookmarkGrid } from './components/BookmarkGrid';
import { FolderModal, type FolderSourceRect } from './components/FolderModal';
import { EditBookmarkModal } from './components/EditBookmarkModal';
import { Logo } from './components/Logo';
import { SettingsModal } from './components/SettingsModal';
import type { BookmarkItem, GlobalSettings } from './types';
import { INITIAL_BOOKMARKS, DEFAULT_SETTINGS, stripWallpaperBlurCache } from './types';
import { setStoredValue, STORAGE_KEYS, writeSettingsSnapshot } from './storage';
import { subscribeToExtensionStorage } from './extensionApi';
import './toolbar.css';
import DEFAULT_LOGO from './assets/logo.png';
import { normalizeNavigationUrl } from './url';
import { applyWallpaperBlurPreview } from './wallpaper';
import { t } from './i18n';
import { playIconLaunchAnimation } from './iconLaunch';

interface AppProps {
  initialBookmarks?: BookmarkItem[];
  initialSettings?: GlobalSettings;
  initialLogoUrl?: string | null;
  initialLogoSize?: number | null;
}

function clampVerticalOffset(value: number): number {
  return Math.min(240, Math.max(-240, Number.isFinite(value) ? value : 0));
}

function App({
  initialBookmarks = INITIAL_BOOKMARKS,
  initialSettings = DEFAULT_SETTINGS,
  initialLogoUrl = null,
  initialLogoSize = null,
}: AppProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(initialBookmarks);
  const [activeFolder, setActiveFolder] = useState<BookmarkItem | null>(null);
  const [folderSourceRect, setFolderSourceRect] = useState<FolderSourceRect | null>(null);
  const [isFolderClosing, setIsFolderClosing] = useState(false);
  const [editingItem, setEditingItem] = useState<BookmarkItem | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [settings, setSettings] = useState<GlobalSettings>(initialSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const openFolder = useCallback((folder: BookmarkItem, sourceRect: FolderSourceRect | null = null) => {
    setFolderSourceRect(sourceRect);
    setIsFolderClosing(false);
    setActiveFolder(folder);
  }, []);

  const clearActiveFolder = useCallback(() => {
    setActiveFolder(null);
    setFolderSourceRect(null);
    setIsFolderClosing(false);
  }, []);

  const closeActiveFolder = useCallback(() => {
    const closedFolderId = activeFolder?.id;
    clearActiveFolder();
    if (!closedFolderId) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const folderItem = Array.from(
          document.querySelectorAll<HTMLElement>('.main-bookmark-grid .bookmark-item'),
        ).find((item) => item.dataset.bookmarkId === closedFolderId);

        if (folderItem) playIconLaunchAnimation(folderItem);
      });
    });
  }, [activeFolder, clearActiveFolder]);

  const openFolderFromSearch = useCallback((folder: BookmarkItem) => {
    openFolder(folder, null);
  }, [openFolder]);

  useEffect(() => subscribeToExtensionStorage((changes, areaName) => {
      if (areaName !== 'local') return;
      const bookmarkChange = changes[STORAGE_KEYS.bookmarks]?.newValue;
      if (Array.isArray(bookmarkChange)) setBookmarks(bookmarkChange as BookmarkItem[]);
      const settingsChange = changes[STORAGE_KEYS.settings]?.newValue;
      if (settingsChange && typeof settingsChange === 'object') {
        const incomingSettings = { ...DEFAULT_SETTINGS, ...settingsChange as GlobalSettings };
        const hasLegacyWallpaperCache = !!(
          incomingSettings.wallpaperBlurSources ||
          incomingSettings.wallpaperBlurSourceVersion ||
          incomingSettings.wallpaperBlurSourceUrl
        );
        const nextSettings = stripWallpaperBlurCache(incomingSettings);
        setSettings(nextSettings);
        writeSettingsSnapshot(nextSettings);
        if (hasLegacyWallpaperCache) {
          setStoredValue(STORAGE_KEYS.settings, nextSettings).catch(() => undefined);
        }
      }
    }), []);

  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = settings.faviconUrl || DEFAULT_LOGO;
  }, [settings.faviconUrl]);

  useLayoutEffect(() => {
    applyWallpaperBlurPreview(settings.wallpaperBlur);
  }, [settings.wallpaperBlur]);

  useEffect(() => {
    document.documentElement.lang = settings.language === 'en' ? 'en' : 'zh-CN';
  }, [settings.language]);

  const handleBookmarksChange = (newBookmarks: BookmarkItem[]) => {
    setBookmarks(newBookmarks);
    setStoredValue(STORAGE_KEYS.bookmarks, newBookmarks).catch(() => undefined);
  };

  const handleSettingsChange = (newSettings: GlobalSettings) => {
    const cleanedSettings = stripWallpaperBlurCache(newSettings);
    const themeChanged = cleanedSettings.iconTheme !== settings.iconTheme;
    const blurChanged = cleanedSettings.iconBlur !== settings.iconBlur;
    const opacityChanged = cleanedSettings.iconOpacity !== settings.iconOpacity;

    if (themeChanged || blurChanged || opacityChanged) {
       const clearStyles = (items: BookmarkItem[]): BookmarkItem[] => {
          return items.map(item => {
             const newItem = { ...item };
             if (themeChanged || opacityChanged) {
                delete newItem.iconTheme;
             }
             if (blurChanged) {
                delete newItem.iconBlur;
             }
             if (newItem.children) {
                newItem.children = clearStyles(newItem.children);
             }
             return newItem;
          });
       };
       const newBookmarks = clearStyles(bookmarks);
       setBookmarks(newBookmarks);
       setStoredValue(STORAGE_KEYS.bookmarks, newBookmarks).catch(() => undefined);
    }

    setSettings(cleanedSettings);
    writeSettingsSnapshot(cleanedSettings);
    localStorage.setItem('zen_favicon_url', cleanedSettings.faviconUrl ?? '');
    setStoredValue(STORAGE_KEYS.settings, cleanedSettings).catch(() => undefined);
  };

  const handleUpdateFolder = (updatedFolder: BookmarkItem) => {
    const newBookmarks = bookmarks.map(b => b.id === updatedFolder.id ? updatedFolder : b);
    handleBookmarksChange(newBookmarks);
    setActiveFolder(updatedFolder);
  };

  const handleOpenLink = (url: string) => {
    window.location.href = normalizeNavigationUrl(url);
  };

  const handleExtractItem = (extractedItem: BookmarkItem, folderId: string) => {
    let newBookmarks = [...bookmarks];
    const folderIndex = newBookmarks.findIndex(f => f.id === folderId);
    if (folderIndex !== -1) {
      const folder = { ...newBookmarks[folderIndex] };
      folder.children = folder.children?.filter(c => c.id !== extractedItem.id) || [];
      if (folder.children.length === 1) {
        const lastItem = folder.children[0];
        newBookmarks.splice(folderIndex, 1, lastItem, extractedItem);
        clearActiveFolder();
      } else if (folder.children.length === 0) {
        newBookmarks.splice(folderIndex, 1, extractedItem);
        clearActiveFolder();
      } else {
        newBookmarks[folderIndex] = folder;
        newBookmarks.push(extractedItem);
        setActiveFolder(folder);
      }
      handleBookmarksChange(newBookmarks);
    }
  };

  const handleDisbandFolder = (folderId: string) => {
    let newBookmarks = [...bookmarks];
    const folderIndex = newBookmarks.findIndex(f => f.id === folderId);
    if (folderIndex !== -1) {
      const folder = newBookmarks[folderIndex];
      const children = folder.children || [];
      newBookmarks.splice(folderIndex, 1, ...children);
      handleBookmarksChange(newBookmarks);
      clearActiveFolder();
    }
  };

  const handleEditSave = (updatedItem: BookmarkItem) => {
    let newBookmarks = [...bookmarks];
    if (isAdding) {
      newBookmarks.push(updatedItem);
      setIsAdding(false);
    } else {
      const rootIndex = newBookmarks.findIndex(i => i.id === updatedItem.id);
      if (rootIndex !== -1) {
        newBookmarks[rootIndex] = updatedItem;
      } else {
        newBookmarks = newBookmarks.map(b => {
          if (b.type === 'folder' && b.children) {
            const childIndex = b.children.findIndex(c => c.id === updatedItem.id);
            if (childIndex !== -1) {
              const newChildren = [...b.children];
              newChildren[childIndex] = updatedItem;
              return { ...b, children: newChildren };
            }
          }
          return b;
        });
        if (activeFolder && activeFolder.children?.some(c => c.id === updatedItem.id)) {
           setActiveFolder(newBookmarks.find(b => b.id === activeFolder.id) || null);
        }
      }
    }
    handleBookmarksChange(newBookmarks);
    setEditingItem(null);
  };

  const handleEditDelete = (id: string) => {
    let newBookmarks = [...bookmarks];
    const rootIndex = newBookmarks.findIndex(i => i.id === id);
    if (rootIndex !== -1) {
      newBookmarks.splice(rootIndex, 1);
    } else {
      newBookmarks = newBookmarks.map(b => {
        if (b.type === 'folder' && b.children) {
          const newChildren = b.children.filter(c => c.id !== id);
          return { ...b, children: newChildren };
        }
        return b;
      }).map(b => {
        if (b.type === 'folder' && b.children?.length === 1) {
            return b.children[0];
        }
        if (b.type === 'folder' && b.children?.length === 0) {
            return null as unknown as BookmarkItem; 
        }
        return b;
      }).filter(Boolean);

      if (activeFolder) {
         const newActive = newBookmarks.find(b => b.id === activeFolder.id);
         if (!newActive || newActive.type !== 'folder') {
            clearActiveFolder();
         } else {
            setActiveFolder(newActive);
         }
      }
    }
    handleBookmarksChange(newBookmarks);
    setEditingItem(null);
  };

  const isNonFolderModalOpen = !!editingItem || isAdding || isSettingsOpen;
  const isAnyModalOpen = !!activeFolder || isNonFolderModalOpen;
  const isFolderVisuallyOpen = !!activeFolder;

  return (
    <>
      {/* Wallpaper layer */}
      {settings.wallpaperUrl && (
        <div aria-hidden="true" style={{
          position: 'fixed',
          top: -50,
          left: -50,
          right: -50,
          bottom: -50,
          backgroundImage: `url(${settings.wallpaperUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(var(--zen-wallpaper-blur, 0px))',
          pointerEvents: 'none',
        }} />
      )}

      {/* Content layer */}
      <div
        className={`home-surface ${isFolderVisuallyOpen ? 'folder-open' : ''} ${isFolderClosing ? 'folder-closing' : ''} ${isNonFolderModalOpen ? 'modal-open' : ''}`}
        style={{
        pointerEvents: isAnyModalOpen ? 'none' : 'auto'
        }}
      >
        {settings.logoVisible && (
          <section className="home-region home-logo-region" style={{ top: `${clampVerticalOffset(settings.logoOffsetY)}px` }}>
            <Logo
              globalSettings={settings}
              initialLogoUrl={initialLogoUrl}
              initialLogoSize={initialLogoSize}
            />
          </section>
        )}
        <section className="home-region home-search-region" style={{ top: `${clampVerticalOffset(settings.searchOffsetY)}px` }}>
          <SearchBox
            bookmarks={bookmarks}
            onFolderOpen={openFolderFromSearch}
            globalSettings={settings}
          />
        </section>
        <section className="home-region home-bookmark-region" style={{ top: `${clampVerticalOffset(settings.bookmarkOffsetY)}px` }}>
          <BookmarkGrid
            items={bookmarks}
            onItemsChange={handleBookmarksChange}
            onFolderClick={openFolder}
            onEditClick={setEditingItem}
            globalSettings={settings}
          />
        </section>
      </div>
      
      {activeFolder && (
        <FolderModal 
          folder={activeFolder} 
          isOpen={!!activeFolder} 
          sourceRect={folderSourceRect}
          onClosing={() => setIsFolderClosing(true)}
          onClose={closeActiveFolder}
          onUpdateFolder={handleUpdateFolder}
          onOpenLink={handleOpenLink}
          onExtractItem={handleExtractItem}
          onDisband={handleDisbandFolder}
          onEditClick={setEditingItem}
          globalSettings={settings}
        />
      )}

      <EditBookmarkModal 
        item={editingItem}
        isOpen={!!editingItem || isAdding}
        onClose={() => { setEditingItem(null); setIsAdding(false); }}
        onSave={handleEditSave}
        onDelete={handleEditDelete}
        globalSettings={settings}
      />

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />
      
      {/* Bottom Toolbar with real blur */}
      <div className={`bottom-toolbar home-toolbar ${isFolderVisuallyOpen ? 'folder-open' : ''} ${isFolderClosing ? 'folder-closing' : ''} ${isNonFolderModalOpen ? 'modal-open' : ''}`} style={{
        borderRadius: '24px',
        position: 'fixed',
        bottom: '24px',
        left: 0,
        right: 0,
        margin: '0 auto',
        width: 'fit-content',
        display: 'flex',
        gap: '16px',
        padding: '12px 24px',
        background: settings.iconTheme === 'transparent' ? 'transparent' : (settings.iconTheme === 'dark' ? `rgba(30, 30, 30, ${settings.iconOpacity ?? 0.8})` : `rgba(255, 255, 255, ${settings.iconOpacity ?? 0.8})`),
        border: settings.iconTheme === 'transparent' ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
        backdropFilter: `blur(${settings.iconBlur + 4}px)`,
        WebkitBackdropFilter: `blur(${settings.iconBlur + 4}px)`,
        pointerEvents: isAnyModalOpen ? 'none' : 'auto'
      }}>
        <button className="toolbar-btn" onClick={() => setIsSettingsOpen(true)} title={t(settings.language, 'globalStyle')} style={{ position: 'relative', zIndex: 1 }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
             <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
             <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{t(settings.language, 'style')}</span>
        </button>
        
        <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)', margin: '0 8px', position: 'relative', zIndex: 1 }}></div>
        
        <button className="toolbar-btn" onClick={() => setIsAdding(true)} title={t(settings.language, 'addBookmark')} style={{ position: 'relative', zIndex: 1 }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span>{t(settings.language, 'add')}</span>
        </button>
      </div>
    </>
  );
}

export default App;
