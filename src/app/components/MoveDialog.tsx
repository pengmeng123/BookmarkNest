import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';

import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, SelectInput, TextInput } from '../../components/Field';
import type { Folder } from '../../shared/types';

interface MoveDialogProps {
  folders: Folder[];
  open: boolean;
  itemCount: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onMove: (folderId?: string) => void;
  onCreateAndMove: (folderName: string) => void;
}

export function MoveDialog({ folders, open, itemCount, busy, error, onClose, onMove, onCreateAndMove }: MoveDialogProps) {
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
    <Dialog
      open={open}
      title={`Move bookmark${itemCount > 1 ? 's' : ''}`}
      description={`${itemCount} selected. Choose an existing folder or create a new one.`}
      onClose={onClose}
      closeOnOverlayClick={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={handleMove} disabled={busy || (selectedFolderId === '__new__' && !newFolderName.trim())}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
            {busy ? 'Moving...' : 'Move'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Destination">
          <SelectInput
            value={selectedFolderId}
            disabled={busy}
            onChange={(event) => setSelectedFolderId(event.target.value)}
          >
            <option value="__uncategorized__">Uncategorized</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
            <option value="__new__">Create new folder...</option>
          </SelectInput>
        </Field>

        {selectedFolderId === '__new__' ? (
          <Field label="New folder name" hint="The folder will be created locally in BookmarkNest.">
            <TextInput
              value={newFolderName}
              disabled={busy}
              onChange={(event) => setNewFolderName(event.target.value)}
              autoFocus
            />
          </Field>
        ) : null}
        {error ? <p className="rounded-app border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p> : null}
      </div>
    </Dialog>
  );
}
