import '../lib/utils/translateGuard';
import {
  Archive,
  BookMarked,
  ChevronRight,
  ChevronsUpDown,
  Cloud,
  CloudOff,
  Download,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  Folder,
  Inbox,
  LoaderCircle,
  Lock,
  MoreHorizontal,
  Moon,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Tags,
  Trash2,
  ArrowUp,
  Upload,
  UserRound,
  Waypoints,
  X
} from 'lucide-react';
import { forwardRef, StrictMode, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Field, SelectInput, TextInput, TextareaInput } from '../components/Field';
import { PageShell } from '../components/PageShell';
import { normalizeHandleSearchValue } from '../lib/bookmarks/searchText';
import { useTheme } from '../hooks/useTheme';
import {
  addTagToBookmarks,
  createFolder,
  createSavedView,
  createTag,
  deleteFolder,
  deleteSavedView,
  deleteTag,
  getBookmarkItemsByIds,
  getSavedViewCounts,
  moveBookmarksToFolder,
  removeTagFromBookmark,
  renameFolder,
  restoreBookmarkFolders,
  restoreBookmarks,
  restoreFolder,
  restoreTag,
  permanentlyDeleteBookmarks,
  setBookmarkArchived,
  setBookmarkMarkedForExport,
  softDeleteBookmark,
  updateBookmarkNote,
  updateSavedView,
  exportLocalBackup,
  type BookmarkListFilters,
  type BookmarkListItem
} from '../lib/db/bookmarkRepository';
import { getBookmarkSignals } from '../lib/bookmarks/metadata';
import { downloadBookmarks, downloadText } from '../lib/export/download';
import { canUseCapability } from '../lib/license/pro';
import { sendRuntimeMessage } from '../lib/messaging/runtime';
import { tokenizeSearchQuery, type SortKey } from '../lib/search/searchBookmarks';
import { getCloudSyncStatus, getLastBackupStatus, getLocalDataStatus, getSettings, saveSettings, setLastBackupStatus, subscribeToLocalStateChanges } from '../lib/storage/localStorage';
import { cn } from '../lib/utils/cn';
import type { BookmarkFocusFilter, CloudSyncStatus, ImportSession, LastBackupStatus, SavedView } from '../shared/types';
import '../styles/globals.css';
import { BookmarkList } from './components/BookmarkList';
import { MoveDialog } from './components/MoveDialog';
import { useBookmarkQuery } from './hooks/useBookmarkQuery';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useLibraryData } from './hooks/useLibraryData';
import { useLicenseState } from './hooks/useLicenseState';

type FolderFilter = string | null | undefined;
type NameDialogState =
  | { kind: 'create-folder'; title: string; label: string; initialValue?: string }
  | { kind: 'rename-folder'; title: string; label: string; folderId: string; initialValue?: string }
  | { kind: 'create-tag'; title: string; label: string; initialValue?: string }
  | { kind: 'create-view'; title: string; label: string; initialValue?: string }
  | { kind: 'rename-view'; title: string; label: string; viewId: string; initialValue?: string }
  | null;
type ConfirmDialogState =
  | { kind: 'delete-folder'; title: string; description: string; folderId: string; actionLabel: string }
  | { kind: 'delete-tag'; title: string; description: string; tagId: string; actionLabel: string }
  | { kind: 'delete-bookmark'; title: string; description: string; bookmarkId: string; actionLabel: string }
  | { kind: 'permanently-delete-bookmark'; title: string; description: string; bookmarkId: string; actionLabel: string }
  | { kind: 'bulk-delete'; title: string; description: string; actionLabel: string }
  | { kind: 'delete-view'; title: string; description: string; viewId: string; actionLabel: string }
  | null;
type TagDialogState = { kind: 'add' | 'remove'; bookmarkIds: string[]; bookmarkId?: string } | null;
type ImportStatus = { type: 'loading' | 'success' | 'error'; message: string } | null;
type ActionToast = { type: 'success' | 'error'; message: string; onUndo?: () => Promise<void> } | null;
type AppExportFormat = 'json' | 'markdown' | 'csv' | 'research-pack';
type ResearchViewState = {
  query: string;
  sortKey: SortKey;
  folderId: FolderFilter;
  tagId: string | null | undefined;
  includeArchived: boolean;
  focus: BookmarkFocusFilter;
  authorQuery: string;
};

const focusOptions: { value: BookmarkFocusFilter; label: string }[] = [
  { value: 'all', label: 'All evidence' },
  { value: 'with-notes', label: 'Has notes' },
  { value: 'without-notes', label: 'Needs notes' },
  { value: 'with-media', label: 'Has media' },
  { value: 'with-links', label: 'External links' },
  { value: 'threads', label: 'Threads' },
  { value: 'unfiled', label: 'Unfiled' },
  { value: 'export-queue', label: 'Export picks' }
];

const savedViewTemplates: Array<Pick<SavedView, 'name' | 'query' | 'sortKey' | 'focus' | 'authorQuery' | 'folderId' | 'tagId' | 'includeArchived'>> = [
  { name: 'Needs notes', query: '', sortKey: 'source', focus: 'without-notes', authorQuery: '', folderId: null, tagId: null, includeArchived: false },
  { name: 'Media references', query: '', sortKey: 'source', focus: 'with-media', authorQuery: '', folderId: null, tagId: null, includeArchived: false },
  { name: 'Unfiled inbox', query: '', sortKey: 'source', focus: 'unfiled', authorQuery: '', folderId: null, tagId: null, includeArchived: false },
  { name: 'Export picks', query: '', sortKey: 'source', focus: 'export-queue', authorQuery: '', folderId: null, tagId: null, includeArchived: false }
];

function formatImportError(error?: string) {
  if (!error) {
    return 'Import failed. Open your X bookmarks page and wait for bookmarks to load.';
  }

  if (error.includes('Open your X bookmarks page') || error.includes('No active tab')) {
    return 'No loaded X bookmarks page detected. Open x.com/i/bookmarks, wait for the list to appear, then try Import again.';
  }

  return error;
}

function formatShortDate(timestamp?: number) {
  if (!timestamp) {
    return null;
  }

  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(timestamp);
}

function formatBackupDate(timestamp?: number) {
  if (!timestamp) {
    return 'Never backed up';
  }

  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp);
}

function formatCloudDate(timestamp?: number) {
  if (!timestamp) {
    return 'Not protected yet';
  }

  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
    Math.round((timestamp - Date.now()) / (60 * 1000)),
    'minute'
  );
}

function backupFilename(timestamp: number) {
  const compactTimestamp = new Date(timestamp).toISOString().slice(0, 16).replaceAll('-', '').replaceAll(':', '').replace('T', '-');
  return `bookmarknest-backup-${compactTimestamp}.json`;
}

function normalizeAuthorQuery(value: string) {
  return normalizeHandleSearchValue(value);
}

function savedViewState(savedView: SavedView): ResearchViewState {
  return {
    query: savedView.query,
    sortKey: savedView.sortKey,
    folderId: savedView.folderId ?? undefined,
    tagId: savedView.tagId ?? undefined,
    includeArchived: savedView.includeArchived,
    focus: savedView.focus ?? 'all',
    authorQuery: savedView.authorQuery ?? ''
  };
}

function matchesSavedView(savedView: SavedView | undefined, state: ResearchViewState) {
  if (!savedView) {
    return false;
  }

  const saved = savedViewState(savedView);
  return (
    saved.query === state.query &&
    saved.sortKey === state.sortKey &&
    (saved.folderId ?? null) === (state.folderId ?? null) &&
    (saved.tagId ?? null) === (state.tagId ?? null) &&
    saved.includeArchived === state.includeArchived &&
    saved.focus === state.focus &&
    normalizeAuthorQuery(saved.authorQuery) === normalizeAuthorQuery(state.authorQuery)
  );
}

const DebouncedFilterInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onCommit: (value: string) => void;
    placeholder: string;
    ariaLabel: string;
    containerClassName: string;
    inputClassName?: string;
    icon?: ReactNode;
    label?: string;
    delayMs?: number;
  }
>(function DebouncedFilterInput(
  {
    value,
    onCommit,
    placeholder,
    ariaLabel,
    containerClassName,
    inputClassName,
    icon,
    label,
    delayMs = 180
  },
  ref
) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === value) {
      return;
    }

    const timeoutId = window.setTimeout(() => onCommit(draft), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [draft, value, onCommit, delayMs]);

  return (
    <label className={containerClassName}>
      {icon}
      {label ? <span className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span> : null}
      <input
        ref={ref}
        className={inputClassName ?? 'min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground'}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {draft ? (
        <button
          type="button"
          className="grid h-7 w-7 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Clear ${ariaLabel.toLowerCase()}`}
          onClick={() => {
            setDraft('');
            onCommit('');
          }}
        >
          <X size={15} />
        </button>
      ) : null}
    </label>
  );
});

function AppSidebar({
  folders,
  tags,
  counts,
  focusFilter,
  activeFolderId,
  activeTagId,
  includeArchived,
  showTrash,
  researchSources,
  onFocusChange,
  onFolderChange,
  onTagChange,
  onArchivedChange,
  onTrashChange,
  onAuthorSource,
  onDomainSource,
  onCreateFolder,
  onCreateTag,
  onRenameFolder,
  onDeleteFolder,
  onDeleteTag
}: {
  folders: { id: string; name: string }[];
  tags: { id: string; name: string; usageCount: number; color: string }[];
  counts: { total: number; deleted: number; uncategorized: number; archived: number; withNotes: number; exportQueue: number; byFolder: Record<string, number> };
  focusFilter: BookmarkFocusFilter;
  activeFolderId: FolderFilter;
  activeTagId?: string | null;
  includeArchived: boolean;
  showTrash: boolean;
  researchSources: { authors: { value: string; count: number }[]; domains: { value: string; count: number }[] };
  onFocusChange: (focus: BookmarkFocusFilter) => void;
  onFolderChange: (folderId: FolderFilter) => void;
  onTagChange: (tagId?: string | null) => void;
  onArchivedChange: (includeArchived: boolean) => void;
  onTrashChange: (showTrash: boolean) => void;
  onAuthorSource: (author: string) => void;
  onDomainSource: (domain: string) => void;
  onCreateFolder: () => void;
  onCreateTag: () => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteTag: (tagId: string) => void;
}) {
  const laneCardClass = (active: boolean) =>
    cn(
      'border border-border/70 bg-background/80 px-3 py-2 text-left transition hover:bg-background',
      active && 'border-accent/55 bg-accent/10 shadow-[inset_2px_0_0_0_rgba(125,91,22,0.95)]'
    );

  const navItemClass = (active: boolean) =>
    cn(
      'flex w-full items-center gap-2 border-b border-border/60 px-3 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-background/50 hover:text-foreground',
      active && 'bg-background/85 text-foreground shadow-[inset_2px_0_0_0_rgba(125,91,22,0.95)]'
    );

  return (
    <aside className="h-full border-b border-border bg-[#eaf1ef] dark:bg-[#101816] lg:sticky lg:top-0 lg:min-h-[calc(100vh-140px)] lg:border-b-0 lg:border-r lg:max-h-screen lg:overflow-y-auto">
      <div className="border-b border-border/70 px-4 py-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Research lanes</p>
        <div className="mt-3 grid gap-2 text-xs">
          <button
            className={laneCardClass(focusFilter === 'all')}
            onClick={(event) => {
              event.currentTarget.blur();
              onFocusChange('all');
            }}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Inbox size={14} />
              <span>Library</span>
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">{counts.total}</div>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={laneCardClass(focusFilter === 'without-notes')}
              onClick={(event) => {
                event.currentTarget.blur();
                onFocusChange('without-notes');
              }}
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles size={14} />
                <span>Needs notes</span>
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">{Math.max(0, counts.total - counts.withNotes)}</div>
            </button>
            <button
              className={laneCardClass(focusFilter === 'export-queue')}
              onClick={(event) => {
                event.currentTarget.blur();
                onFocusChange('export-queue');
              }}
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <PackageOpen size={14} />
                <span>Picks</span>
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">{counts.exportQueue}</div>
            </button>
          </div>
        </div>
      </div>

      <div className="px-2 py-3">
        <button className={navItemClass(activeFolderId === undefined && !includeArchived && !showTrash)} onClick={() => onFolderChange(undefined)}>
          <Inbox size={16} />
          <span className="truncate">All bookmarks</span>
          <span className="ml-auto text-xs">{counts.total}</span>
        </button>
        <button className={navItemClass(activeFolderId === null)} onClick={() => onFolderChange(null)}>
          <Folder size={16} />
          <span className="truncate">Uncategorized</span>
          <span className="ml-auto text-xs">{counts.uncategorized}</span>
        </button>
        <button className={navItemClass(includeArchived)} onClick={() => onArchivedChange(!includeArchived)}>
          <Archive size={16} />
          <span className="truncate">Archived</span>
          <span className="ml-auto text-xs">{counts.archived}</span>
        </button>
        <button className={navItemClass(showTrash)} onClick={() => onTrashChange(!showTrash)}>
          <Trash2 size={16} />
          <span className="truncate">Trash</span>
          <span className="ml-auto text-xs">{counts.deleted}</span>
        </button>
      </div>

      <div className="border-t border-border/70 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Folders</h2>
          <button className="grid h-7 w-7 place-items-center border border-border bg-background/80 text-foreground hover:bg-background" onClick={onCreateFolder} aria-label="New folder">
            <Plus size={15} />
          </button>
        </div>
        <div className="mt-3 space-y-1">
          {folders.map((folder) => (
            <div key={folder.id} className="group border border-transparent hover:border-border/60">
              <button className={navItemClass(activeFolderId === folder.id)} onClick={() => onFolderChange(folder.id)}>
                <Folder size={15} />
                <span className="truncate">{folder.name}</span>
                <span className="ml-auto text-xs">{counts.byFolder[folder.id] ?? 0}</span>
              </button>
              <div className="hidden items-center justify-end gap-1 bg-background/60 px-2 py-1 group-hover:flex">
                <button className="grid h-7 w-7 place-items-center text-muted-foreground hover:bg-background hover:text-foreground" onClick={() => onRenameFolder(folder.id)} aria-label={`Rename ${folder.name}`}>
                  <Pencil size={14} />
                </button>
                <button className="grid h-7 w-7 place-items-center text-muted-foreground hover:bg-background hover:text-foreground" onClick={() => onDeleteFolder(folder.id)} aria-label={`Delete ${folder.name}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border/70 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Tags</h2>
          <button className="grid h-7 w-7 place-items-center border border-border bg-background/80 text-foreground hover:bg-background" onClick={onCreateTag} aria-label="New tag">
            <Plus size={15} />
          </button>
        </div>
        <div className="mt-3 space-y-1">
          <button className={navItemClass(!activeTagId)} onClick={() => onTagChange(undefined)}>
            <Tags size={15} />
            <span className="truncate">All tags</span>
          </button>
          {tags.map((tag) => (
            <div key={tag.id} className="group border border-transparent hover:border-border/60">
              <button className={navItemClass(activeTagId === tag.id)} onClick={() => onTagChange(tag.id)}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                <span className="truncate">{tag.name}</span>
                <span className="ml-auto text-xs">{tag.usageCount}</span>
              </button>
              <div className="hidden justify-end bg-background/60 px-2 py-1 group-hover:flex">
                <button className="grid h-7 w-7 place-items-center text-muted-foreground hover:bg-background hover:text-foreground" onClick={() => onDeleteTag(tag.id)} aria-label={`Delete ${tag.name}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {(researchSources.authors.length || researchSources.domains.length) ? (
        <div className="border-t border-border/70 px-4 py-3">
          {researchSources.authors.length ? (
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Top authors</h2>
              <div className="mt-2 space-y-1">
                {researchSources.authors.map((source) => <button key={source.value} className={navItemClass(false)} onClick={() => onAuthorSource(source.value)}><UserRound size={14} /><span className="truncate">@{source.value}</span><span className="ml-auto text-xs">{source.count}</span></button>)}
              </div>
            </div>
          ) : null}
          {researchSources.domains.length ? (
            <div className={researchSources.authors.length ? 'mt-4' : ''}>
              <h2 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Link sources</h2>
              <div className="mt-2 space-y-1">
                {researchSources.domains.map((source) => <button key={source.value} className={navItemClass(false)} onClick={() => onDomainSource(source.value)}><ExternalLink size={14} /><span className="truncate">{source.value}</span><span className="ml-auto text-xs">{source.count}</span></button>)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function SavedViewRail({
  views,
  activeViewId,
  viewCounts,
  activeViewDirty,
  canManage,
  onCreate,
  onCreateTemplates,
  onUpdate,
  onApply,
  onRename,
  onDelete
}: {
  views: SavedView[];
  activeViewId: string | null;
  viewCounts: Record<string, number>;
  activeViewDirty: boolean;
  canManage: boolean;
  onCreate: () => void;
  onCreateTemplates: () => void;
  onUpdate: () => void;
  onApply: (savedView: SavedView) => void;
  onRename: (savedView: SavedView) => void;
  onDelete: (savedView: SavedView) => void;
}) {
  return (
    <div className="border-b border-border/70 bg-[#f2f7f5] px-4 py-3 dark:bg-[#101816]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          <Waypoints size={14} />
          Saved views
          {views.length ? <span className="text-[10px] tracking-[0.18em]">{views.length}</span> : null}
        </div>
        {!canManage ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock size={12} />Pro</span> : null}
        {views.length === 0 ? (
          <Button size="sm" variant="ghost" onClick={onCreateTemplates}>
            <Sparkles size={14} />
            Templates
          </Button>
        ) : null}
        {activeViewId && activeViewDirty ? (
          <Button size="sm" variant="ghost" onClick={onUpdate}>
            <Pencil size={14} />
            Update view
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={onCreate}>
          <Plus size={14} />
          Save view
        </Button>
      </div>
      <div className="mt-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {views.length === 0 ? (
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border border-dashed border-border/80 bg-background/50 px-3 py-2 text-sm text-muted-foreground">
            <span>Save the current search and filters as a reusable research lane.</span>
            <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={onCreateTemplates}>
              Add starter templates
            </button>
          </div>
        ) : (
          <div className="flex min-w-max items-stretch gap-2 pr-2">
            {views.map((savedView) => (
              <SavedViewTab
                key={savedView.id}
                savedView={savedView}
                active={activeViewId === savedView.id}
                count={viewCounts[savedView.id] ?? 0}
                dirty={activeViewId === savedView.id && activeViewDirty}
                onApply={onApply}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SavedViewTab({
  savedView,
  active,
  count,
  dirty,
  onApply,
  onRename,
  onDelete
}: {
  savedView: SavedView;
  active: boolean;
  count: number;
  dirty: boolean;
  onApply: (savedView: SavedView) => void;
  onRename: (savedView: SavedView) => void;
  onDelete: (savedView: SavedView) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const updateMenuPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 170;
    const viewportPadding = 12;
    setMenuPosition({
      top: rect.bottom + 4,
      left: Math.min(Math.max(viewportPadding, rect.right - menuWidth), window.innerWidth - menuWidth - viewportPadding)
    });
  };

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }

    function handleLayoutChange() {
      updateMenuPosition();
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('scroll', handleLayoutChange, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('scroll', handleLayoutChange, true);
    };
  }, [menuOpen]);

  const menu = menuOpen && menuPosition
    ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[2147483647] min-w-[170px] border border-border bg-surface p-1.5 shadow-xl"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
            onClick={() => {
              setMenuOpen(false);
              onRename(savedView);
            }}
          >
            <Pencil size={14} />
            Rename view
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger/5"
            onClick={() => {
              setMenuOpen(false);
              onDelete(savedView);
            }}
          >
            <Trash2 size={14} />
            Delete view
          </button>
        </div>,
        document.body
      )
    : null;

  return (
    <div
      className={cn(
        'group relative inline-flex h-11 shrink-0 items-stretch overflow-visible border bg-background/92 transition',
        active
          ? 'border-accent/60 bg-[#fbf8f1] text-foreground shadow-[inset_0_-2px_0_0_rgba(125,91,22,0.92)] dark:bg-[#1a1812]'
          : 'border-border text-muted-foreground hover:border-primary/25 hover:bg-background'
      )}
    >
      <button
        className="flex min-w-0 max-w-[250px] items-center gap-2 py-0 pl-3 pr-9 text-left"
        onClick={() => onApply(savedView)}
        title={savedView.name}
      >
        <span className="truncate text-sm font-medium">{savedView.name}</span>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">
          {count}
        </span>
        {dirty ? <span className="text-[11px] font-medium text-accent">Edited</span> : null}
      </button>
      <div ref={triggerRef} className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
        <button
          className={cn(
            'grid h-8 w-8 place-items-center bg-background/90 text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground focus:opacity-100',
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          )}
          onClick={() => setMenuOpen((current) => !current)}
          aria-label={`More actions for ${savedView.name}`}
          aria-expanded={menuOpen}
          title="More actions"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>
      {menu}
    </div>
  );
}

function BookmarkInspector({
  bookmark,
  noteBusy,
  noteStatus,
  canEditNotes,
  onSaveNote,
  onAuthorView,
  onToggleExportQueue,
  onUpgrade
}: {
  bookmark?: BookmarkListItem;
  noteBusy: boolean;
  noteStatus: string | null;
  canEditNotes: boolean;
  onSaveNote: (value: string) => void;
  onAuthorView: (authorHandle: string) => void;
  onToggleExportQueue: (bookmarkId: string, markedForExport: boolean) => void;
  onUpgrade: () => void;
}) {
  const shellClass =
    'border-t border-border bg-[#f7faf9] dark:bg-[#0f1514] lg:col-span-2 xl:col-span-1 xl:sticky xl:top-0 xl:min-h-[calc(100vh-140px)] xl:max-h-screen xl:overflow-y-auto xl:border-l xl:border-t-0';
  const [noteDraft, setNoteDraft] = useState(bookmark?.note ?? '');

  useEffect(() => {
    setNoteDraft(bookmark?.note ?? '');
  }, [bookmark?.id, bookmark?.note]);

  const noteDirty = (bookmark?.note ?? '') !== noteDraft;

  if (!bookmark) {
    return (
      <aside className={shellClass}>
        <div className="border-b border-border/70 bg-[#eef5f3] px-5 py-4 dark:bg-[#111c1a]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Details</p>
        </div>
        <div className="px-5 py-5">
          <div className="border border-dashed border-border/80 bg-background/55 p-4">
            <div className="flex h-9 w-9 items-center justify-center bg-primary/10 text-primary">
              <BookMarked size={17} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">Select a bookmark</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Open a saved post to review source details, tags, notes, and export status.
            </p>
          </div>
          <div className="mt-4 grid gap-2 text-sm">
            <div className="flex items-center gap-3 border border-border/70 bg-background/55 px-3 py-2.5 text-muted-foreground">
              <UserRound size={15} />
              Author and folder details
            </div>
            <div className="flex items-center gap-3 border border-border/70 bg-background/55 px-3 py-2.5 text-muted-foreground">
              <FileText size={15} />
              Research note
            </div>
            <div className="flex items-center gap-3 border border-border/70 bg-background/55 px-3 py-2.5 text-muted-foreground">
              <PackageOpen size={15} />
              Export picks status
            </div>
          </div>
        </div>
      </aside>
    );
  }

  const signals = getBookmarkSignals(bookmark);

  return (
    <aside className={shellClass}>
      <div className="border-b border-border/70 bg-[#eef5f3] px-5 py-4 dark:bg-[#111c1a]">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Details</p>
      </div>
      <div className="px-5 py-5">
        <div className="border-b border-border/70 pb-5">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
              {bookmark.authorAvatarUrl ? <img src={bookmark.authorAvatarUrl} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-foreground">{bookmark.authorName}</h2>
                  <div className="mt-1 text-sm text-muted-foreground">@{bookmark.authorHandle}</div>
                </div>
                {bookmark.tweetUrl ? (
                  <Button size="icon" variant="secondary" onClick={() => window.open(bookmark.tweetUrl, '_blank', 'noopener,noreferrer')} title="Open original post" aria-label="Open original post">
                    <ExternalLink size={14} />
                  </Button>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{bookmark.folder?.name ?? 'Uncategorized'}</span>
                {bookmark.createdAt ? <span>Posted {formatShortDate(bookmark.createdAt)}</span> : null}
                <span>Imported {formatShortDate(bookmark.importedAt)}</span>
              </div>
              {signals.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {signals.map((signal) => (
                    <span key={signal.key} className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      {signal.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 border-b border-border/70 pb-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Saved post</h3>
            {bookmark.authorHandle ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                onClick={() => onAuthorView(bookmark.authorHandle)}
              >
                <UserRound size={12} />
                <span>View author</span>
              </button>
            ) : null}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{bookmark.contentText}</p>
        </div>

        <div className="mt-5 border-b border-border/70 pb-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Research note</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Keep the reason this bookmark matters next to the saved post.
              </p>
            </div>
            {bookmark.noteUpdatedAt ? (
              <span className="shrink-0 text-xs text-muted-foreground">Edited {formatShortDate(bookmark.noteUpdatedAt)}</span>
            ) : null}
          </div>
          <div className="mt-3">
            <TextareaInput
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              readOnly={!canEditNotes}
              disabled={noteBusy}
              placeholder="Summarize the angle, cite the insight, or note the follow-up."
              className={!canEditNotes ? 'cursor-not-allowed opacity-80' : ''}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {noteStatus ? noteStatus : canEditNotes ? 'Stored locally in this browser.' : 'Notes stay visible, but editing is locked on Free.'}
            </div>
            {canEditNotes ? (
              <Button variant="primary" onClick={() => onSaveNote(noteDraft)} disabled={noteBusy || !noteDirty}>
                {noteBusy ? <LoaderCircle size={14} className="animate-spin" /> : <FileText size={14} />}
                {noteBusy ? 'Saving...' : 'Save note'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={onUpgrade}>
                <Lock size={14} />
                Upgrade to save notes
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5 border-b border-border/70 pb-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Tags</h3>
            <span className="text-xs text-muted-foreground">{bookmark.tags.length}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {bookmark.tags.length > 0 ? (
              bookmark.tags.map((tag) => (
                <span key={tag.id} className="rounded-full border border-border bg-background px-2 py-1 text-xs font-medium" style={{ color: tag.color }}>
                  {tag.name}
                </span>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No tags yet.</span>
            )}
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Actions</h3>
          <div className="mt-3">
            <Button variant={bookmark.markedForExport ? 'primary' : 'secondary'} className="justify-start" onClick={() => onToggleExportQueue(bookmark.id, !bookmark.markedForExport)}>
              <PackageOpen size={14} />
              {bookmark.markedForExport ? 'Remove from picks' : 'Pick for export'}
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function DataSafetyBar({
  bookmarkCount,
  archivedBookmarkCount,
  deletedBookmarkCount,
  savedViewCount,
  lastBackup,
  cloudStatus,
  cloudEnabled,
  canUseCloudSync,
  backupBusy,
  cloudBusy,
  backupStatus,
  onBackup,
  onRestore,
  onEnableCloud,
  onCloudBackup,
  onCloudRestore,
  onUpgrade
}: {
  bookmarkCount: number;
  archivedBookmarkCount: number;
  deletedBookmarkCount: number;
  savedViewCount: number;
  lastBackup: LastBackupStatus | null;
  cloudStatus: CloudSyncStatus | null;
  cloudEnabled: boolean;
  canUseCloudSync: boolean;
  backupBusy: boolean;
  cloudBusy: boolean;
  backupStatus: ActionToast;
  onBackup: () => void;
  onRestore: () => void;
  onEnableCloud: () => void;
  onCloudBackup: () => void;
  onCloudRestore: () => void;
  onUpgrade: () => void;
}) {
  const protectedAt = cloudStatus?.lastSuccessAt ?? lastBackup?.at;
  const backupAgeMs = protectedAt ? Date.now() - protectedAt : Number.POSITIVE_INFINITY;
  const stale = bookmarkCount > 0 && backupAgeMs > 7 * 24 * 60 * 60 * 1000;
  const cloudActive = canUseCloudSync && cloudEnabled;
  const cloudAttention = cloudStatus?.phase === 'attention';
  const protectedRecordCount =
    cloudStatus?.phase === 'protected'
      ? (cloudStatus.bookmarkCount ?? cloudStatus.visibleBookmarkCount ?? bookmarkCount)
      : bookmarkCount + archivedBookmarkCount + deletedBookmarkCount;
  const protectedVisibleCount = cloudStatus?.visibleBookmarkCount ?? bookmarkCount;
  const protectedArchivedCount = cloudStatus?.archivedBookmarkCount;
  const protectedDeletedCount = cloudStatus?.deletedBookmarkCount;
  const protectedRetainedCount = cloudStatus?.retainedBookmarkCount;
  const localRecordCount = bookmarkCount + archivedBookmarkCount + deletedBookmarkCount;
  const cloudCopy = !canUseCloudSync
    ? 'Upgrade to protect this local library with encrypted Cloud Sync.'
    : cloudActive
      ? cloudAttention
        ? cloudStatus?.lastError ?? 'Cloud Sync needs attention.'
        : `Encrypted cloud backup ${formatCloudDate(cloudStatus?.lastSuccessAt)}.`
      : 'Cloud Sync is ready. Turn it on to protect this library automatically.';

  if ((lastBackup || cloudStatus?.lastSuccessAt) && !stale && !cloudAttention) {
    return (
      <div className="border-b border-border bg-[#eef5f3] px-4 py-2.5 text-sm dark:bg-[#101816]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {cloudActive ? <Cloud size={13} /> : <ShieldCheck size={13} />}
              {cloudActive ? 'Cloud sync' : 'Data safety'}
            </span>
            <span className="text-muted-foreground">{cloudCopy}</span>
            <span className="text-xs text-muted-foreground">
              {protectedRecordCount} total protected records ({protectedVisibleCount} visible
              {protectedArchivedCount != null ? `, ${protectedArchivedCount} archived` : ''}
              {protectedDeletedCount != null ? `, ${protectedDeletedCount} in Trash` : protectedArchivedCount == null && protectedRetainedCount ? `, ${protectedRetainedCount} archived or in Trash` : ''}), {cloudStatus?.savedViewCount ?? lastBackup?.savedViewCount ?? savedViewCount} views
            </span>
            {backupStatus ? (
              <span className={cn('text-xs', backupStatus.type === 'error' ? 'text-danger' : 'text-primary')}>{backupStatus.message}</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {cloudActive ? (
              <Button size="xs" variant="ghost" onClick={onCloudBackup} disabled={cloudBusy || bookmarkCount === 0}>
                {cloudBusy ? <LoaderCircle size={13} className="animate-spin" /> : <Cloud size={13} />}
                Protect now
              </Button>
            ) : (
              <Button size="xs" variant="ghost" onClick={canUseCloudSync ? onEnableCloud : onUpgrade}>
                {canUseCloudSync ? <Cloud size={13} /> : <Lock size={13} />}
                {canUseCloudSync ? 'Turn on cloud' : 'Upgrade'}
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={onBackup} disabled={backupBusy || bookmarkCount === 0}>
              {backupBusy ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
              File backup
            </Button>
            <Button size="xs" variant="ghost" onClick={onRestore}>
              Restore
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('border-b border-border px-4 py-3', stale ? 'bg-[#fbf8f1] dark:bg-[#1a1710]' : 'bg-[#eef5f3] dark:bg-[#101816]')}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex h-7 items-center gap-1.5 px-2.5 text-xs font-semibold', stale ? 'bg-accent/12 text-accent' : 'bg-primary/10 text-primary')}>
              {cloudActive ? <Cloud size={13} /> : <CloudOff size={13} />}
              {cloudActive ? 'Cloud sync' : 'Data safety'}
            </span>
            <span className="text-sm font-medium text-foreground">{cloudActive ? cloudCopy : formatBackupDate(lastBackup?.at)}</span>
            {lastBackup ? (
              <span className="text-xs text-muted-foreground">
                {lastBackup.bookmarkCount} total records, {lastBackup.savedViewCount} views
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Chrome removes extension data on uninstall. Cloud Sync keeps an encrypted backup tied to your License Key, while file backup gives you an offline copy.
            Current local data: {localRecordCount} total records ({bookmarkCount} visible, {archivedBookmarkCount} archived, {deletedBookmarkCount} in Trash) and {savedViewCount} saved views.
          </p>
          {backupStatus ? (
            <p className={cn('mt-1 text-xs', backupStatus.type === 'error' ? 'text-danger' : 'text-primary')}>{backupStatus.message}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {cloudActive ? (
            <>
              <Button size="sm" variant="primary" onClick={onCloudBackup} disabled={cloudBusy || bookmarkCount === 0}>
                {cloudBusy ? <LoaderCircle size={14} className="animate-spin" /> : <Cloud size={14} />}
                {cloudBusy ? 'Protecting...' : 'Protect now'}
              </Button>
              <Button size="sm" variant="secondary" onClick={onCloudRestore} disabled={cloudBusy}>
                Restore from cloud
              </Button>
            </>
          ) : (
            <Button size="sm" variant="primary" onClick={canUseCloudSync ? onEnableCloud : onUpgrade}>
              {canUseCloudSync ? <Cloud size={14} /> : <Lock size={14} />}
              {canUseCloudSync ? 'Turn on Cloud Sync' : 'Upgrade for Cloud Sync'}
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={onBackup} disabled={backupBusy || bookmarkCount === 0}>
            {backupBusy ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
            {backupBusy ? 'Backing up...' : 'File backup'}
          </Button>
          <Button size="sm" variant="secondary" onClick={onRestore}>
            <Upload size={14} />
            Restore
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExportMenu({
  disabled,
  onExport
}: {
  disabled: boolean;
  onExport: (format: AppExportFormat) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 210;
    const viewportPadding = 12;
    setPosition({
      top: rect.bottom + 6,
      left: Math.min(Math.max(viewportPadding, rect.right - menuWidth), window.innerWidth - menuWidth - viewportPadding)
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    function handleLayoutChange() {
      updatePosition();
    }

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('scroll', handleLayoutChange, true);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('scroll', handleLayoutChange, true);
    };
  }, [open]);

  const exportItems: Array<{ format: AppExportFormat; label: string; description: string; icon: typeof FileJson }> = [
    { format: 'json', label: 'JSON backup', description: 'Current view data', icon: FileJson },
    { format: 'markdown', label: 'Markdown', description: 'Readable notes and posts', icon: FileText },
    { format: 'csv', label: 'CSV', description: 'Spreadsheet-friendly rows', icon: FileSpreadsheet },
    { format: 'research-pack', label: 'Research pack', description: 'Markdown bundle for a lane', icon: PackageOpen }
  ];

  const menu = open && position
    ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[2147483647] w-[210px] border border-border bg-surface p-1.5 shadow-xl"
          style={{ top: position.top, left: position.left }}
        >
          {exportItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.format}
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  setOpen(false);
                  onExport(item.format);
                }}
              >
                <Icon size={14} className="mt-0.5 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={triggerRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        className="inline-flex h-10 w-full items-center justify-center gap-2 border border-border bg-background px-4 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={15} />
        Export
        <ChevronsUpDown size={14} className="text-muted-foreground" />
      </button>
      {menu}
    </div>
  );
}

function NameDialog({
  state,
  busy,
  error,
  onClose,
  onSubmit
}: {
  state: NameDialogState;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(state?.initialValue ?? '');
  }, [state]);

  if (!state) {
    return null;
  }

  return (
    <Dialog
      open={Boolean(state)}
      title={state.title}
      onClose={onClose}
      closeOnOverlayClick={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => onSubmit(value.trim())} disabled={!value.trim() || busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
            {busy ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label={state.label}>
        <TextInput
          value={value}
          autoFocus
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value.trim() && !busy) {
              onSubmit(value.trim());
            }
          }}
        />
      </Field>
      {error ? <p className="mt-3 border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}
    </Dialog>
  );
}

function ConfirmDialog({
  state,
  busy,
  error,
  onClose,
  onConfirm
}: {
  state: ConfirmDialogState;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!state) {
    return null;
  }

  return (
    <Dialog
      open={Boolean(state)}
      title={state.title}
      description={state.description}
      onClose={onClose}
      closeOnOverlayClick={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
            {busy ? 'Working...' : state.actionLabel}
          </Button>
        </>
      }
    >
      <div className="border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-muted-foreground">
        This only changes your local BookmarkNest library.
      </div>
      {error ? <p className="mt-3 border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}
    </Dialog>
  );
}

function TagDialog({
  state,
  tags,
  busy,
  error,
  onClose,
  onSubmit
}: {
  state: TagDialogState;
  tags: { id: string; name: string; usageCount: number; color: string }[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (tagName: string) => void;
}) {
  const [selectedTag, setSelectedTag] = useState('__new__');
  const [newTagName, setNewTagName] = useState('');

  useEffect(() => {
    setSelectedTag(tags[0]?.name ?? '__new__');
    setNewTagName('');
  }, [state, tags]);

  if (!state) {
    return null;
  }

  const isRemove = state.kind === 'remove';
  const value = selectedTag === '__new__' ? newTagName.trim() : selectedTag;

  return (
    <Dialog
      open={Boolean(state)}
      title={isRemove ? 'Remove tag' : 'Add tag'}
      description={isRemove ? 'Choose which tag to remove from this bookmark.' : `${state.bookmarkIds.length} selected.`}
      onClose={onClose}
      closeOnOverlayClick={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => onSubmit(value)} disabled={!value || busy}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
            {busy ? 'Saving...' : isRemove ? 'Remove' : 'Add tag'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {tags.length > 0 ? (
          <Field label="Tag">
            <SelectInput value={selectedTag} disabled={busy} onChange={(event) => setSelectedTag(event.target.value)}>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.name}
                </option>
              ))}
              {!isRemove ? <option value="__new__">Create new tag...</option> : null}
            </SelectInput>
          </Field>
        ) : null}

        {!isRemove && (selectedTag === '__new__' || tags.length === 0) ? (
          <Field label="New tag name">
            <TextInput value={newTagName} autoFocus disabled={busy} onChange={(event) => setNewTagName(event.target.value)} />
          </Field>
        ) : null}
        {error ? <p className="border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}
      </div>
    </Dialog>
  );
}

function App() {
  const { theme, setTheme } = useTheme();
  const [folderId, setFolderId] = useState<FolderFilter>(undefined);
  const [tagId, setTagId] = useState<string | null | undefined>(undefined);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('source');
  const [focusFilter, setFocusFilter] = useState<BookmarkFocusFilter>('all');
  const [authorQuery, setAuthorQuery] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>(null);
  const [importMode, setImportMode] = useState<'visible' | 'auto-scroll' | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [moveTargetIds, setMoveTargetIds] = useState<string[] | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [tagDialog, setTagDialog] = useState<TagDialogState>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<ActionToast>(null);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [lastBackup, setLastBackup] = useState<LastBackupStatus | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus | null>(null);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudRestoreConfirmOpen, setCloudRestoreConfirmOpen] = useState(false);
  const [backupStatus, setBackupStatus] = useState<ActionToast>(null);
  const [savedViewCounts, setSavedViewCounts] = useState<Record<string, number>>({});
  const debouncedSearchQuery = searchQuery;
  const debouncedAuthorQuery = authorQuery;
  const workspaceTopRef = useRef<HTMLElement>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const lastSeenLocalDataAtRef = useRef(0);
  const { isPro, license } = useLicenseState();
  const filters = useMemo<BookmarkListFilters>(() => ({ folderId, tagId, includeArchived, includeDeleted: showTrash }), [folderId, tagId, includeArchived, showTrash]);
  const library = useLibraryData();
  const refreshLibrary = library.refresh;
  const currentViewState = useMemo<ResearchViewState>(
    () => ({
      query: debouncedSearchQuery,
      sortKey,
      folderId,
      tagId,
      includeArchived,
      focus: focusFilter,
      authorQuery: debouncedAuthorQuery
    }),
    [debouncedSearchQuery, sortKey, folderId, tagId, includeArchived, focusFilter, debouncedAuthorQuery]
  );
  const bookmarkQuery = useBookmarkQuery({
    filters,
    focus: focusFilter,
    authorQuery: debouncedAuthorQuery,
    query: debouncedSearchQuery,
    sortKey,
    revision: library.revision
  });
  const matchedTerms = useMemo(() => tokenizeSearchQuery(currentViewState.query), [currentViewState.query]);
  const searchMatches = useMemo(
    () => bookmarkQuery.bookmarks.map((bookmark) => ({ bookmark, matchedTerms })),
    [bookmarkQuery.bookmarks, matchedTerms]
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const canManageSavedViews = canUseCapability(license, 'saved-views');
  const canEditNotes = canUseCapability(license, 'bookmark-notes');
  const canUseBulkActions = canUseCapability(license, 'bulk-actions');
  const canExportMarkdown = canUseCapability(license, 'markdown-export');
  const canExportCsv = canUseCapability(license, 'csv-export');
  const canUseCloudSync = canUseCapability(license, 'cloud-sync');
  const loadedBookmarks = bookmarkQuery.bookmarks;
  const activeBookmark = searchMatches.find((match) => match.bookmark.id === activeBookmarkId)?.bookmark ?? searchMatches[0]?.bookmark;
  const activeSavedView = library.savedViews.find((savedView) => savedView.id === activeViewId);
  const activeViewDirty = Boolean(activeSavedView && !matchesSavedView(activeSavedView, currentViewState));
  const viewSummary = bookmarkQuery.viewSummary;
  const { focusedIndex } = useKeyboardNavigation({
    itemCount: searchMatches.length,
    searchInputRef,
    onOpen: (index) => {
      const bookmark = searchMatches[index]?.bookmark;
      if (bookmark) {
        setActiveBookmarkId(bookmark.id);
      }
    },
    onToggleSelect: (index) => {
      const bookmark = searchMatches[index]?.bookmark;
      if (bookmark) {
        handleSelectedChange(bookmark.id, !selectedIds.has(bookmark.id));
      }
    },
    onToggleHelp: () => setShowShortcuts((prev) => !prev)
  });

  useLayoutEffect(() => {
    if (pendingScrollRestoreRef.current == null) {
      return;
    }

    const top = pendingScrollRestoreRef.current;
    pendingScrollRestoreRef.current = null;
    window.scrollTo({ top, left: window.scrollX, behavior: 'auto' });
  });

  function openUpgrade() {
    void sendRuntimeMessage({ type: 'OPEN_UPGRADE' });
  }

  async function refreshAfter(action: Promise<unknown>) {
    await action;
    await library.refresh();
    setSelectedIds(new Set());
  }

  function formatActionError(error: unknown) {
    return error instanceof Error ? error.message : 'Action failed. Please try again.';
  }

  async function runDialogAction(action: () => Promise<void>) {
    if (dialogBusy) {
      return;
    }

    setDialogBusy(true);
    setDialogError(null);
    try {
      await action();
    } catch (error) {
      setDialogError(formatActionError(error));
    } finally {
      setDialogBusy(false);
    }
  }

  useEffect(() => {
    if (!activeBookmarkId || !searchMatches.some((match) => match.bookmark.id === activeBookmarkId)) {
      setActiveBookmarkId(searchMatches[0]?.bookmark.id ?? null);
    }
  }, [activeBookmarkId, searchMatches]);

  useEffect(() => {
    let cancelled = false;

    if (library.savedViews.length === 0) {
      setSavedViewCounts({});
      return () => {
        cancelled = true;
      };
    }

    void getSavedViewCounts(library.savedViews)
      .then((counts) => {
        if (!cancelled) {
          setSavedViewCounts(counts);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSavedViewCounts({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [library.revision, library.savedViews]);

  useEffect(() => {
    setNoteStatus(null);
  }, [activeBookmark?.id, activeBookmark?.note]);

  useEffect(() => {
    if (!importStatus || importStatus.type !== 'success') {
      return;
    }

    const timeoutId = window.setTimeout(() => setImportStatus(null), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [importStatus]);

  useEffect(() => {
    if (!noteStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => setNoteStatus(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [noteStatus]);

  useEffect(() => {
    void chrome.action?.setBadgeText?.({ text: '' });
  }, []);

  useEffect(() => {
    void getLastBackupStatus().then(setLastBackup);
    void getCloudSyncStatus().then(setCloudStatus);
    void getSettings().then((settings) => {
      setCloudEnabled(settings.cloudSyncEnabled);
      setShowOnboarding(!settings.onboardingDismissed && library.counts.total > 0);
    });
  }, [library.counts.total]);

  useEffect(
    () =>
      subscribeToLocalStateChanges({
        onLocalDataChange: (status) => {
          lastSeenLocalDataAtRef.current = status.at;
          void refreshLibrary();
          setSelectedIds(new Set());
          setActiveBookmarkId(null);
          setActionToast({
            type: 'success',
            message: status.reason === 'local-data-cleared' ? 'Local library cleared.' : 'Local library refreshed.'
          });
        },
        onLastBackupChange: setLastBackup,
        onCloudSyncChange: setCloudStatus
      }),
    [refreshLibrary]
  );

  useEffect(() => {
    async function refreshIfLocalDataChanged() {
      const status = await getLocalDataStatus();
      if (!status || status.at <= lastSeenLocalDataAtRef.current) {
        return;
      }

      lastSeenLocalDataAtRef.current = status.at;
      await refreshLibrary();
      setSelectedIds(new Set());
      setActiveBookmarkId(null);
    }

    function handleVisibilityOrFocus() {
      if (document.visibilityState === 'hidden') {
        return;
      }
      void refreshIfLocalDataChanged();
    }

    void refreshIfLocalDataChanged();
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [refreshLibrary]);

  useEffect(() => {
    function handleScroll() {
      setShowBackToTop(window.scrollY > 600);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!backupStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => setBackupStatus(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [backupStatus]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [folderId, tagId, includeArchived, debouncedSearchQuery, focusFilter, debouncedAuthorQuery]);

  function handleCreateFolder() {
    setDialogError(null);
    setNameDialog({ kind: 'create-folder', title: 'New folder', label: 'Folder name' });
  }

  function handleRenameFolder(nextFolderId: string) {
    const folder = library.folders.find((item) => item.id === nextFolderId);
    setDialogError(null);
    setNameDialog({ kind: 'rename-folder', title: 'Rename folder', label: 'Folder name', folderId: nextFolderId, initialValue: folder?.name });
  }

  function handleDeleteFolder(deletedFolderId: string) {
    const folder = library.folders.find((item) => item.id === deletedFolderId);
    setDialogError(null);
    setConfirmDialog({
      kind: 'delete-folder',
      title: `Delete ${folder?.name ?? 'folder'}?`,
      description: 'Bookmarks in this folder will move to Uncategorized.',
      folderId: deletedFolderId,
      actionLabel: 'Delete folder'
    });
  }

  function handleCreateTag() {
    setDialogError(null);
    setNameDialog({ kind: 'create-tag', title: 'New tag', label: 'Tag name' });
  }

  function handleDeleteTag(nextTagId: string) {
    const tag = library.tags.find((item) => item.id === nextTagId);
    setDialogError(null);
    setConfirmDialog({
      kind: 'delete-tag',
      title: `Delete ${tag?.name ?? 'tag'}?`,
      description: 'This tag will be removed from every local bookmark.',
      tagId: nextTagId,
      actionLabel: 'Delete tag'
    });
  }

  function handleCreateView() {
    if (!canManageSavedViews) {
      openUpgrade();
      return;
    }

    setDialogError(null);
    setNameDialog({ kind: 'create-view', title: 'Save current view', label: 'View name', initialValue: searchQuery.trim() || undefined });
  }

  async function handleUpdateActiveView() {
    if (!activeSavedView) {
      return;
    }
    if (!canManageSavedViews) {
      openUpgrade();
      return;
    }

    await updateSavedView(activeSavedView.id, {
      query: debouncedSearchQuery,
      sortKey,
      focus: focusFilter,
      authorQuery: debouncedAuthorQuery.trim(),
      folderId: folderId ?? null,
      tagId: tagId ?? null,
      includeArchived
    });
    await library.refresh();
    setActionToast({ type: 'success', message: 'Saved view updated.' });
  }

  async function handleCreateViewTemplates() {
    if (!canManageSavedViews) {
      openUpgrade();
      return;
    }

    const existingNames = new Set(library.savedViews.map((view) => view.name.toLowerCase()));
    const templatesToCreate = savedViewTemplates.filter((view) => !existingNames.has(view.name.toLowerCase()));
    if (!templatesToCreate.length) {
      setActionToast({ type: 'success', message: 'Saved view templates are already available.' });
      return;
    }

    await Promise.all(templatesToCreate.map((view) => createSavedView(view)));
    await library.refresh();
    setActionToast({ type: 'success', message: `${templatesToCreate.length} saved view templates added.` });
  }

  function handleRenameView(savedView: SavedView) {
    if (!canManageSavedViews) {
      openUpgrade();
      return;
    }

    setDialogError(null);
    setNameDialog({ kind: 'rename-view', title: 'Rename saved view', label: 'View name', viewId: savedView.id, initialValue: savedView.name });
  }

  function handleDeleteView(savedView: SavedView) {
    if (!canManageSavedViews) {
      openUpgrade();
      return;
    }

    setDialogError(null);
    setConfirmDialog({
      kind: 'delete-view',
      title: `Delete ${savedView.name}?`,
      description: 'This removes the saved lane definition, not the bookmarks themselves.',
      viewId: savedView.id,
      actionLabel: 'Delete view'
    });
  }

  function handleApplySavedView(savedView: SavedView) {
    if (!canManageSavedViews) {
      openUpgrade();
      return;
    }

    setSearchQuery(savedView.query);
    setSortKey(savedView.sortKey);
    setFocusFilter(savedView.focus ?? 'all');
    setAuthorQuery(savedView.authorQuery ?? '');
    setFolderId(savedView.folderId ?? undefined);
    setTagId(savedView.tagId ?? undefined);
    setIncludeArchived(savedView.includeArchived);
    setActiveViewId(savedView.id);
  }

  async function handleNameSubmit(value: string) {
    if (!nameDialog) {
      return;
    }

    await runDialogAction(async () => {
      if (nameDialog.kind === 'create-folder') {
        await refreshAfter(createFolder(value));
      }
      if (nameDialog.kind === 'rename-folder') {
        await refreshAfter(renameFolder(nameDialog.folderId, value));
      }
      if (nameDialog.kind === 'create-tag') {
        await refreshAfter(createTag(value));
      }
      if (nameDialog.kind === 'create-view') {
        const savedView = await createSavedView({
          name: value,
          query: debouncedSearchQuery,
          sortKey,
          focus: focusFilter,
          authorQuery: debouncedAuthorQuery.trim(),
          folderId: folderId ?? null,
          tagId: tagId ?? null,
          includeArchived
        });
        await library.refresh();
        setActiveViewId(savedView.id);
      }
      if (nameDialog.kind === 'rename-view') {
        await updateSavedView(nameDialog.viewId, { name: value });
        await library.refresh();
      }
      setNameDialog(null);
    });
  }

  async function handleConfirmSubmit() {
    if (!confirmDialog) {
      return;
    }

    await runDialogAction(async () => {
      if (confirmDialog.kind === 'delete-folder') {
        const wasViewingDeletedFolder = folderId === confirmDialog.folderId;
        const snapshot = await deleteFolder(confirmDialog.folderId);
        setSelectedIds(new Set());
        setConfirmDialog(null);

        if (wasViewingDeletedFolder) {
          setFolderId(undefined);
        } else {
          await library.refresh();
        }
        if (snapshot) {
          setActionToast({
            type: 'success',
            message: 'Folder deleted.',
            onUndo: async () => {
              await restoreFolder(snapshot);
              await library.refresh();
            }
          });
        }
        return;
      }

      if (confirmDialog.kind === 'delete-tag') {
        const snapshot = await deleteTag(confirmDialog.tagId);
        await library.refresh();
        setSelectedIds(new Set());
        setTagId(undefined);
        setConfirmDialog(null);
        if (snapshot) {
          setActionToast({
            type: 'success',
            message: 'Tag deleted.',
            onUndo: async () => {
              await restoreTag(snapshot);
              await library.refresh();
            }
          });
        }
        return;
      }

      if (confirmDialog.kind === 'delete-bookmark') {
        const deletedIds = [confirmDialog.bookmarkId];
        await refreshAfter(softDeleteBookmark(confirmDialog.bookmarkId));
        setConfirmDialog(null);
        setActionToast({
          type: 'success',
          message: 'Bookmark deleted.',
          onUndo: async () => {
            await restoreBookmarks(deletedIds);
            await library.refresh();
          }
        });
        return;
      }

      if (confirmDialog.kind === 'permanently-delete-bookmark') {
        await refreshAfter(permanentlyDeleteBookmarks([confirmDialog.bookmarkId]));
        setConfirmDialog(null);
        setActionToast({ type: 'success', message: 'Bookmark permanently deleted.' });
        return;
      }

      if (confirmDialog.kind === 'bulk-delete') {
        const deletedIds = Array.from(selectedIds);
        await refreshAfter(Promise.all(deletedIds.map((bookmarkId) => softDeleteBookmark(bookmarkId))));
        setConfirmDialog(null);
        setActionToast({
          type: 'success',
          message: `${deletedIds.length} bookmarks deleted.`,
          onUndo: async () => {
            await restoreBookmarks(deletedIds);
            await library.refresh();
          }
        });
        return;
      }

      if (confirmDialog.kind === 'delete-view') {
        await deleteSavedView(confirmDialog.viewId);
        await library.refresh();
        if (activeViewId === confirmDialog.viewId) {
          setActiveViewId(null);
        }
      }
      setConfirmDialog(null);
    });
  }

  function handleMove(bookmarkId: string) {
    setDialogError(null);
    setMoveTargetIds([bookmarkId]);
  }

  function handleBulkMove() {
    if (!selectedIds.size) {
      return;
    }
    if (!canUseBulkActions) {
      openUpgrade();
      return;
    }

    setDialogError(null);
    setMoveTargetIds(Array.from(selectedIds));
  }

  async function handleMoveToFolder(targetFolderId?: string) {
    if (!moveTargetIds?.length) {
      return;
    }
    await runDialogAction(async () => {
      const bookmarksById = new Map((await getBookmarkItemsByIds(moveTargetIds)).map((bookmark) => [bookmark.id, bookmark]));
      const previousFolders = moveTargetIds.map((bookmarkId) => ({
        bookmarkId,
        folderId: bookmarksById.get(bookmarkId)?.folderId
      }));
      await refreshAfter(moveBookmarksToFolder(moveTargetIds, targetFolderId));
      setMoveTargetIds(null);
      setActionToast({
        type: 'success',
        message: `${moveTargetIds.length === 1 ? 'Bookmark' : 'Bookmarks'} moved.`,
        onUndo: async () => {
          await restoreBookmarkFolders(previousFolders);
          await library.refresh();
        }
      });
    });
  }

  async function handleCreateFolderAndMove(folderName: string) {
    if (!moveTargetIds?.length) {
      return;
    }
    await runDialogAction(async () => {
      const targetIds = [...moveTargetIds];
      const bookmarksById = new Map((await getBookmarkItemsByIds(targetIds)).map((bookmark) => [bookmark.id, bookmark]));
      const previousFolders = targetIds.map((bookmarkId) => ({
        bookmarkId,
        folderId: bookmarksById.get(bookmarkId)?.folderId
      }));
      const existing = library.folders.find((folder) => folder.name.toLowerCase() === folderName.toLowerCase());
      const folder = existing ?? (await createFolder(folderName));
      await refreshAfter(moveBookmarksToFolder(targetIds, folder.id));
      setMoveTargetIds(null);
      setActionToast({
        type: 'success',
        message: `${targetIds.length === 1 ? 'Bookmark' : 'Bookmarks'} moved.`,
        onUndo: async () => {
          await restoreBookmarkFolders(previousFolders);
          if (!existing) {
            await deleteFolder(folder.id);
          }
          await library.refresh();
        }
      });
    });
  }

  function handleTag(bookmarkId: string) {
    setDialogError(null);
    setTagDialog({ kind: 'add', bookmarkIds: [bookmarkId], bookmarkId });
  }

  function handleBulkTag() {
    if (!selectedIds.size) {
      return;
    }
    if (!canUseBulkActions) {
      openUpgrade();
      return;
    }

    setDialogError(null);
    setTagDialog({ kind: 'add', bookmarkIds: Array.from(selectedIds) });
  }

  function handleRemoveTag(bookmarkId: string) {
    const bookmark = loadedBookmarks.find((item) => item.id === bookmarkId);
    if (!bookmark?.tags.length) {
      return;
    }

    setDialogError(null);
    setTagDialog({ kind: 'remove', bookmarkIds: [bookmarkId], bookmarkId });
  }

  async function handleTagSubmit(tagName: string) {
    if (!tagDialog) {
      return;
    }

    await runDialogAction(async () => {
      if (tagDialog.kind === 'remove') {
        const bookmark = loadedBookmarks.find((item) => item.id === tagDialog.bookmarkId);
        const tag = bookmark?.tags.find((item) => item.name.toLowerCase() === tagName.toLowerCase());
        if (tag && bookmark) {
          await refreshAfter(removeTagFromBookmark(bookmark.id, tag.id));
        }
        setTagDialog(null);
        return;
      }

      const existing = library.tags.find((tag) => tag.name.toLowerCase() === tagName.toLowerCase());
      const tag = existing ?? (await createTag(tagName));
      await refreshAfter(addTagToBookmarks(tagDialog.bookmarkIds, tag.id));
      setTagDialog(null);
      setActionToast({
        type: 'success',
        message: `${tagDialog.bookmarkIds.length === 1 ? 'Tag' : 'Tags'} added.`,
        onUndo: async () => {
          await Promise.all(tagDialog.bookmarkIds.map((bookmarkId) => removeTagFromBookmark(bookmarkId, tag.id)));
          if (!existing) {
            await deleteTag(tag.id);
          }
          await library.refresh();
        }
      });
    });
  }

  async function handleArchive(bookmarkId: string, archived: boolean) {
    await refreshAfter(setBookmarkArchived(bookmarkId, archived));
  }

  async function handleToggleExportQueue(bookmarkId: string, markedForExport: boolean) {
    await refreshAfter(setBookmarkMarkedForExport(bookmarkId, markedForExport));
    setActionToast({ type: 'success', message: markedForExport ? 'Added to export picks.' : 'Removed from export picks.' });
  }

  function handleAuthorView(authorHandle: string) {
    setSearchQuery('');
    setAuthorQuery(authorHandle);
    setFocusFilter('all');
    setFolderId(undefined);
    setTagId(undefined);
    setIncludeArchived(false);
    setShowTrash(false);
    setActiveViewId(null);
  }

  function handleDomainView(domain: string) {
    setSearchQuery(domain);
    setAuthorQuery('');
    setFocusFilter('with-links');
    setFolderId(undefined);
    setTagId(undefined);
    setIncludeArchived(false);
    setShowTrash(false);
    setActiveViewId(null);
  }

  function handleDelete(bookmarkId: string) {
    setDialogError(null);
    setConfirmDialog({
      kind: 'delete-bookmark',
      title: 'Delete bookmark?',
      description: 'This removes the saved copy from BookmarkNest.',
      bookmarkId,
      actionLabel: 'Delete bookmark'
    });
  }

  async function handleRestore(bookmarkId: string) {
    await refreshAfter(restoreBookmarks([bookmarkId]));
    setActionToast({ type: 'success', message: 'Bookmark restored to the library.' });
  }

  function handlePermanentlyDelete(bookmarkId: string) {
    setDialogError(null);
    setConfirmDialog({
      kind: 'permanently-delete-bookmark',
      title: 'Delete permanently?',
      description: 'This bookmark cannot be recovered after permanent deletion.',
      bookmarkId,
      actionLabel: 'Delete permanently'
    });
  }

  function handleBulkDelete() {
    if (!selectedIds.size) {
      return;
    }
    if (!canUseBulkActions) {
      openUpgrade();
      return;
    }

    setDialogError(null);
    setConfirmDialog({
      kind: 'bulk-delete',
      title: `Delete ${selectedIds.size} bookmarks?`,
      description: 'This removes the selected saved copies from BookmarkNest.',
      actionLabel: 'Delete selected'
    });
  }

  async function handleExport(format: AppExportFormat) {
    const bookmarks = await bookmarkQuery.listAllItems();
    if (bookmarks.length === 0) {
      return;
    }

    if ((format === 'markdown' || format === 'research-pack') && !canExportMarkdown) {
      openUpgrade();
      return;
    }

    if (format === 'csv' && !canExportCsv) {
      openUpgrade();
      return;
    }

    try {
      await downloadBookmarks(format, bookmarks, { includeNotes: isPro });
    } catch (error) {
      setImportStatus({ type: 'error', message: error instanceof Error ? error.message : 'Export failed. Please try again.' });
    }
  }

  async function handleFullBackup() {
    if (backupBusy) {
      return;
    }

    setBackupBusy(true);
    setBackupStatus(null);
    try {
      const backup = await exportLocalBackup();
      const filename = backupFilename(backup.exportedAt);
      await downloadText(filename, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');

      const status: LastBackupStatus = {
        at: backup.exportedAt,
        bookmarkCount: backup.bookmarks.length,
        savedViewCount: backup.savedViews.length,
        filename
      };
      await setLastBackupStatus(status);
      setLastBackup(status);
      setBackupStatus({ type: 'success', message: `Full backup generated: ${filename}` });
    } catch (error) {
      setBackupStatus({ type: 'error', message: error instanceof Error ? error.message : 'Backup failed. Please try again.' });
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleEnableCloudSync() {
    if (!canUseCloudSync) {
      openUpgrade();
      return;
    }

    setCloudEnabled(true);
    await saveSettings({ cloudSyncEnabled: true });
    await handleCloudBackup();
  }

  async function handleCloudBackup() {
    if (cloudBusy) {
      return;
    }
    if (!canUseCloudSync) {
      openUpgrade();
      return;
    }

    setCloudBusy(true);
    setBackupStatus(null);
    try {
      const response = await sendRuntimeMessage<CloudSyncStatus>({ type: 'RUN_CLOUD_BACKUP' });
      if (!response.ok || !response.data) {
        setBackupStatus({ type: 'error', message: response.error ?? 'Cloud Sync failed.' });
        return;
      }
      setCloudStatus(response.data);
      setBackupStatus({
        type: 'success',
        message: response.data.lastUploadResult === 'unchanged' ? 'Cloud backup already up to date.' : 'Cloud backup protected.'
      });
    } finally {
      setCloudBusy(false);
    }
  }

  function requestCloudRestore() {
    if (cloudBusy) {
      return;
    }
    if (!canUseCloudSync) {
      openUpgrade();
      return;
    }
    setCloudRestoreConfirmOpen(true);
  }

  async function handleCloudRestore() {
    if (cloudBusy) {
      return;
    }
    if (!canUseCloudSync) {
      openUpgrade();
      return;
    }

    setCloudRestoreConfirmOpen(false);
    setCloudBusy(true);
    setBackupStatus(null);
    try {
      const safetyBackup = await exportLocalBackup();
      await downloadText(`bookmarknest-before-cloud-restore-${safetyBackup.exportedAt}.json`, JSON.stringify(safetyBackup, null, 2), 'application/json;charset=utf-8');
      const response = await sendRuntimeMessage<CloudSyncStatus>({ type: 'RESTORE_CLOUD_BACKUP' });
      if (!response.ok || !response.data) {
        setBackupStatus({ type: 'error', message: response.error ?? 'Cloud restore failed.' });
        return;
      }
      setCloudStatus(response.data);
      await library.refresh();
      setBackupStatus({ type: 'success', message: 'Cloud backup restored. A local safety backup was downloaded first.' });
    } finally {
      setCloudBusy(false);
    }
  }

  async function handleImport(mode: 'visible' | 'auto-scroll' = 'auto-scroll') {
    if (importMode) {
      return;
    }

    setImportMode(mode);
    setImportStatus({
      type: 'loading',
      message: mode === 'auto-scroll' ? 'Importing X bookmarks and scanning the X page for avatars...' : 'Looking for an open X bookmarks tab...'
    });
    try {
      const response = await sendRuntimeMessage<{ session?: ImportSession }>({
        type: 'START_X_IMPORT',
        mode
      });

      if (!response.ok) {
        setImportStatus({ type: 'error', message: formatImportError(response.error) });
        return;
      }

      await library.refresh();
      const session = response.data?.session;
      if ((session?.insertedCount ?? 0) > 0) {
        setShowOnboarding(true);
      }
      setImportStatus(
        session
          ? {
              type: 'success',
              message: `Import complete: ${session.insertedCount} new, ${session.duplicateCount} already saved, ${session.failedCount} failed, ${session.foundCount} fetched from X.`
            }
          : { type: 'success', message: 'Import complete.' }
      );
    } finally {
      setImportMode(null);
    }
  }

  function handleSelectedChange(bookmarkId: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(bookmarkId);
      } else {
        next.delete(bookmarkId);
      }
      return next;
    });
  }

  async function handleSelectAllVisible() {
    setSelectedIds(new Set(await bookmarkQuery.listAllIds()));
  }

  async function handleInvertVisibleSelection() {
    const bookmarkIds = await bookmarkQuery.listAllIds();
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const bookmarkId of bookmarkIds) {
        if (next.has(bookmarkId)) {
          next.delete(bookmarkId);
        } else {
          next.add(bookmarkId);
        }
      }
      return next;
    });
  }

  function handleClearSelection() {
    setSelectedIds(new Set());
  }

  async function handleUndoAction(onUndo: () => Promise<void>) {
    try {
      await onUndo();
      setActionToast({ type: 'success', message: 'Action undone.' });
    } catch (error) {
      setActionToast({ type: 'error', message: formatActionError(error) });
    }
  }

  async function handleSaveNote(nextNote: string) {
    if (!activeBookmark) {
      return;
    }
    if (!canEditNotes) {
      openUpgrade();
      return;
    }

    setNoteBusy(true);
    setNoteStatus(null);
    try {
      await updateBookmarkNote(activeBookmark.id, nextNote);
      await library.refresh();
      setNoteStatus('Saved.');
    } catch (error) {
      setNoteStatus(error instanceof Error ? error.message : 'Unable to save note.');
    } finally {
      setNoteBusy(false);
    }
  }

  function closeNameDialog() {
    if (dialogBusy) {
      return;
    }
    setDialogError(null);
    setNameDialog(null);
  }

  function closeConfirmDialog() {
    if (dialogBusy) {
      return;
    }
    setDialogError(null);
    setConfirmDialog(null);
  }

  function closeTagDialog() {
    if (dialogBusy) {
      return;
    }
    setDialogError(null);
    setTagDialog(null);
  }

  function closeMoveDialog() {
    if (dialogBusy) {
      return;
    }
    setDialogError(null);
    setMoveTargetIds(null);
  }

  function handleFolderChange(nextFolderId: FolderFilter) {
    setFolderId(nextFolderId);
    setTagId(undefined);
    setIncludeArchived(false);
    setShowTrash(false);
    setSearchQuery('');
    setAuthorQuery('');
    setFocusFilter('all');
    setActiveViewId(null);
  }

  function handleArchivedChange(nextIncludeArchived: boolean) {
    setIncludeArchived(nextIncludeArchived);
    setFolderId(undefined);
    setTagId(undefined);
    setShowTrash(false);
    setSearchQuery('');
    setAuthorQuery('');
    setFocusFilter('all');
    setActiveViewId(null);
  }

  function handleTagChange(nextTagId?: string | null) {
    setTagId(nextTagId);
    setFolderId(undefined);
    setIncludeArchived(false);
    setShowTrash(false);
    setSearchQuery('');
    setAuthorQuery('');
    setFocusFilter('all');
    setActiveViewId(null);
  }

  function handleFocusLaneChange(nextFocus: BookmarkFocusFilter) {
    pendingScrollRestoreRef.current = window.scrollY;
    setFocusFilter(nextFocus);
    setFolderId(undefined);
    setTagId(undefined);
    setIncludeArchived(false);
    setShowTrash(false);
    setSearchQuery('');
    setAuthorQuery('');
    setActiveViewId(null);
  }

  function handleTrashChange(nextShowTrash: boolean) {
    setShowTrash(nextShowTrash);
    setFolderId(undefined);
    setTagId(undefined);
    setIncludeArchived(false);
    setFocusFilter('all');
    setSearchQuery('');
    setAuthorQuery('');
    setActiveViewId(null);
  }

  const visibleTagOptions = tagDialog?.kind === 'remove'
    ? (loadedBookmarks.find((item) => item.id === tagDialog.bookmarkId)?.tags ?? [])
    : library.tags;
  const selectedCount = selectedIds.size;

  return (
    <PageShell
      title="BookmarkNest research desk"
      description="Name repeatable research lanes, annotate key posts, and keep the working library local."
      actions={
        <div className="flex items-center gap-2">
          <button
            className="grid h-9 w-9 place-items-center border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Toggle theme"
            onClick={() => {
              const next = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
              void setTheme(next);
            }}
          >
            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button
            className="grid h-9 w-9 place-items-center border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Settings"
            onClick={() => void chrome.runtime?.openOptionsPage?.()}
          >
            <Settings size={16} />
          </button>
        </div>
      }
    >
      <section ref={workspaceTopRef} className="grid min-h-[calc(100vh-140px)] grid-cols-1 border border-border bg-surface shadow-[0_24px_80px_rgba(19,42,39,0.08)] lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <AppSidebar
          folders={library.folders}
          tags={library.tags}
          counts={library.counts}
          focusFilter={focusFilter}
          activeFolderId={folderId}
          activeTagId={tagId}
          includeArchived={includeArchived}
          showTrash={showTrash}
          researchSources={library.researchSources}
          onFocusChange={handleFocusLaneChange}
          onFolderChange={handleFolderChange}
          onTagChange={handleTagChange}
          onArchivedChange={handleArchivedChange}
          onTrashChange={handleTrashChange}
          onAuthorSource={handleAuthorView}
          onDomainSource={handleDomainView}
          onCreateFolder={() => void handleCreateFolder()}
          onCreateTag={() => void handleCreateTag()}
          onRenameFolder={(nextFolderId) => void handleRenameFolder(nextFolderId)}
          onDeleteFolder={(nextFolderId) => void handleDeleteFolder(nextFolderId)}
          onDeleteTag={(nextTagId) => void handleDeleteTag(nextTagId)}
        />

        <div className="min-w-0 bg-surface">
          <SavedViewRail
            views={library.savedViews}
            activeViewId={activeViewId}
            viewCounts={savedViewCounts}
            activeViewDirty={activeViewDirty}
            canManage={canManageSavedViews}
            onCreate={handleCreateView}
            onCreateTemplates={() => void handleCreateViewTemplates()}
            onUpdate={() => void handleUpdateActiveView()}
            onApply={handleApplySavedView}
            onRename={handleRenameView}
            onDelete={handleDeleteView}
          />

          <DataSafetyBar
            bookmarkCount={library.counts.total}
            archivedBookmarkCount={library.counts.archived}
            deletedBookmarkCount={library.counts.deleted}
            savedViewCount={library.savedViews.length}
            lastBackup={lastBackup}
            cloudStatus={cloudStatus}
            cloudEnabled={cloudEnabled}
            canUseCloudSync={canUseCloudSync}
            backupBusy={backupBusy}
            cloudBusy={cloudBusy}
            backupStatus={backupStatus}
            onBackup={() => void handleFullBackup()}
            onRestore={() => void chrome.runtime?.openOptionsPage?.()}
            onEnableCloud={() => void handleEnableCloudSync()}
            onCloudBackup={() => void handleCloudBackup()}
            onCloudRestore={requestCloudRestore}
            onUpgrade={openUpgrade}
          />

          {showOnboarding ? (
            <div className="border-b border-accent/35 bg-accent/8 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium text-foreground">Shape this import into a research lane.</span>
                <div className="flex flex-wrap gap-2">
                  <Button size="xs" variant="ghost" onClick={() => void handleCreateFolder()}>Create folder</Button>
                  <Button size="xs" variant="ghost" onClick={() => handleFocusLaneChange('without-notes')}>Review notes</Button>
                  <Button size="icon" variant="ghost" aria-label="Dismiss onboarding" title="Dismiss" onClick={() => {
                    setShowOnboarding(false);
                    void saveSettings({ onboardingDismissed: true });
                  }}>
                    <X size={14} />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="border-b border-border bg-surface px-4 py-4">
            <DebouncedFilterInput
              ref={searchInputRef}
              value={searchQuery}
              onCommit={setSearchQuery}
              containerClassName="flex h-11 min-w-0 items-center gap-2 border border-border bg-background px-3 text-sm shadow-inner"
              inputClassName="w-full bg-transparent outline-none placeholder:text-muted-foreground"
              icon={<Search size={17} className="text-muted-foreground" />}
              placeholder="Search text, authors, tags, notes"
              ariaLabel="Search bookmarks"
            />

            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(150px,0.75fr)_minmax(190px,1fr)] xl:grid-cols-[minmax(170px,0.8fr)_minmax(220px,1fr)_minmax(0,1.35fr)]">
              <label className="relative flex h-10 min-w-0 items-center gap-2 border border-border bg-[#f6fbfa] px-3 text-sm shadow-inner dark:bg-[#111816]">
                <span className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Sort</span>
                <select
                  className="min-w-0 flex-1 appearance-none bg-transparent pr-6 text-sm text-foreground outline-none"
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  aria-label="Sort bookmarks"
                >
                  <option value="source">Source order</option>
                  <option value="date-posted">Date posted</option>
                  <option value="date-imported">Date imported</option>
                  <option value="author">Author</option>
                </select>
                <ChevronsUpDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </label>

              <label className="relative flex h-10 min-w-0 items-center gap-2 border border-border bg-[#f6fbfa] px-3 text-sm shadow-inner dark:bg-[#111816]">
                <Filter size={15} className="text-muted-foreground" />
                <span className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Focus</span>
                <select
                  className="min-w-0 flex-1 appearance-none bg-transparent pr-6 text-sm text-foreground outline-none"
                  value={focusFilter}
                  onChange={(event) => setFocusFilter(event.target.value as BookmarkFocusFilter)}
                  aria-label="Focus filter"
                >
                  {focusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronsUpDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </label>

              <DebouncedFilterInput
                value={authorQuery}
                onCommit={setAuthorQuery}
                containerClassName="flex h-10 min-w-0 items-center gap-2 border border-border bg-[#f6fbfa] px-3 text-sm shadow-inner dark:bg-[#111816] md:col-span-2 xl:col-span-1"
                label="Author"
                placeholder="@handle or name"
                ariaLabel="Filter by author"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-start justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1 border border-border bg-[#f6fbfa] px-3 py-2.5 shadow-inner dark:bg-[#111816]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="inline-flex items-center gap-2 text-foreground">
                    <BookMarked size={14} className="text-primary" />
                    <span className="text-base font-semibold tabular-nums">{bookmarkQuery.totalCount}</span>
                    <span className="text-sm text-muted-foreground">in view</span>
                  </span>
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Sparkles size={13} />
                    <span className="text-xs uppercase tracking-[0.14em]">Notes {viewSummary.withNotes}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <PackageOpen size={13} />
                    <span className="text-xs uppercase tracking-[0.14em]">Picks {viewSummary.queued}</span>
                  </span>
                </div>
                {(activeSavedView || focusFilter !== 'all' || debouncedAuthorQuery || importStatus) ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {activeSavedView ? (
                      <span className="inline-flex h-7 items-center gap-1.5 bg-accent/10 px-2.5 text-xs text-foreground">
                        <Waypoints size={12} />
                        <span className="max-w-[180px] truncate">{activeSavedView.name}</span>
                        {activeViewDirty ? <span className="text-accent">Edited</span> : null}
                      </span>
                    ) : null}
                    {focusFilter !== 'all' ? (
                      <span className="inline-flex h-7 items-center bg-background px-2.5 text-xs text-muted-foreground">
                        Focus: {focusOptions.find((option) => option.value === focusFilter)?.label}
                      </span>
                    ) : null}
                    {debouncedAuthorQuery ? (
                      <span className="inline-flex h-7 max-w-full items-center bg-background px-2.5 text-xs text-muted-foreground">
                        <span className="truncate">Author: {debouncedAuthorQuery}</span>
                      </span>
                    ) : null}
                    {importStatus ? (
                      <span className={cn('text-xs', importStatus.type === 'error' ? 'text-danger' : 'text-muted-foreground')}>
                        {importStatus.message}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex w-full flex-wrap items-center gap-2 2xl:w-auto">
                <Button variant="primary" className="h-10 w-full px-4 sm:w-auto" onClick={() => void handleImport('auto-scroll')} disabled={Boolean(importMode)}>
                  {importMode === 'auto-scroll' ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
                  {importMode === 'auto-scroll' ? 'Loading...' : 'Import more'}
                </Button>
                <ExportMenu disabled={bookmarkQuery.totalCount === 0} onExport={(format) => void handleExport(format)} />
              </div>
            </div>
          </div>

          {selectedCount > 0 ? (
            <div className="border-b border-border bg-[#eef6f3] px-4 py-3 text-sm dark:bg-[#101816]">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{selectedCount} selected</span>
                    {!canUseBulkActions ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock size={12} />Pro bulk tools</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Apply tags, move folders, or remove selected bookmarks from the current view.
                  </div>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <Button size="sm" variant="ghost" onClick={handleSelectAllVisible}>
                    All in view
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleInvertVisibleSelection}>
                    Invert
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleClearSelection}>
                    Clear
                  </Button>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
                  <Button size="sm" className="flex-1 sm:flex-none" onClick={() => void handleBulkTag()}>
                    <Tags size={14} />
                    Tag
                  </Button>
                  <Button size="sm" className="flex-1 sm:flex-none" onClick={() => void handleBulkMove()}>
                    <Folder size={14} />
                    Move
                  </Button>
                  <Button size="sm" className="flex-1 sm:flex-none" variant="danger" onClick={() => void handleBulkDelete()}>
                    <Trash2 size={14} />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <BookmarkList
            matches={searchMatches}
            totalCount={bookmarkQuery.totalCount}
            hasMore={bookmarkQuery.hasMore}
            loadingMore={bookmarkQuery.loadingMore}
            loading={library.loading || bookmarkQuery.loading}
            error={bookmarkQuery.error ?? library.error}
            hasSearchQuery={Boolean(debouncedSearchQuery.trim())}
            focusedIndex={focusedIndex}
            activeBookmarkId={activeBookmark?.id}
            onOpen={setActiveBookmarkId}
            onArchive={(bookmarkId, archived) => void handleArchive(bookmarkId, archived)}
            onDelete={handleDelete}
            onRestore={(bookmarkId) => void handleRestore(bookmarkId)}
            onPermanentlyDelete={handlePermanentlyDelete}
            onMove={handleMove}
            onTag={handleTag}
            onRemoveTag={handleRemoveTag}
            onAuthor={handleAuthorView}
            onToggleExportQueue={(bookmarkId, markedForExport) => void handleToggleExportQueue(bookmarkId, markedForExport)}
            selectedIds={selectedIds}
            onSelectedChange={handleSelectedChange}
            onLoadMore={() => void bookmarkQuery.loadMore()}
          />
        </div>

        <BookmarkInspector
          bookmark={activeBookmark}
          noteBusy={noteBusy}
          noteStatus={noteStatus}
          canEditNotes={canEditNotes}
          onSaveNote={(nextNote) => void handleSaveNote(nextNote)}
          onAuthorView={handleAuthorView}
          onToggleExportQueue={(bookmarkId, markedForExport) => void handleToggleExportQueue(bookmarkId, markedForExport)}
          onUpgrade={openUpgrade}
        />
      </section>

      {actionToast ? (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm border border-border bg-surface px-4 py-3 shadow-xl">
          <div className="flex items-start gap-3">
            <div className={cn('mt-0.5 h-2.5 w-2.5 rounded-full', actionToast.type === 'error' ? 'bg-danger' : 'bg-primary')} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{actionToast.message}</p>
              {actionToast.onUndo ? (
                <button className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => void handleUndoAction(actionToast.onUndo!)}>
                  Undo
                  <ChevronRight size={12} />
                </button>
              ) : null}
            </div>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setActionToast(null)} aria-label="Dismiss message">
              <X size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {showBackToTop ? (
        <button
          type="button"
          className="fixed bottom-6 right-[max(1.5rem,calc((100vw-1500px)/2+1.5rem))] z-40 grid h-11 w-11 place-items-center border border-border bg-surface/95 text-foreground shadow-lg backdrop-blur transition hover:bg-background"
          aria-label="Back to top"
          title="Back to top"
          onClick={() => workspaceTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <ArrowUp size={18} />
        </button>
      ) : null}

      <NameDialog state={nameDialog} busy={dialogBusy} error={dialogError} onClose={closeNameDialog} onSubmit={(value) => void handleNameSubmit(value)} />
      <ConfirmDialog state={confirmDialog} busy={dialogBusy} error={dialogError} onClose={closeConfirmDialog} onConfirm={() => void handleConfirmSubmit()} />
      <TagDialog state={tagDialog} tags={visibleTagOptions} busy={dialogBusy} error={dialogError} onClose={closeTagDialog} onSubmit={(tagName) => void handleTagSubmit(tagName)} />
      <MoveDialog
        folders={library.folders}
        open={Boolean(moveTargetIds)}
        itemCount={moveTargetIds?.length ?? 0}
        busy={dialogBusy}
        error={dialogError}
        onClose={closeMoveDialog}
        onMove={(nextFolderId) => void handleMoveToFolder(nextFolderId)}
        onCreateAndMove={(folderName) => void handleCreateFolderAndMove(folderName)}
      />

      <Dialog
        open={cloudRestoreConfirmOpen}
        title="Restore cloud backup?"
        description="Your latest encrypted cloud backup will replace this browser's local library."
        onClose={() => {
          if (!cloudBusy) {
            setCloudRestoreConfirmOpen(false);
          }
        }}
        closeOnOverlayClick={!cloudBusy}
        footer={
          <>
            <Button onClick={() => setCloudRestoreConfirmOpen(false)} disabled={cloudBusy}>Cancel</Button>
            <Button variant="danger" onClick={() => void handleCloudRestore()} disabled={cloudBusy}>
              {cloudBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
              {cloudBusy ? 'Restoring...' : 'Restore backup'}
            </Button>
          </>
        }
      >
        <div className="rounded-app border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-muted-foreground">
          BookmarkNest will download a local safety backup before replacing any data.
        </div>
      </Dialog>

      <Dialog open={showShortcuts} title="Keyboard shortcuts" onClose={() => setShowShortcuts(false)}>
        <div className="space-y-2 text-sm leading-6 text-muted-foreground">
          <p><kbd className="border border-border bg-background px-1.5 py-0.5 text-xs">/</kbd> Focus search</p>
          <p><kbd className="border border-border bg-background px-1.5 py-0.5 text-xs">j</kbd> / <kbd className="border border-border bg-background px-1.5 py-0.5 text-xs">k</kbd> Move through bookmarks</p>
          <p><kbd className="border border-border bg-background px-1.5 py-0.5 text-xs">x</kbd> Select bookmark</p>
          <p><kbd className="border border-border bg-background px-1.5 py-0.5 text-xs">Enter</kbd> Open bookmark in inspector</p>
          <p><kbd className="border border-border bg-background px-1.5 py-0.5 text-xs">?</kbd> Show this dialog</p>
        </div>
      </Dialog>
    </PageShell>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
