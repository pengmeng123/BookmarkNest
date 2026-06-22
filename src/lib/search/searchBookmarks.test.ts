import { describe, expect, it } from 'vitest';

import type { BookmarkListItem } from '../db/bookmarkRepository';
import { searchBookmarks, tokenizeSearchQuery } from './searchBookmarks';

function item(overrides: Partial<BookmarkListItem>): BookmarkListItem {
  return {
    id: overrides.id ?? 'bookmark_1',
    authorName: 'Ada Lovelace',
    authorHandle: 'ada',
    contentText: 'Local first knowledge tools',
    mediaUrls: [],
    importedAt: 1,
    updatedAt: 1,
    tagIds: [],
    tags: [],
    archived: false,
    deleted: false,
    dedupeKey: 'tweet:1',
    source: 'x-bookmarks-page',
    locked: false,
    ...overrides
  };
}

describe('searchBookmarks', () => {
  it('tokenizes case-insensitive terms and strips leading handle at signs', () => {
    expect(tokenizeSearchQuery('  LOCAL @Ada  ')).toEqual(['local', 'ada']);
  });

  it('matches content, author, handle, tags, and folder', () => {
    const bookmarks = [
      item({
        id: 'one',
        tags: [{ id: 'tag_1', name: 'Research', color: '#111', createdAt: 1, updatedAt: 1, usageCount: 1 }],
        folder: { id: 'folder_1', name: 'Ideas', createdAt: 1, updatedAt: 1, sortOrder: 1 }
      })
    ];

    expect(searchBookmarks(bookmarks, 'knowledge')).toHaveLength(1);
    expect(searchBookmarks(bookmarks, 'lovelace')).toHaveLength(1);
    expect(searchBookmarks(bookmarks, '@ada')).toHaveLength(1);
    expect(searchBookmarks(bookmarks, 'research')).toHaveLength(1);
    expect(searchBookmarks(bookmarks, 'ideas')).toHaveLength(1);
  });

  it('uses multi-word AND matching', () => {
    const bookmarks = [item({ id: 'one', contentText: 'AI startup notes' }), item({ id: 'two', contentText: 'AI research' })];

    expect(searchBookmarks(bookmarks, 'ai startup').map((match) => match.bookmark.id)).toEqual(['one']);
  });

  it('orders results by imported time descending', () => {
    const bookmarks = [item({ id: 'old', importedAt: 1 }), item({ id: 'new', importedAt: 3 }), item({ id: 'middle', importedAt: 2 })];

    expect(searchBookmarks(bookmarks, '').map((match) => match.bookmark.id)).toEqual(['new', 'middle', 'old']);
  });
});
