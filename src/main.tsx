import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initializeFaviconCache } from './favicon-bootstrap'
import { getStoredValue, readSettingsSnapshot, setStoredValue, STORAGE_KEYS, writeSettingsSnapshot } from './storage'
import type { BookmarkItem, GlobalSettings } from './types'
import { DEFAULT_SETTINGS, INITIAL_BOOKMARKS, stripWallpaperBlurCache } from './types'
import { applyWallpaperBlurPreview } from './wallpaper'
import './index.css'
import App from './App.tsx'

async function bootstrap() {
  const settingsSnapshot = readSettingsSnapshot<GlobalSettings>()
  if (settingsSnapshot) applyWallpaperBlurPreview(settingsSnapshot.wallpaperBlur ?? 0)

  const [savedBookmarks, savedSettings, customLogo, customLogoSize] = await Promise.all([
    getStoredValue<BookmarkItem[]>(STORAGE_KEYS.bookmarks),
    getStoredValue<GlobalSettings>(STORAGE_KEYS.settings),
    getStoredValue<string>(STORAGE_KEYS.customLogo),
    getStoredValue<number>(STORAGE_KEYS.customLogoSize),
    initializeFaviconCache(),
  ])

  const initialBookmarks = savedBookmarks ?? INITIAL_BOOKMARKS
  const initialSettings = stripWallpaperBlurCache({
    ...DEFAULT_SETTINGS,
    ...settingsSnapshot,
    ...savedSettings,
  })
  applyWallpaperBlurPreview(initialSettings.wallpaperBlur)
  writeSettingsSnapshot(initialSettings)
  localStorage.setItem('zen_favicon_url', initialSettings.faviconUrl ?? '')

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App
        initialBookmarks={initialBookmarks}
        initialSettings={initialSettings}
        initialLogoUrl={customLogo}
        initialLogoSize={customLogoSize}
      />
    </StrictMode>,
  )

  if (!savedBookmarks) setStoredValue(STORAGE_KEYS.bookmarks, initialBookmarks).catch(() => undefined)
  if (!savedSettings) setStoredValue(STORAGE_KEYS.settings, initialSettings).catch(() => undefined)

  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.classList.add('zen-app-ready')
    window.setTimeout(() => document.getElementById('zen-boot-shell')?.remove(), 260)
  }))
}

void bootstrap().catch(() => {
  applyWallpaperBlurPreview(DEFAULT_SETTINGS.wallpaperBlur)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App initialBookmarks={INITIAL_BOOKMARKS} initialSettings={DEFAULT_SETTINGS} />
    </StrictMode>,
  )
  requestAnimationFrame(() => document.documentElement.classList.add('zen-app-ready'))
})
