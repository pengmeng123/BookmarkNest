import { useCallback, useEffect, useState } from 'react';

import {
  listBookmarkItems,
  listFolders,
  listImportSessions,
  listTags,
  getBookmarkCounts,
  type BookmarkListFilters,
  type BookmarkListItem,
  type BookmarkCounts
} from '../../lib/db/bookmarkRepository';
import type { Folder, ImportSession, Tag } from '../../shared/types';

export interface LibraryData {
  bookmarks: BookmarkListItem[];
  folders: Folder[];
  tags: Tag[];
  importSessions: ImportSession[];
  counts: BookmarkCounts;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const emptyCounts: BookmarkCounts = { total: 0, uncategorized: 0, archived: 0, byFolder: {} };

export function useLibraryData(filters: BookmarkListFilters): LibraryData {
  const [bookmarks, setBookmarks] = useState<BookmarkListItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);
  const [counts, setCounts] = useState<BookmarkCounts>(emptyCounts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextBookmarks, nextFolders, nextTags, nextImportSessions, nextCounts] = await Promise.all([
        listBookmarkItems(filters),
        listFolders(),
        listTags(),
        listImportSessions(),
        getBookmarkCounts()
      ]);
      setBookmarks(nextBookmarks);
      setFolders(nextFolders);
      setTags(nextTags);
      setImportSessions(nextImportSessions);
      setCounts(nextCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load local bookmarks.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { bookmarks, folders, tags, importSessions, counts, loading, error, refresh };
}
