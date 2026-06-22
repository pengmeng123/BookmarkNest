import Dexie, { type Table } from 'dexie';

import type { Bookmark, Folder, ImportSession, Tag } from '../../shared/types';

export interface SearchMetadata {
  id: string;
  bookmarkId: string;
  text: string;
  updatedAt: number;
}

export class BookmarkNestDatabase extends Dexie {
  bookmarks!: Table<Bookmark, string>;
  folders!: Table<Folder, string>;
  tags!: Table<Tag, string>;
  importSessions!: Table<ImportSession, string>;
  searchMetadata!: Table<SearchMetadata, string>;

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
  }
}

export const db = new BookmarkNestDatabase();
