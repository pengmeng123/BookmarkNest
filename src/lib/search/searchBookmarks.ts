import type { BookmarkListItem } from '../db/bookmarkRepository';
import { buildBookmarkSearchText, normalizeHandleSearchValue } from '../bookmarks/searchText';
import type { BookmarkSortKey } from '../../shared/types';

export type SortKey = BookmarkSortKey;

export interface SearchMatch {
  bookmark: BookmarkListItem;
  matchedTerms: string[];
}

function matchesTerms(bookmark: BookmarkListItem, terms: string[]) {
  const searchText = bookmark.searchText ?? buildBookmarkSearchText(bookmark);
  return terms.every((term) => searchText.includes(term));
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
    .map(normalizeHandleSearchValue)
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
    .filter((bookmark) => matchesTerms(bookmark, terms))
    .sort(comparator)
    .map((bookmark) => ({ bookmark, matchedTerms: terms }));
}

export function countSearchBookmarks(bookmarks: BookmarkListItem[], query: string) {
  const terms = tokenizeSearchQuery(query);
  if (terms.length === 0) {
    return bookmarks.length;
  }

  let count = 0;
  for (const bookmark of bookmarks) {
    if (matchesTerms(bookmark, terms)) {
      count += 1;
    }
  }

  return count;
}
