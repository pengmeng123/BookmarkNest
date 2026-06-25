import type { ExtensionMessage, MessageResponse } from '../../shared/types';
import { runImportFromLoadedCards, runImportWithAutoScroll, type AutoScrollProgress } from './importRunner';
import { parseGraphqlBookmarks, type GraphqlBookmark } from './graphqlParser';
import { isXBookmarkPage } from './pageDetection';
import { parseLoadedBookmarkCards } from './parser';

const CONTROL_ID = 'bookmarknest-import-control';
const CONTROL_STYLE_ID = 'bookmarknest-import-control-style';
const CONTROL_VERSION = 'auto-scroll-v3';
const ENABLE_FLOATING_IMPORT_CONTROL = false;
const GRAPHQL_EVENT_NAME = 'bookmarknest:x-graphql-response';
const REQUEST_EVENT_NAME = 'bookmarknest:x-bookmarks-request';
const FETCH_ALL_EVENT_NAME = 'bookmarknest:x-fetch-all-bookmarks';
const FETCH_ALL_PROGRESS_EVENT_NAME = 'bookmarknest:x-fetch-all-bookmarks-progress';
let currentImportController: { cancelled: boolean } | null = null;
const capturedBookmarks = new Map<string, GraphqlBookmark>();

function ensureControlStyle() {
  if (document.getElementById(CONTROL_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = CONTROL_STYLE_ID;
  style.textContent = `
    #${CONTROL_ID}[data-loading="true"] > span {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.45);
      border-top-color: #fff;
      border-radius: 999px;
      animation: bookmarknest-spin 0.75s linear infinite;
      flex: 0 0 auto;
    }

    @keyframes bookmarknest-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (max-width: 720px) {
      #${CONTROL_ID} {
        right: 76px !important;
        bottom: 16px !important;
        max-width: 160px !important;
      }
    }
  `;
  document.documentElement.append(style);
}

function setControlLoading(button: HTMLElement, loading: boolean) {
  button.toggleAttribute('aria-busy', loading);
  button.dataset.loading = loading ? 'true' : 'false';
}

function setControlText(button: HTMLElement, text: string, loading = false) {
  button.replaceChildren();
  if (loading) {
    const spinner = document.createElement('span');
    spinner.setAttribute('aria-hidden', 'true');
    button.append(spinner);
  }
  button.append(document.createTextNode(text));
  setControlLoading(button, loading);
}

function formatAutoScrollProgress(progress: AutoScrollProgress) {
  if (progress.phase === 'scanning') {
    return `Scanning: ${progress.uniqueCount} found`;
  }

  if (progress.phase === 'settled') {
    return progress.reachedEnd ? `Reached end: ${progress.uniqueCount}` : `Ready: ${progress.uniqueCount} found`;
  }

  return `Scroll ${progress.scrolls}/${progress.maxScrolls}: ${progress.uniqueCount}`;
}

function getCapturedBookmarks() {
  return Array.from(capturedBookmarks.values())
    .sort((left, right) => {
      if (left.sortIndex && right.sortIndex && left.sortIndex !== right.sortIndex) {
        if (left.sortIndex.length !== right.sortIndex.length) {
          return right.sortIndex.length - left.sortIndex.length;
        }
        return right.sortIndex > left.sortIndex ? 1 : -1;
      }
      return 0;
    })
    .map((bookmark) => bookmark.input);
}

function createRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return `bookmarknest_${globalThis.crypto.randomUUID()}`;
  }
  return `bookmarknest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function fetchAllBookmarkPages(
  controller: { cancelled: boolean },
  onProgress: (progress: { phase: 'fetching' | 'done' | 'error'; page?: number; error?: string }) => void
) {
  const requestId = createRequestId();

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener(FETCH_ALL_PROGRESS_EVENT_NAME, handleProgress);
        resolve(false);
      }
    }, 120000);

    function finish(result: boolean) {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener(FETCH_ALL_PROGRESS_EVENT_NAME, handleProgress);
      resolve(result);
    }

    function handleProgress(event: Event) {
      const detail = (event as CustomEvent<{ requestId?: string; phase?: string; page?: number; error?: string }>).detail;
      if (detail?.requestId !== requestId) {
        return;
      }

      if (controller.cancelled) {
        finish(false);
        return;
      }

      if (detail.phase === 'fetching') {
        onProgress({ phase: 'fetching', page: detail.page });
      } else if (detail.phase === 'done') {
        onProgress({ phase: 'done' });
        finish(true);
      } else if (detail.phase === 'error') {
        onProgress({ phase: 'error', error: detail.error });
        finish(false);
      }
    }

    window.addEventListener(FETCH_ALL_PROGRESS_EVENT_NAME, handleProgress);
    window.dispatchEvent(new CustomEvent(FETCH_ALL_EVENT_NAME, { detail: { requestId, maxPages: 120 } }));
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function collectParsedBookmarkInputs() {
  return parseLoadedBookmarkCards(document).parsed.map((card) => card.input);
}

async function collectLoadedBookmarkMetadata(tweetIds: string[] = [], autoScroll = false) {
  const targetIds = new Set(tweetIds.filter(Boolean));
  const collected = new Map<string, ReturnType<typeof collectParsedBookmarkInputs>[number]>();

  function collectVisible() {
    for (const bookmark of collectParsedBookmarkInputs()) {
      const key = bookmark.tweetId ?? bookmark.tweetUrl;
      if (key) {
        collected.set(key, bookmark);
      }
    }
  }

  collectVisible();
  if (!autoScroll || targetIds.size === 0) {
    return Array.from(collected.values());
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
  await sleep(900);
  collectVisible();

  let idleRounds = 0;
  let lastMatchedCount = 0;
  const maxScrolls = Math.max(30, Math.min(120, Math.ceil(targetIds.size * 2.5)));

  for (let scrolls = 0; scrolls < maxScrolls; scrolls += 1) {
    const matchedCount = Array.from(targetIds).filter((tweetId) => collected.has(tweetId)).length;
    if (matchedCount >= targetIds.size) {
      break;
    }

    if (matchedCount === lastMatchedCount) {
      idleRounds += 1;
    } else {
      idleRounds = 0;
    }
    lastMatchedCount = matchedCount;

    if (scrolls > 8 && idleRounds >= 8) {
      break;
    }

    window.scrollBy({ top: Math.max(700, Math.floor(window.innerHeight * 0.9)), behavior: 'auto' });
    await sleep(1100);
    collectVisible();
  }

  return Array.from(collected.values());
}

window.addEventListener(GRAPHQL_EVENT_NAME, (event) => {
  const detail = (event as CustomEvent<{ body?: unknown }>).detail;
  const bookmarks = parseGraphqlBookmarks(detail?.body);
  for (const bookmark of bookmarks) {
    const key = bookmark.input.tweetId ?? bookmark.input.tweetUrl;
    if (key) {
      capturedBookmarks.set(key, bookmark);
    }
  }
});

window.addEventListener(REQUEST_EVENT_NAME, (event) => {
  const payload = (event as CustomEvent<{
    url?: string;
    operationName?: 'Bookmarks';
    queryId?: string;
    features?: string;
    variables?: string;
    headers?: Record<string, string>;
  }>).detail;
  if (!payload?.url || !payload.headers) {
    return;
  }

  void chrome.runtime.sendMessage({
    type: 'CAPTURE_X_BOOKMARKS_REQUEST',
    payload: {
      url: payload.url,
      operationName: payload.operationName,
      queryId: payload.queryId,
      features: payload.features,
      variables: payload.variables,
      headers: payload.headers
    }
  });
});

function ensureImportControl() {
  if (!ENABLE_FLOATING_IMPORT_CONTROL) {
    document.getElementById(CONTROL_ID)?.remove();
    return;
  }

  if (!isXBookmarkPage(window.location.href)) {
    document.getElementById(CONTROL_ID)?.remove();
    return;
  }

  const existingControl = document.getElementById(CONTROL_ID);
  if (existingControl instanceof HTMLButtonElement && existingControl.dataset.version === CONTROL_VERSION) {
    return;
  }

  existingControl?.remove();
  ensureControlStyle();

  const button = document.createElement('button');
  button.id = CONTROL_ID;
  button.type = 'button';
  button.dataset.version = CONTROL_VERSION;
  setControlText(button, 'Import more');
  button.setAttribute('aria-label', 'Import more X bookmarks to BookmarkNest');
  button.style.position = 'fixed';
  button.style.right = '88px';
  button.style.bottom = '16px';
  button.style.zIndex = '2147483647';
  button.style.border = '0';
  button.style.borderRadius = '999px';
  button.style.padding = '8px 11px';
  button.style.background = '#14786f';
  button.style.color = '#fff';
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.gap = '8px';
  button.style.minHeight = '36px';
  button.style.maxWidth = '190px';
  button.style.whiteSpace = 'nowrap';
  button.style.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  button.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.18)';
  button.style.cursor = 'pointer';
  button.onclick = () => {
    if (currentImportController) {
      currentImportController.cancelled = true;
      setControlText(button, 'Cancelling...', true);
      return;
    }

    setControlText(button, 'Starting...', true);
    void startImport('auto-scroll');
  };

  document.documentElement.append(button);
}

async function startImport(mode: 'visible' | 'auto-scroll' = 'visible'): Promise<MessageResponse> {
  if (!isXBookmarkPage(window.location.href)) {
    return { ok: false, error: 'Current page is not an X bookmarks page.' };
  }

  const control = document.getElementById(CONTROL_ID);
  if (control) {
    setControlText(control, 'Importing...', true);
  }

  currentImportController = { cancelled: false };

  try {
    if (mode === 'auto-scroll') {
      const apiCompleted = await fetchAllBookmarkPages(currentImportController, (progress) => {
        if (!control) {
          return;
        }
        if (progress.phase === 'fetching') {
          setControlText(control, `API page ${progress.page ?? 1}: ${capturedBookmarks.size}`, true);
        } else if (progress.phase === 'done') {
          setControlText(control, `API done: ${capturedBookmarks.size}`, true);
        } else if (progress.phase === 'error') {
          setControlText(control, progress.error ?? 'API fallback', true);
        }
      });

      if (!apiCompleted) {
        throw new Error('Unable to fetch all X bookmarks through the Bookmarks API.');
      }

      if (capturedBookmarks.size === 0) {
        throw new Error('The X Bookmarks API returned no bookmark items.');
      }

      const result = await runImportWithAutoScroll(window.location.href, document, currentImportController, (progress) => {
        if (control) {
          const apiCount = capturedBookmarks.size;
          setControlText(control, apiCount > progress.uniqueCount ? `API ${apiCount} found` : formatAutoScrollProgress(progress), true);
        }
      }, { apiBookmarks: getCapturedBookmarks, maxScrolls: 0 });

      if (control) {
        setControlText(
          control,
          result.session.status === 'cancelled'
            ? `Cancelled: ${result.session.insertedCount} saved`
            : `Done: ${result.session.insertedCount} new`
        );
      }

      return { ok: true, data: { status: result.session.status, ...result } };
    }

    const result = await runImportFromLoadedCards(window.location.href, document, currentImportController, (session) => {
      if (control) {
        const processed = session.insertedCount + session.duplicateCount + session.failedCount;
        setControlText(
          control,
          session.status === 'running'
            ? `Importing ${processed}/${session.foundCount} - click to cancel`
            : `${session.status}: ${session.insertedCount} new, ${session.duplicateCount} duplicate`,
          session.status === 'running'
        );
      }
    }, { apiBookmarks: getCapturedBookmarks });

    if (control) {
      setControlText(
        control,
        result.session.status === 'cancelled'
          ? `Cancelled: ${result.session.insertedCount} saved`
          : `Done: ${result.session.insertedCount} new`
      );
    }

    return { ok: true, data: { status: result.session.status, ...result } };
  } catch (error) {
    if (control) {
      setControlText(control, 'Import failed');
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to import the current X bookmarks page.' };
  } finally {
    currentImportController = null;
  }
}

ensureImportControl();

let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
  }
  ensureImportControl();
});

observer.observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'START_X_IMPORT') {
    startImport(message.mode).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_LOADED_X_BOOKMARKS') {
    collectLoadedBookmarkMetadata(message.tweetIds, message.autoScroll).then((bookmarks) => sendResponse({ ok: true, data: bookmarks }));
    return true;
  }

  sendResponse({ ok: false, error: 'Unknown content script message.' });
  return false;
});
