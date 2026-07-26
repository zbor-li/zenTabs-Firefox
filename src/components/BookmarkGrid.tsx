import React from 'react';
import type { BookmarkItem, GlobalSettings } from '../types';
import { FaviconImage } from './FaviconImage';
import { normalizeNavigationUrl } from '../url';
import { t } from '../i18n';
import type { FolderSourceRect } from './FolderModal';
import { launchWithIconAnimation } from '../iconLaunch';


interface BookmarkGridProps {
  items: BookmarkItem[];
  onItemsChange: (items: BookmarkItem[]) => void;
  onFolderClick: (folder: BookmarkItem, sourceRect: FolderSourceRect) => void;
  onEditClick: (item: BookmarkItem) => void;
  globalSettings: GlobalSettings;
}

export function BookmarkGrid({ items, onItemsChange, onFolderClick, onEditClick, globalSettings }: BookmarkGridProps) {
  const iconsPerRow = Math.min(10, Math.max(3, globalSettings.iconsPerRow || 6));
  const iconSize = globalSettings.iconSize || 56;
  const renderedIconSize = Math.max(16, Math.round((iconSize * 0.6) / 4) * 4);
  const handleDragStart = (e: React.DragEvent, item: BookmarkItem) => {
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetItem: BookmarkItem) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const sourceItem: BookmarkItem = JSON.parse(e.dataTransfer.getData('application/json'));
      if (sourceItem.id === targetItem.id) return;
      
      let newItems = [...items];
      const sourceIndex = newItems.findIndex(i => i.id === sourceItem.id);
      const targetIndex = newItems.findIndex(i => i.id === targetItem.id);
      
      if (sourceIndex === -1 || targetIndex === -1) return;
      
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const dropX = e.clientX - rect.left;
      const width = rect.width;
      
      const isEdgeDrop = dropX < width * 0.25 || dropX > width * 0.75;

      if (!isEdgeDrop) {
        if (targetItem.type === 'folder') {
          const updatedFolder = { ...targetItem, children: [...(targetItem.children || []), sourceItem] };
          newItems.splice(sourceIndex, 1);
          const newTargetIndex = newItems.findIndex(i => i.id === targetItem.id);
          newItems[newTargetIndex] = updatedFolder;
        } 
        else if (sourceItem.type !== 'folder') {
          const newFolder: BookmarkItem = {
            id: `folder-${Date.now()}`,
            type: 'folder',
            title: t(globalSettings.language, 'newFolder'),
            children: [targetItem, sourceItem]
          };
          
          newItems.splice(sourceIndex, 1);
          const newTargetIndex = newItems.findIndex(i => i.id === targetItem.id);
          newItems[newTargetIndex] = newFolder;
        } else {
           const [movedItem] = newItems.splice(sourceIndex, 1);
           const adjustedTargetIndex = newItems.findIndex(i => i.id === targetItem.id);
           newItems.splice(adjustedTargetIndex, 0, movedItem);
        }
      } else {
        const [movedItem] = newItems.splice(sourceIndex, 1);
        const adjustedTargetIndex = newItems.findIndex(i => i.id === targetItem.id);
        const finalInsertIndex = dropX > width / 2 ? adjustedTargetIndex + 1 : adjustedTargetIndex;
        newItems.splice(finalInsertIndex, 0, movedItem);
      }
      
      onItemsChange(newItems);
    } catch (err) {
      console.error('Drag and drop error', err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, item: BookmarkItem) => {
    e.preventDefault();
    onEditClick(item);
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

  return (
    <div
      className="bookmark-grid main-bookmark-grid"
      style={{
        gridTemplateColumns: `repeat(${iconsPerRow}, minmax(80px, 1fr))`,
        maxWidth: `${iconsPerRow * 112}px`,
      }}
    >
      {items.map(item => (
        <div 
          key={item.id} 
          className="bookmark-item"
          draggable
          onDragStart={(e) => handleDragStart(e, item)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, item)}
          onClick={(event) => {
            if (item.type === 'folder') {
              const icon = event.currentTarget.querySelector<HTMLElement>('.bookmark-icon-container') ?? event.currentTarget;
              const rect = icon.getBoundingClientRect();
              onFolderClick(item, {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
              });
            }
            else if (item.url) {
              const destination = normalizeNavigationUrl(item.url);
              launchWithIconAnimation(event.currentTarget, () => {
                window.location.href = destination;
              });
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, item)}
        >
          <div className="bookmark-icon-container" style={{ ...getItemStyle(item), backdropFilter: `blur(${getBlur(item)}px)`, WebkitBackdropFilter: `blur(${getBlur(item)}px)` }}>
            {item.type === 'folder' ? (
              <div className="folder-icon-container">
                {item.children?.slice(0, 4).map((child) => (
                  <FaviconImage 
                    key={child.id} 
                    icon={child.icon} 
                    iconSource={child.iconSource}
                    url={child.url}
                    alt={child.title} 
                    className="bookmark-icon folder-mini-icon"
                  />
                ))}
              </div>
            ) : (
              <FaviconImage 
                icon={item.icon} 
                iconSource={item.iconSource}
                url={item.url}
                alt={item.title} 
                className="bookmark-icon"
                style={{ width: `${renderedIconSize}px`, height: `${renderedIconSize}px` }}
              />
            )}
          </div>
          <span className="bookmark-title">
            {item.title}
          </span>
        </div>
      ))}
    </div>
  );
}
