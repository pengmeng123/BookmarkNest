import { useCallback, useEffect, useState } from 'react';

import {
  listBookmarkItems,
  listFolders,
  listImportSessions,
  listTags,
  type BookmarkListFilters,
  type BookmarkListItem
} from '../../lib/db/bookmarkRepository';
import type { Folder, ImportSession, Tag } from '../../shared/types';

export interface LibraryData {
  bookmarks: BookmarkListItem[];
  folders: Folder[];
  tags: Tag[];
  importSessions: ImportSession[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useLibraryData(filters: BookmarkListFilters): LibraryData {
  const [bookmarks, setBookmarks] = useState<BookmarkListItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextBookmarks, nextFolders, nextTags, nextImportSessions] = await Promise.all([
        listBookmarkItems(filters),
        listFolders(),
        listTags(),
        listImportSessions()
      ]);
      setBookmarks(nextBookmarks);
      setFolders(nextFolders);
      setTags(nextTags);
      setImportSessions(nextImportSessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load local bookmarks.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { bookmarks, folders, tags, importSessions, loading, error, refresh };
}
