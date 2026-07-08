import type { Bookmark, BookmarkInput, Folder, ImportSession, SavedView, Tag } from '../../shared/types';
import { db } from './database';

export interface LocalBackup {
  schemaVersion: 3;
  exportedAt: number;
  bookmarks: Bookmark[];
  folders: Folder[];
  tags: Tag[];
  importSessions: ImportSession[];
  savedViews: SavedView[];
}

interface LegacyLocalBackup {
  schemaVersion: 2;
  exportedAt: number;
  bookmarks: Bookmark[];
  folders: Folder[];
  tags: Tag[];
  importSessions: ImportSession[];
}

export interface FolderRestoreSnapshot {
  folder: Folder;
  assignments: { bookmarkId: string; folderId?: string }[];
}

export interface TagRestoreSnapshot {
  tag: Tag;
  bookmarkIds: string[];
}

function createId(prefix: string) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function createDedupeKey(input: Pick<BookmarkInput, 'tweetId' | 'tweetUrl' | 'authorHandle' | 'contentText'>) {
  if (input.tweetId?.trim()) {
    return `tweet:${input.tweetId.trim()}`;
  }

  if (input.tweetUrl?.trim()) {
    return `url:${input.tweetUrl.trim()}`;
  }

  return `hash:${input.authorHandle.trim().toLowerCase()}::${input.contentText.trim().toLowerCase()}`;
}

function isPlaceholderAuthorName(value: string) {
  return value === 'Unknown user' || value === 'Unavailable tweet' || /^User \d+$/.test(value);
}

function isPlaceholderAuthorHandle(value: string) {
  return value === 'unknown' || value.startsWith('user_');
}

async function recalculateTagUsage(tagIds: string[]) {
  const uniqueTagIds = Array.from(new Set(tagIds));
  await Promise.all(
    uniqueTagIds.map(async (tagId) => {
      const usageCount = await db.bookmarks.filter((bookmark) => !bookmark.deleted && bookmark.tagIds.includes(tagId)).count();
      await db.tags.update(tagId, { usageCount, updatedAt: Date.now() });
    })
  );
}

export async function upsertBookmark(input: BookmarkInput) {
  const now = Date.now();
  const dedupeKey = createDedupeKey(input);
  const existing = await db.bookmarks.where('dedupeKey').equals(dedupeKey).first();

  if (existing) {
    const wasDeleted = existing.deleted;
    const updated: Bookmark = {
      ...existing,
      tweetId: input.tweetId ?? existing.tweetId,
      tweetUrl: input.tweetUrl ?? existing.tweetUrl,
      authorId: input.authorId ?? existing.authorId,
      authorName: isPlaceholderAuthorName(input.authorName) ? existing.authorName : input.authorName,
      authorHandle: isPlaceholderAuthorHandle(input.authorHandle) ? existing.authorHandle : input.authorHandle,
      authorAvatarUrl: input.authorAvatarUrl ?? existing.authorAvatarUrl,
      contentText: input.contentText,
      mediaUrls: input.mediaUrls ?? [],
      createdAtText: input.createdAtText,
      createdAt: input.createdAt,
      sourceOrder: input.sourceOrder ?? existing.sourceOrder,
      updatedAt: now,
      deleted: false,
      deletedAt: undefined,
      source: input.source
    };

    await db.bookmarks.put(updated);
    if (wasDeleted) {
      await recalculateTagUsage(updated.tagIds);
    }
    return { bookmark: updated, inserted: false, restored: wasDeleted };
  }

  const bookmark: Bookmark = {
    id: createId('bookmark'),
    tweetId: input.tweetId,
    tweetUrl: input.tweetUrl,
    authorId: input.authorId,
    authorName: input.authorName,
    authorHandle: input.authorHandle,
    authorAvatarUrl: input.authorAvatarUrl,
    contentText: input.contentText,
    mediaUrls: input.mediaUrls ?? [],
    createdAtText: input.createdAtText,
    createdAt: input.createdAt,
    sourceOrder: input.sourceOrder,
    importedAt: now,
    updatedAt: now,
    tagIds: [],
    archived: false,
    deleted: false,
    dedupeKey,
    source: input.source
  };

  await db.bookmarks.add(bookmark);
  return { bookmark, inserted: true, restored: false };
}

export async function updateBookmarkNote(bookmarkId: string, note: string) {
  const trimmed = note.trim();
  const nextNote = trimmed.length > 0 ? note : undefined;
  await db.bookmarks.update(bookmarkId, {
    note: nextNote,
    noteUpdatedAt: nextNote ? Date.now() : undefined,
    updatedAt: Date.now()
  });
}

export async function softDeleteBookmark(bookmarkId: string) {
  await db.transaction('rw', db.bookmarks, db.tags, async () => {
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (!bookmark || bookmark.deleted) {
      return;
    }

    await db.bookmarks.update(bookmarkId, {
      deleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now()
    });
    await recalculateTagUsage(bookmark.tagIds);
  });
}

export async function softDeleteMissingXBookmarks(presentKeys: Set<string>): Promise<number> {
  let removed = 0;
  await db.transaction('rw', db.bookmarks, db.tags, async () => {
    const now = Date.now();
    const removedTagIds = new Set<string>();
    await db.bookmarks
      .filter((bookmark) => bookmark.source === 'x-bookmarks-page' && !bookmark.deleted && !presentKeys.has(bookmark.dedupeKey))
      .modify((bookmark) => {
        bookmark.deleted = true;
        bookmark.deletedAt = now;
        bookmark.updatedAt = now;
        bookmark.tagIds.forEach((tagId) => removedTagIds.add(tagId));
        removed += 1;
      });
    await recalculateTagUsage(Array.from(removedTagIds));
  });
  return removed;
}

export async function restoreBookmarks(bookmarkIds: string[]) {
  await db.transaction('rw', db.bookmarks, db.tags, async () => {
    const restoredTagIds = new Set<string>();
    await db.bookmarks.where('id').anyOf(bookmarkIds).modify((bookmark) => {
      if (!bookmark.deleted) {
        return;
      }
      bookmark.deleted = false;
      delete bookmark.deletedAt;
      bookmark.updatedAt = Date.now();
      bookmark.tagIds.forEach((tagId) => restoredTagIds.add(tagId));
    });
    await recalculateTagUsage(Array.from(restoredTagIds));
  });
}

export async function setBookmarkArchived(bookmarkId: string, archived: boolean) {
  await db.bookmarks.update(bookmarkId, {
    archived,
    updatedAt: Date.now()
  });
}

export async function resetDomainData() {
  await db.transaction('rw', [db.bookmarks, db.folders, db.tags, db.importSessions, db.searchMetadata, db.savedViews], async () => {
    await Promise.all([
      db.bookmarks.clear(),
      db.folders.clear(),
      db.tags.clear(),
      db.importSessions.clear(),
      db.searchMetadata.clear(),
      db.savedViews.clear()
    ]);
  });
}

export async function exportLocalBackup(): Promise<LocalBackup> {
  const [bookmarks, folders, tags, importSessions, savedViews] = await Promise.all([
    db.bookmarks.toArray(),
    db.folders.toArray(),
    db.tags.toArray(),
    db.importSessions.toArray(),
    db.savedViews.orderBy('updatedAt').reverse().toArray()
  ]);

  return {
    schemaVersion: 3,
    exportedAt: Date.now(),
    bookmarks,
    folders,
    tags,
    importSessions,
    savedViews
  };
}

function isLegacyLocalBackup(value: unknown): value is LegacyLocalBackup {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const backup = value as Partial<LegacyLocalBackup>;
  return (
    backup.schemaVersion === 2 &&
    Array.isArray(backup.bookmarks) &&
    Array.isArray(backup.folders) &&
    Array.isArray(backup.tags) &&
    Array.isArray(backup.importSessions)
  );
}

function isLocalBackup(value: unknown): value is LocalBackup {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const backup = value as Partial<LocalBackup>;
  return (
    backup.schemaVersion === 3 &&
    Array.isArray(backup.bookmarks) &&
    Array.isArray(backup.folders) &&
    Array.isArray(backup.tags) &&
    Array.isArray(backup.importSessions) &&
    Array.isArray(backup.savedViews)
  );
}

export async function importLocalBackup(value: unknown) {
  if (!isLocalBackup(value) && !isLegacyLocalBackup(value)) {
    throw new Error('Backup file is not a valid BookmarkNest backup.');
  }

  const savedViews = isLocalBackup(value) ? value.savedViews : [];

  await db.transaction('rw', [db.bookmarks, db.folders, db.tags, db.importSessions, db.searchMetadata, db.savedViews], async () => {
    await Promise.all([
      db.bookmarks.clear(),
      db.folders.clear(),
      db.tags.clear(),
      db.importSessions.clear(),
      db.searchMetadata.clear(),
      db.savedViews.clear()
    ]);
    await Promise.all([
      db.bookmarks.bulkPut(value.bookmarks),
      db.folders.bulkPut(value.folders),
      db.tags.bulkPut(value.tags),
      db.importSessions.bulkPut(value.importSessions),
      savedViews.length ? db.savedViews.bulkPut(savedViews) : Promise.resolve()
    ]);
  });

  await recalculateTagUsage(value.tags.map((tag) => tag.id));
}

export async function createFolder(name: string) {
  const now = Date.now();
  const count = await db.folders.count();
  const folder: Folder = {
    id: createId('folder'),
    name,
    createdAt: now,
    updatedAt: now,
    sortOrder: count
  };

  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(folderId: string, name: string) {
  await db.folders.update(folderId, { name, updatedAt: Date.now() });
}

export async function deleteFolder(folderId: string): Promise<FolderRestoreSnapshot | null> {
  const folder = await db.folders.get(folderId);
  if (!folder) {
    return null;
  }

  const assignments = (await db.bookmarks.where('folderId').equals(folderId).toArray()).map((bookmark) => ({
    bookmarkId: bookmark.id,
    folderId: bookmark.folderId
  }));

  await db.transaction('rw', db.folders, db.bookmarks, db.savedViews, async () => {
    await db.bookmarks.where('folderId').equals(folderId).modify((bookmark) => {
      delete bookmark.folderId;
      bookmark.updatedAt = Date.now();
    });
    await db.savedViews.where('folderId').equals(folderId).modify((view) => {
      view.folderId = null;
      view.updatedAt = Date.now();
    });
    await db.folders.delete(folderId);
  });

  return { folder, assignments };
}

export async function restoreFolder(snapshot: FolderRestoreSnapshot) {
  await db.transaction('rw', db.folders, db.bookmarks, async () => {
    await db.folders.put(snapshot.folder);
    await Promise.all(
      snapshot.assignments.map((assignment) =>
        db.bookmarks.update(assignment.bookmarkId, {
          folderId: assignment.folderId,
          updatedAt: Date.now()
        })
      )
    );
  });
}

export async function moveBookmarksToFolder(bookmarkIds: string[], folderId?: string) {
  await db.bookmarks.where('id').anyOf(bookmarkIds).modify((bookmark) => {
    if (folderId) {
      bookmark.folderId = folderId;
    } else {
      delete bookmark.folderId;
    }
    bookmark.updatedAt = Date.now();
  });
}

export async function restoreBookmarkFolders(assignments: { bookmarkId: string; folderId?: string }[]) {
  await db.transaction('rw', db.bookmarks, async () => {
    await Promise.all(
      assignments.map((assignment) =>
        db.bookmarks.update(assignment.bookmarkId, {
          folderId: assignment.folderId,
          updatedAt: Date.now()
        })
      )
    );
  });
}

export async function createTag(name: string, color = '#14786f') {
  const now = Date.now();
  const tag: Tag = {
    id: createId('tag'),
    name,
    color,
    createdAt: now,
    updatedAt: now,
    usageCount: 0
  };

  await db.tags.add(tag);
  return tag;
}

export async function addTagToBookmarks(bookmarkIds: string[], tagId: string) {
  await db.transaction('rw', db.bookmarks, db.tags, async () => {
    let changed = 0;
    await db.bookmarks.where('id').anyOf(bookmarkIds).modify((bookmark) => {
      if (!bookmark.tagIds.includes(tagId)) {
        bookmark.tagIds.push(tagId);
        bookmark.updatedAt = Date.now();
        changed += 1;
      }
    });

    if (changed > 0) {
      await recalculateTagUsage([tagId]);
    }
  });
}

export async function removeTagFromBookmark(bookmarkId: string, tagId: string) {
  await db.transaction('rw', db.bookmarks, db.tags, async () => {
    await db.bookmarks.update(bookmarkId, (bookmark) => {
      bookmark.tagIds = bookmark.tagIds.filter((id) => id !== tagId);
      bookmark.updatedAt = Date.now();
    });
    await recalculateTagUsage([tagId]);
  });
}

export async function deleteTag(tagId: string): Promise<TagRestoreSnapshot | null> {
  const tag = await db.tags.get(tagId);
  if (!tag) {
    return null;
  }

  const bookmarkIds = (await db.bookmarks.filter((bookmark) => bookmark.tagIds.includes(tagId)).toArray()).map((bookmark) => bookmark.id);

  await db.transaction('rw', db.bookmarks, db.tags, db.savedViews, async () => {
    await db.bookmarks.filter((bookmark) => bookmark.tagIds.includes(tagId)).modify((bookmark) => {
      bookmark.tagIds = bookmark.tagIds.filter((id) => id !== tagId);
      bookmark.updatedAt = Date.now();
    });
    await db.savedViews.where('tagId').equals(tagId).modify((view) => {
      view.tagId = null;
      view.updatedAt = Date.now();
    });
    await db.tags.delete(tagId);
  });

  return { tag, bookmarkIds };
}

export async function restoreTag(snapshot: TagRestoreSnapshot) {
  await db.transaction('rw', db.bookmarks, db.tags, async () => {
    await db.tags.put(snapshot.tag);
    await db.bookmarks.where('id').anyOf(snapshot.bookmarkIds).modify((bookmark) => {
      if (!bookmark.tagIds.includes(snapshot.tag.id)) {
        bookmark.tagIds.push(snapshot.tag.id);
        bookmark.updatedAt = Date.now();
      }
    });
    await recalculateTagUsage([snapshot.tag.id]);
  });
}

export interface BookmarkListFilters {
  folderId?: string | null;
  tagId?: string | null;
  includeArchived?: boolean;
}

export interface BookmarkListItem extends Bookmark {
  folder?: Folder;
  tags: Tag[];
}

function compareBookmarksBySourceOrder(left: Bookmark, right: Bookmark) {
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

export async function listBookmarkItems(filters: BookmarkListFilters = {}): Promise<BookmarkListItem[]> {
  const [bookmarks, folders, tags] = await Promise.all([db.bookmarks.toArray(), db.folders.toArray(), db.tags.toArray()]);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));

  return bookmarks
    .filter((bookmark) => !bookmark.deleted)
    .filter((bookmark) => (filters.includeArchived ? bookmark.archived : !bookmark.archived))
    .filter((bookmark) => {
      if (filters.folderId === null) {
        return !bookmark.folderId;
      }
      if (filters.folderId) {
        return bookmark.folderId === filters.folderId;
      }
      return true;
    })
    .filter((bookmark) => (filters.tagId ? bookmark.tagIds.includes(filters.tagId) : true))
    .sort(compareBookmarksBySourceOrder)
    .map((bookmark) => ({
      ...bookmark,
      folder: bookmark.folderId ? folderById.get(bookmark.folderId) : undefined,
      tags: bookmark.tagIds.map((tagId) => tagById.get(tagId)).filter((tag): tag is Tag => Boolean(tag))
    }));
}

export interface BookmarkCounts {
  total: number;
  uncategorized: number;
  archived: number;
  withNotes: number;
  byFolder: Record<string, number>;
}

export async function getBookmarkCounts(): Promise<BookmarkCounts> {
  const bookmarks = await db.bookmarks.filter((b) => !b.deleted).toArray();
  const active = bookmarks.filter((b) => !b.archived);
  const byFolder: Record<string, number> = {};
  let uncategorized = 0;
  let withNotes = 0;
  for (const b of active) {
    if (b.note?.trim()) {
      withNotes += 1;
    }
    if (b.folderId) {
      byFolder[b.folderId] = (byFolder[b.folderId] ?? 0) + 1;
    } else {
      uncategorized++;
    }
  }
  return {
    total: active.length,
    uncategorized,
    archived: bookmarks.length - active.length,
    withNotes,
    byFolder
  };
}

export async function listFolders() {
  return db.folders.orderBy('sortOrder').toArray();
}

export async function listTags() {
  const tags = await db.tags.orderBy('name').toArray();
  await recalculateTagUsage(tags.map((tag) => tag.id));
  return db.tags.orderBy('name').toArray();
}

export async function listImportSessions(limit = 8) {
  return db.importSessions.orderBy('startedAt').reverse().limit(limit).toArray();
}

export async function listSavedViews() {
  return db.savedViews.orderBy('updatedAt').reverse().toArray();
}

export async function createSavedView(input: Omit<SavedView, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = Date.now();
  const savedView: SavedView = {
    id: createId('view'),
    name: input.name,
    query: input.query,
    sortKey: input.sortKey,
    folderId: input.folderId ?? null,
    tagId: input.tagId ?? null,
    includeArchived: input.includeArchived,
    createdAt: now,
    updatedAt: now
  };

  await db.savedViews.add(savedView);
  return savedView;
}

export async function updateSavedView(savedViewId: string, input: Partial<Omit<SavedView, 'id' | 'createdAt' | 'updatedAt'>>) {
  await db.savedViews.update(savedViewId, {
    ...input,
    updatedAt: Date.now()
  });
}

export async function deleteSavedView(savedViewId: string) {
  await db.savedViews.delete(savedViewId);
}
