import { memo, useEffect, useMemo, useRef } from 'react';
import { Virtuoso, type ScrollSeekConfiguration, type VirtuosoHandle } from 'react-virtuoso';

import type { SearchMatch } from '../../lib/search/searchBookmarks';
import { BookmarkCard } from './BookmarkCard';

interface BookmarkListProps {
  matches: SearchMatch[];
  totalCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  loading: boolean;
  error: string | null;
  hasSearchQuery: boolean;
  focusedIndex?: number | null;
  activeBookmarkId?: string | null;
  onOpen: (bookmarkId: string) => void;
  onArchive: (bookmarkId: string, archived: boolean) => void;
  onDelete: (bookmarkId: string) => void;
  onRestore: (bookmarkId: string) => void;
  onPermanentlyDelete: (bookmarkId: string) => void;
  onMove: (bookmarkId: string) => void;
  onTag: (bookmarkId: string) => void;
  onRemoveTag: (bookmarkId: string) => void;
  onAuthor: (authorHandle: string) => void;
  onToggleExportQueue: (bookmarkId: string, markedForExport: boolean) => void;
  selectedIds: Set<string>;
  onSelectedChange: (bookmarkId: string, selected: boolean) => void;
  onLoadMore: () => void;
}

const scrollSeekConfiguration: ScrollSeekConfiguration = {
  enter: (velocity) => Math.abs(velocity) > 1400,
  exit: (velocity) => Math.abs(velocity) < 180,
  change: (_velocity, range) => range
};

function BookmarkCardPlaceholder() {
  return (
    <article className="border-b border-border/80 bg-surface/86 p-4 last:border-b-0">
      <div className="animate-pulse">
        <div className="flex gap-3">
          <div className="mt-1 h-4 w-4 rounded-sm bg-muted" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 bg-muted" />
                <div className="h-3 w-56 bg-muted/80" />
                <div className="flex gap-1.5">
                  <div className="h-5 w-16 rounded-full bg-muted/80" />
                  <div className="h-5 w-12 rounded-full bg-muted/60" />
                </div>
              </div>
              <div className="hidden h-10 w-10 rounded-full bg-muted sm:block" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-3 w-full bg-muted/80" />
              <div className="h-3 w-[92%] bg-muted/80" />
              <div className="h-3 w-[68%] bg-muted/60" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border/70 pt-3">
              <div className="h-8 w-20 bg-muted" />
              <div className="h-8 w-8 bg-muted/80" />
              <div className="h-8 w-8 bg-muted/80" />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function BookmarkListView({
  matches,
  totalCount,
  hasMore,
  loadingMore,
  loading,
  error,
  hasSearchQuery,
  focusedIndex,
  activeBookmarkId,
  onOpen,
  onArchive,
  onDelete,
  onRestore,
  onPermanentlyDelete,
  onMove,
  onTag,
  onRemoveTag,
  onAuthor,
  onToggleExportQueue,
  selectedIds,
  onSelectedChange,
  onLoadMore
}: BookmarkListProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);

  useEffect(() => {
    if (focusedIndex == null || focusedIndex < 0 || focusedIndex >= matches.length) {
      return;
    }

    virtuosoRef.current?.scrollToIndex({
      index: focusedIndex,
      align: 'center',
      behavior: 'smooth'
    });
  }, [focusedIndex, matches.length]);

  const footerLabel = useMemo(() => {
    if (matches.length === 0) {
      return null;
    }

    if (!hasMore) {
      return `${totalCount} bookmarks loaded`;
    }

    return loadingMore ? `Loading ${matches.length} of ${totalCount}...` : `${matches.length} of ${totalCount} bookmarks loaded`;
  }, [hasMore, loadingMore, matches.length, totalCount]);

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
    <Virtuoso
      ref={virtuosoRef}
      useWindowScroll
      totalCount={matches.length}
      endReached={() => {
        if (hasMore && !loadingMore) {
          onLoadMore();
        }
      }}
      overscan={320}
      increaseViewportBy={{ top: 600, bottom: 1200 }}
      scrollSeekConfiguration={scrollSeekConfiguration}
      computeItemKey={(index) => matches[index]?.bookmark.id ?? `bookmark-${index}`}
      components={{
        ScrollSeekPlaceholder: BookmarkCardPlaceholder,
        Footer: footerLabel
          ? () => <div className="border-t border-border/70 px-4 py-4 text-center text-xs text-muted-foreground">{footerLabel}</div>
          : undefined
      }}
      itemContent={(index) => {
        const { bookmark, matchedTerms } = matches[index];
        return (
          <BookmarkCard
            bookmark={bookmark}
            matchedTerms={matchedTerms}
            focused={focusedIndex === index}
            active={activeBookmarkId === bookmark.id}
            onOpen={onOpen}
            onArchive={onArchive}
          onDelete={onDelete}
          onRestore={onRestore}
          onPermanentlyDelete={onPermanentlyDelete}
            onMove={onMove}
            onTag={onTag}
            onRemoveTag={onRemoveTag}
            onAuthor={onAuthor}
            onToggleExportQueue={onToggleExportQueue}
            selected={selectedIds.has(bookmark.id)}
            onSelectedChange={onSelectedChange}
          />
        );
      }}
    />
  );
}

export const BookmarkList = memo(BookmarkListView, (prev, next) =>
  prev.matches === next.matches &&
  prev.totalCount === next.totalCount &&
  prev.hasMore === next.hasMore &&
  prev.loadingMore === next.loadingMore &&
  prev.loading === next.loading &&
  prev.error === next.error &&
  prev.hasSearchQuery === next.hasSearchQuery &&
  prev.focusedIndex === next.focusedIndex &&
  prev.activeBookmarkId === next.activeBookmarkId &&
  prev.selectedIds === next.selectedIds
);
