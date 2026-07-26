import React, { useRef, useState } from 'react';
import DEFAULT_LOGO from '../assets/logo.png';


import type { GlobalSettings } from '../types';
import { removeStoredValue, setStoredValue, STORAGE_KEYS } from '../storage';
import { t } from '../i18n';

interface LogoProps {
  globalSettings?: GlobalSettings;
  initialLogoUrl?: string | null;
  initialLogoSize?: number | null;
}

export function Logo({ globalSettings, initialLogoUrl, initialLogoSize }: LogoProps) {
  const language = globalSettings?.language;
  const [logoUrl, setLogoUrl] = useState<string>(initialLogoUrl || DEFAULT_LOGO);
  const [logoSize, setLogoSize] = useState<number>(initialLogoSize || 60);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setLogoUrl(base64);
        setStoredValue(STORAGE_KEYS.customLogo, base64).catch(() => undefined);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const resetDefault = () => {
    setLogoUrl(DEFAULT_LOGO);
    removeStoredValue(STORAGE_KEYS.customLogo).catch(() => undefined);
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setLogoSize(newSize);
    setStoredValue(STORAGE_KEYS.customLogoSize, newSize).catch(() => undefined);
  };

  return (
    <>
      <div 
        className="logo-container"
        data-zen-page-entry-animation="logo"
        onDoubleClick={() => setIsModalOpen(true)}
        title={t(language, 'logoEditHint')}
        style={{
          marginBottom: '2rem',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        <img 
          src={logoUrl} 
          alt="Logo" 
          style={{
            height: `${logoSize}px`,
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))',
            transition: 'height 0.3s'
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = DEFAULT_LOGO;
          }}
        />
      </div>

      {isModalOpen && (
        <div className="modal-overlay active" onClick={() => setIsModalOpen(false)} style={{ zIndex: 300 }}>
          <div 
            className="modal-content glass-panel" 
            onClick={e => e.stopPropagation()} 
            style={{ 
              maxWidth: '400px', 
              minHeight: 'auto', 
              position: 'relative',
              background: 'rgba(30, 30, 30, 0.55)',
              backdropFilter: `blur(${(globalSettings?.iconBlur || 16) + 10}px)`,
              WebkitBackdropFilter: `blur(${(globalSettings?.iconBlur || 16) + 10}px)`,
            }}
          >
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="modal-header">
                <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>{t(language, 'logoSettings')}</h2>
                <button className="close-btn" onClick={() => setIsModalOpen(false)} title={t(language, 'close')}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}
                >
                  {t(language, 'uploadLocalImage')}
                </button>
                <button 
                  onClick={resetDefault}
                  style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                >
                  {t(language, 'resetDefault')}
                </button>
                <input 
                  type="file" 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
              </div>

              <div>
                <label style={{ display: 'flex', justifyContent: 'space-between', color: 'white', marginBottom: '8px' }}>
                  <span>{t(language, 'displaySize')}</span>
                  <span>{logoSize}px</span>
                </label>
                <input 
                  type="range" 
                  min="30" max="150" 
                  value={logoSize} 
                  onChange={handleSizeChange}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
