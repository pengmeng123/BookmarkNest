import type { ImportSession } from '../../shared/types';
import type { MessageResponse } from '../../shared/types';
import { parseLoadedBookmarkCards } from './parser';

export interface ImportRunResult {
  session: ImportSession;
}

export interface ImportController {
  cancelled: boolean;
}

function createId(prefix: string) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function runImportFromLoadedCards(
  sourceUrl: string,
  root: ParentNode = document,
  controller?: ImportController,
  onProgress?: (session: ImportSession) => void
): Promise<ImportRunResult> {
  const parsed = parseLoadedBookmarkCards(root);
  const now = Date.now();
  const session: ImportSession = {
    id: createId('import'),
    startedAt: now,
    sourceUrl,
    foundCount: parsed.foundCount,
    insertedCount: 0,
    updatedCount: 0,
    duplicateCount: 0,
    failedCount: parsed.failedCount,
    status: 'running'
  };

  onProgress?.({ ...session });

  const bookmarks = [];
  for (const card of parsed.parsed) {
    if (controller?.cancelled) {
      session.status = 'cancelled';
      break;
    }

    bookmarks.push(card.input);
    onProgress?.({ ...session });
  }

  if (session.status !== 'cancelled') {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_IMPORTED_BOOKMARKS',
      payload: {
        sourceUrl,
        bookmarks,
        foundCount: parsed.foundCount,
        failedCount: parsed.failedCount
      }
    });
    const saveResponse = response as MessageResponse<ImportRunResult>;
    if (!saveResponse.ok || !saveResponse.data) {
      throw new Error(saveResponse.error ?? 'Unable to save imported bookmarks.');
    }
    return saveResponse.data;
  }

  session.finishedAt = Date.now();
  onProgress?.({ ...session });

  return { session };
}
