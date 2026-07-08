import '../lib/utils/translateGuard';
import {
  Archive,
  BookMarked,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  FileText,
  Folder,
  Inbox,
  LoaderCircle,
  Lock,
  Moon,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Tags,
  Trash2,
  ArrowUp,
  Upload,
  Waypoints,
  X
} from 'lucide-react';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Field, SelectInput, TextInput, TextareaInput } from '../components/Field';
import { PageShell } from '../components/PageShell';
import { useTheme } from '../hooks/useTheme';
import {
  addTagToBookmarks,
  createFolder,
  createSavedView,
  createTag,
  deleteFolder,
  deleteSavedView,
  deleteTag,
  moveBookmarksToFolder,
  removeTagFromBookmark,
  renameFolder,
  restoreBookmarkFolders,
  restoreBookmarks,
  restoreFolder,
  restoreTag,
  setBookmarkArchived,
  softDeleteBookmark,
  updateBookmarkNote,
  updateSavedView,
  type BookmarkListFilters,
  type BookmarkListItem
} from '../lib/db/bookmarkRepository';
import { downloadBookmarks } from '../lib/export/download';
import { canUseCapability } from '../lib/license/pro';
import { sendRuntimeMessage } from '../lib/messaging/runtime';
import { searchBookmarks, type SortKey } from '../lib/search/searchBookmarks';
import { cn } from '../lib/utils/cn';
import type { ImportSession, SavedView } from '../shared/types';
import '../styles/globals.css';
import { BookmarkList } from './components/BookmarkList';
import { MoveDialog } from './components/MoveDialog';
import { useDebouncedValue } from './hooks/useDebouncedValue';
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
  | { kind: 'bulk-delete'; title: string; description: string; actionLabel: string }
  | { kind: 'delete-view'; title: string; description: string; viewId: string; actionLabel: string }
  | null;
type TagDialogState = { kind: 'add' | 'remove'; bookmarkIds: string[]; bookmarkId?: string } | null;
type ImportStatus = { type: 'loading' | 'success' | 'error'; message: string } | null;
type ActionToast = { type: 'success' | 'error'; message: string; onUndo?: () => Promise<void> } | null;

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

function matchesSavedView(savedView: SavedView | undefined, state: { query: string; sortKey: SortKey; folderId: FolderFilter; tagId: string | null | undefined; includeArchived: boolean }) {
  if (!savedView) {
    return false;
  }

  return (
    savedView.query === state.query &&
    savedView.sortKey === state.sortKey &&
    (savedView.folderId ?? null) === (state.folderId ?? null) &&
    (savedView.tagId ?? null) === (state.tagId ?? null) &&
    savedView.includeArchived === state.includeArchived
  );
}

function AppSidebar({
  folders,
  tags,
  counts,
  activeFolderId,
  activeTagId,
  includeArchived,
  onFolderChange,
  onTagChange,
  onArchivedChange,
  onCreateFolder,
  onCreateTag,
  onRenameFolder,
  onDeleteFolder,
  onDeleteTag
}: {
  folders: { id: string; name: string }[];
  tags: { id: string; name: string; usageCount: number; color: string }[];
  counts: { total: number; uncategorized: number; archived: number; withNotes: number; byFolder: Record<string, number> };
  activeFolderId: FolderFilter;
  activeTagId?: string | null;
  includeArchived: boolean;
  onFolderChange: (folderId: FolderFilter) => void;
  onTagChange: (tagId?: string | null) => void;
  onArchivedChange: (includeArchived: boolean) => void;
  onCreateFolder: () => void;
  onCreateTag: () => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteTag: (tagId: string) => void;
}) {
  const navItemClass = (active: boolean) =>
    cn(
      'flex w-full items-center gap-2 border-b border-border/60 px-3 py-2.5 text-left text-sm text-muted-foreground transition hover:bg-background/50 hover:text-foreground',
      active && 'bg-background/85 text-foreground shadow-[inset_2px_0_0_0_rgba(125,91,22,0.95)]'
    );

  return (
    <aside className="border-r border-border bg-[#eaf1ef] dark:bg-[#101816]">
      <div className="border-b border-border/70 px-4 py-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Research lanes</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="border border-border/70 bg-background/80 px-3 py-2">
            <div className="text-muted-foreground">Library</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{counts.total}</div>
          </div>
          <div className="border border-border/70 bg-background/80 px-3 py-2">
            <div className="text-muted-foreground">With notes</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{counts.withNotes}</div>
          </div>
        </div>
      </div>

      <div className="px-2 py-3">
        <button className={navItemClass(activeFolderId === undefined && !includeArchived)} onClick={() => onFolderChange(undefined)}>
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
    </aside>
  );
}

function SavedViewRail({
  views,
  activeViewId,
  canManage,
  onCreate,
  onApply,
  onRename,
  onDelete
}: {
  views: SavedView[];
  activeViewId: string | null;
  canManage: boolean;
  onCreate: () => void;
  onApply: (savedView: SavedView) => void;
  onRename: (savedView: SavedView) => void;
  onDelete: (savedView: SavedView) => void;
}) {
  return (
    <div className="border-b border-border/70 bg-[#f2f7f5] px-4 py-3 dark:bg-[#101816]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          <Waypoints size={14} />
          Saved views
        </div>
        {views.length === 0 ? (
          <span className="text-sm text-muted-foreground">No saved views yet.</span>
        ) : null}
        {views.map((savedView) => {
          const active = activeViewId === savedView.id;
          return (
            <div key={savedView.id} className={cn('inline-flex items-center border bg-background/90', active ? 'border-accent text-foreground' : 'border-border text-muted-foreground')}>
              <button className="px-3 py-2 text-sm hover:bg-background" onClick={() => onApply(savedView)}>
                {savedView.name}
              </button>
              <div className="flex items-center border-l border-inherit">
                <button className="grid h-9 w-9 place-items-center hover:bg-background" onClick={() => onRename(savedView)} aria-label={`Rename ${savedView.name}`}>
                  <Pencil size={13} />
                </button>
                <button className="grid h-9 w-9 place-items-center hover:bg-background" onClick={() => onDelete(savedView)} aria-label={`Delete ${savedView.name}`}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          {!canManage ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock size={12} />Pro</span> : null}
          <Button size="sm" variant="secondary" onClick={onCreate}>
            <Plus size={14} />
            Save view
          </Button>
        </div>
      </div>
    </div>
  );
}

function BookmarkInspector({
  bookmark,
  noteDraft,
  noteDirty,
  noteBusy,
  noteStatus,
  canEditNotes,
  onNoteChange,
  onSaveNote,
  onUpgrade
}: {
  bookmark?: BookmarkListItem;
  noteDraft: string;
  noteDirty: boolean;
  noteBusy: boolean;
  noteStatus: string | null;
  canEditNotes: boolean;
  onNoteChange: (value: string) => void;
  onSaveNote: () => void;
  onUpgrade: () => void;
}) {
  const shellClass =
    'border-l border-border bg-[#f7faf9] dark:bg-[#0f1514] lg:sticky lg:top-0 lg:self-start lg:max-h-screen lg:overflow-y-auto';

  if (!bookmark) {
    return (
      <aside className={shellClass}>
        <div className="border-b border-border/70 bg-[#eef5f3] px-5 py-4 dark:bg-[#111c1a]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Inspector</p>
        </div>
        <div className="px-5 py-6">
          <div className="max-w-xs">
            <h2 className="text-lg font-semibold text-foreground">Open a bookmark</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Select any saved post to read its metadata, inspect tags, and keep research notes alongside the original bookmark.
            </p>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className={shellClass}>
      <div className="border-b border-border/70 bg-[#eef5f3] px-5 py-4 dark:bg-[#111c1a]">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Inspector</p>
      </div>
      <div className="px-5 py-5">
        <div className="flex items-start gap-3 border-b border-border/70 pb-4">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
            {bookmark.authorAvatarUrl ? <img src={bookmark.authorAvatarUrl} alt="" className="h-full w-full object-cover" /> : null}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">{bookmark.authorName}</h2>
            <div className="mt-1 text-sm text-muted-foreground">@{bookmark.authorHandle}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{bookmark.folder?.name ?? 'Uncategorized'}</span>
              {bookmark.createdAt ? <span>Posted {formatShortDate(bookmark.createdAt)}</span> : null}
              <span>Imported {formatShortDate(bookmark.importedAt)}</span>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Saved post</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{bookmark.contentText}</p>
        </div>

        <div className="mt-6">
          <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Research note</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Keep the reason this bookmark matters next to the saved post.
          </p>
          <div className="mt-3">
            <TextareaInput
              value={noteDraft}
              onChange={(event) => onNoteChange(event.target.value)}
              readOnly={!canEditNotes}
              disabled={noteBusy}
              placeholder="Summarize the angle, cite the insight, or note the follow-up."
              className={!canEditNotes ? 'cursor-not-allowed opacity-80' : ''}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canEditNotes ? (
              <Button variant="primary" onClick={onSaveNote} disabled={noteBusy || !noteDirty}>
                {noteBusy ? <LoaderCircle size={14} className="animate-spin" /> : <FileText size={14} />}
                {noteBusy ? 'Saving...' : 'Save note'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={onUpgrade}>
                <Lock size={14} />
                Upgrade to save notes
              </Button>
            )}
            {noteStatus ? <span className="text-xs text-muted-foreground">{noteStatus}</span> : null}
          </div>
        </div>

        <div className="mt-6 border-t border-border/70 pt-5">
          <h3 className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Tags</h3>
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

        {bookmark.tweetUrl ? (
          <div className="mt-6">
            <Button variant="secondary" onClick={() => window.open(bookmark.tweetUrl, '_blank', 'noopener,noreferrer')}>
              <ExternalLink size={14} />
              Open original post
            </Button>
          </div>
        ) : null}
      </div>
    </aside>
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('source');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>(null);
  const [importMode, setImportMode] = useState<'visible' | 'auto-scroll' | null>(null);
  const [moveTargetIds, setMoveTargetIds] = useState<string[] | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [tagDialog, setTagDialog] = useState<TagDialogState>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<ActionToast>(null);
  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteStatus, setNoteStatus] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const workspaceTopRef = useRef<HTMLElement>(null);
  const { isPro, license } = useLicenseState();
  const filters = useMemo<BookmarkListFilters>(() => ({ folderId, tagId, includeArchived }), [folderId, tagId, includeArchived]);
  const library = useLibraryData(filters);
  const searchMatches = useMemo(
    () => searchBookmarks(library.bookmarks, debouncedSearchQuery, sortKey),
    [library.bookmarks, debouncedSearchQuery, sortKey]
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const canManageSavedViews = canUseCapability(license, 'saved-views');
  const canEditNotes = canUseCapability(license, 'bookmark-notes');
  const canUseBulkActions = canUseCapability(license, 'bulk-actions');
  const canExportMarkdown = canUseCapability(license, 'markdown-export');
  const canExportCsv = canUseCapability(license, 'csv-export');
  const activeBookmark = searchMatches.find((match) => match.bookmark.id === activeBookmarkId)?.bookmark ?? searchMatches[0]?.bookmark;
  const activeSavedView = library.savedViews.find((savedView) => savedView.id === activeViewId);
  const noteDirty = (activeBookmark?.note ?? '') !== noteDraft;
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
    setNoteDraft(activeBookmark?.note ?? '');
    setNoteStatus(null);
  }, [activeBookmark?.id, activeBookmark?.note]);

  useEffect(() => {
    if (!matchesSavedView(activeSavedView, { query: debouncedSearchQuery, sortKey, folderId, tagId, includeArchived })) {
      setActiveViewId(null);
    }
  }, [activeSavedView, debouncedSearchQuery, sortKey, folderId, tagId, includeArchived]);

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
    function handleScroll() {
      setShowBackToTop(window.scrollY > 600);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [folderId, tagId, includeArchived, debouncedSearchQuery]);

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
      const previousFolders = moveTargetIds.map((bookmarkId) => ({
        bookmarkId,
        folderId: library.bookmarks.find((bookmark) => bookmark.id === bookmarkId)?.folderId
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
      const previousFolders = targetIds.map((bookmarkId) => ({
        bookmarkId,
        folderId: library.bookmarks.find((bookmark) => bookmark.id === bookmarkId)?.folderId
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
    const bookmark = library.bookmarks.find((item) => item.id === bookmarkId);
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
        const bookmark = library.bookmarks.find((item) => item.id === tagDialog.bookmarkId);
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

  async function handleExport(format: 'json' | 'markdown' | 'csv') {
    const bookmarks = searchMatches.map((match) => match.bookmark);
    if (bookmarks.length === 0) {
      return;
    }

    if (format === 'markdown' && !canExportMarkdown) {
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
      setImportStatus(
        session
          ? {
              type: 'success',
              message: `Import complete: ${session.insertedCount} new, ${session.duplicateCount} duplicate, ${session.failedCount} failed, ${session.foundCount} found.`
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

  function handleSelectAllVisible() {
    setSelectedIds(new Set(searchMatches.map((match) => match.bookmark.id)));
  }

  function handleInvertVisibleSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const { bookmark } of searchMatches) {
        if (next.has(bookmark.id)) {
          next.delete(bookmark.id);
        } else {
          next.add(bookmark.id);
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

  async function handleSaveNote() {
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
      await updateBookmarkNote(activeBookmark.id, noteDraft);
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
  }

  function handleArchivedChange(nextIncludeArchived: boolean) {
    setIncludeArchived(nextIncludeArchived);
    setFolderId(undefined);
    setTagId(undefined);
  }

  function handleTagChange(nextTagId?: string | null) {
    setTagId(nextTagId);
    setFolderId(undefined);
    setIncludeArchived(false);
  }

  const visibleTagOptions = tagDialog?.kind === 'remove'
    ? (library.bookmarks.find((item) => item.id === tagDialog.bookmarkId)?.tags ?? [])
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
      <section ref={workspaceTopRef} className="grid min-h-[calc(100vh-140px)] grid-cols-1 border border-border bg-surface shadow-[0_24px_80px_rgba(19,42,39,0.08)] lg:grid-cols-[280px_minmax(0,1fr)_340px]">
        <AppSidebar
          folders={library.folders}
          tags={library.tags}
          counts={library.counts}
          activeFolderId={folderId}
          activeTagId={tagId}
          includeArchived={includeArchived}
          onFolderChange={handleFolderChange}
          onTagChange={handleTagChange}
          onArchivedChange={handleArchivedChange}
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
            canManage={canManageSavedViews}
            onCreate={handleCreateView}
            onApply={handleApplySavedView}
            onRename={handleRenameView}
            onDelete={handleDeleteView}
          />

          <div className="border-b border-border bg-surface px-4 py-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_160px_auto] xl:items-center">
              <label className="flex h-11 min-w-0 items-center gap-2 border border-border bg-background px-3 text-sm shadow-inner">
                <Search size={17} className="text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
                  placeholder="Search text, authors, tags, notes"
                  aria-label="Search bookmarks"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery ? (
                  <button className="grid h-7 w-7 place-items-center text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Clear search" onClick={() => setSearchQuery('')}>
                    <X size={15} />
                  </button>
                ) : null}
              </label>
              <div className="relative">
                <select
                  className="h-11 w-full appearance-none border border-border bg-background pl-3 pr-9 text-sm text-foreground shadow-inner outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  aria-label="Sort bookmarks"
                >
                  <option value="source">Source order</option>
                  <option value="date-posted">Date posted</option>
                  <option value="date-imported">Date imported</option>
                  <option value="author">Author</option>
                </select>
                <ChevronsUpDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" className="h-11 px-4" onClick={() => void handleImport('auto-scroll')} disabled={Boolean(importMode)}>
                  {importMode === 'auto-scroll' ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
                  {importMode === 'auto-scroll' ? 'Loading...' : 'Import more'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void handleExport('json')} disabled={searchMatches.length === 0}>
                  <FileJson size={14} />
                  JSON
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void handleExport('markdown')} disabled={searchMatches.length === 0}>
                  <FileText size={14} />
                  Markdown
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void handleExport('csv')} disabled={searchMatches.length === 0}>
                  <FileSpreadsheet size={14} />
                  CSV
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <div className="inline-flex items-center gap-2 border border-border bg-background px-3 py-2 text-muted-foreground">
                <BookMarked size={14} />
                <span>{searchMatches.length} in view</span>
              </div>
              <div className="inline-flex items-center gap-2 border border-border bg-background px-3 py-2 text-muted-foreground">
                <Sparkles size={14} />
                <span>{library.counts.withNotes} with notes</span>
              </div>
              {importStatus ? (
                <div className={cn('text-sm', importStatus.type === 'error' ? 'text-danger' : 'text-muted-foreground')}>
                  {importStatus.message}
                </div>
              ) : null}
            </div>
          </div>

          {selectedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-[#f2f7f5] px-4 py-3 text-sm dark:bg-[#101816]">
              <span className="font-medium text-foreground">{selectedCount} selected</span>
              <Button size="sm" variant="ghost" onClick={handleSelectAllVisible}>
                All in view
              </Button>
              <Button size="sm" variant="ghost" onClick={handleInvertVisibleSelection}>
                Invert
              </Button>
              <Button size="sm" variant="ghost" onClick={handleClearSelection}>
                Clear
              </Button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void handleBulkTag()}>
                  <Tags size={14} />
                  Tag
                </Button>
                <Button size="sm" onClick={() => void handleBulkMove()}>
                  <Folder size={14} />
                  Move
                </Button>
                <Button size="sm" variant="danger" onClick={() => void handleBulkDelete()}>
                  <Trash2 size={14} />
                  Delete
                </Button>
                {!canUseBulkActions ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock size={12} />Pro</span> : null}
              </div>
            </div>
          ) : null}

          <BookmarkList
            matches={searchMatches}
            totalCount={library.counts.total}
            loading={library.loading}
            error={library.error}
            hasSearchQuery={Boolean(debouncedSearchQuery.trim())}
            focusedIndex={focusedIndex}
            activeBookmarkId={activeBookmark?.id}
            onOpen={setActiveBookmarkId}
            onArchive={(bookmarkId, archived) => void handleArchive(bookmarkId, archived)}
            onDelete={handleDelete}
            onMove={handleMove}
            onTag={handleTag}
            onRemoveTag={handleRemoveTag}
            selectedIds={selectedIds}
            onSelectedChange={handleSelectedChange}
          />
        </div>

        <BookmarkInspector
          bookmark={activeBookmark}
          noteDraft={noteDraft}
          noteDirty={noteDirty}
          noteBusy={noteBusy}
          noteStatus={noteStatus}
          canEditNotes={canEditNotes}
          onNoteChange={setNoteDraft}
          onSaveNote={() => void handleSaveNote()}
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
