import { memo, useEffect, useMemo, useState } from 'react';

import type { SearchMatch } from '../../lib/search/searchBookmarks';
import { BookmarkCard } from './BookmarkCard';
import { useIntersectionObserver } from '../hooks/useIntersectionObserver';

interface BookmarkListProps {
  matches: SearchMatch[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  hasSearchQuery: boolean;
  focusedIndex?: number | null;
  activeBookmarkId?: string | null;
  onOpen: (bookmarkId: string) => void;
  onArchive: (bookmarkId: string, archived: boolean) => void;
  onDelete: (bookmarkId: string) => void;
  onMove: (bookmarkId: string) => void;
  onTag: (bookmarkId: string) => void;
  onRemoveTag: (bookmarkId: string) => void;
  onAuthor: (authorHandle: string) => void;
  onToggleExportQueue: (bookmarkId: string, markedForExport: boolean) => void;
  selectedIds: Set<string>;
  onSelectedChange: (bookmarkId: string, selected: boolean) => void;
}

const PAGE_SIZE = 120;

function BookmarkListView({
  matches,
  totalCount,
  loading,
  error,
  hasSearchQuery,
  focusedIndex,
  activeBookmarkId,
  onOpen,
  onArchive,
  onDelete,
  onMove,
  onTag,
  onRemoveTag,
  onAuthor,
  onToggleExportQueue,
  selectedIds,
  onSelectedChange
}: BookmarkListProps) {
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const visibleMatches = useMemo(() => matches.slice(0, visibleLimit), [matches, visibleLimit]);
  const sentinelRef = useIntersectionObserver(() => setVisibleLimit((current) => current + PAGE_SIZE));

  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [matches]);

  useEffect(() => {
    if (focusedIndex != null && focusedIndex >= visibleLimit) {
      setVisibleLimit((current) => Math.max(current, focusedIndex + PAGE_SIZE));
    }
  }, [focusedIndex, visibleLimit]);

  if (loading) {
    return (
      <div className="flex min-h-[460px] items-center justify-center p-8 text-sm text-muted-foreground">
        Loading bookmarks...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[460px] items-center justify-center p-8">
        <div className="max-w-md border border-danger/25 bg-danger/5 px-6 py-5 text-sm text-danger">
          {error}
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    const isFilteredEmpty = totalCount > 0 || hasSearchQuery;
    return (
      <div className="flex min-h-[460px] items-center justify-center p-8">
        <div className="max-w-md border border-dashed border-border bg-background/65 px-6 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">{isFilteredEmpty ? 'No bookmarks in this view' : 'No bookmarks imported yet'}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {isFilteredEmpty
              ? 'Clear search, switch focus, or open a different saved view to broaden the result set.'
              : 'Open your X bookmarks page in Chrome, let the list load, then import the loaded items into this local library.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {visibleMatches.map(({ bookmark, matchedTerms }, index) => (
        <BookmarkCard
          key={bookmark.id}
          bookmark={bookmark}
          matchedTerms={matchedTerms}
          focused={focusedIndex === index}
          active={activeBookmarkId === bookmark.id}
          onOpen={onOpen}
          onArchive={onArchive}
          onDelete={onDelete}
          onMove={onMove}
          onTag={onTag}
          onRemoveTag={onRemoveTag}
          onAuthor={onAuthor}
          onToggleExportQueue={onToggleExportQueue}
          selected={selectedIds.has(bookmark.id)}
          onSelectedChange={onSelectedChange}
        />
      ))}
      {visibleMatches.length < matches.length ? (
        <div ref={sentinelRef} className="flex items-center justify-center p-4 text-sm text-muted-foreground">
          Loading more...
        </div>
      ) : null}
    </div>
  );
}

export const BookmarkList = memo(BookmarkListView, (prev, next) =>
  prev.matches === next.matches &&
  prev.totalCount === next.totalCount &&
  prev.loading === next.loading &&
  prev.error === next.error &&
  prev.hasSearchQuery === next.hasSearchQuery &&
  prev.focusedIndex === next.focusedIndex &&
  prev.activeBookmarkId === next.activeBookmarkId &&
  prev.selectedIds === next.selectedIds
);
