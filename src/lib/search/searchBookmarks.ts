import type { BookmarkListItem } from '../db/bookmarkRepository';

export interface SearchMatch {
  bookmark: BookmarkListItem;
  matchedTerms: string[];
}

function normalize(value: string) {
  return value.toLowerCase().replace(/^@/, '').trim();
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

export function tokenizeSearchQuery(query: string) {
  return query
    .split(/\s+/)
    .map(normalize)
    .filter(Boolean);
}

export function searchBookmarks(bookmarks: BookmarkListItem[], query: string): SearchMatch[] {
  const terms = tokenizeSearchQuery(query);

  if (terms.length === 0) {
    return bookmarks
      .slice()
      .sort(compareBySourceOrder)
      .map((bookmark) => ({ bookmark, matchedTerms: [] }));
  }

  return bookmarks
    .filter((bookmark) => {
      const searchText = buildSearchText(bookmark);
      return terms.every((term) => searchText.includes(term));
    })
    .sort(compareBySourceOrder)
    .map((bookmark) => ({ bookmark, matchedTerms: terms }));
}
