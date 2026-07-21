import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { BookmarkItem, GlobalSettings, SearchEngine } from '../types';
import { DEFAULT_ENGINES } from '../types';
import { FaviconImage } from './FaviconImage';
import { getStoredValue, setStoredValue, STORAGE_KEYS } from '../storage';
import { t } from '../i18n';
import {
  getLocalSearchSuggestions,
  mergeSearchHistory,
  type SearchHistoryEntry,
  type SearchSuggestion,
} from '../searchSuggestions';
import { normalizeNavigationUrl } from '../url';

interface SearchBoxProps {
  bookmarks: BookmarkItem[];
  onFolderOpen?: (folder: BookmarkItem) => void;
  onSearch?: (query: string, engine: SearchEngine) => void;
  globalSettings?: GlobalSettings;
}

const DEFAULT_ENGINE_BY_ID = new Map(DEFAULT_ENGINES.map(engine => [engine.id, engine]));

function normalizeDefaultEngineIcons(engines: SearchEngine[]): { engines: SearchEngine[]; changed: boolean } {
  let changed = false;
  const normalized = engines.map(engine => {
    const defaultEngine = DEFAULT_ENGINE_BY_ID.get(engine.id);
    if (!defaultEngine || engine.iconUrl === defaultEngine.iconUrl) return engine;
    changed = true;
    return { ...engine, iconUrl: defaultEngine.iconUrl };
  });
  return { engines: normalized, changed };
}

function SearchEngineIcon({ engine, size }: { engine: SearchEngine; size: number }) {
  const borderRadius = Math.max(5, Math.round(size * 0.28));
  const isGoogle = engine.id === 'google';
  const iconStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: isGoogle ? '50%' : borderRadius,
    objectFit: 'contain',
    boxSizing: 'border-box',
    background: isGoogle ? '#fff' : undefined,
    padding: isGoogle ? Math.max(2, Math.round(size * 0.1)) : undefined,
  };

  if (DEFAULT_ENGINE_BY_ID.has(engine.id)) {
    return (
      <img
        src={engine.iconUrl}
        alt={engine.name}
        width={size}
        height={size}
        draggable={false}
        style={iconStyle}
      />
    );
  }

  return (
    <FaviconImage
      icon={engine.iconUrl}
      alt={engine.name}
      style={iconStyle}
    />
  );
}

function SuggestionGlyph({ suggestion }: { suggestion: SearchSuggestion }) {
  if (suggestion.kind === 'bookmark') {
    return (
      <FaviconImage
        url={suggestion.url}
        alt=""
        className="search-suggestion-favicon"
      />
    );
  }

  if (suggestion.kind === 'folder') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.75A2.25 2.25 0 0 1 5.75 4.5h4.1l1.8 2h6.6a2.25 2.25 0 0 1 2.25 2.25v8.5a2.25 2.25 0 0 1-2.25 2.25H5.75a2.25 2.25 0 0 1-2.25-2.25V6.75Z" /></svg>
    );
  }

  if (suggestion.kind === 'history') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.32 4H3l3.5-3.5L10 9H7.76A5 5 0 1 0 12 7v3l4 2-1 1.73-5-2.73V5h2Z" /></svg>
    );
  }

  return null;
}

function suggestionLabel(language: GlobalSettings['language'] | undefined, suggestion: SearchSuggestion): string {
  if (suggestion.kind === 'history') return t(language, 'suggestionHistory');
  if (suggestion.kind === 'folder') return t(language, 'suggestionFolder');
  return t(language, 'suggestionWebsite');
}

export const SearchBox = memo(function SearchBox({ bookmarks, onFolderOpen, onSearch, globalSettings }: SearchBoxProps) {
  const language = globalSettings?.language;
  const blur = globalSettings?.iconBlur ?? 16;
  const theme = globalSettings?.iconTheme ?? 'light';
  const opacity = globalSettings?.iconOpacity ?? 0.8;
  const suggestionsEnabled = globalSettings?.searchSuggestionsEnabled ?? true;
  const boxWidth = Math.min(1000, Math.max(320, globalSettings?.searchBoxWidth ?? 600));
  const boxHeight = Math.min(96, Math.max(48, globalSettings?.searchBoxHeight ?? 68));
  const engineIconSize = Math.min(
    Math.min(48, boxHeight - 16),
    Math.max(16, globalSettings?.searchEngineIconSize ?? 30),
  );
  const selectorSize = Math.min(boxHeight - 8, Math.max(48, engineIconSize + 12));
  const listboxId = useId();
  const engineMenuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const [engines, setEngines] = useState<SearchEngine[]>(DEFAULT_ENGINES);
  const [selectedEngine, setSelectedEngine] = useState<SearchEngine>(DEFAULT_ENGINES[0]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  const containerBg = theme === 'transparent'
    ? `rgba(255, 255, 255, ${Math.max(0.04, opacity * 0.12)})`
    : theme === 'dark'
      ? `rgba(30, 30, 30, ${opacity})`
      : `rgba(255, 255, 255, ${opacity})`;
  const containerBorder = theme === 'transparent'
    ? '1px solid rgba(255, 255, 255, 0.28)'
    : '1px solid rgba(255, 255, 255, 0.42)';
  const dropdownBg = theme === 'dark'
    ? `rgba(0, 0, 0, ${opacity})`
    : theme === 'transparent'
      ? `rgba(255, 255, 255, ${Math.max(0.02, opacity * 0.1)})`
      : `rgba(255, 255, 255, ${opacity})`;
  const dropdownBorder = theme === 'dark'
    ? `1px solid rgba(255, 255, 255, ${Math.min(0.15, opacity)})`
    : theme === 'transparent'
      ? `1px solid rgba(255, 255, 255, ${Math.min(0.12, opacity)})`
      : `1px solid rgba(255, 255, 255, ${Math.min(0.5, opacity + 0.1)})`;

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const [savedEngines, savedId] = await Promise.all([
          getStoredValue<SearchEngine[]>(STORAGE_KEYS.searchEngines),
          getStoredValue<string>(STORAGE_KEYS.selectedEngine),
        ]);
        if (cancelled) return;
        const storedEngines = savedEngines?.length ? savedEngines : DEFAULT_ENGINES;
        const { engines: availableEngines, changed } = normalizeDefaultEngineIcons(storedEngines);
        setEngines(availableEngines);
        setSelectedEngine(availableEngines.find(engine => engine.id === savedId) ?? availableEngines[0]);
        if (changed) setStoredValue(STORAGE_KEYS.searchEngines, availableEngines).catch(() => undefined);
      } catch {
        if (!cancelled) {
          setEngines(DEFAULT_ENGINES);
          setSelectedEngine(DEFAULT_ENGINES[0]);
        }
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!suggestionsEnabled) {
      setHistory([]);
      return;
    }

    let cancelled = false;
    getStoredValue<SearchHistoryEntry[]>(STORAGE_KEYS.searchHistory)
      .then(value => {
        if (!cancelled) setHistory(Array.isArray(value) ? value : []);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    const handleClear = () => setHistory([]);
    window.addEventListener('zentab-search-history-cleared', handleClear);
    return () => {
      cancelled = true;
      window.removeEventListener('zentab-search-history-cleared', handleClear);
    };
  }, [suggestionsEnabled]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
        setIsFocused(false);
        setSuggestionsDismissed(true);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displaySuggestions = useMemo<SearchSuggestion[]>(() => {
    const trimmedQuery = query.trim();
    if (!suggestionsEnabled || !trimmedQuery || isMenuOpen || !isFocused || suggestionsDismissed) return [];
    return getLocalSearchSuggestions(trimmedQuery, history, bookmarks, 10);
  }, [bookmarks, history, isFocused, isMenuOpen, query, suggestionsDismissed, suggestionsEnabled]);

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [displaySuggestions]);

  const handleEngineSelect = (engine: SearchEngine) => {
    setSelectedEngine(engine);
    setStoredValue(STORAGE_KEYS.selectedEngine, engine.id).catch(() => undefined);
    setIsMenuOpen(false);
  };

  const handleAddEngine = () => {
    const name = window.prompt(t(language, 'engineNamePrompt'));
    if (!name) return;
    const url = window.prompt(t(language, 'engineUrlPrompt'));
    if (!url) return;
    const iconUrl = window.prompt(t(language, 'engineIconPrompt'));
    const newEngine: SearchEngine = {
      id: `custom-${Date.now()}`,
      name,
      url,
      iconUrl: iconUrl || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2NVcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxjaXJjbGUgY3g9IjExIiBjeT0iMTEiIHI9IjgiPjwvY2lyY2xlPjxsaW5lIHgxPSIyMSIgeTE9IjIxIiB4Mj0iMTYuNjUiIHkyPSIxNi42NSI+PC9saW5lPjwvc3ZnPg==',
    };
    const nextEngines = [...engines, newEngine];
    setEngines(nextEngines);
    setStoredValue(STORAGE_KEYS.searchEngines, nextEngines).catch(() => undefined);
  };

  const handleDeleteEngine = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation();
    if (engines.length <= 1) {
      window.alert(t(language, 'engineMinimum'));
      return;
    }
    const nextEngines = engines.filter(engine => engine.id !== id);
    setEngines(nextEngines);
    setStoredValue(STORAGE_KEYS.searchEngines, nextEngines).catch(() => undefined);
    if (selectedEngine.id === id) handleEngineSelect(nextEngines[0]);
  };

  const executeSearch = async (value: string, engine: SearchEngine = selectedEngine) => {
    const trimmedQuery = value.trim();
    if (!trimmedQuery) return;
    setSuggestionsDismissed(true);
    if (suggestionsEnabled) {
      const nextHistory = mergeSearchHistory(history, trimmedQuery, engine.id, Date.now());
      setHistory(nextHistory);
      await setStoredValue(STORAGE_KEYS.searchHistory, nextHistory).catch(() => undefined);
    }
    if (onSearch) onSearch(trimmedQuery, engine);
    else window.location.href = engine.url + encodeURIComponent(trimmedQuery);
  };

  const activateSuggestion = async (suggestion: SearchSuggestion) => {
    if (suggestion.kind === 'history') {
      const historyEngine = engines.find(engine => engine.id === suggestion.engineId) ?? selectedEngine;
      setQuery(suggestion.query);
      await executeSearch(suggestion.query, historyEngine);
      return;
    }
    setSuggestionsDismissed(true);
    if (suggestion.kind === 'folder') onFolderOpen?.(suggestion.folder);
    else window.location.href = normalizeNavigationUrl(suggestion.url);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeSuggestionIndex >= 0 && displaySuggestions[activeSuggestionIndex]) {
      activateSuggestion(displaySuggestions[activeSuggestionIndex]).catch(() => undefined);
      return;
    }
    executeSearch(query).catch(() => undefined);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!displaySuggestions.length) {
      if (event.key === 'Escape') setSuggestionsDismissed(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex(index => (index + 1) % displaySuggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex(index => (index <= 0 ? displaySuggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
      event.preventDefault();
      activateSuggestion(displaySuggestions[activeSuggestionIndex]).catch(() => undefined);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setSuggestionsDismissed(true);
      setActiveSuggestionIndex(-1);
    }
  };

  const dropdownStyle = {
    '--search-dropdown-bg': dropdownBg,
    '--search-dropdown-border': dropdownBorder,
    '--search-dropdown-blur': `${blur}px`,
    '--search-dropdown-shadow': '0 4px 12px rgba(0, 0, 0, 0.1)',
    '--search-dropdown-text': theme === 'light' ? 'rgba(22, 28, 36, 0.92)' : 'rgba(255, 255, 255, 0.94)',
    '--search-dropdown-hover': 'rgba(255, 255, 255, 0.08)',
  } as React.CSSProperties;

  return (
    <div
      className="search-box-wrap"
      data-theme={theme}
      ref={containerRef}
      style={{ width: `min(90vw, ${boxWidth}px)`, zIndex: isMenuOpen || displaySuggestions.length ? 999 : 10 }}
    >
      <div
        className="search-container"
        data-theme={theme}
        style={{
          width: '100%',
          height: `${boxHeight}px`,
          boxSizing: 'border-box',
          margin: 0,
          padding: '0 18px',
          borderRadius: '26px',
          background: containerBg,
          backdropFilter: `blur(${blur}px)`,
          WebkitBackdropFilter: `blur(${blur}px)`,
          border: containerBorder,
          boxShadow: '0 10px 36px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255,255,255,0.18)',
          transition: 'background 120ms ease-out, border 120ms ease-out',
        }}
      >
        <button
          type="button"
          className="engine-selector"
          onClick={() => {
            setIsMenuOpen(open => !open);
            setSuggestionsDismissed(true);
          }}
          title={t(language, 'searchWith', { engine: selectedEngine.name })}
          aria-expanded={isMenuOpen}
          aria-haspopup="menu"
          aria-controls={isMenuOpen ? engineMenuId : undefined}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setIsMenuOpen(false);
            } else if (event.key === 'ArrowDown' && !isMenuOpen) {
              event.preventDefault();
              setIsMenuOpen(true);
              setSuggestionsDismissed(true);
            }
          }}
          style={{ width: selectorSize, height: selectorSize }}
        >
          <SearchEngineIcon engine={selectedEngine} size={engineIconSize} />
        </button>

        <form onSubmit={handleSubmit} className="search-form">
          <input
            type="text"
            className="search-input"
            placeholder={t(language, 'searchPlaceholder')}
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setSuggestionsDismissed(false);
            }}
            onFocus={() => {
              setIsFocused(true);
              setSuggestionsDismissed(false);
            }}
            onBlur={event => {
              if (!containerRef.current?.contains(event.relatedTarget as Node | null)) setIsFocused(false);
            }}
            onKeyDown={handleInputKeyDown}
            autoComplete="off"
            autoFocus
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={displaySuggestions.length > 0}
            aria-controls={displaySuggestions.length ? listboxId : undefined}
            aria-activedescendant={activeSuggestionIndex >= 0 ? `${listboxId}-${activeSuggestionIndex}` : undefined}
            style={{ color: 'white', fontSize: '1.08rem' }}
          />
        </form>
      </div>

      {displaySuggestions.length > 0 && (
        <div id={listboxId} className="search-suggestions search-dropdown" role="listbox" style={dropdownStyle}>
          {displaySuggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={activeSuggestionIndex === index}
              className={`search-suggestion ${activeSuggestionIndex === index ? 'active' : ''}`}
              onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => setActiveSuggestionIndex(index)}
              onClick={() => activateSuggestion(suggestion).catch(() => undefined)}
            >
              <span className="search-suggestion-icon"><SuggestionGlyph suggestion={suggestion} /></span>
              <span className="search-suggestion-copy">
                <strong>{suggestion.title}</strong>
                <small>
                  {suggestion.kind === 'bookmark'
                    ? suggestion.url
                    : suggestion.kind === 'folder' && suggestion.folderPath.length
                      ? suggestion.folderPath.join(' / ')
                      : suggestionLabel(language, suggestion)}
                </small>
              </span>
              <span className="search-suggestion-kind">{suggestionLabel(language, suggestion)}</span>
            </button>
          ))}
        </div>
      )}

      {isMenuOpen && (
        <div
          id={engineMenuId}
          className="search-engine-menu search-dropdown"
          role="menu"
          aria-label={t(language, 'searchBoxSettings')}
          style={dropdownStyle}
          onKeyDown={event => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            setIsMenuOpen(false);
            containerRef.current?.querySelector<HTMLButtonElement>('.engine-selector')?.focus();
          }}
        >
          {engines.map(engine => (
            <div key={engine.id} className="search-engine-row">
              <button type="button" role="menuitem" className="search-engine-option" onClick={() => handleEngineSelect(engine)}>
                <SearchEngineIcon engine={engine} size={26} />
                <span>{engine.name}</span>
              </button>
              <button
                type="button"
                className="search-engine-delete"
                onClick={event => handleDeleteEngine(event, engine.id)}
                title={t(language, 'deleteEngine')}
              >×</button>
            </div>
          ))}
          <div className="search-engine-divider" />
          <button type="button" className="search-engine-add" onClick={handleAddEngine}>+ {t(language, 'addCustomEngine')}</button>
        </div>
      )}
    </div>
  );
});
