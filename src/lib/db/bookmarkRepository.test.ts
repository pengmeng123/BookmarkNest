import { afterEach, describe, expect, it } from 'vitest';

import {
  addTagToBookmarks,
  createDedupeKey,
  createFolder,
  createTag,
  deleteFolder,
  deleteTag,
  exportLocalBackup,
  getManageableBookmarkIds,
  importLocalBackup,
  listImportSessions,
  listBookmarkItems,
  moveBookmarksToFolder,
  removeTagFromBookmark,
  resetDomainData,
  restoreFolder,
  restoreTag,
  softDeleteBookmark,
  setBookmarkArchived,
  upsertBookmark
} from './bookmarkRepository';
import { db } from './database';

function bookmarkInput(index: number) {
  return {
    tweetId: `${index}`,
    tweetUrl: `https://x.com/user/status/${index}`,
    authorName: `Author ${index}`,
    authorHandle: `author${index}`,
    contentText: `Bookmark content ${index}`,
    source: 'x-bookmarks-page' as const
  };
}

describe('bookmarkRepository', () => {
  afterEach(async () => {
    await resetDomainData();
  });

  it('creates deterministic dedupe keys', () => {
    expect(createDedupeKey({ tweetId: ' 123 ', authorHandle: 'a', contentText: 'b' })).toBe('tweet:123');
    expect(createDedupeKey({ tweetUrl: ' https://x.com/a/status/1 ', authorHandle: 'a', contentText: 'b' })).toBe(
      'url:https://x.com/a/status/1'
    );
    expect(createDedupeKey({ authorHandle: 'User', contentText: ' Hello ' })).toBe('hash:user::hello');
  });

  it('preserves user fields when upserting duplicates', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    const folder = await createFolder('Research');
    await moveBookmarksToFolder([inserted.bookmark.id], folder.id);

    const updated = await upsertBookmark({
      ...bookmarkInput(1),
      authorName: 'Updated Author',
      contentText: 'Updated content'
    });

    expect(updated.inserted).toBe(false);
    expect(updated.bookmark.authorName).toBe('Updated Author');
    expect(updated.bookmark.folderId).toBe(folder.id);
  });

  it('soft deletes bookmarks without removing records', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    await softDeleteBookmark(inserted.bookmark.id);

    const stored = await db.bookmarks.get(inserted.bookmark.id);
    expect(stored?.deleted).toBe(true);
    expect(stored?.deletedAt).toEqual(expect.any(Number));
  });

  it('moves bookmarks to uncategorized when deleting a folder', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    const folder = await createFolder('Ideas');
    await moveBookmarksToFolder([inserted.bookmark.id], folder.id);
    await deleteFolder(folder.id);

    const stored = await db.bookmarks.get(inserted.bookmark.id);
    expect(stored?.folderId).toBeUndefined();
    expect(await db.folders.get(folder.id)).toBeUndefined();
  });

  it('restores a deleted folder with bookmark assignments', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    const folder = await createFolder('Ideas');
    await moveBookmarksToFolder([inserted.bookmark.id], folder.id);

    const snapshot = await deleteFolder(folder.id);
    expect((await db.bookmarks.get(inserted.bookmark.id))?.folderId).toBeUndefined();

    await restoreFolder(snapshot!);
    expect((await db.bookmarks.get(inserted.bookmark.id))?.folderId).toBe(folder.id);
    expect((await db.folders.get(folder.id))?.name).toBe('Ideas');
  });

  it('removes deleted tags from every bookmark', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    const tag = await createTag('ai');
    await addTagToBookmarks([inserted.bookmark.id], tag.id);
    await deleteTag(tag.id);

    const stored = await db.bookmarks.get(inserted.bookmark.id);
    expect(stored?.tagIds).not.toContain(tag.id);
    expect(await db.tags.get(tag.id)).toBeUndefined();
  });

  it('restores a deleted tag with bookmark assignments', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    const tag = await createTag('ai');
    await addTagToBookmarks([inserted.bookmark.id], tag.id);

    const snapshot = await deleteTag(tag.id);
    expect((await db.bookmarks.get(inserted.bookmark.id))?.tagIds).toEqual([]);

    await restoreTag(snapshot!);
    expect((await db.bookmarks.get(inserted.bookmark.id))?.tagIds).toContain(tag.id);
    expect((await db.tags.get(tag.id))?.usageCount).toBe(1);
  });

  it('updates tag usage when adding and removing tags', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    const tag = await createTag('ai');

    await addTagToBookmarks([inserted.bookmark.id], tag.id);
    expect((await db.tags.get(tag.id))?.usageCount).toBe(1);

    await removeTagFromBookmark(inserted.bookmark.id, tag.id);
    expect((await db.tags.get(tag.id))?.usageCount).toBe(0);
  });

  it('updates tag usage when tagged bookmarks are soft deleted', async () => {
    const first = await upsertBookmark(bookmarkInput(1));
    const second = await upsertBookmark(bookmarkInput(2));
    const tag = await createTag('ai');

    await addTagToBookmarks([first.bookmark.id, second.bookmark.id], tag.id);
    expect((await db.tags.get(tag.id))?.usageCount).toBe(2);

    await softDeleteBookmark(first.bookmark.id);
    expect((await db.tags.get(tag.id))?.usageCount).toBe(1);

    await softDeleteBookmark(second.bookmark.id);
    expect((await db.tags.get(tag.id))?.usageCount).toBe(0);
  });

  it('allows multiple different tags on the same bookmark', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    const first = await createTag('alpha');
    const second = await createTag('beta');

    await addTagToBookmarks([inserted.bookmark.id], first.id);
    await addTagToBookmarks([inserted.bookmark.id], second.id);

    const [item] = await listBookmarkItems({ isPro: true });
    expect(item.tags.map((tag) => tag.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('lists bookmark items with folders, tags, archive scope, and soft delete exclusion', async () => {
    const visible = await upsertBookmark(bookmarkInput(1));
    const archived = await upsertBookmark(bookmarkInput(2));
    const deleted = await upsertBookmark(bookmarkInput(3));
    const folder = await createFolder('Research');
    const tag = await createTag('ai');

    await moveBookmarksToFolder([visible.bookmark.id], folder.id);
    await addTagToBookmarks([visible.bookmark.id], tag.id);
    await setBookmarkArchived(archived.bookmark.id, true);
    await softDeleteBookmark(deleted.bookmark.id);

    const defaultItems = await listBookmarkItems({ isPro: true });
    expect(defaultItems.map((item) => item.id)).toEqual([visible.bookmark.id]);
    expect(defaultItems[0].folder?.name).toBe('Research');
    expect(defaultItems[0].tags[0].name).toBe('ai');

    const archivedItems = await listBookmarkItems({ includeArchived: true, isPro: true });
    expect(archivedItems.map((item) => item.id)).toEqual([archived.bookmark.id]);
  });

  it('lists bookmark items by X page visual order', async () => {
    const middle = await upsertBookmark({ ...bookmarkInput(1), sourceOrder: 1 });
    const top = await upsertBookmark({ ...bookmarkInput(2), sourceOrder: 0 });
    const bottom = await upsertBookmark({ ...bookmarkInput(3), sourceOrder: 2 });

    const items = await listBookmarkItems({ isPro: true });

    expect(items.map((item) => item.id)).toEqual([top.bookmark.id, middle.bookmark.id, bottom.bookmark.id]);
  });

  it('filters bookmark items by folder and tag', async () => {
    const first = await upsertBookmark(bookmarkInput(1));
    const second = await upsertBookmark(bookmarkInput(2));
    const folder = await createFolder('Research');
    const tag = await createTag('ai');

    await moveBookmarksToFolder([first.bookmark.id], folder.id);
    await addTagToBookmarks([second.bookmark.id], tag.id);

    await expect(listBookmarkItems({ folderId: folder.id, isPro: true })).resolves.toMatchObject([{ id: first.bookmark.id }]);
    await expect(listBookmarkItems({ folderId: null, isPro: true })).resolves.toMatchObject([{ id: second.bookmark.id }]);
    await expect(listBookmarkItems({ tagId: tag.id, isPro: true })).resolves.toMatchObject([{ id: second.bookmark.id }]);
  });

  it('limits free manageable scope to the recent 200 undeleted bookmarks', async () => {
    for (let index = 0; index < 205; index += 1) {
      await upsertBookmark(bookmarkInput(index));
    }

    const freeIds = await getManageableBookmarkIds(false);
    const proIds = await getManageableBookmarkIds(true);

    expect(freeIds.size).toBe(200);
    expect(proIds.size).toBe(205);

    const freeItems = await listBookmarkItems({ isPro: false });
    expect(freeItems.filter((item) => item.locked)).toHaveLength(5);
  });

  it('restores all imported bookmarks as manageable for Pro users', async () => {
    for (let index = 0; index < 205; index += 1) {
      await upsertBookmark(bookmarkInput(index));
    }

    const proItems = await listBookmarkItems({ isPro: true });

    expect(proItems).toHaveLength(205);
    expect(proItems.filter((item) => item.locked)).toHaveLength(0);
  });

  it('exports and imports a full local backup', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    const folder = await createFolder('Backup');
    const tag = await createTag('restore');
    await moveBookmarksToFolder([inserted.bookmark.id], folder.id);
    await addTagToBookmarks([inserted.bookmark.id], tag.id);
    await db.importSessions.add({
      id: 'import_test',
      startedAt: 1,
      finishedAt: 2,
      sourceUrl: 'https://x.com/i/bookmarks',
      foundCount: 1,
      insertedCount: 1,
      updatedCount: 0,
      duplicateCount: 0,
      failedCount: 0,
      status: 'completed'
    });

    const backup = await exportLocalBackup();
    await resetDomainData();
    await importLocalBackup(backup);

    const [item] = await listBookmarkItems({ isPro: true });
    expect(item.folder?.name).toBe('Backup');
    expect(item.tags.map((itemTag) => itemTag.name)).toEqual(['restore']);
    expect(await listImportSessions()).toHaveLength(1);
  });
});
