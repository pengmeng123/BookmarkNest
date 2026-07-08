import { describe, expect, it } from 'vitest';

import type { BookmarkListItem } from '../db/bookmarkRepository';
import { createCsvExport, createExportFilename, createJsonBackup, createMarkdownExport, createResearchPackExport } from './exportBookmarks';

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
    ...overrides
  };
}

describe('exportBookmarks', () => {
  it('creates JSON backups for provided eligible bookmarks', () => {
    const backup = createJsonBackup([item({ id: 'one', note: 'Use in essay.' }), item({ id: 'deleted', deleted: true })], new Date('2026-06-22T00:00:00.000Z'));

    expect(backup.exportedAt).toBe('2026-06-22T00:00:00.000Z');
    expect(backup.bookmarks).toHaveLength(1);
    expect(backup.bookmarks[0].id).toBe('one');
    expect(backup.bookmarks[0].note).toBe('Use in essay.');
  });

  it('creates Markdown with fallbacks', () => {
    const markdown = createMarkdownExport([item({ folder: undefined, tags: [], note: 'Quote this.' })], { includeNotes: true });

    expect(markdown).toContain('## Uncategorized');
    expect(markdown).toContain('> Hello, "CSV"');
    expect(markdown).toContain('- Folder: Uncategorized');
    expect(markdown).toContain('- Tags: None');
    expect(markdown).toContain('#### Note');
    expect(markdown).toContain('Quote this.');
  });

  it('escapes CSV commas, quotes, and newlines', () => {
    const csv = createCsvExport([item({ contentText: 'Hello, "CSV"\nworld', note: 'Line one' })], { includeNotes: true });

    expect(csv).toContain('"Hello, ""CSV""\nworld"');
    expect(csv).toContain('note');
  });

  it('creates dated filenames', () => {
    expect(createExportFilename('csv', new Date('2026-06-22T00:00:00.000Z'))).toBe('bookmarknest-export-2026-06-22.csv');
    expect(createExportFilename('markdown', new Date('2026-06-22T00:00:00.000Z'))).toBe('bookmarknest-export-2026-06-22.md');
  });

  it('creates a research pack with metadata and notes', () => {
    const pack = createResearchPackExport(
      [
        item({
          note: 'Use this in the synthesis section.',
          mediaUrls: ['https://pbs.twimg.com/media/1.jpg'],
          tags: [{ id: 'tag_1', name: 'Research', color: '#111', createdAt: 1, updatedAt: 1, usageCount: 1 }],
          folder: { id: 'folder_1', name: 'Signals', createdAt: 1, updatedAt: 1, sortOrder: 0 },
          markedForExport: true
        })
      ],
      { includeNotes: true }
    );

    expect(pack).toContain('# BookmarkNest Research Pack');
    expect(pack).toContain('signals:');
    expect(pack).toContain('### Research note');
    expect(pack).toContain('Use this in the synthesis section.');
    expect(pack).toContain('folder: "Signals"');
  });
});
