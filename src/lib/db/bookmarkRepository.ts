import type { Collection } from 'dexie';

import type { Bookmark, BookmarkFocusFilter, BookmarkInput, BookmarkSortKey, Folder, ImportSession, SavedView, Tag } from '../../shared/types';
import { buildBookmarkAuthorSearchText, buildBookmarkSearchText, tokenizeSearchText } from '../bookmarks/searchText';
import { tokenizeSearchQuery } from '../search/searchBookmarks';
import { db, type SearchMetadata } from './database';

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

let searchMetadataVerified = false;

function metadataUpdatedAt(bookmark: Bookmark) {
  return Math.max(
    bookmark.updatedAt,
    bookmark.noteUpdatedAt ?? 0,
    bookmark.exportMarkedAt ?? 0,
    bookmark.createdAt ?? 0
  );
}

function createSearchMetadata(bookmark: Bookmark, folder?: Folder, tags: Tag[] = []): SearchMetadata {
  const searchItem = {
    ...bookmark,
    folder,
    tags
  };
  const text = buildBookmarkSearchText(searchItem);
  const authorText = buildBookmarkAuthorSearchText(searchItem);

  return {
    bookmarkId: bookmark.id,
    text,
    authorText,
    tokens: tokenizeSearchText(text),
    updatedAt: metadataUpdatedAt(bookmark)
  };
}

async function putSearchMetadataEntries(bookmarks: Bookmark[]) {
  if (bookmarks.length === 0) {
    searchMetadataVerified = true;
    return;
  }

  const folderIds = Array.from(new Set(bookmarks.map((bookmark) => bookmark.folderId).filter((folderId): folderId is string => Boolean(folderId))));
  const tagIds = Array.from(new Set(bookmarks.flatMap((bookmark) => bookmark.tagIds)));
  const [folders, tags] = await Promise.all([
    folderIds.length ? db.folders.where('id').anyOf(folderIds).toArray() : Promise.resolve([] as Folder[]),
    tagIds.length ? db.tags.where('id').anyOf(tagIds).toArray() : Promise.resolve([] as Tag[])
  ]);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));

  await db.searchMetadata.bulkPut(
    bookmarks.map((bookmark) =>
      createSearchMetadata(
        bookmark,
        bookmark.folderId ? folderById.get(bookmark.folderId) : undefined,
        bookmark.tagIds.map((tagId) => tagById.get(tagId)).filter((tag): tag is Tag => Boolean(tag))
      )
    )
  );
  searchMetadataVerified = true;
}

async function refreshSearchMetadataForBookmarks(bookmarkIds: string[]) {
  if (bookmarkIds.length === 0) {
    return;
  }

  const bookmarks = await db.bookmarks.where('id').anyOf(Array.from(new Set(bookmarkIds))).toArray();
  await putSearchMetadataEntries(bookmarks);
}

async function rebuildSearchMetadataIndex() {
  const bookmarks = await db.bookmarks.toArray();
  await db.searchMetadata.clear();
  await putSearchMetadataEntries(bookmarks);
  searchMetadataVerified = true;
}

async function ensureSearchMetadataIndex() {
  if (searchMetadataVerified) {
    return;
  }
  const [bookmarkCount, metadataCount] = await Promise.all([db.bookmarks.count(), db.searchMetadata.count()]);
  if (bookmarkCount !== metadataCount) {
    await rebuildSearchMetadataIndex();
    return;
  }
  searchMetadataVerified = true;
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
    await putSearchMetadataEntries([updated]);
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
  await putSearchMetadataEntries([bookmark]);
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
  await refreshSearchMetadataForBookmarks([bookmarkId]);
}

export async function setBookmarkMarkedForExport(bookmarkId: string, markedForExport: boolean) {
  await db.bookmarks.update(bookmarkId, {
    markedForExport,
    exportMarkedAt: markedForExport ? Date.now() : undefined,
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
  searchMetadataVerified = true;
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

  await rebuildSearchMetadataIndex();
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
  const bookmarkIds = (await db.bookmarks.where('folderId').equals(folderId).toArray()).map((bookmark) => bookmark.id);
  await refreshSearchMetadataForBookmarks(bookmarkIds);
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

  await refreshSearchMetadataForBookmarks(assignments.map((assignment) => assignment.bookmarkId));

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
  await refreshSearchMetadataForBookmarks(snapshot.assignments.map((assignment) => assignment.bookmarkId));
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
  await refreshSearchMetadataForBookmarks(bookmarkIds);
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
  await refreshSearchMetadataForBookmarks(assignments.map((assignment) => assignment.bookmarkId));
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
  await refreshSearchMetadataForBookmarks(bookmarkIds);
}

export async function removeTagFromBookmark(bookmarkId: string, tagId: string) {
  await db.transaction('rw', db.bookmarks, db.tags, async () => {
    await db.bookmarks.update(bookmarkId, (bookmark) => {
      bookmark.tagIds = bookmark.tagIds.filter((id) => id !== tagId);
      bookmark.updatedAt = Date.now();
    });
    await recalculateTagUsage([tagId]);
  });
  await refreshSearchMetadataForBookmarks([bookmarkId]);
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

  await refreshSearchMetadataForBookmarks(bookmarkIds);

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
  await refreshSearchMetadataForBookmarks(snapshot.bookmarkIds);
}

export interface BookmarkListFilters {
  folderId?: string | null;
  tagId?: string | null;
  includeArchived?: boolean;
}

export interface BookmarkListItem extends Bookmark {
  folder?: Folder;
  tags: Tag[];
  searchText?: string;
  authorSearchText?: string;
}

export interface BookmarkQueryRequest {
  filters?: BookmarkListFilters;
  query?: string;
  sortKey?: BookmarkSortKey;
  focus?: BookmarkFocusFilter;
  authorQuery?: string;
  offset?: number;
  limit?: number;
}

export interface BookmarkQueryResult {
  items: BookmarkListItem[];
  totalCount: number;
  hasMore: boolean;
  viewSummary: {
    withNotes: number;
    queued: number;
  };
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

type BookmarkArchiveScope = 'active' | 'archived' | 'all';

function matchesArchiveScope(bookmark: Bookmark, scope: BookmarkArchiveScope) {
  if (scope === 'all') {
    return true;
  }

  return scope === 'archived' ? bookmark.archived : !bookmark.archived;
}

function matchesFolderFilter(bookmark: Bookmark, folderId: BookmarkListFilters['folderId']) {
  if (folderId === null) {
    return !bookmark.folderId;
  }

  if (folderId) {
    return bookmark.folderId === folderId;
  }

  return true;
}

function matchesTagFilter(bookmark: Bookmark, tagId: BookmarkListFilters['tagId']) {
  if (!tagId) {
    return true;
  }

  return bookmark.tagIds.includes(tagId);
}

function mapBookmarkListItem(bookmark: Bookmark, folderById: Map<string, Folder>, tagById: Map<string, Tag>) {
  const resolvedTags = bookmark.tagIds.map((tagId) => tagById.get(tagId)).filter((tag): tag is Tag => Boolean(tag));
  const folder = bookmark.folderId ? folderById.get(bookmark.folderId) : undefined;
  const item: BookmarkListItem = {
    ...bookmark,
    folder,
    tags: resolvedTags
  };

  item.searchText = buildBookmarkSearchText(item);
  item.authorSearchText = buildBookmarkAuthorSearchText(item);
  return item;
}

function mapBookmarkListItems(bookmarks: Bookmark[], folders: Folder[], tags: Tag[]) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));

  return bookmarks.map((bookmark) => mapBookmarkListItem(bookmark, folderById, tagById));
}

async function listBookmarksRaw(filters: BookmarkListFilters = {}, archiveScope: BookmarkArchiveScope = 'active'): Promise<Bookmark[]> {
  const filterByTag = typeof filters.tagId === 'string' && filters.tagId.length > 0;
  const filterByFolder = typeof filters.folderId === 'string' && filters.folderId.length > 0;

  if (filterByFolder) {
    return db.bookmarks
      .where('folderId')
      .equals(filters.folderId as string)
      .and((bookmark) => !bookmark.deleted && matchesArchiveScope(bookmark, archiveScope) && (!filterByTag || bookmark.tagIds.includes(filters.tagId as string)))
      .toArray();
  }

  return db.bookmarks
    .toCollection()
    .and(
      (bookmark) =>
        !bookmark.deleted &&
        matchesArchiveScope(bookmark, archiveScope) &&
        matchesFolderFilter(bookmark, filters.folderId) &&
        (!filterByTag || bookmark.tagIds.includes(filters.tagId as string))
    )
    .toArray();
}

export async function listBookmarkItems(filters: BookmarkListFilters = {}): Promise<BookmarkListItem[]> {
  const archiveScope = filters.includeArchived ? 'archived' : 'active';
  const [bookmarks, folders, tags] = await Promise.all([listBookmarksRaw(filters, archiveScope), db.folders.toArray(), db.tags.toArray()]);

  return mapBookmarkListItems(bookmarks.sort(compareBookmarksBySourceOrder), folders, tags);
}

export async function getBookmarkItemsByIds(bookmarkIds: string[]): Promise<BookmarkListItem[]> {
  if (bookmarkIds.length === 0) {
    return [];
  }

  const [bookmarks, folders, tags] = await Promise.all([db.bookmarks.where('id').anyOf(bookmarkIds).toArray(), db.folders.toArray(), db.tags.toArray()]);
  return mapBookmarkListItems(bookmarks, folders, tags);
}

function matchesFocusFilter(bookmark: BookmarkListItem, focus: SavedView['focus'] | undefined) {
  if (focus === 'with-notes') {
    return Boolean(bookmark.note?.trim());
  }
  if (focus === 'without-notes') {
    return !bookmark.note?.trim();
  }
  if (focus === 'with-media') {
    return bookmark.mediaUrls.length > 0;
  }
  if (focus === 'unfiled') {
    return !bookmark.folderId;
  }
  if (focus === 'export-queue') {
    return Boolean(bookmark.markedForExport);
  }

  return true;
}

function normalizeAuthorFilter(value: string | undefined) {
  return value?.normalize('NFC').toLowerCase().replace(/^@/, '').trim() ?? '';
}

function matchesSearchTerms(bookmark: BookmarkListItem, terms: string[]) {
  const searchText = bookmark.searchText ?? buildBookmarkSearchText(bookmark);
  return terms.every((term) => searchText.includes(term));
}

async function getCandidateBookmarkIdsForTerms(terms: string[]) {
  if (terms.length === 0) {
    return null;
  }

  if (terms.some((term) => term.length < 2)) {
    return null;
  }

  await ensureSearchMetadataIndex();

  const sortedTerms = [...terms].sort((left, right) => left.localeCompare(right));
  let candidateIds: Set<string> | null = null;

  for (const term of sortedTerms) {
    const matches = await db.searchMetadata.where('tokens').equals(term).toArray();
    const nextIds = new Set<string>(matches.map((match) => match.bookmarkId));
    if (candidateIds == null) {
      candidateIds = nextIds;
    } else {
      const currentIds: string[] = Array.from(candidateIds as Set<string>);
      candidateIds = new Set<string>(currentIds.filter((bookmarkId: string) => nextIds.has(bookmarkId)));
    }

    if (candidateIds.size === 0) {
      return candidateIds;
    }
  }

  return candidateIds;
}

function matchesBookmarkQuery(bookmark: BookmarkListItem, query: Pick<BookmarkQueryRequest, 'focus' | 'authorQuery' | 'query'>, terms: string[]) {
  if (!matchesFocusFilter(bookmark, query.focus)) {
    return false;
  }

  const authorQuery = normalizeAuthorFilter(query.authorQuery);
  if (authorQuery && !(bookmark.authorSearchText ?? `${bookmark.authorName} ${bookmark.authorHandle}`.normalize('NFC').toLowerCase()).includes(authorQuery)) {
    return false;
  }

  if (terms.length > 0 && !matchesSearchTerms(bookmark, terms)) {
    return false;
  }

  return true;
}

async function iterateSortedBookmarks(
  sortKey: BookmarkSortKey,
  callback: (bookmark: Bookmark) => void
) {
  const run = async (bookmarks: Collection<Bookmark, string>) => {
    await bookmarks.each((bookmark) => {
      callback(bookmark);
    });
  };

  switch (sortKey) {
    case 'date-imported':
      await run(db.bookmarks.orderBy('importedAt').reverse());
      break;
    case 'date-posted':
      await run(db.bookmarks.orderBy('createdAt').reverse().filter((bookmark) => bookmark.createdAt != null));
      await run(db.bookmarks.orderBy('importedAt').reverse().filter((bookmark) => bookmark.createdAt == null));
      break;
    case 'author':
      await run(db.bookmarks.orderBy('authorName'));
      break;
    default:
      await run(db.bookmarks.orderBy('sourceOrder').filter((bookmark) => bookmark.sourceOrder != null));
      await run(db.bookmarks.orderBy('importedAt').reverse().filter((bookmark) => bookmark.sourceOrder == null));
      break;
  }
}

async function queryBookmarksInternal(
  request: BookmarkQueryRequest,
  options?: { collectItems?: boolean; limitOverride?: number; idsOnly?: boolean }
): Promise<BookmarkQueryResult & { ids?: string[] }> {
  const filters = request.filters ?? {};
  const sortKey = request.sortKey ?? 'source';
  const offset = request.offset ?? 0;
  const limit = options?.limitOverride ?? request.limit ?? 200;
  const archiveScope: BookmarkArchiveScope = filters.includeArchived ? 'archived' : 'active';
  const terms = tokenizeSearchQuery(request.query ?? '');
  const candidateIds = await getCandidateBookmarkIdsForTerms(terms);
  const [folders, tags] = await Promise.all([db.folders.toArray(), db.tags.toArray()]);
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const items: BookmarkListItem[] = [];
  const ids: string[] = [];
  let totalCount = 0;
  let withNotes = 0;
  let queued = 0;

  await iterateSortedBookmarks(sortKey, (bookmark) => {
    if (
      bookmark.deleted ||
      (candidateIds != null && !candidateIds.has(bookmark.id)) ||
      !matchesArchiveScope(bookmark, archiveScope) ||
      !matchesFolderFilter(bookmark, filters.folderId) ||
      !matchesTagFilter(bookmark, filters.tagId)
    ) {
      return;
    }

    const item = mapBookmarkListItem(bookmark, folderById, tagById);
    if (!matchesBookmarkQuery(item, request, terms)) {
      return;
    }

    if (item.note?.trim()) {
      withNotes += 1;
    }
    if (item.markedForExport) {
      queued += 1;
    }
    if (options?.idsOnly) {
      ids.push(item.id);
    } else if ((options?.collectItems ?? true) && totalCount >= offset && items.length < limit) {
      items.push(item);
    }

    totalCount += 1;
  });

  return {
    items,
    ids: options?.idsOnly ? ids : undefined,
    totalCount,
    hasMore: offset + items.length < totalCount,
    viewSummary: { withNotes, queued }
  };
}

export async function queryBookmarkItems(request: BookmarkQueryRequest): Promise<BookmarkQueryResult> {
  const result = await queryBookmarksInternal(request);
  return {
    items: result.items,
    totalCount: result.totalCount,
    hasMore: result.hasMore,
    viewSummary: result.viewSummary
  };
}

export async function listBookmarkIdsForQuery(request: BookmarkQueryRequest): Promise<string[]> {
  const result = await queryBookmarksInternal(request, { collectItems: false, idsOnly: true });
  return result.ids ?? [];
}

export async function listAllBookmarkItemsForQuery(request: BookmarkQueryRequest): Promise<BookmarkListItem[]> {
  const result = await queryBookmarksInternal(request, { limitOverride: Number.MAX_SAFE_INTEGER });
  return result.items;
}

export async function getSavedViewCounts(savedViews: SavedView[]): Promise<Record<string, number>> {
  if (savedViews.length === 0) {
    return {};
  }

  const counts: Record<string, number> = {};

  for (const savedView of savedViews) {
    const result = await queryBookmarkItems({
      filters: {
        folderId: savedView.folderId ?? undefined,
        tagId: savedView.tagId ?? undefined,
        includeArchived: savedView.includeArchived
      },
      query: savedView.query,
      sortKey: savedView.sortKey,
      focus: savedView.focus,
      authorQuery: savedView.authorQuery,
      limit: 0
    });
    counts[savedView.id] = result.totalCount;
  }

  return counts;
}

export interface BookmarkCounts {
  total: number;
  uncategorized: number;
  archived: number;
  withNotes: number;
  exportQueue: number;
  byFolder: Record<string, number>;
}

export async function getBookmarkCounts(): Promise<BookmarkCounts> {
  const bookmarks = await db.bookmarks.filter((b) => !b.deleted).toArray();
  const active = bookmarks.filter((b) => !b.archived);
  const byFolder: Record<string, number> = {};
  let uncategorized = 0;
  let withNotes = 0;
  let exportQueue = 0;
  for (const b of active) {
    if (b.note?.trim()) {
      withNotes += 1;
    }
    if (b.markedForExport) {
      exportQueue += 1;
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
    exportQueue,
    byFolder
  };
}

export async function listFolders() {
  return db.folders.orderBy('sortOrder').toArray();
}

export async function listTags() {
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
    focus: input.focus ?? 'all',
    authorQuery: input.authorQuery?.trim() ?? '',
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
