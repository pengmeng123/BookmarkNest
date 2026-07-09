import Dexie, { type Table } from 'dexie';

import type { Bookmark, Folder, ImportSession, SavedView, Tag } from '../../shared/types';

export interface SearchMetadata {
  bookmarkId: string;
  text: string;
  authorText: string;
  tokens: string[];
  updatedAt: number;
}

export class BookmarkNestDatabase extends Dexie {
  bookmarks!: Table<Bookmark, string>;
  folders!: Table<Folder, string>;
  tags!: Table<Tag, string>;
  importSessions!: Table<ImportSession, string>;
  searchMetadata!: Table<SearchMetadata, string>;
  savedViews!: Table<SavedView, string>;

  constructor(name = 'bookmarknest') {
    super(name);

    this.version(1).stores({
      bookmarks:
        '&id, &dedupeKey, tweetId, tweetUrl, authorHandle, importedAt, updatedAt, folderId, archived, deleted, [deleted+archived+importedAt]',
      folders: '&id, name, sortOrder, createdAt, updatedAt',
      tags: '&id, &name, color, usageCount, createdAt, updatedAt',
      importSessions: '&id, startedAt, finishedAt, status',
      searchMetadata: '&id, bookmarkId, updatedAt'
    });

    this.version(2).stores({
      bookmarks:
        '&id, &dedupeKey, tweetId, tweetUrl, authorHandle, importedAt, sourceOrder, updatedAt, folderId, archived, deleted, [deleted+archived+sourceOrder]',
      folders: '&id, name, sortOrder, createdAt, updatedAt',
      tags: '&id, &name, color, usageCount, createdAt, updatedAt',
      importSessions: '&id, startedAt, finishedAt, status',
      searchMetadata: '&id, bookmarkId, updatedAt'
    });

    this.version(3).stores({
      bookmarks:
        '&id, &dedupeKey, tweetId, tweetUrl, authorHandle, importedAt, sourceOrder, updatedAt, noteUpdatedAt, folderId, archived, deleted, [deleted+archived+sourceOrder]',
      folders: '&id, name, sortOrder, createdAt, updatedAt',
      tags: '&id, &name, color, usageCount, createdAt, updatedAt',
      importSessions: '&id, startedAt, finishedAt, status',
      searchMetadata: '&id, bookmarkId, updatedAt',
      savedViews: '&id, updatedAt, createdAt, folderId, tagId'
    });

    this.version(4).stores({
      bookmarks:
        '&id, &dedupeKey, tweetId, tweetUrl, authorHandle, authorName, createdAt, importedAt, sourceOrder, updatedAt, noteUpdatedAt, folderId, archived, deleted, [deleted+archived+sourceOrder]',
      folders: '&id, name, sortOrder, createdAt, updatedAt',
      tags: '&id, &name, color, usageCount, createdAt, updatedAt',
      importSessions: '&id, startedAt, finishedAt, status',
      searchMetadata: '&id, bookmarkId, updatedAt',
      savedViews: '&id, updatedAt, createdAt, folderId, tagId'
    });

    this.version(5).stores({
      bookmarks:
        '&id, &dedupeKey, tweetId, tweetUrl, authorHandle, authorName, createdAt, importedAt, sourceOrder, updatedAt, noteUpdatedAt, folderId, archived, deleted, [deleted+archived+sourceOrder]',
      folders: '&id, name, sortOrder, createdAt, updatedAt',
      tags: '&id, &name, color, usageCount, createdAt, updatedAt',
      importSessions: '&id, startedAt, finishedAt, status',
      searchMetadata: '&bookmarkId, *tokens, updatedAt',
      savedViews: '&id, updatedAt, createdAt, folderId, tagId'
    });

  }
}

export const db = new BookmarkNestDatabase();
