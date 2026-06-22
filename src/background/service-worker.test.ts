import { afterEach, describe, expect, it } from 'vitest';

import { resetDomainData, softDeleteBookmark, upsertBookmark } from '../lib/db/bookmarkRepository';
import { db } from '../lib/db/database';
import { saveImportedBookmarks } from './service-worker';

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

  it('does not restore soft-deleted duplicate bookmarks', async () => {
    const existing = await upsertBookmark(bookmark);
    await softDeleteBookmark(existing.bookmark.id);

    await saveImportedBookmarks({
      sourceUrl: 'https://x.com/i/bookmarks',
      bookmarks: [bookmark],
      foundCount: 1,
      failedCount: 0
    });

    const stored = await db.bookmarks.get(existing.bookmark.id);
    expect(stored?.deleted).toBe(true);
  });
});
