import { memo, useEffect, useRef, useState } from 'react';
import { Archive, BookMarked, Check, ExternalLink, FilePenLine, FolderInput, Link, MoreHorizontal, Tag, Trash2, UserRound } from 'lucide-react';

import { Button } from '../../components/Button';
import { getBookmarkSignals } from '../../lib/bookmarks/metadata';
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
  onAuthor: (authorHandle: string) => void;
  onToggleExportQueue: (bookmarkId: string, markedForExport: boolean) => void;
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

export const BookmarkCard = memo(function BookmarkCard({
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
  onAuthor,
  onToggleExportQueue,
  selected,
  onSelectedChange
}: BookmarkCardProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [menuOpen, setMenuOpen] = useState(false);
  const postDate = bookmark.createdAt ? formatDate(bookmark.createdAt) : bookmark.createdAtText;
  const cardRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuCloseTimerRef = useRef<number | null>(null);
  const signals = getBookmarkSignals(bookmark);
  const featuredSignals = signals.slice(0, 2);
  const hiddenSignals = signals.slice(2);
  const visibleTags = bookmark.tags.slice(0, 3);
  const hiddenTagCount = Math.max(0, bookmark.tags.length - visibleTags.length);

  useEffect(() => {
    if (focused) {
      cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focused]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

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

  function openMenu() {
    if (menuCloseTimerRef.current != null) {
      window.clearTimeout(menuCloseTimerRef.current);
      menuCloseTimerRef.current = null;
    }
    setMenuOpen(true);
  }

  function closeMenuSoon() {
    if (menuCloseTimerRef.current != null) {
      window.clearTimeout(menuCloseTimerRef.current);
    }
    menuCloseTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false);
      menuCloseTimerRef.current = null;
    }, 180);
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
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="truncate text-sm font-semibold text-foreground">{bookmark.authorName}</h3>
                <span className="text-xs text-muted-foreground">@{bookmark.authorHandle}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/75">{bookmark.folder?.name ?? 'Uncategorized'}</span>
                {postDate ? <span>Posted {postDate}</span> : null}
                <span>Imported {formatDate(bookmark.importedAt)}</span>
              </div>
              {bookmark.note?.trim() || featuredSignals.length || hiddenSignals.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {bookmark.note?.trim() ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/12 px-2 py-1 text-[11px] font-medium text-foreground">
                      <FilePenLine size={11} />
                      Note
                    </span>
                  ) : null}
                  {featuredSignals.map((signal) => (
                    <span key={signal.key} className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      {signal.label}
                    </span>
                  ))}
                  {hiddenSignals.length ? (
                    <span
                      className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground"
                      title={hiddenSignals.map((signal) => signal.label).join(', ')}
                    >
                      +{hiddenSignals.length}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="hidden h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border/70 bg-muted sm:block">
              {bookmark.authorAvatarUrl ? (
                <img src={bookmark.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
          </div>
          <p className={cn('mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground', bookmark.note?.trim() ? 'line-clamp-3' : 'line-clamp-4')}>
            <HighlightedText text={bookmark.contentText} terms={matchedTerms} />
          </p>
          {bookmark.note?.trim() ? (
            <div className="mt-3 border-l-2 border-accent/60 bg-accent/5 px-3 py-2">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Research note</p>
              <p className="line-clamp-3 whitespace-pre-line text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                {bookmark.note.trim()}
              </p>
            </div>
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
          {bookmark.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {visibleTags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full border border-border bg-background/75 px-2 py-0.5 text-[11px] font-medium"
                  style={{ color: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
              {hiddenTagCount ? (
                <span
                  className="rounded-full border border-border bg-background/75 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  title={bookmark.tags.slice(3).map((tag) => tag.name).join(', ')}
                >
                  +{hiddenTagCount} tags
                </span>
              ) : null}
            </div>
          ) : null}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 sm:pl-7">
        {bookmark.tweetUrl ? (
          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => window.open(bookmark.tweetUrl, '_blank', 'noopener,noreferrer')}>
            <ExternalLink size={14} />
            Open
          </Button>
        ) : null}

        <Button
          size="icon"
          variant="secondary"
          onClick={() => void handleCopy()}
          disabled={!bookmark.tweetUrl}
          title={copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy link'}
          aria-label={copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy link'}
        >
          {copyState === 'copied' ? <Check size={14} /> : <Link size={14} />}
        </Button>

        <Button
          size="icon"
          variant={bookmark.markedForExport ? 'primary' : 'secondary'}
          onClick={() => onToggleExportQueue(bookmark.id, !bookmark.markedForExport)}
          title={bookmark.markedForExport ? 'Remove from export picks' : 'Pick for export'}
          aria-label={bookmark.markedForExport ? 'Remove from export picks' : 'Pick for export'}
        >
          <BookMarked size={14} />
        </Button>

        <div
          ref={menuRef}
          className="relative ml-auto"
          onMouseEnter={openMenu}
          onMouseLeave={closeMenuSoon}
        >
          <Button
            size="icon"
            variant="ghost"
            onClick={openMenu}
            onFocus={openMenu}
            title="More actions"
            aria-label="More actions"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={16} />
          </Button>

          {menuOpen ? (
            <div className="absolute right-0 top-full z-20 min-w-[180px] border border-border bg-surface p-1.5 shadow-xl">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false);
                  onTag(bookmark.id);
                }}
              >
                <Tag size={14} />
                Tag bookmark
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false);
                  onMove(bookmark.id);
                }}
              >
                <FolderInput size={14} />
                Move to folder
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false);
                  onAuthor(bookmark.authorHandle);
                }}
              >
                <UserRound size={14} />
                View author
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  setMenuOpen(false);
                  onRemoveTag(bookmark.id);
                }}
                disabled={bookmark.tags.length === 0}
              >
                <Tag size={14} />
                Remove tag
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false);
                  onArchive(bookmark.id, !bookmark.archived);
                }}
              >
                <Archive size={14} />
                {bookmark.archived ? 'Unarchive' : 'Archive'}
              </button>
              <div className="my-1 border-t border-border/80" />
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/5"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(bookmark.id);
                }}
              >
                <Trash2 size={14} />
                Delete bookmark
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
});
