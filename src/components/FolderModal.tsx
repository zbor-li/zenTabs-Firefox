import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BookmarkItem, GlobalSettings } from '../types';
import { FaviconImage } from './FaviconImage';
import { t } from '../i18n';


export interface FolderSourceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface FolderModalProps {
  folder: BookmarkItem;
  isOpen: boolean;
  sourceRect: FolderSourceRect | null;
  onClosing: () => void;
  onClose: () => void;
  onUpdateFolder: (updatedFolder: BookmarkItem) => void;
  onOpenLink: (url: string) => void;
  onExtractItem: (item: BookmarkItem, folderId: string) => void;
  onDisband: (folderId: string) => void;
  onEditClick: (item: BookmarkItem) => void;
  globalSettings: GlobalSettings;
}

export function FolderModal({ folder, isOpen, sourceRect, onClosing, onClose, onUpdateFolder, onOpenLink, onExtractItem, onDisband, onEditClick, globalSettings }: FolderModalProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleStr, setEditTitleStr] = useState(folder.title);
  const [isClosing, setIsClosing] = useState(false);
  const pointerDownRef = useRef(false);
  const motionRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);
  const closeActionRef = useRef<() => void>(onClose);

  useEffect(() => {
    setEditTitleStr(folder.title);
  }, [folder.id, folder.title]);

  useEffect(() => {
    setIsClosing(false);
    isClosingRef.current = false;
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [folder.id, isOpen]);

  useEffect(() => {
    if (!isClosingRef.current) closeActionRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    const motion = motionRef.current;
    if (!isOpen || !motion) return;

    const updatePlacement = () => {
      const viewportMargin = 16;
      const desiredHeight = 400;
      const panelHeight = Math.min(desiredHeight, Math.max(1, window.innerHeight - viewportMargin * 2));
      const panelTop = Math.max(viewportMargin, (window.innerHeight - panelHeight) / 2);

      motion.style.setProperty('--folder-panel-top', `${Math.round(panelTop)}px`);
      motion.style.setProperty('--folder-panel-height', `${Math.max(1, Math.round(panelHeight))}px`);

      const motionRect = motion.getBoundingClientRect();
      const panelWidth = motion.offsetWidth || motionRect.width;
      const panelCenterX = window.innerWidth / 2;
      const panelCenterY = panelTop + panelHeight / 2;

      if (!sourceRect) {
        motion.style.setProperty('--folder-source-translate-x', '0px');
        motion.style.setProperty('--folder-source-translate-y', '0px');
        motion.style.setProperty('--folder-source-scale', '0.86');
        return;
      }

      const sourceCenterX = sourceRect.left + sourceRect.width / 2;
      const sourceCenterY = sourceRect.top + sourceRect.height / 2;
      const sourceScale = Math.max(
        0.22,
        Math.min(0.34, Math.min(sourceRect.width / panelWidth, sourceRect.height / panelHeight)),
      );

      motion.style.setProperty('--folder-source-translate-x', `${Math.round(sourceCenterX - panelCenterX)}px`);
      motion.style.setProperty('--folder-source-translate-y', `${Math.round(sourceCenterY - panelCenterY)}px`);
      motion.style.setProperty('--folder-source-scale', String(sourceScale));
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    return () => window.removeEventListener('resize', updatePlacement);
  }, [folder.id, isOpen, sourceRect]);

  useEffect(() => {
    const releasePointer = () => { pointerDownRef.current = false; };
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    window.addEventListener('blur', releasePointer);
    return () => {
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      window.removeEventListener('blur', releasePointer);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  const finishClose = () => {
    if (!isClosingRef.current) return;
    isClosingRef.current = false;
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    closeActionRef.current();
  };

  const requestClose = (afterClose: () => void = onClose) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    closeActionRef.current = afterClose;
    setIsClosing(true);
    onClosing();
    closeTimerRef.current = window.setTimeout(finishClose, 220);
  };

  const handleOverlayAnimationEnd = (event: React.AnimationEvent<HTMLDivElement>) => {
    if (
      event.target !== event.currentTarget
      || event.animationName !== 'folderOverlayClose'
      || !isClosingRef.current
    ) return;
    finishClose();
  };

  const handleTitleSubmit = () => {
    onUpdateFolder({ ...folder, title: editTitleStr || 'Unnamed Folder' });
    setIsEditingTitle(false);
  };

  const handleDragStart = (e: React.DragEvent, item: BookmarkItem) => {
    if (!pointerDownRef.current) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropContainer = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const sourceItem: BookmarkItem = JSON.parse(e.dataTransfer.getData('application/json'));
      const isAlreadyInFolder = folder.children?.some(c => c.id === sourceItem.id);
      if (isAlreadyInFolder) return;
      const newChildren = [...(folder.children || []), sourceItem];
      onUpdateFolder({ ...folder, children: newChildren });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDragLeaveContainer = (e: React.DragEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (
      e.clientX <= rect.left ||
      e.clientX >= rect.right ||
      e.clientY <= rect.top ||
      e.clientY >= rect.bottom
    ) {
        try {
          const sourceItem: BookmarkItem = JSON.parse(e.dataTransfer.getData('application/json'));
          if (folder.children?.some(c => c.id === sourceItem.id)) {
            onExtractItem(sourceItem, folder.id);
          }
        } catch {
          // Ignore invalid drag payloads.
        }
    }
  };

  const handleDropItem = (e: React.DragEvent, targetItem: BookmarkItem) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const sourceItem: BookmarkItem = JSON.parse(e.dataTransfer.getData('application/json'));
      if (sourceItem.id === targetItem.id) return;
      
      const isAlreadyInFolder = folder.children?.some(c => c.id === sourceItem.id);
      if (!isAlreadyInFolder) {
        // Handle dropping an outside item onto a specific item in the folder
        // Just append it or insert it
        const newChildren = [...(folder.children || []), sourceItem];
        onUpdateFolder({ ...folder, children: newChildren });
        return;
      }
      
      let newChildren = [...(folder.children || [])];
      const sourceIndex = newChildren.findIndex(i => i.id === sourceItem.id);
      const targetIndex = newChildren.findIndex(i => i.id === targetItem.id);
      
      if (sourceIndex === -1 || targetIndex === -1) return;
      
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      const width = rect.width;
      
      const [movedItem] = newChildren.splice(sourceIndex, 1);
      const adjustedTargetIndex = newChildren.findIndex(i => i.id === targetItem.id);
      const finalInsertIndex = dropX > width / 2 ? adjustedTargetIndex + 1 : adjustedTargetIndex;
      newChildren.splice(finalInsertIndex, 0, movedItem);
      
      onUpdateFolder({ ...folder, children: newChildren });
    } catch (err) {
      console.error(err);
    }
  };

  const getItemStyle = (item: BookmarkItem): React.CSSProperties => {
    const theme = item.iconTheme || globalSettings.iconTheme;
    const opacity = globalSettings.iconOpacity;
    const size = globalSettings.iconSize || 56;
    
    let bg: string;
    let border: string;

    if (theme === 'dark') {
      bg = `rgba(0, 0, 0, ${opacity})`;
      border = `1px solid rgba(255, 255, 255, ${Math.min(0.15, opacity)})`;
    } else if (theme === 'transparent') {
      bg = `rgba(255, 255, 255, ${Math.max(0.02, opacity * 0.1)})`;
      border = `1px solid rgba(255, 255, 255, ${Math.min(0.12, opacity)})`;
    } else {
      bg = `rgba(255, 255, 255, ${opacity})`;
      border = `1px solid rgba(255, 255, 255, ${Math.min(0.5, opacity + 0.1)})`;
    }

    return {
      background: bg,
      border: border,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${size * 0.25}px`,
      overflow: 'hidden',
      position: 'relative',
    };
  };

  const getBlur = (item: BookmarkItem): number => {
    return item.iconBlur ?? globalSettings.iconBlur;
  };

  const modalBlur = globalSettings.iconBlur + 10;
  const modalOpacity = Math.max(0.35, globalSettings.iconOpacity);
  const iconSize = globalSettings.iconSize || 56;
  const renderedIconSize = Math.max(16, Math.round((iconSize * 0.6) / 4) * 4);

  const getModalBg = (): string => {
    const theme = globalSettings.iconTheme;
    if (theme === 'dark') return `rgba(20,20,20,${modalOpacity})`;
    if (theme === 'transparent') return `rgba(255,255,255,${Math.max(0.02, modalOpacity * 0.1)})`;
    return `rgba(255,255,255,${modalOpacity})`;
  };

  return (
    <div
      className={`modal-overlay folder-modal-overlay active ${isClosing ? 'closing' : ''}`}
      onClick={() => requestClose()}
      onAnimationEnd={handleOverlayAnimationEnd}
      style={{ zIndex: 100 }}
    >
      <div
        ref={motionRef}
        className="folder-modal-motion"
        onClick={(e) => e.stopPropagation()}
        onDragOver={handleDragOver}
        onDrop={handleDropContainer}
        onDragLeave={handleDragLeaveContainer}
      >
        <div
          className="modal-content folder-modal-content"
          style={{
            background: getModalBg(),
            backdropFilter: `blur(${modalBlur}px)`,
            WebkitBackdropFilter: `blur(${modalBlur}px)`,
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '24px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
            overflowX: 'hidden',
            overflowY: 'auto',
            position: 'relative',
          }}
        >
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="modal-header">
              {isEditingTitle ? (
                <input
                  type="text"
                  value={editTitleStr}
                  onChange={(e) => setEditTitleStr(e.target.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={(e) => e.key === 'Enter' && handleTitleSubmit()}
                  autoFocus
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '2px solid rgba(255,255,255,0.3)',
                    color: 'white',
                    fontSize: '1.5rem',
                    fontWeight: 600,
                    outline: 'none',
                    padding: '4px 8px',
                  }}
                />
              ) : (
                <h2
                  style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: 'white', cursor: 'pointer' }}
                  onClick={() => setIsEditingTitle(true)}
                >
                  {folder.title}
                </h2>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="close-btn" onClick={() => requestClose(() => onDisband(folder.id))} title={t(globalSettings.language, 'disbandFolder')} style={{ color: '#ff6b6b' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
                <button className="close-btn" onClick={() => requestClose()} title={t(globalSettings.language, 'close')}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            </div>

            <div className="bookmark-grid" style={{ padding: 0 }}>
              {folder.children?.map(child => (
                <div
                  key={child.id}
                  className="bookmark-item"
                  draggable
                  onPointerDown={(event) => { pointerDownRef.current = event.button === 0; }}
                  onPointerUp={() => { pointerDownRef.current = false; }}
                  onDragStart={(e) => handleDragStart(e, child)}
                  onDragEnd={() => { pointerDownRef.current = false; }}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropItem(e, child)}
                  onClick={() => child.url && onOpenLink(child.url)}
                  onContextMenu={(e) => { e.preventDefault(); onEditClick(child); }}
                >
                  <div className="bookmark-icon-container" style={{ ...getItemStyle(child), backdropFilter: `blur(${getBlur(child)}px)`, WebkitBackdropFilter: `blur(${getBlur(child)}px)` }}>
                    <FaviconImage
                      icon={child.icon}
                      iconSource={child.iconSource}
                      url={child.url}
                      alt={child.title}
                      className="bookmark-icon"
                      style={{ width: `${renderedIconSize}px`, height: `${renderedIconSize}px` }}
                    />
                  </div>
                  <span className="bookmark-title">
                    {child.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
