import { describe, expect, it } from 'vitest';

import type { BookmarkListItem } from '../db/bookmarkRepository';
import { createCsvExport, createExportFilename, createJsonBackup, createMarkdownExport } from './exportBookmarks';

function item(overrides: Partial<BookmarkListItem>): BookmarkListItem {
  return {
    id: overrides.id ?? 'bookmark_1',
    tweetId: '1',
    tweetUrl: 'https://x.com/ada/status/1',
    authorName: 'Ada',
    authorHandle: 'ada',
    contentText: 'Hello, "CSV"\nworld',
    mediaUrls: [],
    importedAt: Date.parse('2026-06-22T00:00:00.000Z'),
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

describe('exportBookmarks', () => {
  it('creates JSON backups for provided eligible bookmarks', () => {
    const backup = createJsonBackup([item({ id: 'one' }), item({ id: 'deleted', deleted: true })], new Date('2026-06-22T00:00:00.000Z'));

    expect(backup.exportedAt).toBe('2026-06-22T00:00:00.000Z');
    expect(backup.bookmarks).toHaveLength(1);
    expect(backup.bookmarks[0].id).toBe('one');
  });

  it('creates Markdown with fallbacks', () => {
    const markdown = createMarkdownExport([item({ folder: undefined, tags: [] })]);

    expect(markdown).toContain('## Uncategorized');
    expect(markdown).toContain('- Tags: None');
  });

  it('escapes CSV commas, quotes, and newlines', () => {
    const csv = createCsvExport([item({ contentText: 'Hello, "CSV"\nworld' })]);

    expect(csv).toContain('"Hello, ""CSV""\nworld"');
  });

  it('creates dated filenames', () => {
    expect(createExportFilename('csv', new Date('2026-06-22T00:00:00.000Z'))).toBe('bookmarknest-export-2026-06-22.csv');
    expect(createExportFilename('markdown', new Date('2026-06-22T00:00:00.000Z'))).toBe('bookmarknest-export-2026-06-22.md');
  });
});
