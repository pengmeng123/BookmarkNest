import type { ImportSession } from '../../shared/types';
import type { MessageResponse } from '../../shared/types';
import type { BookmarkInput } from '../../shared/types';
import { parseLoadedBookmarkCards, type ParsedBookmarkCard } from './parser';

export interface ImportRunResult {
  session: ImportSession;
}

export interface ImportController {
  cancelled: boolean;
}

export interface AutoScrollOptions {
  maxScrolls?: number;
  idleRounds?: number;
  minScrolls?: number;
  waitMs?: number;
  scrollBy?: number;
  apiBookmarks?: () => BookmarkInput[];
  // True only when `apiBookmarks` is the complete, authoritative X set (every
  // page fetched). Forwarded to the save payload so the background can mirror
  // removals. Never set on DOM-parsed / visible imports.
  complete?: boolean;
}

export interface AutoScrollProgress {
  phase: 'scanning' | 'scrolling' | 'settled';
  scrolls: number;
  foundCount: number;
  uniqueCount: number;
  idleRounds: number;
  maxScrolls: number;
  reachedEnd: boolean;
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
  onProgress?: (session: ImportSession) => void,
  options: Pick<AutoScrollOptions, 'apiBookmarks'> = {}
): Promise<ImportRunResult> {
  const parsed = parseLoadedBookmarkCards(root);
  const apiBookmarks = options.apiBookmarks?.() ?? [];
  const now = Date.now();
  const session: ImportSession = {
    id: createId('import'),
    startedAt: now,
    sourceUrl,
    foundCount: apiBookmarks.length || parsed.foundCount,
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
    const bookmarkInputs = apiBookmarks.length ? apiBookmarks : bookmarks;
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_IMPORTED_BOOKMARKS',
      payload: {
        sourceUrl,
        bookmarks: bookmarkInputs,
        foundCount: apiBookmarks.length || parsed.foundCount,
        failedCount: apiBookmarks.length ? 0 : parsed.failedCount
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

function getScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

function getMaxScrollTop() {
  const scrollingElement = document.scrollingElement ?? document.documentElement;
  return Math.max(0, scrollingElement.scrollHeight - window.innerHeight);
}

function collectLoadedBookmarkKeys(root: ParentNode = document) {
  return new Set(
    parseLoadedBookmarkCards(root).parsed.map((card) => card.input.tweetId ?? card.input.tweetUrl).filter(Boolean)
  );
}

function collectParsedBookmarks(root: ParentNode, collected: Map<string, ParsedBookmarkCard>) {
  const parsed = parseLoadedBookmarkCards(root);
  for (const card of parsed.parsed) {
    const key = card.input.tweetId ?? card.input.tweetUrl;
    if (key) {
      collected.set(key, card);
    }
  }
  return parsed;
}

async function saveCollectedBookmarks(sourceUrl: string, collected: Map<string, ParsedBookmarkCard>, failedCount: number) {
  return saveBookmarkInputs(sourceUrl, Array.from(collected.values()).map((card) => card.input), collected.size + failedCount, failedCount);
}

async function saveBookmarkInputs(sourceUrl: string, bookmarks: BookmarkInput[], foundCount: number, failedCount: number, complete = false) {
  const response = await chrome.runtime.sendMessage({
    type: 'SAVE_IMPORTED_BOOKMARKS',
    payload: {
      sourceUrl,
      bookmarks,
      foundCount,
      failedCount,
      mirrorComplete: complete
    }
  });
  const saveResponse = response as MessageResponse<ImportRunResult>;
  if (!saveResponse.ok || !saveResponse.data) {
    throw new Error(saveResponse.error ?? 'Unable to save imported bookmarks.');
  }
  return saveResponse.data;
}

export async function loadMoreBookmarksByScrolling(
  root: ParentNode = document,
  controller?: ImportController,
  onProgress?: (progress: AutoScrollProgress) => void,
  options: AutoScrollOptions = {}
) {
  const maxScrolls = options.maxScrolls ?? 30;
  const maxIdleRounds = options.idleRounds ?? 5;
  const minScrolls = options.minScrolls ?? 6;
  const waitMs = options.waitMs ?? 1800;
  const scrollBy = options.scrollBy ?? Math.max(700, Math.floor(window.innerHeight * 0.85));
  const seenKeys = collectLoadedBookmarkKeys(root);
  let lastScrollTop = getScrollTop();
  let lastFoundCount = seenKeys.size;
  let idleRounds = 0;

  onProgress?.({
    phase: 'scanning',
    scrolls: 0,
    foundCount: parseLoadedBookmarkCards(root).foundCount,
    uniqueCount: seenKeys.size,
    idleRounds,
    maxScrolls,
    reachedEnd: false
  });

  for (let scrolls = 1; scrolls <= maxScrolls; scrolls += 1) {
    if (controller?.cancelled) {
      break;
    }

    window.scrollBy({ top: scrollBy, behavior: 'auto' });
    await sleep(waitMs);

    const parsed = parseLoadedBookmarkCards(root);
    for (const card of parsed.parsed) {
      const key = card.input.tweetId ?? card.input.tweetUrl;
      if (key) {
        seenKeys.add(key);
      }
    }

    const scrollTop = getScrollTop();
    const maxScrollTop = getMaxScrollTop();
    const moved = Math.abs(scrollTop - lastScrollTop) > 24;
    const discoveredNewBookmark = seenKeys.size > lastFoundCount;
    const nearBottom = maxScrollTop > 0 && maxScrollTop - scrollTop < 32;
    idleRounds = discoveredNewBookmark || moved ? 0 : idleRounds + 1;
    lastFoundCount = Math.max(lastFoundCount, seenKeys.size);
    lastScrollTop = scrollTop;
    onProgress?.({ phase: 'scrolling', scrolls, foundCount: parsed.foundCount, uniqueCount: seenKeys.size, idleRounds, maxScrolls, reachedEnd: nearBottom });

    if (scrolls >= minScrolls && (idleRounds >= maxIdleRounds || (nearBottom && !discoveredNewBookmark && !moved))) {
      onProgress?.({ phase: 'settled', scrolls, foundCount: parsed.foundCount, uniqueCount: seenKeys.size, idleRounds, maxScrolls, reachedEnd: nearBottom });
      break;
    }
  }

  return { foundCount: lastFoundCount };
}

export async function runImportWithAutoScroll(
  sourceUrl: string,
  root: ParentNode = document,
  controller?: ImportController,
  onProgress?: (progress: AutoScrollProgress) => void,
  options: AutoScrollOptions = {}
): Promise<ImportRunResult> {
  const maxScrolls = options.maxScrolls ?? 30;
  const maxIdleRounds = options.idleRounds ?? 5;
  const minScrolls = options.minScrolls ?? 6;
  const waitMs = options.waitMs ?? 1800;
  const scrollBy = options.scrollBy ?? Math.max(700, Math.floor(window.innerHeight * 0.85));
  const collected = new Map<string, ParsedBookmarkCard>();
  let failedCount = 0;
  let lastScrollTop = getScrollTop();
  let lastUniqueCount = 0;
  let idleRounds = 0;

  const initial = collectParsedBookmarks(root, collected);
  failedCount += initial.failedCount;
  lastUniqueCount = collected.size;
  onProgress?.({
    phase: 'scanning',
    scrolls: 0,
    foundCount: initial.foundCount,
    uniqueCount: collected.size,
    idleRounds,
    maxScrolls,
    reachedEnd: false
  });

  for (let scrolls = 1; scrolls <= maxScrolls; scrolls += 1) {
    if (controller?.cancelled) {
      const now = Date.now();
      return {
        session: {
          id: createId('import'),
          startedAt: now,
          finishedAt: now,
          sourceUrl,
          foundCount: collected.size + failedCount,
          insertedCount: 0,
          updatedCount: 0,
          duplicateCount: 0,
          failedCount,
          status: 'cancelled'
        }
      };
    }

    window.scrollBy({ top: scrollBy, behavior: 'auto' });
    await sleep(waitMs);

    const parsed = collectParsedBookmarks(root, collected);
    failedCount += parsed.failedCount;
    const scrollTop = getScrollTop();
    const maxScrollTop = getMaxScrollTop();
    const moved = Math.abs(scrollTop - lastScrollTop) > 24;
    const discoveredNewBookmark = collected.size > lastUniqueCount;
    const nearBottom = maxScrollTop > 0 && maxScrollTop - scrollTop < 32;
    idleRounds = discoveredNewBookmark || moved ? 0 : idleRounds + 1;
    lastUniqueCount = Math.max(lastUniqueCount, collected.size);
    lastScrollTop = scrollTop;
    onProgress?.({ phase: 'scrolling', scrolls, foundCount: parsed.foundCount, uniqueCount: collected.size, idleRounds, maxScrolls, reachedEnd: nearBottom });

    if (scrolls >= minScrolls && (idleRounds >= maxIdleRounds || (nearBottom && !discoveredNewBookmark && !moved))) {
      onProgress?.({ phase: 'settled', scrolls, foundCount: parsed.foundCount, uniqueCount: collected.size, idleRounds, maxScrolls, reachedEnd: nearBottom });
      break;
    }
  }

  const apiBookmarks = options.apiBookmarks?.() ?? [];
  if (apiBookmarks.length > 0) {
    return saveBookmarkInputs(sourceUrl, apiBookmarks, apiBookmarks.length, 0, options.complete ?? false);
  }

  return saveCollectedBookmarks(sourceUrl, collected, failedCount);
}
