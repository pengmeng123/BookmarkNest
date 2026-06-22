import { Archive, ExternalLink, FolderInput, Link, Tag, Trash2 } from 'lucide-react';

import { Button } from '../../components/Button';
import type { BookmarkListItem } from '../../lib/db/bookmarkRepository';

interface BookmarkCardProps {
  bookmark: BookmarkListItem;
  matchedTerms?: string[];
  onArchive: (bookmarkId: string, archived: boolean) => void;
  onDelete: (bookmarkId: string) => void;
  onMove: (bookmarkId: string) => void;
  onTag: (bookmarkId: string) => void;
  onRemoveTag: (bookmarkId: string) => void;
  selected: boolean;
  onSelectedChange: (bookmarkId: string, selected: boolean) => void;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(timestamp);
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) {
    return <>{text}</>;
  }

  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  if (!escaped.length) {
    return <>{text}</>;
  }

  const pattern = new RegExp(`(${escaped.join('|')})`, 'ig');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, index) =>
        escaped.some((term) => part.toLowerCase() === term.toLowerCase()) ? (
          <mark key={`${part}-${index}`} className="rounded bg-primary/20 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

export function BookmarkCard({
  bookmark,
  matchedTerms = [],
  onArchive,
  onDelete,
  onMove,
  onTag,
  onRemoveTag,
  selected,
  onSelectedChange
}: BookmarkCardProps) {
  return (
    <article className="border-b border-border p-4 last:border-b-0">
      <div className="flex gap-3">
        <input
          type="checkbox"
          className="mt-3 h-4 w-4 rounded border-border"
          checked={selected}
          disabled={bookmark.locked}
          aria-label={`Select bookmark from ${bookmark.authorName}`}
          onChange={(event) => onSelectedChange(bookmark.id, event.target.checked)}
        />
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
          {bookmark.authorAvatarUrl ? (
            <img src={bookmark.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-sm font-semibold">{bookmark.authorName}</h3>
            <span className="text-xs text-muted-foreground">@{bookmark.authorHandle}</span>
            {bookmark.locked ? (
              <span className="rounded-app bg-muted px-2 py-0.5 text-xs text-muted-foreground">Locked</span>
            ) : null}
          </div>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6">
            <HighlightedText text={bookmark.contentText} terms={matchedTerms} />
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{bookmark.folder?.name ?? 'Uncategorized'}</span>
            <span>{formatDate(bookmark.importedAt)}</span>
            {bookmark.tags.map((tag) => (
              <span key={tag.id} className="rounded-app bg-muted px-2 py-0.5" style={{ color: tag.color }}>
                {tag.name}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {bookmark.tweetUrl ? (
              <Button size="sm" onClick={() => window.open(bookmark.tweetUrl, '_blank', 'noopener,noreferrer')}>
                <ExternalLink size={14} />
                Open
              </Button>
            ) : null}
            <Button size="sm" onClick={() => void navigator.clipboard?.writeText(bookmark.tweetUrl ?? '')}>
              <Link size={14} />
              Copy
            </Button>
            <Button size="sm" onClick={() => onTag(bookmark.id)} disabled={bookmark.locked}>
              <Tag size={14} />
              Tag
            </Button>
            <Button size="sm" onClick={() => onRemoveTag(bookmark.id)} disabled={bookmark.locked || bookmark.tags.length === 0}>
              <Tag size={14} />
              Remove tag
            </Button>
            <Button size="sm" onClick={() => onMove(bookmark.id)} disabled={bookmark.locked}>
              <FolderInput size={14} />
              Move
            </Button>
            <Button size="sm" onClick={() => onArchive(bookmark.id, !bookmark.archived)} disabled={bookmark.locked}>
              <Archive size={14} />
              {bookmark.archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(bookmark.id)} disabled={bookmark.locked}>
              <Trash2 size={14} />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
