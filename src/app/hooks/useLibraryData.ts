import { useCallback, useEffect, useState } from 'react';

import {
  listSavedViews,
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
import type { SavedView } from '../../shared/types';

export interface LibraryData {
  bookmarks: BookmarkListItem[];
  allBookmarks: BookmarkListItem[];
  folders: Folder[];
  tags: Tag[];
  savedViews: SavedView[];
  importSessions: ImportSession[];
  counts: BookmarkCounts;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const emptyCounts: BookmarkCounts = { total: 0, uncategorized: 0, archived: 0, withNotes: 0, exportQueue: 0, byFolder: {} };

export function useLibraryData(filters: BookmarkListFilters): LibraryData {
  const [bookmarks, setBookmarks] = useState<BookmarkListItem[]>([]);
  const [allBookmarks, setAllBookmarks] = useState<BookmarkListItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);
  const [counts, setCounts] = useState<BookmarkCounts>(emptyCounts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextBookmarks, nextFolders, nextTags, nextSavedViews, nextImportSessions, nextCounts] = await Promise.all([
        listBookmarkItems(filters),
        listFolders(),
        listTags(),
        listSavedViews(),
        listImportSessions(),
        getBookmarkCounts()
      ]);
      const [activeBookmarks, archivedBookmarks] = await Promise.all([listBookmarkItems(), listBookmarkItems({ includeArchived: true })]);
      setBookmarks(nextBookmarks);
      setAllBookmarks([...activeBookmarks, ...archivedBookmarks]);
      setFolders(nextFolders);
      setTags(nextTags);
      setSavedViews(nextSavedViews);
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

  return { bookmarks, allBookmarks, folders, tags, savedViews, importSessions, counts, loading, error, refresh };
}
