import { useEffect, useRef, useState } from 'react';
import { Archive, Check, ExternalLink, FilePenLine, FolderInput, Link, Tag, Trash2 } from 'lucide-react';

import { Button } from '../../components/Button';
import { cn } from '../../lib/utils/cn';
import type { BookmarkListItem } from '../../lib/db/bookmarkRepository';

interface BookmarkCardProps {
  bookmark: BookmarkListItem;
  matchedTerms?: string[];
  focused?: boolean;
  active?: boolean;
  onOpen: (bookmarkId: string) => void;
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

function thumbnailUrl(url: string): string {
  if (!url.includes('pbs.twimg.com')) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('name', 'small');
    return parsed.toString();
  } catch {
    return url;
  }
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
          <mark key={`${part}-${index}`} className="rounded-sm bg-accent/25 px-0.5 text-foreground">
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
  focused,
  active,
  onOpen,
  onArchive,
  onDelete,
  onMove,
  onTag,
  onRemoveTag,
  selected,
  onSelectedChange
}: BookmarkCardProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const postDate = bookmark.createdAt ? formatDate(bookmark.createdAt) : bookmark.createdAtText;
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (focused) {
      cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focused]);

  async function handleCopy() {
    if (!bookmark.tweetUrl) {
      setCopyState('failed');
      window.setTimeout(() => setCopyState('idle'), 1600);
      return;
    }

    try {
      await navigator.clipboard?.writeText(bookmark.tweetUrl);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    window.setTimeout(() => setCopyState('idle'), 1600);
  }

  return (
    <article
      ref={cardRef}
      className={cn(
        'border-b border-border/80 bg-surface/86 p-4 transition last:border-b-0 hover:bg-[#f7fbfa] dark:hover:bg-[#122320]',
        active && 'bg-[#edf8f4] shadow-[inset_2px_0_0_0_rgba(24,118,102,0.95)] dark:bg-[#10211d]',
        focused && 'ring-1 ring-primary/35'
      )}
    >
      <div className="flex gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-border accent-primary"
          checked={selected}
          aria-label={`Select bookmark from ${bookmark.authorName}`}
          onChange={(event) => onSelectedChange(bookmark.id, event.target.checked)}
        />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onOpen(bookmark.id)}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">{bookmark.authorName}</h3>
                <span className="text-xs text-muted-foreground">@{bookmark.authorHandle}</span>
                {bookmark.note?.trim() ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-foreground">
                    <FilePenLine size={11} />
                    Note
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <span>{bookmark.folder?.name ?? 'Uncategorized'}</span>
                {postDate ? <span>Posted {postDate}</span> : null}
                <span>Imported {formatDate(bookmark.importedAt)}</span>
              </div>
            </div>
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border/70 bg-muted">
              {bookmark.authorAvatarUrl ? (
                <img src={bookmark.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
          </div>
          <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-foreground">
            <HighlightedText text={bookmark.contentText} terms={matchedTerms} />
          </p>
          {bookmark.note?.trim() ? (
            <p className="mt-3 line-clamp-2 border-l-2 border-accent/60 pl-3 whitespace-pre-line text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
              {bookmark.note.trim()}
            </p>
          ) : null}
          {bookmark.mediaUrls.length > 0 ? (
            <div className={cn('mt-3 grid gap-1 overflow-hidden rounded-md', bookmark.mediaUrls.length >= 2 ? 'grid-cols-2' : '')}>
              {bookmark.mediaUrls.slice(0, 4).map((url, index) => (
                <span
                  key={url}
                  className={cn(
                    'relative block overflow-hidden bg-muted',
                    bookmark.mediaUrls.length === 1 ? 'max-h-44' : 'aspect-video',
                    bookmark.mediaUrls.length === 3 && index === 0 ? 'col-span-2' : ''
                  )}
                >
                  <img src={thumbnailUrl(url)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {index === 3 && bookmark.mediaUrls.length > 4 ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white">
                      +{bookmark.mediaUrls.length - 4}
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {bookmark.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full border border-border bg-background/75 px-2 py-0.5 text-[11px] font-medium"
                style={{ color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 pl-7">
        {bookmark.tweetUrl ? (
          <Button size="sm" onClick={() => window.open(bookmark.tweetUrl, '_blank', 'noopener,noreferrer')}>
            <ExternalLink size={14} />
            Open
          </Button>
        ) : null}
        <Button size="sm" onClick={() => void handleCopy()} disabled={!bookmark.tweetUrl}>
          {copyState === 'copied' ? <Check size={14} /> : <Link size={14} />}
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
        </Button>
        <Button size="sm" onClick={() => onTag(bookmark.id)}>
          <Tag size={14} />
          Tag
        </Button>
        <Button size="sm" onClick={() => onMove(bookmark.id)}>
          <FolderInput size={14} />
          Move
        </Button>
        <Button size="sm" onClick={() => onArchive(bookmark.id, !bookmark.archived)}>
          <Archive size={14} />
          {bookmark.archived ? 'Unarchive' : 'Archive'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onRemoveTag(bookmark.id)} disabled={bookmark.tags.length === 0}>
          Remove tag
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(bookmark.id)}>
          <Trash2 size={14} />
          Delete
        </Button>
      </div>
    </article>
  );
}
