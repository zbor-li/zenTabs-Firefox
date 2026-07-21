import React, { useState, useEffect, useRef } from 'react';
import type { BookmarkItem, GlobalSettings } from '../types';
import { getSiteFaviconUrl, isAutomaticFaviconUrl, normalizeNavigationUrl } from '../url';
import { t } from '../i18n';
import { FaviconImage } from './FaviconImage';


interface EditBookmarkModalProps {
  item: BookmarkItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: BookmarkItem) => void;
  onDelete: (id: string) => void;
  globalSettings: GlobalSettings;
}

type IconChoice = 'auto' | 'site' | 'custom';
const MAX_LOCAL_ICON_BYTES = 5 * 1024 * 1024;
const MAX_LOCAL_ICON_DIMENSION = 256;

function readLocalIcon(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('read-failed'));
    reader.readAsDataURL(file);
  });
}

function decodeLocalIcon(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('decode-failed'));
    image.src = source;
  });
}

async function optimizeLocalIcon(file: File): Promise<string> {
  const source = await readLocalIcon(file);
  const image = await decodeLocalIcon(source);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('decode-failed');

  const scale = Math.min(1, MAX_LOCAL_ICON_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas-unavailable');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  const optimized = canvas.toDataURL('image/webp', 0.92);
  if (!optimized.startsWith('data:image/')) throw new Error('encode-failed');
  return optimized;
}

function inferIconChoice(item: BookmarkItem | null, pageUrl: string): IconChoice {
  if (!item?.icon || item.iconSource === 'auto') return 'auto';
  if (item.icon === getSiteFaviconUrl(pageUrl)) return 'site';
  if (item.iconSource !== 'custom' && (
    isAutomaticFaviconUrl(item.icon)
    || (/^data:image\/(?!svg\+xml)/i.test(item.icon) && item.icon.length < 200000)
  )) return 'auto';
  return 'custom';
}

export function EditBookmarkModal({ item, isOpen, onClose, onSave, onDelete, globalSettings }: EditBookmarkModalProps) {
  const language = globalSettings.language;
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewIcon, setPreviewIcon] = useState('');
  const [iconChoice, setIconChoice] = useState<IconChoice>('auto');
  const [iconError, setIconError] = useState('');
  const [iconTheme, setIconTheme] = useState<'light' | 'dark' | 'transparent'>('light');
  const [iconBlur, setIconBlur] = useState<number>(16);
  const localIconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
      const nextUrl = item.url || '';
      setTitle(item.title || '');
      setUrl(nextUrl);
      setIcon(item.icon || '');
      setPreviewUrl(nextUrl);
      setPreviewIcon(item.icon || '');
      setIconChoice(inferIconChoice(item, nextUrl));
      setIconTheme(item.iconTheme || globalSettings.iconTheme);
      setIconBlur(item.iconBlur ?? globalSettings.iconBlur);
    } else {
      setTitle('');
      setUrl('https://');
      setIcon('');
      setPreviewUrl('https://');
      setPreviewIcon('');
      setIconChoice('auto');
      setIconTheme(globalSettings.iconTheme);
      setIconBlur(globalSettings.iconBlur);
    }
    setIconError('');
  }, [item, globalSettings]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      setPreviewUrl(url);
      setPreviewIcon(icon);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [icon, isOpen, url]);

  if (!isOpen) return null;
  const isAdding = !item;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let resolvedIcon = icon.trim();
    let resolvedIconSource: 'auto' | 'custom' = resolvedIcon ? 'custom' : 'auto';
    if (iconChoice === 'auto') {
      resolvedIcon = '';
      resolvedIconSource = 'auto';
    } else if (iconChoice === 'site') {
      const siteFavicon = getSiteFaviconUrl(url);
      if (!siteFavicon) {
        setIconError(t(language, 'siteFaviconUnavailable'));
        return;
      }
      resolvedIcon = siteFavicon;
      resolvedIconSource = 'custom';
    } else if (!resolvedIcon) {
      setIconError(t(language, 'customIconRequired'));
      return;
    }

    const newItem: BookmarkItem = {
      id: item?.id || `link-${Date.now()}`,
      type: item?.type || 'link',
      title: title || t(language, 'newLink'),
      url: item?.type === 'folder' ? item.url : normalizeNavigationUrl(url),
      icon: resolvedIcon,
      iconSource: resolvedIconSource,
      children: item?.children,
    };

    if (!isAdding) {
      newItem.iconTheme = iconTheme;
      newItem.iconBlur = iconBlur;
    }

    onSave(newItem);
  };

  const handleLocalIconChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setIconError('');
    if (!file.type.startsWith('image/')) {
      setIconError(t(language, 'localIconInvalid'));
      return;
    }
    if (file.size > MAX_LOCAL_ICON_BYTES) {
      setIconError(t(language, 'localIconTooLarge'));
      return;
    }
    try {
      const localIcon = await optimizeLocalIcon(file);
      setIcon(localIcon);
      setPreviewIcon(localIcon);
      setIconChoice('custom');
    } catch {
      setIconError(t(language, 'localIconInvalid'));
    }
  };

  return (
    <div className={`modal-overlay ${isOpen ? 'active' : ''}`} onClick={onClose} style={{ zIndex: 200 }}>
      <div 
        className="modal-content glass-panel" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: '400px', 
          minHeight: 'auto', 
          position: 'relative',
          background: 'rgba(30, 30, 30, 0.55)',
          backdropFilter: `blur(${globalSettings.iconBlur + 10}px)`,
          WebkitBackdropFilter: `blur(${globalSettings.iconBlur + 10}px)`,
        }}
      >
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="modal-header">
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>{isAdding ? t(language, 'addShortcut') : t(language, 'editShortcut')}</h2>
            <button className="close-btn" onClick={onClose} type="button" title={t(language, 'close')}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', textAlign: 'left' }}>{t(language, 'title')}</label>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', boxSizing: 'border-box' }}
                autoFocus
              />
            </div>
            
            {(!item || item.type === 'link') && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', textAlign: 'left' }}>{t(language, 'url')}</label>
                <input 
                  type="text" 
                  value={url} 
                  onChange={e => {
                    const nextUrl = e.target.value;
                    setUrl(nextUrl);
                    setIconError('');
                  }}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {(!item || item.type === 'link') && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', textAlign: 'left' }}>{t(language, 'iconSource')}</label>
                <div className="icon-source-picker" role="group" aria-label={t(language, 'iconSource')}>
                  {(['auto', 'site', 'custom'] as const).map(choice => (
                    <button
                      key={choice}
                      type="button"
                      className={iconChoice === choice ? 'active' : ''}
                      aria-pressed={iconChoice === choice}
                      onClick={() => {
                        if (choice === 'site') {
                          const siteFavicon = getSiteFaviconUrl(url);
                          if (!siteFavicon) {
                            setIconError(t(language, 'siteFaviconUnavailable'));
                            return;
                          }
                          setIcon(siteFavicon);
                        } else if (choice === 'auto') {
                          setIcon('');
                        } else if (iconChoice === 'site') {
                          setIcon('');
                        }
                        setIconError('');
                        setIconChoice(choice);
                      }}
                    >
                      {t(language, choice === 'auto' ? 'iconSourceAuto' : choice === 'site' ? 'iconSourceSite' : 'iconSourceCustom')}
                    </button>
                  ))}
                </div>

                {iconChoice === 'custom' && (
                  <div className="custom-icon-controls">
                    <input
                      type="text"
                      value={icon.startsWith('data:image/') ? '' : icon}
                      onChange={e => {
                        setIcon(e.target.value);
                        setIconError('');
                      }}
                      placeholder={icon.startsWith('data:image/') ? t(language, 'localIconSelected') : t(language, 'iconUrlPlaceholder')}
                      aria-label={t(language, 'iconUrlOptional')}
                    />
                    <button type="button" onClick={() => localIconInputRef.current?.click()}>
                      {t(language, 'uploadLocalImage')}
                    </button>
                    <input
                      ref={localIconInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      aria-label={t(language, 'uploadLocalImage')}
                      onChange={handleLocalIconChange}
                    />
                  </div>
                )}

                <div className="icon-source-preview" aria-hidden="true">
                  <FaviconImage
                    icon={iconChoice === 'auto'
                      ? undefined
                      : iconChoice === 'site'
                        ? getSiteFaviconUrl(previewUrl) ?? undefined
                        : previewIcon}
                    iconSource={iconChoice === 'auto' ? 'auto' : 'custom'}
                    url={previewUrl}
                    alt=""
                  />
                </div>
                {iconError && <p className="field-error" role="alert">{iconError}</p>}
              </div>
            )}

            {!isAdding && (
               <div style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', textAlign: 'left' }}>{t(language, 'iconOverrideStyle')}</label>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'white', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input type="radio" name="iconTheme" checked={iconTheme === 'light'} onChange={() => setIconTheme('light')} />
                      {t(language, 'light')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'white', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input type="radio" name="iconTheme" checked={iconTheme === 'dark'} onChange={() => setIconTheme('dark')} />
                      {t(language, 'dark')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'white', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input type="radio" name="iconTheme" checked={iconTheme === 'transparent'} onChange={() => setIconTheme('transparent')} />
                      {t(language, 'transparent')}
                    </label>
                  </div>
                  
                  <label style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '4px' }}>
                    <span>{t(language, 'blurOverride')}</span>
                    <span>{iconBlur}px</span>
                  </label>
                  <input 
                    type="range" min="0" max="40" 
                    value={iconBlur} 
                    onChange={e => setIconBlur(parseInt(e.target.value))}
                    style={{ width: '100%' }}
                  />
               </div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
              {item && (
                <button 
                  type="button" 
                  onClick={() => { onDelete(item.id); onClose(); }}
                  style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(255, 50, 50, 0.2)', color: '#ff6b6b', border: '1px solid rgba(255, 50, 50, 0.3)', cursor: 'pointer' }}
                >
                  {t(language, 'delete')}
                </button>
              )}
              <button 
                type="submit"
                style={{ padding: '8px 24px', borderRadius: '8px', background: 'rgba(255,255,255,0.9)', color: 'black', border: 'none', cursor: 'pointer', fontWeight: 'bold', marginLeft: 'auto' }}
              >
                {t(language, 'save')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
