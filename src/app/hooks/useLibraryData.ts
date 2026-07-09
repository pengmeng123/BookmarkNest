import { useCallback, useEffect, useState } from 'react';

import {
  listSavedViews,
  listFolders,
  listImportSessions,
  listTags,
  getBookmarkCounts,
  type BookmarkCounts
} from '../../lib/db/bookmarkRepository';
import type { Folder, ImportSession, Tag } from '../../shared/types';
import type { SavedView } from '../../shared/types';

export interface LibraryData {
  folders: Folder[];
  tags: Tag[];
  savedViews: SavedView[];
  importSessions: ImportSession[];
  counts: BookmarkCounts;
  loading: boolean;
  error: string | null;
  revision: number;
  refresh: () => Promise<void>;
}

const emptyCounts: BookmarkCounts = { total: 0, uncategorized: 0, archived: 0, withNotes: 0, exportQueue: 0, byFolder: {} };

export function useLibraryData(): LibraryData {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [importSessions, setImportSessions] = useState<ImportSession[]>([]);
  const [counts, setCounts] = useState<BookmarkCounts>(emptyCounts);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextFolders, nextTags, nextSavedViews, nextImportSessions, nextCounts] = await Promise.all([
        listFolders(),
        listTags(),
        listSavedViews(),
        listImportSessions(),
        getBookmarkCounts()
      ]);
      setFolders(nextFolders);
      setTags(nextTags);
      setSavedViews(nextSavedViews);
      setImportSessions(nextImportSessions);
      setCounts(nextCounts);
      setRevision((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load local bookmarks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { folders, tags, savedViews, importSessions, counts, loading, error, revision, refresh };
}
