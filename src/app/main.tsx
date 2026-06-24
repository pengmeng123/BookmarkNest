import {
  Archive,
  Download,
  FileJson,
  FileSpreadsheet,
  Folder,
  Inbox,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field, SelectInput, TextInput } from '../components/Field';
import { PageShell } from '../components/PageShell';
import {
  deleteFolder,
  deleteTag,
  createFolder,
  createTag,
  moveBookmarksToFolder,
  removeTagFromBookmark,
  renameFolder,
  restoreBookmarks,
  setBookmarkArchived,
  softDeleteBookmark,
  addTagToBookmarks,
  type BookmarkListFilters
} from '../lib/db/bookmarkRepository';
import { sendRuntimeMessage } from '../lib/messaging/runtime';
import { cn } from '../lib/utils/cn';
import { searchBookmarks } from '../lib/search/searchBookmarks';
import { downloadBookmarks } from '../lib/export/download';
import '../styles/globals.css';
import { BookmarkList } from './components/BookmarkList';
import { MoveDialog } from './components/MoveDialog';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useLibraryData } from './hooks/useLibraryData';
import { useLicenseState } from './hooks/useLicenseState';

type FolderFilter = string | null | undefined;
type NameDialogState =
  | { kind: 'create-folder'; title: string; label: string; initialValue?: string }
  | { kind: 'rename-folder'; title: string; label: string; folderId: string; initialValue?: string }
  | { kind: 'create-tag'; title: string; label: string; initialValue?: string }
  | null;
type ConfirmDialogState =
  | { kind: 'delete-folder'; title: string; description: string; folderId: string; actionLabel: string }
  | { kind: 'delete-tag'; title: string; description: string; tagId: string; actionLabel: string }
  | { kind: 'delete-bookmark'; title: string; description: string; bookmarkId: string; actionLabel: string }
  | { kind: 'bulk-delete'; title: string; description: string; actionLabel: string }
  | null;
type TagDialogState = { kind: 'add' | 'remove'; bookmarkIds: string[]; bookmarkId?: string } | null;
type ImportStatus = { type: 'loading' | 'success' | 'error'; message: string } | null;
type ActionToast = { type: 'success' | 'error'; message: string; undoBookmarkIds?: string[] } | null;

function formatImportError(error?: string) {
  if (!error) {
    return 'Import failed. Open your X bookmarks page and wait for bookmarks to load.';
  }

  if (error.includes('Open your X bookmarks page') || error.includes('No active tab')) {
    return 'No loaded X bookmarks page detected. Open x.com/i/bookmarks, wait for the list to appear, then try Import again.';
  }

  return error;
}

function AppSidebar({
  folders,
  tags,
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
  const folderItemClass = (active: boolean) =>
    cn(
      'flex h-9 w-full items-center gap-2 rounded-app px-2.5 text-left text-sm text-muted-foreground transition hover:bg-muted/80 hover:text-foreground',
      active && 'bg-primary/10 font-medium text-primary ring-1 ring-primary/10'
    );
  const actionButtonClass =
    'grid h-8 w-8 place-items-center rounded-app text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100 focus:opacity-100';

  return (
    <aside className="rounded-app border border-border bg-surface p-3 shadow-sm">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">Library</h2>
        <MoreHorizontal size={16} className="text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-4 space-y-1">
        <button className={folderItemClass(activeFolderId === undefined && !includeArchived)} onClick={() => onFolderChange(undefined)}>
          <Inbox size={16} />
          <span className="truncate">All bookmarks</span>
        </button>
        <button className={folderItemClass(activeFolderId === null)} onClick={() => onFolderChange(null)}>
          <Folder size={16} />
          <span className="truncate">Uncategorized</span>
        </button>
        <button className={folderItemClass(includeArchived)} onClick={() => onArchivedChange(!includeArchived)}>
          <Archive size={16} />
          <span className="truncate">Archived</span>
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Folders</h3>
        <button className="grid h-7 w-7 place-items-center rounded-app text-primary hover:bg-primary/10" onClick={onCreateFolder} aria-label="New folder">
          <Plus size={15} />
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {folders.map((folder) => (
          <div key={folder.id} className="group flex items-center gap-1">
            <button className={cn(folderItemClass(activeFolderId === folder.id), 'min-w-0 flex-1')} onClick={() => onFolderChange(folder.id)}>
              <Folder size={16} />
              <span className="truncate">{folder.name}</span>
            </button>
            <button className={actionButtonClass} onClick={() => onRenameFolder(folder.id)} aria-label={`Rename ${folder.name}`}>
              <Pencil size={14} />
            </button>
            <button className={actionButtonClass} onClick={() => onDeleteFolder(folder.id)} aria-label={`Delete ${folder.name}`}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tags</h3>
        <button className="grid h-7 w-7 place-items-center rounded-app text-primary hover:bg-primary/10" onClick={onCreateTag} aria-label="New tag">
          <Plus size={15} />
        </button>
      </div>
      <div className="mt-2 space-y-1">
        <button className={folderItemClass(!activeTagId)} onClick={() => onTagChange(undefined)}>
          <Tags size={16} />
          <span className="truncate">All tags</span>
        </button>
        {tags.map((tag) => (
          <div key={tag.id} className="group flex items-center gap-1">
            <button className={cn(folderItemClass(activeTagId === tag.id), 'min-w-0 flex-1')} onClick={() => onTagChange(tag.id)}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
              <span className="truncate">{tag.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{tag.usageCount}</span>
            </button>
            <button className={actionButtonClass} onClick={() => onDeleteTag(tag.id)} aria-label={`Delete ${tag.name}`}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
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
        <TextInput value={value} autoFocus disabled={busy} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && value.trim() && !busy) {
            onSubmit(value.trim());
          }
        }} />
      </Field>
      {error ? <p className="mt-3 rounded-app border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}
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
      <div className="rounded-app border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-muted-foreground">
        This only changes your local BookmarkNest library.
      </div>
      {error ? <p className="mt-3 rounded-app border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}
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
        {error ? <p className="rounded-app border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}
      </div>
    </Dialog>
  );
}

function App() {
  const [folderId, setFolderId] = useState<FolderFilter>(undefined);
  const [tagId, setTagId] = useState<string | null | undefined>(undefined);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [importStatus, setImportStatus] = useState<ImportStatus>(null);
  const [importMode, setImportMode] = useState<'visible' | 'auto-scroll' | null>(null);
  const [moveTargetIds, setMoveTargetIds] = useState<string[] | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [tagDialog, setTagDialog] = useState<TagDialogState>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<ActionToast>(null);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const { isPro } = useLicenseState();
  const filters = useMemo<BookmarkListFilters>(() => ({ folderId, tagId, includeArchived, isPro }), [folderId, tagId, includeArchived, isPro]);
  const library = useLibraryData(filters);
  const searchMatches = useMemo(
    () => searchBookmarks(library.bookmarks, debouncedSearchQuery),
    [library.bookmarks, debouncedSearchQuery]
  );

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

  function handleCreateFolder() {
    setDialogError(null);
    setNameDialog({ kind: 'create-folder', title: 'New folder', label: 'Folder name' });
  }

  function handleRenameFolder(folderId: string) {
    const folder = library.folders.find((item) => item.id === folderId);
    setDialogError(null);
    setNameDialog({ kind: 'rename-folder', title: 'Rename folder', label: 'Folder name', folderId, initialValue: folder?.name });
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

  function handleDeleteTag(tagId: string) {
    const tag = library.tags.find((item) => item.id === tagId);
    setDialogError(null);
    setConfirmDialog({
      kind: 'delete-tag',
      title: `Delete ${tag?.name ?? 'tag'}?`,
      description: 'This tag will be removed from every local bookmark.',
      tagId,
      actionLabel: 'Delete tag'
    });
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
        await deleteFolder(confirmDialog.folderId);
        setSelectedIds(new Set());
        setConfirmDialog(null);

        if (wasViewingDeletedFolder) {
          setFolderId(undefined);
        } else {
          await library.refresh();
        }
        return;
      }

      if (confirmDialog.kind === 'delete-tag') {
        await refreshAfter(deleteTag(confirmDialog.tagId));
        setTagId(undefined);
      }
      if (confirmDialog.kind === 'delete-bookmark') {
        const deletedIds = [confirmDialog.bookmarkId];
        await refreshAfter(softDeleteBookmark(confirmDialog.bookmarkId));
        setActionToast({ type: 'success', message: 'Bookmark deleted.', undoBookmarkIds: deletedIds });
      }
      if (confirmDialog.kind === 'bulk-delete') {
        const deletedIds = Array.from(selectedIds);
        await refreshAfter(Promise.all(deletedIds.map((bookmarkId) => softDeleteBookmark(bookmarkId))));
        setActionToast({ type: 'success', message: `${deletedIds.length} bookmarks deleted.`, undoBookmarkIds: deletedIds });
      }
      setConfirmDialog(null);
    });
  }

  function handleMove(bookmarkId: string) {
    setDialogError(null);
    setMoveTargetIds([bookmarkId]);
  }

  function handleBulkMove() {
    if (selectedIds.size) {
      setDialogError(null);
      setMoveTargetIds(Array.from(selectedIds));
    }
  }

  async function handleMoveToFolder(folderId?: string) {
    if (!moveTargetIds?.length) {
      return;
    }
    await runDialogAction(async () => {
      await refreshAfter(moveBookmarksToFolder(moveTargetIds, folderId));
      setMoveTargetIds(null);
    });
  }

  async function handleCreateFolderAndMove(folderName: string) {
    if (!moveTargetIds?.length) {
      return;
    }
    await runDialogAction(async () => {
      const existing = library.folders.find((folder) => folder.name.toLowerCase() === folderName.toLowerCase());
      const folder = existing ?? (await createFolder(folderName));
      await refreshAfter(moveBookmarksToFolder(moveTargetIds, folder.id));
      setMoveTargetIds(null);
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

    if (!isPro && format !== 'json') {
      await sendRuntimeMessage({ type: 'OPEN_UPGRADE' });
      return;
    }

    await downloadBookmarks(format, bookmarks);
  }

  async function handleImport(mode: 'visible' | 'auto-scroll' = 'visible') {
    if (importMode) {
      return;
    }

    setImportMode(mode);
    setImportStatus({
      type: 'loading',
      message: mode === 'auto-scroll' ? 'Loading more X bookmarks, then importing...' : 'Looking for an open X bookmarks tab...'
    });
    try {
      const response = await sendRuntimeMessage<{ session?: { insertedCount: number; duplicateCount: number; failedCount: number } }>({
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
              message: `Import complete: ${session.insertedCount} new, ${session.duplicateCount} duplicate, ${session.failedCount} failed.`
            }
          : { type: 'success', message: 'Import complete.' }
      );
    } finally {
      setImportMode(null);
    }
  }

  useEffect(() => {
    if (!importStatus || importStatus.type !== 'success') {
      return;
    }

    const timeoutId = window.setTimeout(() => setImportStatus(null), 6000);
    return () => window.clearTimeout(timeoutId);
  }, [importStatus]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [folderId, tagId, includeArchived, debouncedSearchQuery]);

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
    setSelectedIds(new Set(searchMatches.map((match) => match.bookmark).filter((bookmark) => !bookmark.locked).map((bookmark) => bookmark.id)));
  }

  function handleInvertVisibleSelection() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const { bookmark } of searchMatches) {
        if (bookmark.locked) {
          continue;
        }
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

  async function handleUndoDelete(bookmarkIds: string[]) {
    try {
      await restoreBookmarks(bookmarkIds);
      await library.refresh();
      setActionToast({ type: 'success', message: `${bookmarkIds.length === 1 ? 'Bookmark' : 'Bookmarks'} restored.` });
    } catch (error) {
      setActionToast({ type: 'error', message: formatActionError(error) });
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
  const selectableCount = searchMatches.filter((match) => !match.bookmark.locked).length;

  return (
    <PageShell title="BookmarkNest" description="Import the X bookmarks already loaded in your browser, then organize and export them locally.">
      <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar
          folders={library.folders}
          tags={library.tags}
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
        <div className="overflow-hidden rounded-app border border-border bg-surface shadow-sm">
          <div className="border-b border-border bg-surface p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-app border border-border bg-background px-3 text-sm shadow-inner">
                <Search size={17} className="text-muted-foreground" />
                <input
                  className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
                  placeholder="Search text, authors, tags"
                  aria-label="Search bookmarks"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {searchQuery ? (
                  <button className="grid h-7 w-7 place-items-center rounded-app text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Clear search" onClick={() => setSearchQuery('')}>
                    <X size={15} />
                  </button>
                ) : null}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" onClick={() => void handleImport('visible')} disabled={Boolean(importMode)}>
                    {importMode === 'visible' ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
                    {importMode === 'visible' ? 'Importing...' : 'Import visible'}
                  </Button>
                  <Button onClick={() => void handleImport('auto-scroll')} disabled={Boolean(importMode)}>
                    {importMode === 'auto-scroll' ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
                    {importMode === 'auto-scroll' ? 'Loading...' : 'Import more'}
                  </Button>
                <div className="flex rounded-app border border-border bg-background p-1">
                  <Button size="xs" variant="ghost" onClick={() => void handleExport('json')} disabled={searchMatches.length === 0}>
                    <FileJson size={14} />
                    JSON
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => void handleExport('markdown')} disabled={searchMatches.length === 0}>
                    <Download size={14} />
                    MD
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => void handleExport('csv')} disabled={searchMatches.length === 0}>
                    <FileSpreadsheet size={14} />
                    CSV
                  </Button>
                </div>
              </div>
            </div>
          </div>
          {importStatus ? (
            <div
              className={cn(
                'flex items-start justify-between gap-3 border-b border-border px-4 py-2 text-sm',
                importStatus.type === 'error' ? 'bg-danger/5 text-danger' : 'bg-primary/5 text-primary'
              )}
            >
              <span>{importStatus.message}</span>
              <button
                className="grid h-6 w-6 shrink-0 place-items-center rounded-app hover:bg-background/70"
                aria-label="Dismiss import status"
                onClick={() => setImportStatus(null)}
              >
                <X size={14} />
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/60 px-4 py-3 text-sm">
            <span className="font-medium">{selectedIds.size} selected</span>
            <span className="text-muted-foreground">{selectableCount} visible</span>
            <Button size="sm" onClick={handleSelectAllVisible} disabled={selectableCount === 0}>
              Select all visible
            </Button>
            <Button size="sm" onClick={handleInvertVisibleSelection} disabled={selectableCount === 0}>
              Invert visible
            </Button>
            <Button size="sm" variant="ghost" onClick={handleClearSelection} disabled={selectedIds.size === 0}>
              Clear
            </Button>
            {selectedIds.size > 0 ? (
              <>
                {!isPro ? <span className="text-muted-foreground">Bulk actions are a Pro feature.</span> : null}
              <Button size="sm" onClick={() => void handleBulkTag()} disabled={!isPro}>
                Add tag
              </Button>
              <Button size="sm" onClick={() => void handleBulkMove()} disabled={!isPro}>
                Move
              </Button>
              <Button size="sm" variant="danger" onClick={() => void handleBulkDelete()} disabled={!isPro}>
                Delete
              </Button>
              {!isPro ? (
                <Button size="sm" variant="primary" onClick={() => void sendRuntimeMessage({ type: 'OPEN_UPGRADE' })}>
                  Upgrade
                </Button>
              ) : null}
              </>
            ) : null}
          </div>
          <BookmarkList
            matches={searchMatches}
            totalCount={library.bookmarks.length}
            loading={library.loading}
            error={library.error}
            hasSearchQuery={Boolean(debouncedSearchQuery.trim())}
            onArchive={(bookmarkId, archived) => void handleArchive(bookmarkId, archived)}
            onDelete={(bookmarkId) => void handleDelete(bookmarkId)}
            onMove={handleMove}
            onTag={(bookmarkId) => void handleTag(bookmarkId)}
            onRemoveTag={(bookmarkId) => void handleRemoveTag(bookmarkId)}
            selectedIds={selectedIds}
            onSelectedChange={handleSelectedChange}
          />
        </div>
      </section>
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
      <NameDialog state={nameDialog} busy={dialogBusy} error={dialogError} onClose={closeNameDialog} onSubmit={(value) => void handleNameSubmit(value)} />
      <ConfirmDialog state={confirmDialog} busy={dialogBusy} error={dialogError} onClose={closeConfirmDialog} onConfirm={() => void handleConfirmSubmit()} />
      <TagDialog
        state={tagDialog}
        tags={visibleTagOptions}
        busy={dialogBusy}
        error={dialogError}
        onClose={closeTagDialog}
        onSubmit={(tagName) => void handleTagSubmit(tagName)}
      />
      {actionToast ? (
        <div
          className={cn(
            'fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-app border bg-surface px-4 py-3 text-sm shadow-xl',
            actionToast.type === 'error' ? 'border-danger/25 text-danger' : 'border-border text-foreground'
          )}
          role="status"
        >
          <span className="min-w-0 flex-1">{actionToast.message}</span>
          {actionToast.undoBookmarkIds?.length ? (
            <Button size="xs" onClick={() => void handleUndoDelete(actionToast.undoBookmarkIds ?? [])}>
              Undo
            </Button>
          ) : null}
          <button
            className="grid h-7 w-7 shrink-0 place-items-center rounded-app text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Dismiss notification"
            onClick={() => setActionToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
    </PageShell>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
