import { afterEach, describe, expect, it } from 'vitest';

import {
  addTagToBookmarks,
  createDedupeKey,
  createFolder,
  createSavedView,
  createTag,
  deleteFolder,
  deleteSavedView,
  deleteTag,
  exportLocalBackup,
  importLocalBackup,
  listImportSessions,
  listBookmarkItems,
  listSavedViews,
  moveBookmarksToFolder,
  removeTagFromBookmark,
  resetDomainData,
  restoreFolder,
  restoreTag,
  setBookmarkMarkedForExport,
  softDeleteBookmark,
  softDeleteMissingXBookmarks,
  setBookmarkArchived,
  updateBookmarkNote,
  updateSavedView,
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

  it('does not overwrite enriched author fields with placeholder duplicate imports', async () => {
    await upsertBookmark({
      ...bookmarkInput(1),
      authorId: '123',
      authorName: 'Real Author',
      authorHandle: 'real_author',
      authorAvatarUrl: 'https://pbs.twimg.com/profile_images/real.jpg'
    });

    const updated = await upsertBookmark({
      ...bookmarkInput(1),
      authorId: '123',
      authorName: 'User 123',
      authorHandle: 'user_123',
      authorAvatarUrl: undefined
    });

    expect(updated.bookmark.authorName).toBe('Real Author');
    expect(updated.bookmark.authorHandle).toBe('real_author');
    expect(updated.bookmark.authorAvatarUrl).toBe('https://pbs.twimg.com/profile_images/real.jpg');
  });

  it('updates bookmark notes in place', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));

    await updateBookmarkNote(inserted.bookmark.id, 'Key angle for this thread');

    const stored = await db.bookmarks.get(inserted.bookmark.id);
    expect(stored?.note).toBe('Key angle for this thread');
    expect(stored?.noteUpdatedAt).toEqual(expect.any(Number));
  });

  it('marks bookmarks for the export queue', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));

    await setBookmarkMarkedForExport(inserted.bookmark.id, true);

    const stored = await db.bookmarks.get(inserted.bookmark.id);
    expect(stored?.markedForExport).toBe(true);
    expect(stored?.exportMarkedAt).toEqual(expect.any(Number));
  });

  it('creates, updates, lists, and deletes saved views', async () => {
    const savedView = await createSavedView({
      name: 'AI research',
      query: 'ai',
      sortKey: 'source',
      focus: 'with-notes',
      authorQuery: 'ada',
      folderId: null,
      tagId: null,
      includeArchived: false
    });

    expect((await listSavedViews()).map((view) => view.name)).toEqual(['AI research']);

    await updateSavedView(savedView.id, { name: 'Deep research', includeArchived: true });

    const [updated] = await listSavedViews();
    expect(updated.name).toBe('Deep research');
    expect(updated.focus).toBe('with-notes');
    expect(updated.authorQuery).toBe('ada');
    expect(updated.includeArchived).toBe(true);

    await deleteSavedView(savedView.id);
    expect(await listSavedViews()).toHaveLength(0);
  });

  it('soft deletes bookmarks without removing records', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    await softDeleteBookmark(inserted.bookmark.id);

    const stored = await db.bookmarks.get(inserted.bookmark.id);
    expect(stored?.deleted).toBe(true);
    expect(stored?.deletedAt).toEqual(expect.any(Number));
  });

  it('mirror-removes X bookmarks missing from the present set, sparing others', async () => {
    const kept = await upsertBookmark(bookmarkInput(1));
    const removed = await upsertBookmark(bookmarkInput(2));
    const manual = await upsertBookmark({ ...bookmarkInput(3), source: 'manual-import' as const });

    const presentKeys = new Set([createDedupeKey(bookmarkInput(1))]);
    const count = await softDeleteMissingXBookmarks(presentKeys);

    expect(count).toBe(1);
    expect((await db.bookmarks.get(removed.bookmark.id))?.deleted).toBe(true);
    expect((await db.bookmarks.get(kept.bookmark.id))?.deleted).toBe(false);
    expect((await db.bookmarks.get(manual.bookmark.id))?.deleted).toBe(false);
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

    const [item] = await listBookmarkItems();
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

    const defaultItems = await listBookmarkItems();
    expect(defaultItems.map((item) => item.id)).toEqual([visible.bookmark.id]);
    expect(defaultItems[0].folder?.name).toBe('Research');
    expect(defaultItems[0].tags[0].name).toBe('ai');

    const archivedItems = await listBookmarkItems({ includeArchived: true });
    expect(archivedItems.map((item) => item.id)).toEqual([archived.bookmark.id]);
  });

  it('lists bookmark items by X page visual order', async () => {
    const middle = await upsertBookmark({ ...bookmarkInput(1), sourceOrder: 1 });
    const top = await upsertBookmark({ ...bookmarkInput(2), sourceOrder: 0 });
    const bottom = await upsertBookmark({ ...bookmarkInput(3), sourceOrder: 2 });

    const items = await listBookmarkItems();

    expect(items.map((item) => item.id)).toEqual([top.bookmark.id, middle.bookmark.id, bottom.bookmark.id]);
  });

  it('filters bookmark items by folder and tag', async () => {
    const first = await upsertBookmark(bookmarkInput(1));
    const second = await upsertBookmark(bookmarkInput(2));
    const folder = await createFolder('Research');
    const tag = await createTag('ai');

    await moveBookmarksToFolder([first.bookmark.id], folder.id);
    await addTagToBookmarks([second.bookmark.id], tag.id);

    await expect(listBookmarkItems({ folderId: folder.id })).resolves.toMatchObject([{ id: first.bookmark.id }]);
    await expect(listBookmarkItems({ folderId: null })).resolves.toMatchObject([{ id: second.bookmark.id }]);
    await expect(listBookmarkItems({ tagId: tag.id })).resolves.toMatchObject([{ id: second.bookmark.id }]);
  });

  it('exports and imports a full local backup with notes and saved views', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    const folder = await createFolder('Backup');
    const tag = await createTag('restore');
    await moveBookmarksToFolder([inserted.bookmark.id], folder.id);
    await addTagToBookmarks([inserted.bookmark.id], tag.id);
    await updateBookmarkNote(inserted.bookmark.id, 'Preserve this angle');
    await createSavedView({
      name: 'Restored lane',
      query: 'restore',
      sortKey: 'author',
      focus: 'with-notes',
      authorQuery: 'author',
      folderId: folder.id,
      tagId: tag.id,
      includeArchived: false
    });
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

    const [item] = await listBookmarkItems();
    expect(item.folder?.name).toBe('Backup');
    expect(item.tags.map((itemTag) => itemTag.name)).toEqual(['restore']);
    expect(item.note).toBe('Preserve this angle');
    expect(await listImportSessions()).toHaveLength(1);
    expect((await listSavedViews())[0]).toMatchObject({ name: 'Restored lane', focus: 'with-notes', authorQuery: 'author' });
  });

  it('imports legacy backups without saved views', async () => {
    const inserted = await upsertBookmark(bookmarkInput(1));
    const legacyBackup = {
      schemaVersion: 2 as const,
      exportedAt: Date.now(),
      bookmarks: [inserted.bookmark],
      folders: [],
      tags: [],
      importSessions: []
    };

    await resetDomainData();
    await importLocalBackup(legacyBackup);

    expect(await listBookmarkItems()).toHaveLength(1);
    expect(await listSavedViews()).toHaveLength(0);
  });
});
