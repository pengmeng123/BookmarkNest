import type { ImportSession } from '../../shared/types';
import type { MessageResponse } from '../../shared/types';
import { parseLoadedBookmarkCards } from './parser';

export interface ImportRunResult {
  session: ImportSession;
}

export interface ImportController {
  cancelled: boolean;
}

export interface AutoScrollOptions {
  maxScrolls?: number;
  idleRounds?: number;
  waitMs?: number;
  scrollBy?: number;
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

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function loadMoreBookmarksByScrolling(
  root: ParentNode = document,
  controller?: ImportController,
  onProgress?: (progress: { scrolls: number; foundCount: number; idleRounds: number }) => void,
  options: AutoScrollOptions = {}
) {
  const maxScrolls = options.maxScrolls ?? 30;
  const maxIdleRounds = options.idleRounds ?? 4;
  const waitMs = options.waitMs ?? 1400;
  const scrollBy = options.scrollBy ?? Math.max(700, Math.floor(window.innerHeight * 0.85));
  let lastFoundCount = parseLoadedBookmarkCards(root).foundCount;
  let idleRounds = 0;

  onProgress?.({ scrolls: 0, foundCount: lastFoundCount, idleRounds });

  for (let scrolls = 1; scrolls <= maxScrolls; scrolls += 1) {
    if (controller?.cancelled) {
      break;
    }

    window.scrollBy({ top: scrollBy, behavior: 'smooth' });
    await sleep(waitMs);

    const foundCount = parseLoadedBookmarkCards(root).foundCount;
    idleRounds = foundCount > lastFoundCount ? 0 : idleRounds + 1;
    lastFoundCount = Math.max(lastFoundCount, foundCount);
    onProgress?.({ scrolls, foundCount, idleRounds });

    if (idleRounds >= maxIdleRounds) {
      break;
    }
  }

  return { foundCount: lastFoundCount };
}
