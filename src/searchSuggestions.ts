import type { BookmarkItem, SearchHistoryEntry } from './types';
export type { SearchHistoryEntry } from './types';

type SuggestionMatchType = 'prefix' | 'contains';

export type SearchSuggestion =
  | {
      id: string;
      kind: 'history';
      title: string;
      query: string;
      engineId: string;
      folderPath: string[];
      matchType: SuggestionMatchType;
    }
  | {
      id: string;
      kind: 'bookmark';
      title: string;
      url: string;
      bookmarkId: string;
      folderPath: string[];
      matchType: SuggestionMatchType;
    }
  | {
      id: string;
      kind: 'folder';
      title: string;
      folderId: string;
      folder: BookmarkItem;
      folderPath: string[];
      matchType: SuggestionMatchType;
    };

export type FlattenedBookmarkItem = {
  item: BookmarkItem;
  folderPath: string[];
};

type MatchField = {
  value: string;
  priority: number;
};

type MatchResult = {
  matchType: SuggestionMatchType;
  matchRank: number;
  exactRank: number;
  fieldPriority: number;
};

type RankedSuggestion = {
  suggestion: SearchSuggestion;
  matchRank: number;
  exactRank: number;
  fieldPriority: number;
  useCount: number;
  lastUsedAt: number;
  sourceOrder: number;
};

const MAX_SUGGESTIONS = 10;
const MAX_HISTORY_ENTRIES = 100;

/** Normalizes user-visible text for local, case-insensitive matching. */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

/**
 * Flattens links and folders without mutating the source tree. `folderPath`
 * contains the item's ancestor folder titles, from the root downwards.
 */
export function flattenBookmarkItems(
  items: readonly BookmarkItem[],
  folderPath: readonly string[] = [],
): FlattenedBookmarkItem[] {
  const flattened: FlattenedBookmarkItem[] = [];

  for (const item of items) {
    flattened.push({ item, folderPath: [...folderPath] });

    if (item.type === 'folder' && item.children?.length) {
      flattened.push(...flattenBookmarkItems(item.children, [...folderPath, item.title]));
    }
  }

  return flattened;
}

function clampLimit(value: number | undefined, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return maximum;
  return Math.min(maximum, Math.max(0, Math.floor(value)));
}

function findBestMatch(normalizedQuery: string, fields: readonly MatchField[]): MatchResult | null {
  let best: MatchResult | null = null;

  for (const field of fields) {
    const normalizedField = normalizeSearchText(field.value);
    if (!normalizedField) continue;

    const isExact = normalizedField === normalizedQuery;
    const isPrefix = isExact || normalizedField.startsWith(normalizedQuery);
    const isContains = !isPrefix && normalizedField.includes(normalizedQuery);
    if (!isPrefix && !isContains) continue;

    const candidate: MatchResult = {
      matchType: isPrefix ? 'prefix' : 'contains',
      matchRank: isPrefix ? 2 : 1,
      exactRank: isExact ? 1 : 0,
      fieldPriority: field.priority,
    };

    if (
      !best ||
      candidate.matchRank > best.matchRank ||
      (candidate.matchRank === best.matchRank && candidate.exactRank > best.exactRank) ||
      (candidate.matchRank === best.matchRank &&
        candidate.exactRank === best.exactRank &&
        candidate.fieldPriority > best.fieldPriority)
    ) {
      best = candidate;
    }
  }

  return best;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function getFolderFields(item: BookmarkItem, folderPath: readonly string[]): MatchField[] {
  return [
    { value: item.title, priority: 50 },
    ...folderPath.map((segment, index) => ({ value: segment, priority: 20 - index })),
    { value: folderPath.join(' / '), priority: 10 },
  ];
}

function getBookmarkFields(item: BookmarkItem): MatchField[] {
  const url = item.url ?? '';
  return [
    { value: item.title, priority: 50 },
    { value: getHostname(url), priority: 40 },
    { value: url, priority: 30 },
  ];
}

function rankSuggestions(left: RankedSuggestion, right: RankedSuggestion): number {
  return (
    right.matchRank - left.matchRank ||
    right.exactRank - left.exactRank ||
    right.fieldPriority - left.fieldPriority ||
    right.useCount - left.useCount ||
    right.lastUsedAt - left.lastUsedAt ||
    left.sourceOrder - right.sourceOrder
  );
}

/**
 * Older versions stored the same query once per search engine. Collapse those
 * records into one logical history item, retaining the most recently used
 * engine while preserving the combined use count.
 */
function dedupeHistoryEntries(history: readonly SearchHistoryEntry[]): SearchHistoryEntry[] {
  const deduped = new Map<string, SearchHistoryEntry>();

  for (const entry of history) {
    if (typeof entry.query !== 'string') continue;
    const storedNormalizedQuery = typeof entry.normalizedQuery === 'string' ? entry.normalizedQuery : '';
    const normalizedQuery = normalizeSearchText(storedNormalizedQuery || entry.query);
    if (!normalizedQuery) continue;

    const useCount = Number.isFinite(entry.useCount) ? Math.max(0, entry.useCount) : 0;
    const lastUsedAt = Number.isFinite(entry.lastUsedAt) ? entry.lastUsedAt : 0;
    const existing = deduped.get(normalizedQuery);

    if (!existing) {
      deduped.set(normalizedQuery, {
        query: entry.query.trim(),
        normalizedQuery,
        engineId: typeof entry.engineId === 'string' ? entry.engineId : '',
        useCount,
        lastUsedAt,
      });
      continue;
    }

    const latest = lastUsedAt > existing.lastUsedAt
      ? {
          query: entry.query.trim(),
          engineId: typeof entry.engineId === 'string' ? entry.engineId : '',
          lastUsedAt,
        }
      : {
          query: existing.query,
          engineId: existing.engineId,
          lastUsedAt: existing.lastUsedAt,
        };

    deduped.set(normalizedQuery, {
      ...latest,
      normalizedQuery,
      useCount: existing.useCount + useCount,
    });
  }

  return [...deduped.values()];
}

function suggestionDedupeKey(suggestion: SearchSuggestion): string {
  if (suggestion.kind === 'history') {
    return `history:${normalizeSearchText(suggestion.query)}`;
  }
  if (suggestion.kind === 'bookmark') {
    return `bookmark:${normalizeSearchText(suggestion.url) || suggestion.bookmarkId}`;
  }
  return `folder:${suggestion.folderId}`;
}

/**
 * Produces local suggestions from Zen Tab's own search history and bookmark
 * tree. History always appears first; homepage items fill any remaining slots.
 * Within each source, prefix matches sort ahead of substring matches.
 */
export function getLocalSearchSuggestions(
  query: string,
  history: readonly SearchHistoryEntry[],
  bookmarks: readonly BookmarkItem[],
  limit: number = MAX_SUGGESTIONS,
): SearchSuggestion[] {
  const normalizedQuery = normalizeSearchText(query);
  const resultLimit = clampLimit(limit, MAX_SUGGESTIONS);
  if (!normalizedQuery || resultLimit === 0) return [];

  const rankedHistory: RankedSuggestion[] = [];
  const rankedHomepage: RankedSuggestion[] = [];
  let sourceOrder = 0;

  for (const entry of dedupeHistoryEntries(history)) {
    const entryQuery = normalizeSearchText(entry.normalizedQuery || entry.query);
    const match = findBestMatch(normalizedQuery, [{ value: entryQuery, priority: 60 }]);
    if (!entryQuery || !match) continue;

    rankedHistory.push({
      suggestion: {
        id: `history:${entry.engineId}:${entryQuery}`,
        kind: 'history',
        title: entry.query.trim(),
        query: entry.query.trim(),
        engineId: entry.engineId,
        folderPath: [],
        matchType: match.matchType,
      },
      ...match,
      useCount: Number.isFinite(entry.useCount) ? Math.max(0, entry.useCount) : 0,
      lastUsedAt: Number.isFinite(entry.lastUsedAt) ? entry.lastUsedAt : 0,
      sourceOrder: sourceOrder++,
    });
  }

  for (const { item, folderPath } of flattenBookmarkItems(bookmarks)) {
    if (item.type === 'folder') {
      const match = findBestMatch(normalizedQuery, getFolderFields(item, folderPath));
      if (!match) continue;

      rankedHomepage.push({
        suggestion: {
          id: `folder:${item.id}`,
          kind: 'folder',
          title: item.title,
          folderId: item.id,
          folder: item,
          folderPath,
          matchType: match.matchType,
        },
        ...match,
        useCount: 0,
        lastUsedAt: 0,
        sourceOrder: sourceOrder++,
      });
      continue;
    }

    if (!item.url) continue;
    const match = findBestMatch(normalizedQuery, getBookmarkFields(item));
    if (!match) continue;

    rankedHomepage.push({
      suggestion: {
        id: `bookmark:${item.id}`,
        kind: 'bookmark',
        title: item.title,
        url: item.url,
        bookmarkId: item.id,
        folderPath,
        matchType: match.matchType,
      },
      ...match,
      useCount: 0,
      lastUsedAt: 0,
      sourceOrder: sourceOrder++,
    });
  }

  const seen = new Set<string>();
  const suggestions: SearchSuggestion[] = [];

  for (const source of [rankedHistory, rankedHomepage]) {
    for (const candidate of source.sort(rankSuggestions)) {
      const key = suggestionDedupeKey(candidate.suggestion);
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push(candidate.suggestion);
      if (suggestions.length === resultLimit) return suggestions;
    }
  }

  return suggestions;
}

/**
 * Returns a new, recency-sorted history array. The caller supplies `now` so
 * the function remains deterministic and side-effect free.
 */
export function mergeSearchHistory(
  history: readonly SearchHistoryEntry[],
  query: string,
  engineId: string,
  now: number,
  maxEntries: number = MAX_HISTORY_ENTRIES,
): SearchHistoryEntry[] {
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeSearchText(trimmedQuery);
  const normalizedEngineId = engineId.trim();
  const resultLimit = clampLimit(maxEntries, MAX_HISTORY_ENTRIES);

  if (!normalizedQuery || !normalizedEngineId || resultLimit === 0) {
    return history.slice(0, resultLimit);
  }

  const dedupedHistory = dedupeHistoryEntries(history);
  const existing = dedupedHistory.find(entry =>
    normalizeSearchText(entry.normalizedQuery || entry.query) === normalizedQuery
  );
  const previousUseCount = existing && Number.isFinite(existing.useCount)
    ? Math.max(0, existing.useCount)
    : 0;
  const safeNow = Number.isFinite(now) ? now : 0;
  const mergedEntry: SearchHistoryEntry = {
    query: trimmedQuery,
    normalizedQuery,
    engineId: normalizedEngineId,
    useCount: previousUseCount + 1,
    lastUsedAt: safeNow,
  };

  return [
    mergedEntry,
    ...dedupedHistory.filter(entry =>
      normalizeSearchText(entry.normalizedQuery || entry.query) !== normalizedQuery
    ),
  ]
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, resultLimit);
}
