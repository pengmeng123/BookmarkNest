import { Archive, Download, Folder, Inbox, Search, Upload, X } from 'lucide-react';
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { Button } from '../components/Button';
import { PageShell } from '../components/PageShell';
import {
  deleteFolder,
  deleteTag,
  createFolder,
  createTag,
  moveBookmarksToFolder,
  removeTagFromBookmark,
  renameFolder,
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
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { useLibraryData } from './hooks/useLibraryData';
import { useLicenseState } from './hooks/useLicenseState';

type FolderFilter = string | null | undefined;

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
    cn('flex w-full items-center gap-2 rounded-app px-2 py-2 text-left text-sm hover:bg-muted', active && 'bg-muted font-medium');

  return (
    <aside className="rounded-app border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Library</h2>
      </div>
      <div className="mt-4 space-y-1">
        <button className={folderItemClass(activeFolderId === undefined && !includeArchived)} onClick={() => onFolderChange(undefined)}>
          <Inbox size={16} />
          All bookmarks
        </button>
        <button className={folderItemClass(activeFolderId === null)} onClick={() => onFolderChange(null)}>
          <Folder size={16} />
          Uncategorized
        </button>
        <button className={folderItemClass(includeArchived)} onClick={() => onArchivedChange(!includeArchived)}>
          <Archive size={16} />
          Archived
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">Folders</h3>
        <button className="text-xs text-primary" onClick={onCreateFolder}>
          New
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {folders.map((folder) => (
          <div key={folder.id} className="group flex items-center gap-1">
            <button className={cn(folderItemClass(activeFolderId === folder.id), 'min-w-0 flex-1')} onClick={() => onFolderChange(folder.id)}>
              <Folder size={16} />
              <span className="truncate">{folder.name}</span>
            </button>
            <button className="rounded-app px-1 text-xs text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100" onClick={() => onRenameFolder(folder.id)}>
              Rename
            </button>
            <button className="rounded-app px-1 text-xs text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100" onClick={() => onDeleteFolder(folder.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">Tags</h3>
        <button className="text-xs text-primary" onClick={onCreateTag}>
          New
        </button>
      </div>
      <div className="mt-2 space-y-1">
        <button className={folderItemClass(!activeTagId)} onClick={() => onTagChange(undefined)}>
          All tags
        </button>
        {tags.map((tag) => (
          <div key={tag.id} className="group flex items-center gap-1">
            <button className={cn(folderItemClass(activeTagId === tag.id), 'min-w-0 flex-1')} onClick={() => onTagChange(tag.id)}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
              <span className="truncate">{tag.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{tag.usageCount}</span>
            </button>
            <button className="rounded-app px-1 text-xs text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100" onClick={() => onDeleteTag(tag.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function App() {
  const [folderId, setFolderId] = useState<FolderFilter>(undefined);
  const [tagId, setTagId] = useState<string | null | undefined>(undefined);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const { isPro } = useLicenseState();
  const filters = useMemo<BookmarkListFilters>(() => ({ folderId, tagId, includeArchived, isPro }), [folderId, tagId, includeArchived]);
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

  async function handleCreateFolder() {
    const name = window.prompt('Folder name');
    if (name?.trim()) {
      await refreshAfter(createFolder(name.trim()));
    }
  }

  async function handleRenameFolder(folderId: string) {
    const folder = library.folders.find((item) => item.id === folderId);
    const name = window.prompt('Folder name', folder?.name);
    if (name?.trim()) {
      await refreshAfter(renameFolder(folderId, name.trim()));
    }
  }

  async function handleDeleteFolder(folderId: string) {
    if (window.confirm('Delete this folder? Bookmarks will move to Uncategorized.')) {
      await refreshAfter(deleteFolder(folderId));
      setFolderId(undefined);
    }
  }

  async function handleCreateTag() {
    const name = window.prompt('Tag name');
    if (name?.trim()) {
      await refreshAfter(createTag(name.trim()));
    }
  }

  async function handleDeleteTag(tagId: string) {
    if (window.confirm('Delete this tag from all bookmarks?')) {
      await refreshAfter(deleteTag(tagId));
      setTagId(undefined);
    }
  }

  async function handleMove(bookmarkId: string) {
    const folderName = window.prompt('Move to folder name');
    if (!folderName?.trim()) {
      await refreshAfter(moveBookmarksToFolder([bookmarkId], undefined));
      return;
    }

    const existing = library.folders.find((folder) => folder.name.toLowerCase() === folderName.trim().toLowerCase());
    const folder = existing ?? (await createFolder(folderName.trim()));
    await refreshAfter(moveBookmarksToFolder([bookmarkId], folder.id));
  }

  async function handleBulkMove() {
    if (!selectedIds.size) {
      return;
    }

    const folderName = window.prompt('Move selected bookmarks to folder');
    if (!folderName?.trim()) {
      await refreshAfter(moveBookmarksToFolder(Array.from(selectedIds), undefined));
      return;
    }

    const existing = library.folders.find((folder) => folder.name.toLowerCase() === folderName.trim().toLowerCase());
    const folder = existing ?? (await createFolder(folderName.trim()));
    await refreshAfter(moveBookmarksToFolder(Array.from(selectedIds), folder.id));
  }

  async function handleTag(bookmarkId: string) {
    const tagName = window.prompt('Tag name');
    if (!tagName?.trim()) {
      return;
    }

    const existing = library.tags.find((tag) => tag.name.toLowerCase() === tagName.trim().toLowerCase());
    const tag = existing ?? (await createTag(tagName.trim()));
    await refreshAfter(addTagToBookmarks([bookmarkId], tag.id));
  }

  async function handleBulkTag() {
    if (!selectedIds.size) {
      return;
    }

    const tagName = window.prompt('Add tag to selected bookmarks');
    if (!tagName?.trim()) {
      return;
    }

    const existing = library.tags.find((tag) => tag.name.toLowerCase() === tagName.trim().toLowerCase());
    const tag = existing ?? (await createTag(tagName.trim()));
    await refreshAfter(addTagToBookmarks(Array.from(selectedIds), tag.id));
  }

  async function handleRemoveTag(bookmarkId: string) {
    const bookmark = library.bookmarks.find((item) => item.id === bookmarkId);
    if (!bookmark?.tags.length) {
      return;
    }

    const tagName = window.prompt('Remove tag name', bookmark.tags[0]?.name);
    const tag = bookmark.tags.find((item) => item.name.toLowerCase() === tagName?.trim().toLowerCase());
    if (tag) {
      await refreshAfter(removeTagFromBookmark(bookmarkId, tag.id));
    }
  }

  async function handleArchive(bookmarkId: string, archived: boolean) {
    await refreshAfter(setBookmarkArchived(bookmarkId, archived));
  }

  async function handleDelete(bookmarkId: string) {
    if (window.confirm('Delete this local bookmark?')) {
      await refreshAfter(softDeleteBookmark(bookmarkId));
    }
  }

  async function handleBulkDelete() {
    if (!selectedIds.size || !window.confirm('Delete selected local bookmarks?')) {
      return;
    }

    await refreshAfter(Promise.all(Array.from(selectedIds).map((bookmarkId) => softDeleteBookmark(bookmarkId))));
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

  async function handleImport() {
    setImportStatus('Looking for an open X bookmarks tab...');
    const response = await sendRuntimeMessage<{ session?: { insertedCount: number; duplicateCount: number; failedCount: number } }>({
      type: 'START_X_IMPORT'
    });

    if (!response.ok) {
      setImportStatus(response.error ?? 'Import failed.');
      return;
    }

    await library.refresh();
    const session = response.data?.session;
    setImportStatus(
      session
        ? `Imported ${session.insertedCount} new, ${session.duplicateCount} duplicate, ${session.failedCount} failed.`
        : 'Import completed.'
    );
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

  function handleFolderChange(nextFolderId: FolderFilter) {
    setFolderId(nextFolderId);
    setIncludeArchived(false);
  }

  function handleArchivedChange(nextIncludeArchived: boolean) {
    setIncludeArchived(nextIncludeArchived);
    setFolderId(undefined);
  }

  return (
    <PageShell title="BookmarkNest" description="Search, organize, and export your X bookmarks.">
      <section className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <AppSidebar
          folders={library.folders}
          tags={library.tags}
          activeFolderId={folderId}
          activeTagId={tagId}
          includeArchived={includeArchived}
          onFolderChange={handleFolderChange}
          onTagChange={setTagId}
          onArchivedChange={handleArchivedChange}
          onCreateFolder={() => void handleCreateFolder()}
          onCreateTag={() => void handleCreateTag()}
          onRenameFolder={(nextFolderId) => void handleRenameFolder(nextFolderId)}
          onDeleteFolder={(nextFolderId) => void handleDeleteFolder(nextFolderId)}
          onDeleteTag={(nextTagId) => void handleDeleteTag(nextTagId)}
        />
        <div className="rounded-app border border-border bg-surface">
          <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-app border border-border bg-background px-3 text-sm">
              <Search size={16} />
              <input
                className="w-full bg-transparent outline-none"
                placeholder="Search bookmarks"
                aria-label="Search bookmarks"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery ? (
                <button aria-label="Clear search" onClick={() => setSearchQuery('')}>
                  <X size={16} />
                </button>
              ) : null}
            </label>
            <Button
              variant="primary"
              onClick={() => void handleImport()}
            >
              <Upload size={16} />
              Import
            </Button>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void handleExport('json')} disabled={searchMatches.length === 0}>
                <Download size={14} />
                JSON
              </Button>
              <Button size="sm" onClick={() => void handleExport('markdown')} disabled={searchMatches.length === 0}>
                Markdown
              </Button>
              <Button size="sm" onClick={() => void handleExport('csv')} disabled={searchMatches.length === 0}>
                CSV
              </Button>
            </div>
          </div>
          {importStatus ? <div className="border-b border-border px-4 py-2 text-sm text-muted-foreground">{importStatus}</div> : null}
          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-4 py-3 text-sm">
              <span className="font-medium">{selectedIds.size} selected</span>
              {!isPro ? <span className="text-muted-foreground">Bulk actions are a Pro feature.</span> : null}
              <Button size="sm" onClick={() => void handleBulkTag()} disabled={!isPro}>
                Add tag
              </Button>
              <Button size="sm" onClick={() => void handleBulkMove()} disabled={!isPro}>
                Move
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void handleBulkDelete()} disabled={!isPro}>
                Delete
              </Button>
              {!isPro ? (
                <Button size="sm" variant="primary" onClick={() => void sendRuntimeMessage({ type: 'OPEN_UPGRADE' })}>
                  Upgrade
                </Button>
              ) : null}
            </div>
          ) : null}
          <BookmarkList
            matches={searchMatches}
            loading={library.loading}
            error={library.error}
            onArchive={(bookmarkId, archived) => void handleArchive(bookmarkId, archived)}
            onDelete={(bookmarkId) => void handleDelete(bookmarkId)}
            onMove={(bookmarkId) => void handleMove(bookmarkId)}
            onTag={(bookmarkId) => void handleTag(bookmarkId)}
            onRemoveTag={(bookmarkId) => void handleRemoveTag(bookmarkId)}
            selectedIds={selectedIds}
            onSelectedChange={handleSelectedChange}
          />
        </div>
      </section>
    </PageShell>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
