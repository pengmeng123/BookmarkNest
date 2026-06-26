import type { BookmarkListItem } from '../db/bookmarkRepository';

export type SortKey = 'source' | 'date-posted' | 'date-imported' | 'author';

export interface SearchMatch {
  bookmark: BookmarkListItem;
  matchedTerms: string[];
}

function normalize(value: string) {
  return value.normalize('NFC').toLowerCase().replace(/^@/, '').trim();
}

function buildSearchText(bookmark: BookmarkListItem) {
  return [
    bookmark.contentText,
    bookmark.authorName,
    bookmark.authorHandle,
    `@${bookmark.authorHandle}`,
    bookmark.folder?.name ?? '',
    ...bookmark.tags.map((tag) => tag.name)
  ]
    .join(' ')
    .normalize('NFC')
    .toLowerCase();
}

function compareBySourceOrder(left: BookmarkListItem, right: BookmarkListItem) {
  const leftOrder = left.sourceOrder ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.sourceOrder ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  if (left.importedAt !== right.importedAt) {
    return right.importedAt - left.importedAt;
  }

  return right.id.localeCompare(left.id);
}

function getComparator(sortKey: SortKey) {
  switch (sortKey) {
    case 'date-posted':
      return (a: BookmarkListItem, b: BookmarkListItem) => (b.createdAt ?? 0) - (a.createdAt ?? 0);
    case 'date-imported':
      return (a: BookmarkListItem, b: BookmarkListItem) => b.importedAt - a.importedAt;
    case 'author':
      return (a: BookmarkListItem, b: BookmarkListItem) => a.authorName.localeCompare(b.authorName);
    default:
      return compareBySourceOrder;
  }
}

export function tokenizeSearchQuery(query: string) {
  return query
    .split(/\s+/)
    .map(normalize)
    .filter(Boolean);
}

export function searchBookmarks(bookmarks: BookmarkListItem[], query: string, sortKey: SortKey = 'source'): SearchMatch[] {
  const terms = tokenizeSearchQuery(query);
  const comparator = getComparator(sortKey);

  if (terms.length === 0) {
    return bookmarks
      .slice()
      .sort(comparator)
      .map((bookmark) => ({ bookmark, matchedTerms: [] }));
  }

  return bookmarks
    .filter((bookmark) => {
      const searchText = buildSearchText(bookmark);
      return terms.every((term) => searchText.includes(term));
    })
    .sort(comparator)
    .map((bookmark) => ({ bookmark, matchedTerms: terms }));
}
