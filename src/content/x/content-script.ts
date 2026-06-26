import type { ExtensionMessage, MessageResponse } from '../../shared/types';
import type { BookmarkInput } from '../../shared/types';
import { runImportFromLoadedCards, runImportWithAutoScroll } from './importRunner';
import { parseGraphqlBookmarks, type GraphqlBookmark } from './graphqlParser';
import { isXBookmarkPage } from './pageDetection';

const GRAPHQL_EVENT_NAME = 'bookmarknest:x-graphql-response';
const REQUEST_EVENT_NAME = 'bookmarknest:x-bookmarks-request';
const FETCH_ALL_EVENT_NAME = 'bookmarknest:x-fetch-all-bookmarks';
const FETCH_ALL_PROGRESS_EVENT_NAME = 'bookmarknest:x-fetch-all-bookmarks-progress';
const FETCH_ALL_CANCEL_EVENT_NAME = 'bookmarknest:x-fetch-all-bookmarks-cancel';
const WIDGET_HOST_ID = 'bookmarknest-import-widget';

let currentImportController: { cancelled: boolean } | null = null;
const capturedBookmarks = new Map<string, GraphqlBookmark>();

// ─── Widget ─────────────────────────────────────────────

type WidgetState = 'idle' | 'fetching' | 'saving' | 'done' | 'error' | 'partial';

interface WidgetRef {
  host: HTMLElement;
  root: ShadowRoot;
  btn: HTMLButtonElement;
  icon: HTMLElement;
  label: HTMLElement;
  sub: HTMLElement;
  barFill: HTMLElement;
  state: WidgetState;
}

let widget: WidgetRef | null = null;
let autoHideTimer: ReturnType<typeof setTimeout> | null = null;

const ICONS = {
  import: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v7.5M5.5 7L8 9.5 10.5 7"/><path d="M3 11v2.5h10V11"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  warn: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5L1 14h14z"/><path d="M8 6v3.5M8 12v.5"/></svg>',
  spinner: '<div class="spinner"></div>',
};

function widgetCSS() {
  return `
    :host {
      all: initial !important;
      position: fixed !important;
      bottom: 20px !important;
      right: 20px !important;
      z-index: 2147483647 !important;
      display: block !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0 18px;
      height: 44px;
      border-radius: 22px;
      border: none;
      cursor: pointer;
      font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      letter-spacing: -0.01em;
      color: #fff;
      background: #1d9bf0;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.06);
      transition: background 0.25s, border-color 0.25s, box-shadow 0.25s, transform 0.15s;
      position: relative;
      overflow: hidden;
      max-width: 340px;
      white-space: nowrap;
      animation: bn-slideUp 0.35s cubic-bezier(0.34,1.56,0.64,1);
      -webkit-font-smoothing: antialiased;
    }
    .btn:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08);
    }
    .btn:active { transform: translateY(0) scale(0.98); }
    .btn:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 2px; }

    /* States */
    .btn[data-state="fetching"],
    .btn[data-state="saving"] {
      background: rgba(22,24,28,0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .btn[data-state="done"] { background: #00ba7c; }
    .btn[data-state="error"] {
      background: rgba(22,24,28,0.95);
      border: 1px solid rgba(244,33,46,0.4);
    }
    .btn[data-state="partial"] {
      background: rgba(22,24,28,0.95);
      border: 1px solid rgba(255,212,0,0.4);
    }

    /* Icon */
    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
    .icon svg { width: 16px; height: 16px; }

    /* Spinner */
    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.2);
      border-top-color: #1d9bf0;
      border-radius: 50%;
      animation: bn-spin 0.7s linear infinite;
    }
    .btn[data-state="saving"] .spinner { border-top-color: #00ba7c; }

    /* Text */
    .label { flex-shrink: 0; }
    .sub {
      font-weight: 400;
      font-size: 12px;
      opacity: 0.6;
      margin-left: 2px;
    }
    .sub:empty { display: none; }

    /* Progress bar */
    .bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: rgba(255,255,255,0.06);
      opacity: 0;
      transition: opacity 0.25s;
    }
    .btn[data-state="fetching"] .bar { opacity: 1; }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #1d9bf0, #4db8ff);
      border-radius: 0 2px 2px 0;
      transition: width 0.5s ease;
      width: 0%;
    }

    /* Animations */
    @keyframes bn-slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes bn-spin {
      to { transform: rotate(360deg); }
    }

    /* Responsive */
    @media (max-width: 720px) {
      :host {
        right: 16px !important;
        bottom: 72px !important;
      }
      .btn { height: 40px; padding: 0 14px; font-size: 13px; }
    }
  `;
}

function mountWidget(): WidgetRef {
  const host = document.createElement('div');
  host.id = WIDGET_HOST_ID;
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = widgetCSS();

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.type = 'button';
  btn.dataset.state = 'idle';
  btn.setAttribute('aria-label', 'Import X bookmarks to BookmarkNest');

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.innerHTML = ICONS.import;

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = 'Import Bookmarks';

  const sub = document.createElement('span');
  sub.className = 'sub';

  const bar = document.createElement('div');
  bar.className = 'bar';
  const barFill = document.createElement('div');
  barFill.className = 'bar-fill';
  bar.appendChild(barFill);

  btn.append(icon, label, sub, bar);
  root.append(style, btn);

  btn.addEventListener('click', onWidgetClick);

  const ref: WidgetRef = { host, root, btn, icon, label, sub, barFill, state: 'idle' };
  document.documentElement.appendChild(host);
  return ref;
}

function onWidgetClick() {
  if (!widget) return;
  switch (widget.state) {
    case 'idle':
    case 'error':
      void startImport('auto-scroll');
      break;
    case 'fetching':
    case 'saving':
      if (currentImportController) {
        currentImportController.cancelled = true;
      }
      break;
    case 'done':
    case 'partial':
      chrome.runtime.sendMessage({ type: 'OPEN_APP' });
      break;
  }
}

function setWidget(state: WidgetState, labelText: string, subText = '', progress = -1) {
  if (!widget) return;

  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  widget.state = state;
  widget.btn.dataset.state = state;
  widget.label.textContent = labelText;
  widget.sub.textContent = subText;

  const iconMap: Record<WidgetState, string> = {
    idle: ICONS.import,
    fetching: ICONS.spinner,
    saving: ICONS.spinner,
    done: ICONS.check,
    error: ICONS.warn,
    partial: ICONS.warn,
  };
  widget.icon.innerHTML = iconMap[state];

  if (progress >= 0 && progress <= 1) {
    widget.barFill.style.width = `${Math.round(progress * 100)}%`;
  }

  widget.btn.setAttribute('aria-label',
    state === 'fetching' || state === 'saving'
      ? 'Click to cancel import'
      : state === 'done' || state === 'partial'
        ? 'Open BookmarkNest library'
        : 'Import X bookmarks to BookmarkNest'
  );

  if (state === 'done' || state === 'error' || state === 'partial') {
    autoHideTimer = setTimeout(() => {
      setWidget('idle', 'Import Bookmarks');
    }, state === 'done' ? 5000 : 6000);
  }
}

function ensureWidget() {
  if (!isXBookmarkPage(window.location.href)) {
    if (widget) {
      widget.host.remove();
      widget = null;
    }
    return;
  }

  if (widget && document.getElementById(WIDGET_HOST_ID)) {
    return;
  }

  widget = mountWidget();
}

// ─── Helpers ────────────────────────────────────────────

function getCapturedBookmarks(): BookmarkInput[] {
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

// ─── Import Flow ────────────────────────────────────────

type FetchAllResult = 'done' | 'partial' | 'error';

function fetchAllBookmarkPages(
  controller: { cancelled: boolean },
  onProgress: (detail: { phase: string; page?: number; pages?: number; error?: string }) => void
): Promise<FetchAllResult> {
  const requestId = createRequestId();

  return new Promise<FetchAllResult>((resolve) => {
    let settled = false;
    // Watchdog: abort only after a stretch of *no progress*, rather than a fixed
    // total budget. Large accounts legitimately take minutes, but a stalled page
    // (expired session, network wedge) should still fail fast — and crucially it
    // tells the page-side pager to stop so its `fetchAllRunning` flag resets.
    const IDLE_TIMEOUT = 60_000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function stopPager() {
      window.dispatchEvent(new CustomEvent(FETCH_ALL_CANCEL_EVENT_NAME, { detail: { requestId } }));
    }

    function armWatchdog() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        stopPager();
        cleanup();
        resolve(capturedBookmarks.size > 0 ? 'partial' : 'error');
      }, IDLE_TIMEOUT);
    }

    function cleanup() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      window.removeEventListener(FETCH_ALL_PROGRESS_EVENT_NAME, handleProgress);
    }

    function finish(result: FetchAllResult) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    function handleProgress(event: Event) {
      const detail = (event as CustomEvent<{
        requestId?: string;
        phase?: string;
        page?: number;
        pages?: number;
        error?: string;
      }>).detail;
      if (detail?.requestId !== requestId) return;

      // Any progress means the pager is alive — reset the watchdog.
      armWatchdog();

      if (controller.cancelled) {
        stopPager();
        finish(capturedBookmarks.size > 0 ? 'partial' : 'error');
        return;
      }

      switch (detail.phase) {
        case 'fetching':
          onProgress({ phase: 'fetching', page: detail.page });
          break;
        case 'done':
          onProgress({ phase: 'done', pages: detail.pages });
          finish('done');
          break;
        case 'partial':
          onProgress({ phase: 'partial', pages: detail.pages, error: detail.error });
          finish('partial');
          break;
        case 'error':
          onProgress({ phase: 'error', error: detail.error });
          finish('error');
          break;
      }
    }

    window.addEventListener(FETCH_ALL_PROGRESS_EVENT_NAME, handleProgress);
    armWatchdog();
    window.dispatchEvent(new CustomEvent(FETCH_ALL_EVENT_NAME, { detail: { requestId, maxPages: 120 } }));
  });
}

async function startImport(mode: 'visible' | 'auto-scroll' = 'visible'): Promise<MessageResponse> {
  if (!isXBookmarkPage(window.location.href)) {
    return { ok: false, error: 'Current page is not an X bookmarks page.' };
  }

  if (currentImportController && !currentImportController.cancelled) {
    return { ok: false, error: 'Import already in progress.' };
  }

  currentImportController = { cancelled: false };
  setWidget('fetching', 'Starting...', '', 0);

  try {
    if (mode === 'auto-scroll') {
      // Re-fetch from the first page is authoritative, so drop anything passively
      // captured during browsing to avoid mixing in stale entries.
      capturedBookmarks.clear();
      const fetchResult = await fetchAllBookmarkPages(currentImportController, (progress) => {
        if (progress.phase === 'fetching') {
          const count = capturedBookmarks.size;
          const page = progress.page ?? 1;
          setWidget('fetching', `${count} found`, `page ${page}`, Math.min(page / 120, 0.95));
        } else if (progress.phase === 'done' || progress.phase === 'partial') {
          setWidget('saving', `Saving ${capturedBookmarks.size}...`);
        }
      });

      if (currentImportController.cancelled) {
        if (capturedBookmarks.size > 0) {
          setWidget('saving', `Saving ${capturedBookmarks.size}...`);
          const result = await runImportWithAutoScroll(
            window.location.href, document, undefined, undefined,
            { apiBookmarks: getCapturedBookmarks, maxScrolls: 0 }
          );
          setWidget('partial', `${result.session.insertedCount} saved`, 'cancelled');
          return { ok: true, data: { status: 'cancelled', ...result } };
        }
        setWidget('idle', 'Import Bookmarks');
        return { ok: false, error: 'Import cancelled.' };
      }

      if (fetchResult === 'error' && capturedBookmarks.size === 0) {
        setWidget('error', 'Import failed', 'No bookmarks found');
        return { ok: false, error: 'Unable to fetch X bookmarks through the API.' };
      }

      if (capturedBookmarks.size === 0) {
        setWidget('error', 'No bookmarks', 'Try refreshing');
        return { ok: false, error: 'The X Bookmarks API returned no bookmark items.' };
      }

      setWidget('saving', `Saving ${capturedBookmarks.size}...`);
      const result = await runImportWithAutoScroll(
        window.location.href, document, currentImportController, undefined,
        { apiBookmarks: getCapturedBookmarks, maxScrolls: 0 }
      );

      if (fetchResult === 'partial') {
        setWidget('partial', `${result.session.insertedCount} saved`, 'some pages failed');
      } else {
        const dupText = result.session.duplicateCount > 0 ? `${result.session.duplicateCount} dup` : '';
        setWidget('done', `${result.session.insertedCount} saved`, dupText);
      }

      return { ok: true, data: { status: result.session.status, ...result } };
    }

    // Visible mode
    setWidget('saving', 'Importing...');
    const result = await runImportFromLoadedCards(
      window.location.href, document, currentImportController,
      (session) => {
        if (session.status === 'running') {
          const processed = session.insertedCount + session.duplicateCount + session.failedCount;
          setWidget('saving', `${processed}/${session.foundCount}`);
        }
      },
      { apiBookmarks: getCapturedBookmarks }
    );

    if (result.session.status === 'cancelled') {
      setWidget('partial', `${result.session.insertedCount} saved`, 'cancelled');
    } else {
      setWidget('done', `${result.session.insertedCount} saved`);
    }

    return { ok: true, data: { status: result.session.status, ...result } };
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    setWidget('error', 'Import failed', msg.length > 40 ? msg.slice(0, 40) + '…' : msg);
    return { ok: false, error: error instanceof Error ? error.message : 'Unable to import bookmarks.' };
  } finally {
    currentImportController = null;
  }
}

// ─── Event Listeners ────────────────────────────────────

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

// ─── Widget Mount & SPA Navigation ─────────────────────

ensureWidget();

let widgetCheckScheduled = false;
const observer = new MutationObserver(() => {
  if (!widgetCheckScheduled) {
    widgetCheckScheduled = true;
    requestAnimationFrame(() => {
      widgetCheckScheduled = false;
      ensureWidget();
    });
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });

// ─── Chrome Message Handler ─────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === 'START_X_IMPORT') {
    startImport(message.mode).then(sendResponse);
    return true;
  }

  sendResponse({ ok: false, error: 'Unknown content script message.' });
  return false;
});
