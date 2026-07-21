import React, { useEffect, useRef, useState } from 'react';
import type { GlobalSettings } from '../types';
import { GitHubSyncPanel } from './GitHubSyncPanel';
import { ShortcutSettings } from './ShortcutSettings';
import { applyWallpaperBlurPreview, optimizeWallpaperFile } from '../wallpaper';
import { t } from '../i18n';
import { createBackup, restoreBackup } from '../backup';
import { removeStoredValue, STORAGE_KEYS } from '../storage';


interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GlobalSettings;
  onSettingsChange: (settings: GlobalSettings) => void;
}

export function SettingsModal({ isOpen, onClose, settings, onSettingsChange }: SettingsModalProps) {
  const language = settings.language;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const wallpaperBlurInputRef = useRef<HTMLInputElement>(null);
  const wallpaperBlurValueRef = useRef<HTMLSpanElement>(null);
  const wallpaperBlurDraftRef = useRef(settings.wallpaperBlur);
  const blurCommitTimerRef = useRef<number | undefined>(undefined);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingWallpaper, setIsProcessingWallpaper] = useState(false);

  const handleExport = async () => {
    try {
      const backup = await createBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `zen-tab-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`${t(language, 'exportFailed')}${message}`);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (importInputRef.current) importInputRef.current.value = '';
    try {
      await restoreBackup(JSON.parse(await file.text()) as unknown, language);
      window.alert(t(language, 'importSuccess'));
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`${t(language, 'importFailed')}${message}`);
    }
  };

  useEffect(() => {
    wallpaperBlurDraftRef.current = settings.wallpaperBlur;
    if (wallpaperBlurInputRef.current) wallpaperBlurInputRef.current.value = String(settings.wallpaperBlur);
    if (wallpaperBlurValueRef.current) wallpaperBlurValueRef.current.textContent = `${settings.wallpaperBlur}px`;
    applyWallpaperBlurPreview(settings.wallpaperBlur);
  }, [settings.wallpaperBlur]);

  useEffect(() => () => {
    if (blurCommitTimerRef.current !== undefined) {
      window.clearTimeout(blurCommitTimerRef.current);
    }
  }, []);

  if (!isOpen) return null;

  const effectiveSearchBoxWidth = Math.min(1000, Math.max(320, settings.searchBoxWidth));
  const effectiveSearchBoxHeight = Math.min(96, Math.max(48, settings.searchBoxHeight));
  const maximumSearchEngineIconSize = Math.min(48, effectiveSearchBoxHeight - 16);
  const effectiveSearchEngineIconSize = Math.min(
    maximumSearchEngineIconSize,
    Math.max(16, settings.searchEngineIconSize),
  );
  const effectiveLogoOffsetY = Math.min(240, Math.max(-240, settings.logoOffsetY));
  const effectiveSearchOffsetY = Math.min(240, Math.max(-240, settings.searchOffsetY));
  const effectiveBookmarkOffsetY = Math.min(240, Math.max(-240, settings.bookmarkOffsetY));

  const handleWallpaperChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessingWallpaper(true);
      try {
        const optimizedWallpaper = await optimizeWallpaperFile(file);
        onSettingsChange({ ...settings, ...optimizedWallpaper });
      } catch (error) {
        window.alert(error instanceof Error ? error.message : t(language, 'wallpaperProcessFailed'));
      } finally {
        setIsProcessingWallpaper(false);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const commitWallpaperBlur = (value: number) => {
    if (blurCommitTimerRef.current !== undefined) {
      window.clearTimeout(blurCommitTimerRef.current);
      blurCommitTimerRef.current = undefined;
    }
    if (value !== settings.wallpaperBlur) {
      onSettingsChange({ ...settings, wallpaperBlur: value });
    }
  };

  const handleWallpaperBlurInput = (e: React.FormEvent<HTMLInputElement>) => {
    const value = Number(e.currentTarget.value);
    wallpaperBlurDraftRef.current = value;
    if (wallpaperBlurValueRef.current) wallpaperBlurValueRef.current.textContent = `${value}px`;
    applyWallpaperBlurPreview(value);
    if (blurCommitTimerRef.current !== undefined) {
      window.clearTimeout(blurCommitTimerRef.current);
    }
    blurCommitTimerRef.current = window.setTimeout(() => commitWallpaperBlur(value), 180);
  };

  const handleClose = () => {
    commitWallpaperBlur(wallpaperBlurDraftRef.current);
    onClose();
  };

  const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        onSettingsChange({ ...settings, faviconUrl: base64 });
      };
      reader.readAsDataURL(file);
    }
    if (faviconInputRef.current) faviconInputRef.current.value = '';
  };

  const handleClearSearchHistory = async () => {
    await removeStoredValue(STORAGE_KEYS.searchHistory);
    window.dispatchEvent(new Event('zentab-search-history-cleared'));
    window.alert(t(language, 'searchHistoryCleared'));
  };

  return (
    <div className="modal-overlay active" onClick={handleClose} style={{ zIndex: 200 }}>
      <div 
        className="modal-content glass-panel" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: '400px', 
          minHeight: 'auto', 
          position: 'relative',
          background: 'rgba(30, 30, 30, 0.55)',
          backdropFilter: `blur(${settings.iconBlur + 10}px)`,
          WebkitBackdropFilter: `blur(${settings.iconBlur + 10}px)`,
          maxHeight: '82vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="modal-header">
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>{t(language, 'globalStyle')}</h2>
            <button className="close-btn" onClick={handleClose} title={t(language, 'close')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', textAlign: 'left' }}>{t(language, 'language')}</label>
              <div className="language-switch" role="group" aria-label={t(language, 'language')}>
                <button type="button" aria-pressed={language === 'zh'} className={language === 'zh' ? 'active' : ''} onClick={() => onSettingsChange({ ...settings, language: 'zh' })}>{t(language, 'chinese')}</button>
                <button type="button" aria-pressed={language === 'en'} className={language === 'en' ? 'active' : ''} onClick={() => onSettingsChange({ ...settings, language: 'en' })}>{t(language, 'english')}</button>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">{t(language, 'homeLayout')}</div>
              <p className="settings-help">{t(language, 'homeLayoutHelp')}</p>
              <label className="settings-toggle">
                <span><strong>{t(language, 'showLogo')}</strong></span>
                <input
                  type="checkbox"
                  checked={settings.logoVisible}
                  onChange={event => onSettingsChange({ ...settings, logoVisible: event.target.checked })}
                />
                <span className="settings-toggle-track" aria-hidden="true" />
              </label>

              <label className="settings-range-label">
                <span>{t(language, 'logoVerticalPosition')}</span>
                <output>{effectiveLogoOffsetY}px</output>
              </label>
              <input
                aria-label={t(language, 'logoVerticalPosition')}
                type="range"
                min="-240"
                max="240"
                step="4"
                value={effectiveLogoOffsetY}
                onChange={event => onSettingsChange({ ...settings, logoOffsetY: Number(event.target.value) })}
              />

              <label className="settings-range-label">
                <span>{t(language, 'searchVerticalPosition')}</span>
                <output>{effectiveSearchOffsetY}px</output>
              </label>
              <input
                aria-label={t(language, 'searchVerticalPosition')}
                type="range"
                min="-240"
                max="240"
                step="4"
                value={effectiveSearchOffsetY}
                onChange={event => onSettingsChange({ ...settings, searchOffsetY: Number(event.target.value) })}
              />

              <label className="settings-range-label">
                <span>{t(language, 'bookmarkVerticalPosition')}</span>
                <output>{effectiveBookmarkOffsetY}px</output>
              </label>
              <input
                aria-label={t(language, 'bookmarkVerticalPosition')}
                type="range"
                min="-240"
                max="240"
                step="4"
                value={effectiveBookmarkOffsetY}
                onChange={event => onSettingsChange({ ...settings, bookmarkOffsetY: Number(event.target.value) })}
              />
            </div>

            <div className="settings-section">
              <div className="settings-section-title">{t(language, 'searchBoxSettings')}</div>
              <label className="settings-toggle">
                <span>
                  <strong>{t(language, 'searchSuggestions')}</strong>
                  <small>{t(language, 'searchSuggestionsHelp')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings.searchSuggestionsEnabled}
                  onChange={event => onSettingsChange({ ...settings, searchSuggestionsEnabled: event.target.checked })}
                />
                <span className="settings-toggle-track" aria-hidden="true" />
              </label>

              <label className="settings-range-label">
                <span>{t(language, 'searchBoxWidth')}</span>
                <output>{effectiveSearchBoxWidth}px</output>
              </label>
              <input
                aria-label={t(language, 'searchBoxWidth')}
                type="range"
                min="320"
                max="1000"
                step="20"
                value={effectiveSearchBoxWidth}
                onChange={event => onSettingsChange({ ...settings, searchBoxWidth: Number(event.target.value) })}
              />

              <label className="settings-range-label">
                <span>{t(language, 'searchBoxHeight')}</span>
                <output>{effectiveSearchBoxHeight}px</output>
              </label>
              <input
                aria-label={t(language, 'searchBoxHeight')}
                type="range"
                min="48"
                max="96"
                step="2"
                value={effectiveSearchBoxHeight}
                onChange={event => {
                  const searchBoxHeight = Number(event.target.value);
                  onSettingsChange({
                    ...settings,
                    searchBoxHeight,
                    searchEngineIconSize: Math.min(effectiveSearchEngineIconSize, searchBoxHeight - 16),
                  });
                }}
              />

              <label className="settings-range-label">
                <span>{t(language, 'searchEngineIconSize')}</span>
                <output>{effectiveSearchEngineIconSize}px</output>
              </label>
              <input
                aria-label={t(language, 'searchEngineIconSize')}
                type="range"
                min="16"
                max={maximumSearchEngineIconSize}
                step="2"
                value={effectiveSearchEngineIconSize}
                onChange={event => onSettingsChange({ ...settings, searchEngineIconSize: Number(event.target.value) })}
              />

              <button type="button" className="wide-settings-button settings-clear-button" onClick={handleClearSearchHistory}>
                {t(language, 'clearSearchHistory')}
              </button>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', textAlign: 'left' }}>{t(language, 'defaultIconStyle')}</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'white', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="radio" checked={settings.iconTheme === 'light'} onChange={() => onSettingsChange({ ...settings, iconTheme: 'light' })} /> {t(language, 'light')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'white', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="radio" checked={settings.iconTheme === 'dark'} onChange={() => onSettingsChange({ ...settings, iconTheme: 'dark' })} /> {t(language, 'dark')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'white', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input type="radio" checked={settings.iconTheme === 'transparent'} onChange={() => onSettingsChange({ ...settings, iconTheme: 'transparent' })} /> {t(language, 'transparent')}
                </label>
              </div>
            </div>

            <div>
               <label style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '4px' }}>
                 <span>{t(language, 'defaultIconBlur')}</span>
                 <span>{settings.iconBlur}px</span>
               </label>
               <input type="range" min="0" max="40" value={settings.iconBlur} onChange={e => onSettingsChange({ ...settings, iconBlur: parseInt(e.target.value) })} style={{ width: '100%' }} />
            </div>

            <div>
               <label style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '4px' }}>
                 <span>{t(language, 'defaultIconOpacity')}</span>
                 <span>{Math.round(settings.iconOpacity * 100)}%</span>
               </label>
               <input type="range" min="0" max="100" value={settings.iconOpacity * 100} onChange={e => onSettingsChange({ ...settings, iconOpacity: parseInt(e.target.value) / 100 })} style={{ width: '100%' }} />
            </div>

            <div>
               <label style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '4px' }}>
                 <span>{t(language, 'iconContainerSize')}</span>
                 <span>{settings.iconSize || 56}px</span>
               </label>
               <input type="range" min="40" max="120" value={settings.iconSize || 56} onChange={e => onSettingsChange({ ...settings, iconSize: parseInt(e.target.value) })} style={{ width: '100%' }} />
            </div>

            <div>
               <label style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '4px' }}>
                 <span>{t(language, 'iconsPerRow')}</span>
                 <span>{settings.iconsPerRow || 6}</span>
               </label>
               <input type="range" min="3" max="10" value={settings.iconsPerRow || 6} onChange={e => onSettingsChange({ ...settings, iconsPerRow: parseInt(e.target.value) })} style={{ width: '100%' }} />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

            <div>
               <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', textAlign: 'left' }}>{t(language, 'wallpaper')}</label>
               <div style={{ display: 'flex', gap: '8px' }}>
                 <button disabled={isProcessingWallpaper} onClick={() => fileInputRef.current?.click()} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', cursor: isProcessingWallpaper ? 'wait' : 'pointer', opacity: isProcessingWallpaper ? 0.65 : 1 }}>{isProcessingWallpaper ? t(language, 'optimizing') : t(language, 'selectImage')}</button>
                 {settings.wallpaperUrl && (
                   <button onClick={() => onSettingsChange({ ...settings, wallpaperUrl: undefined, wallpaperBlur: 0 })} style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', cursor: 'pointer' }}>{t(language, 'remove')}</button>
                 )}
               </div>
               <input type="file" accept="image/*" style={{ display: 'none' }} ref={fileInputRef} onChange={handleWallpaperChange} />
            </div>

            {settings.wallpaperUrl && (
              <div>
                 <label style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '4px' }}>
                   <span>{t(language, 'wallpaperBlur')}</span>
                   <span ref={wallpaperBlurValueRef}>{settings.wallpaperBlur}px</span>
                 </label>
                 <input
                   aria-label={t(language, 'wallpaperBlur')}
                   type="range"
                   min="0"
                   max="60"
                   defaultValue={settings.wallpaperBlur}
                   ref={wallpaperBlurInputRef}
                   onInput={handleWallpaperBlurInput}
                   onPointerUp={e => commitWallpaperBlur(Number(e.currentTarget.value))}
                   onKeyUp={e => commitWallpaperBlur(Number(e.currentTarget.value))}
                   onBlur={e => commitWallpaperBlur(Number(e.currentTarget.value))}
                   style={{ width: '100%' }}
                 />
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

            <div>
               <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', textAlign: 'left' }}>{t(language, 'browserTabIcon')}</label>
               <div style={{ display: 'flex', gap: '8px' }}>
                 <button onClick={() => faviconInputRef.current?.click()} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}>{t(language, 'selectCustomIcon')}</button>
                 {settings.faviconUrl && (
                   <button onClick={() => onSettingsChange({ ...settings, faviconUrl: undefined })} style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', cursor: 'pointer' }}>{t(language, 'reset')}</button>
                 )}
               </div>
               <input type="file" accept="image/*" style={{ display: 'none' }} ref={faviconInputRef} onChange={handleFaviconChange} />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

            <div>
               <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', textAlign: 'left' }}>{t(language, 'dataBackup')}</label>
               <div style={{ display: 'flex', gap: '8px' }}>
                 <button onClick={handleExport} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}>{t(language, 'exportData')}</button>
                 <button onClick={() => importInputRef.current?.click()} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}>{t(language, 'importData')}</button>
               </div>
               <input type="file" accept=".json" style={{ display: 'none' }} ref={importInputRef} onChange={handleImport} />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

            <ShortcutSettings language={language} />

            <GitHubSyncPanel language={language} />

          </div>
        </div>
      </div>
    </div>
  );
}
