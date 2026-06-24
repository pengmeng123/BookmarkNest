import type { ExtensionMessage, MessageResponse } from '../../shared/types';
import { runImportFromLoadedCards, runImportWithAutoScroll, type AutoScrollProgress } from './importRunner';
import { isXBookmarkPage } from './pageDetection';

const CONTROL_ID = 'bookmarknest-import-control';
const CONTROL_STYLE_ID = 'bookmarknest-import-control-style';
const CONTROL_VERSION = 'auto-scroll-v3';
let currentImportController: { cancelled: boolean } | null = null;

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

function ensureImportControl() {
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
      const result = await runImportWithAutoScroll(window.location.href, document, currentImportController, (progress) => {
        if (control) {
          setControlText(control, formatAutoScrollProgress(progress), true);
        }
      });

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
    });

    if (control) {
      setControlText(
        control,
        result.session.status === 'cancelled'
          ? `Cancelled: ${result.session.insertedCount} saved`
          : `Done: ${result.session.insertedCount} new`
      );
    }

    return { ok: true, data: { status: result.session.status, ...result } };
  } catch {
    if (control) {
      setControlText(control, 'Import failed');
    }
    return { ok: false, error: 'Unable to import the current X bookmarks page.' };
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

  sendResponse({ ok: false, error: 'Unknown content script message.' });
  return false;
});
