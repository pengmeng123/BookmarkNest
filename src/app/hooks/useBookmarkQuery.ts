import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  listAllBookmarkItemsForQuery,
  listBookmarkIdsForQuery,
  queryBookmarkItems,
  type BookmarkListFilters,
  type BookmarkListItem,
  type BookmarkQueryRequest
} from '../../lib/db/bookmarkRepository';
import type { SortKey } from '../../lib/search/searchBookmarks';
import type { BookmarkFocusFilter } from '../../shared/types';

const PAGE_SIZE = 200;

interface ViewSummary {
  withNotes: number;
  queued: number;
}

interface UseBookmarkQueryArgs {
  filters: BookmarkListFilters;
  focus: BookmarkFocusFilter;
  authorQuery: string;
  query: string;
  sortKey: SortKey;
  revision: number;
}

export interface BookmarkQueryState {
  bookmarks: BookmarkListItem[];
  totalCount: number;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  viewSummary: ViewSummary;
  loadMore: () => Promise<void>;
  listAllItems: () => Promise<BookmarkListItem[]>;
  listAllIds: () => Promise<string[]>;
}

function createRequest(requestBase: BookmarkQueryRequest, offset: number, limit = PAGE_SIZE): BookmarkQueryRequest {
  return {
    ...requestBase,
    offset,
    limit
  };
}

export function useBookmarkQuery(args: UseBookmarkQueryArgs): BookmarkQueryState {
  const [bookmarks, setBookmarks] = useState<BookmarkListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewSummary, setViewSummary] = useState<ViewSummary>({ withNotes: 0, queued: 0 });
  const revision = args.revision;

  const requestBase = useMemo<BookmarkQueryRequest>(
    () => ({
      filters: args.filters,
      focus: args.focus,
      authorQuery: args.authorQuery,
      query: args.query,
      sortKey: args.sortKey
    }),
    [args.authorQuery, args.filters, args.focus, args.query, args.sortKey]
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await queryBookmarkItems(createRequest(requestBase, 0));
      setBookmarks(result.items);
      setTotalCount(result.totalCount);
      setHasMore(result.hasMore);
      setViewSummary(result.viewSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load bookmarks.');
      setBookmarks([]);
      setTotalCount(0);
      setHasMore(false);
      setViewSummary({ withNotes: 0, queued: 0 });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [requestBase]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial, revision]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const result = await queryBookmarkItems(createRequest(requestBase, bookmarks.length));
      setBookmarks((current) => [...current, ...result.items]);
      setTotalCount(result.totalCount);
      setHasMore(result.hasMore);
      setViewSummary(result.viewSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load more bookmarks.');
    } finally {
      setLoadingMore(false);
    }
  }, [bookmarks.length, hasMore, loading, loadingMore, requestBase]);

  const listAllItems = useCallback(() => listAllBookmarkItemsForQuery(requestBase), [requestBase]);
  const listAllIds = useCallback(() => listBookmarkIdsForQuery(requestBase), [requestBase]);

  return {
    bookmarks,
    totalCount,
    hasMore,
    loading,
    loadingMore,
    error,
    viewSummary,
    loadMore,
    listAllItems,
    listAllIds
  };
}
