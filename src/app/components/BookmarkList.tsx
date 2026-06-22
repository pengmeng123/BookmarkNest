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
    return <div className="flex min-h-[420px] items-center justify-center p-8 text-sm text-muted-foreground">Loading bookmarks...</div>;
  }

  if (error) {
    return <div className="flex min-h-[420px] items-center justify-center p-8 text-sm text-red-600">{error}</div>;
  }

  if (matches.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Open your X bookmarks page to import currently loaded bookmarks.
      </div>
    );
  }

  return (
    <div>
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
