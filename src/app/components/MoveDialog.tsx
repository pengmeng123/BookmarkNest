import { useEffect, useState } from 'react';

import { Button } from '../../components/Button';
import type { Folder } from '../../shared/types';

interface MoveDialogProps {
  folders: Folder[];
  open: boolean;
  itemCount: number;
  onClose: () => void;
  onMove: (folderId?: string) => void;
  onCreateAndMove: (folderName: string) => void;
}

export function MoveDialog({ folders, open, itemCount, onClose, onMove, onCreateAndMove }: MoveDialogProps) {
  const [selectedFolderId, setSelectedFolderId] = useState('__uncategorized__');
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedFolderId('__uncategorized__');
      setNewFolderName('');
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function handleMove() {
    if (selectedFolderId === '__new__') {
      if (newFolderName.trim()) {
        onCreateAndMove(newFolderName.trim());
      }
      return;
    }

    onMove(selectedFolderId === '__uncategorized__' ? undefined : selectedFolderId);
  }

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-sm rounded-app border border-border bg-surface p-4 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Move bookmark{itemCount > 1 ? 's' : ''}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{itemCount} selected</p>
          </div>
          <button className="rounded-app px-2 py-1 text-sm text-muted-foreground hover:bg-muted" onClick={onClose}>
            Close
          </button>
        </div>

        <label className="mt-4 block text-sm">
          <span className="text-muted-foreground">Folder</span>
          <select
            className="mt-1 h-10 w-full rounded-app border border-border bg-background px-3 outline-none"
            value={selectedFolderId}
            onChange={(event) => setSelectedFolderId(event.target.value)}
          >
            <option value="__uncategorized__">Uncategorized</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
            <option value="__new__">Create new folder...</option>
          </select>
        </label>

        {selectedFolderId === '__new__' ? (
          <label className="mt-3 block text-sm">
            <span className="text-muted-foreground">New folder name</span>
            <input
              className="mt-1 h-10 w-full rounded-app border border-border bg-background px-3 outline-none"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              autoFocus
            />
          </label>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleMove} disabled={selectedFolderId === '__new__' && !newFolderName.trim()}>
            Move
          </Button>
        </div>
      </div>
    </div>
  );
}
