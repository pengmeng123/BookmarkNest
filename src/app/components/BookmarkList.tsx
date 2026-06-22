import type { SearchMatch } from '../../lib/search/searchBookmarks';
import { BookmarkCard } from './BookmarkCard';

interface BookmarkListProps {
  matches: SearchMatch[];
  loading: boolean;
  error: string | null;
  onArchive: (bookmarkId: string, archived: boolean) => void;
  onDelete: (bookmarkId: string) => void;
  onMove: (bookmarkId: string) => void;
  onTag: (bookmarkId: string) => void;
  onRemoveTag: (bookmarkId: string) => void;
  selectedIds: Set<string>;
  onSelectedChange: (bookmarkId: string, selected: boolean) => void;
}

export function BookmarkList({
  matches,
  loading,
  error,
  onArchive,
  onDelete,
  onMove,
  onTag,
  onRemoveTag,
  selectedIds,
  onSelectedChange
}: BookmarkListProps) {
  if (loading) {
    return <div className="flex min-h-[460px] items-center justify-center p-8 text-sm text-muted-foreground">Loading bookmarks...</div>;
  }

  if (error) {
    return <div className="flex min-h-[460px] items-center justify-center p-8 text-sm text-danger">{error}</div>;
  }

  if (matches.length === 0) {
    return (
      <div className="flex min-h-[460px] items-center justify-center p-8">
        <div className="max-w-sm rounded-app border border-dashed border-border bg-background px-6 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No bookmarks in this view</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Open X bookmarks in Chrome, let the page load, then import the currently loaded items.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {matches.map(({ bookmark, matchedTerms }) => (
        <BookmarkCard
          key={bookmark.id}
          bookmark={bookmark}
          matchedTerms={matchedTerms}
          onArchive={onArchive}
          onDelete={onDelete}
          onMove={onMove}
          onTag={onTag}
          onRemoveTag={onRemoveTag}
          selected={selectedIds.has(bookmark.id)}
          onSelectedChange={onSelectedChange}
        />
      ))}
    </div>
  );
}
