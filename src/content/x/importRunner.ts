import { upsertBookmark } from '../../lib/db/bookmarkRepository';
import { db } from '../../lib/db/database';
import type { ImportSession } from '../../shared/types';
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

  await db.importSessions.add(session);
  onProgress?.({ ...session });

  for (const card of parsed.parsed) {
    if (controller?.cancelled) {
      session.status = 'cancelled';
      break;
    }

    try {
      const result = await upsertBookmark(card.input);
      if (result.inserted) {
        session.insertedCount += 1;
      } else {
        session.duplicateCount += 1;
        session.updatedCount += 1;
      }
    } catch {
      session.failedCount += 1;
    }

    onProgress?.({ ...session });
  }

  if (session.status === 'running') {
    session.status = 'completed';
  }
  session.finishedAt = Date.now();
  await db.importSessions.put(session);
  onProgress?.({ ...session });

  return { session };
}
