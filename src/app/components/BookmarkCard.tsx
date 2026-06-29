import { useEffect, useRef, useState } from 'react';
import { Archive, Check, ExternalLink, FolderInput, Link, Lock, Tag, Trash2 } from 'lucide-react';

import { Button } from '../../components/Button';
import { cn } from '../../lib/utils/cn';
import { sendRuntimeMessage } from '../../lib/messaging/runtime';
import type { BookmarkListItem } from '../../lib/db/bookmarkRepository';

interface BookmarkCardProps {
  bookmark: BookmarkListItem;
  matchedTerms?: string[];
  focused?: boolean;
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
  focused,
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
    <article ref={cardRef} className={cn('bg-surface p-4 transition hover:bg-background/60', focused && 'ring-2 ring-primary/40')}>
      <div className="flex gap-3">
        <input
          type="checkbox"
          className="mt-3 h-4 w-4 rounded border-border accent-primary"
          checked={selected}
          disabled={bookmark.locked}
          aria-label={`Select bookmark from ${bookmark.authorName}`}
          onChange={(event) => onSelectedChange(bookmark.id, event.target.checked)}
        />
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
          {bookmark.authorAvatarUrl ? (
            <img src={bookmark.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="truncate text-sm font-semibold">{bookmark.authorName}</h3>
                <span className="text-xs text-muted-foreground">@{bookmark.authorHandle}</span>
                {bookmark.locked ? (
                  <button
                    type="button"
                    onClick={() => void sendRuntimeMessage({ type: 'OPEN_UPGRADE' })}
                    className="inline-flex items-center gap-1 rounded-app border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary transition hover:bg-primary/20"
                    title="This bookmark is beyond the free 200-bookmark limit. Upgrade to Pro to manage it."
                  >
                    <Lock size={11} />
                    Upgrade to manage
                  </button>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-app bg-muted px-2 py-0.5">{bookmark.folder?.name ?? 'Uncategorized'}</span>
                {postDate ? <span>Posted {postDate}</span> : null}
                <span>Imported {formatDate(bookmark.importedAt)}</span>
              </div>
            </div>
          </div>
          <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-foreground">
            <HighlightedText text={bookmark.contentText} terms={matchedTerms} />
          </p>
          {bookmark.mediaUrls.length > 0 ? (
            <div className={cn('mt-3 grid gap-1 overflow-hidden rounded-lg', bookmark.mediaUrls.length >= 2 ? 'grid-cols-2' : '')}>
              {bookmark.mediaUrls.slice(0, 4).map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'relative block overflow-hidden bg-muted',
                    bookmark.mediaUrls.length === 1 ? 'max-h-48' : 'aspect-video',
                    bookmark.mediaUrls.length === 3 && index === 0 ? 'col-span-2' : ''
                  )}
                >
                  <img
                    src={thumbnailUrl(url)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition hover:opacity-90"
                  />
                  {index === 3 && bookmark.mediaUrls.length > 4 ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-medium text-white">
                      +{bookmark.mediaUrls.length - 4}
                    </span>
                  ) : null}
                </a>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {bookmark.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-app border border-border bg-background px-2 py-0.5 text-xs font-medium"
                style={{ color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
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
            <Button size="sm" onClick={() => onTag(bookmark.id)} disabled={bookmark.locked}>
              <Tag size={14} />
              Tag
            </Button>
            <Button size="sm" onClick={() => onMove(bookmark.id)} disabled={bookmark.locked}>
              <FolderInput size={14} />
              Move
            </Button>
            <Button size="sm" onClick={() => onArchive(bookmark.id, !bookmark.archived)} disabled={bookmark.locked}>
              <Archive size={14} />
              {bookmark.archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onRemoveTag(bookmark.id)} disabled={bookmark.locked || bookmark.tags.length === 0}>
              Remove tag
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
