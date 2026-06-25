import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetDomainData, softDeleteBookmark, upsertBookmark } from '../lib/db/bookmarkRepository';
import { db } from '../lib/db/database';
import { getImportDiagnostics, saveImportedBookmarks } from './service-worker';

const bookmark = {
  tweetId: '1',
  tweetUrl: 'https://x.com/user/status/1',
  authorName: 'User',
  authorHandle: 'user',
  contentText: 'Saved content',
  source: 'x-bookmarks-page' as const
};

describe('saveImportedBookmarks', () => {
  afterEach(async () => {
    await resetDomainData();
    vi.unstubAllGlobals();
  });

  it('saves imported bookmarks in the extension database', async () => {
    const response = await saveImportedBookmarks({
      sourceUrl: 'https://x.com/i/bookmarks',
      bookmarks: [bookmark],
      foundCount: 1,
      failedCount: 0
    });

    expect(response.ok).toBe(true);
    expect(response.data?.session.insertedCount).toBe(1);
    expect(await db.bookmarks.count()).toBe(1);
  });

  it('stores the visual order from the X bookmarks page', async () => {
    await saveImportedBookmarks({
      sourceUrl: 'https://x.com/i/bookmarks',
      bookmarks: [
        { ...bookmark, tweetId: 'top', tweetUrl: 'https://x.com/user/status/top' },
        { ...bookmark, tweetId: 'bottom', tweetUrl: 'https://x.com/user/status/bottom' }
      ],
      foundCount: 2,
      failedCount: 0
    });

    const stored = await db.bookmarks.orderBy('sourceOrder').toArray();
    expect(stored.map((item) => item.tweetId)).toEqual(['top', 'bottom']);
    expect(stored.map((item) => item.sourceOrder)).toEqual([0, 1]);
  });

  it('refreshes the visual order for duplicates on later imports', async () => {
    await saveImportedBookmarks({
      sourceUrl: 'https://x.com/i/bookmarks',
      bookmarks: [
        { ...bookmark, tweetId: 'first', tweetUrl: 'https://x.com/user/status/first' },
        { ...bookmark, tweetId: 'second', tweetUrl: 'https://x.com/user/status/second' }
      ],
      foundCount: 2,
      failedCount: 0
    });

    await saveImportedBookmarks({
      sourceUrl: 'https://x.com/i/bookmarks',
      bookmarks: [
        { ...bookmark, tweetId: 'second', tweetUrl: 'https://x.com/user/status/second' },
        { ...bookmark, tweetId: 'first', tweetUrl: 'https://x.com/user/status/first' }
      ],
      foundCount: 2,
      failedCount: 0
    });

    const stored = await db.bookmarks.orderBy('sourceOrder').toArray();
    expect(stored.map((item) => item.tweetId)).toEqual(['second', 'first']);
  });

  it('counts duplicates without creating new records', async () => {
    await upsertBookmark(bookmark);

    const response = await saveImportedBookmarks({
      sourceUrl: 'https://x.com/i/bookmarks',
      bookmarks: [bookmark],
      foundCount: 1,
      failedCount: 0
    });

    expect(response.data?.session.duplicateCount).toBe(1);
    expect(response.data?.session.updatedCount).toBe(1);
    expect(await db.bookmarks.count()).toBe(1);
  });

  it('restores soft-deleted bookmarks when they are imported again', async () => {
    const existing = await upsertBookmark(bookmark);
    await softDeleteBookmark(existing.bookmark.id);

    const response = await saveImportedBookmarks({
      sourceUrl: 'https://x.com/i/bookmarks',
      bookmarks: [bookmark],
      foundCount: 1,
      failedCount: 0
    });

    const stored = await db.bookmarks.get(existing.bookmark.id);
    expect(stored?.deleted).toBe(false);
    expect(stored?.deletedAt).toBeUndefined();
    expect(response.data?.session.insertedCount).toBe(1);
  });

  it('exports sanitized import diagnostics without raw response bodies', async () => {
    const storage: Record<string, unknown> = {
      'bookmarknest:last-x-import-debug': {
        createdAt: 1710000000000,
        reason: 'graphql_error',
        queryId: 'BookmarksQuery',
        apiFoundCount: 27,
        domMatchedCount: 26,
        missingTweetIdSample: ['1', '2'],
        error: 'Rate limited',
        body: { data: { bookmark_timeline: { sensitive: 'raw response' } } }
      }
    };

    vi.stubGlobal('chrome', {
      runtime: {
        getManifest: () => ({ version: '0.1.0' })
      },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storage[key] }))
        }
      }
    });

    const response = await getImportDiagnostics();

    expect(response.ok).toBe(true);
    expect(response.data?.diagnostics).toMatchObject({
      extensionVersion: '0.1.0',
      createdAt: '2024-03-09T16:00:00.000Z',
      reason: 'graphql_error',
      queryId: 'BookmarksQuery',
      apiFoundCount: 27,
      domMatchedCount: 26,
      missingTweetIdSample: ['1', '2'],
      error: 'Rate limited'
    });
    expect(JSON.stringify(response.data?.diagnostics)).not.toContain('raw response');
  });
});
