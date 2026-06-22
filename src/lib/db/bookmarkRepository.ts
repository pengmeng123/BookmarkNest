import { FREE_BOOKMARK_LIMIT } from '../../shared/constants';
import type { Bookmark, BookmarkInput, Folder, Tag } from '../../shared/types';
import { db } from './database';

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
      authorName: input.authorName,
      authorHandle: input.authorHandle,
      authorAvatarUrl: input.authorAvatarUrl,
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

export async function setBookmarkArchived(bookmarkId: string, archived: boolean) {
  await db.bookmarks.update(bookmarkId, {
    archived,
    updatedAt: Date.now()
  });
}

export async function resetDomainData() {
  await db.transaction('rw', db.bookmarks, db.folders, db.tags, db.importSessions, db.searchMetadata, async () => {
    await Promise.all([
      db.bookmarks.clear(),
      db.folders.clear(),
      db.tags.clear(),
      db.importSessions.clear(),
      db.searchMetadata.clear()
    ]);
  });
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

export async function deleteFolder(folderId: string) {
  await db.transaction('rw', db.folders, db.bookmarks, async () => {
    await db.bookmarks.where('folderId').equals(folderId).modify((bookmark) => {
      delete bookmark.folderId;
      bookmark.updatedAt = Date.now();
    });
    await db.folders.delete(folderId);
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

export async function deleteTag(tagId: string) {
  await db.transaction('rw', db.bookmarks, db.tags, async () => {
    await db.bookmarks.filter((bookmark) => bookmark.tagIds.includes(tagId)).modify((bookmark) => {
      bookmark.tagIds = bookmark.tagIds.filter((id) => id !== tagId);
      bookmark.updatedAt = Date.now();
    });
    await db.tags.delete(tagId);
  });
}

export async function getManageableBookmarkIds(isPro: boolean) {
  const bookmarks = (await db.bookmarks.filter((bookmark) => !bookmark.deleted).toArray()).sort(
    (left, right) => right.importedAt - left.importedAt
  );

  const scoped = isPro ? bookmarks : bookmarks.slice(0, FREE_BOOKMARK_LIMIT);
  return new Set(scoped.map((bookmark) => bookmark.id));
}

export interface BookmarkListFilters {
  folderId?: string | null;
  tagId?: string | null;
  includeArchived?: boolean;
  isPro?: boolean;
}

export interface BookmarkListItem extends Bookmark {
  folder?: Folder;
  tags: Tag[];
  locked: boolean;
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
  const [bookmarks, folders, tags, manageableIds] = await Promise.all([
    db.bookmarks.toArray(),
    db.folders.toArray(),
    db.tags.toArray(),
    getManageableBookmarkIds(Boolean(filters.isPro))
  ]);
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
      tags: bookmark.tagIds.map((tagId) => tagById.get(tagId)).filter((tag): tag is Tag => Boolean(tag)),
      locked: !manageableIds.has(bookmark.id)
    }));
}

export async function listFolders() {
  return db.folders.orderBy('sortOrder').toArray();
}

export async function listTags() {
  const tags = await db.tags.orderBy('name').toArray();
  await recalculateTagUsage(tags.map((tag) => tag.id));
  return db.tags.orderBy('name').toArray();
}
