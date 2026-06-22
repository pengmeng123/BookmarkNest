import type { ExtensionMessage, MessageResponse } from '../../shared/types';
import { runImportFromLoadedCards } from './importRunner';
import { isXBookmarkPage } from './pageDetection';

const CONTROL_ID = 'bookmarknest-import-control';
let currentImportController: { cancelled: boolean } | null = null;

function ensureImportControl() {
  if (!isXBookmarkPage(window.location.href) || document.getElementById(CONTROL_ID)) {
    return;
  }

  const button = document.createElement('button');
  button.id = CONTROL_ID;
  button.type = 'button';
  button.textContent = 'Import to BookmarkNest';
  button.style.position = 'fixed';
  button.style.right = '20px';
  button.style.bottom = '20px';
  button.style.zIndex = '2147483647';
  button.style.border = '0';
  button.style.borderRadius = '8px';
  button.style.padding = '10px 14px';
  button.style.background = '#14786f';
  button.style.color = '#fff';
  button.style.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  button.style.boxShadow = '0 8px 22px rgba(0, 0, 0, 0.22)';
  button.addEventListener('click', () => {
    if (currentImportController) {
      currentImportController.cancelled = true;
      button.textContent = 'Cancelling...';
      return;
    }

    button.textContent = 'Import starting...';
    void startImport();
  });

  document.documentElement.append(button);
}

async function startImport(): Promise<MessageResponse> {
  if (!isXBookmarkPage(window.location.href)) {
    return { ok: false, error: 'Current page is not an X bookmarks page.' };
  }

  const control = document.getElementById(CONTROL_ID);
  if (control) {
    control.textContent = 'Importing...';
  }

  currentImportController = { cancelled: false };

  try {
    const result = await runImportFromLoadedCards(window.location.href, document, currentImportController, (session) => {
      if (control) {
        const processed = session.insertedCount + session.duplicateCount + session.failedCount;
        control.textContent =
          session.status === 'running'
            ? `Importing ${processed}/${session.foundCount} - click to cancel`
            : `${session.status}: ${session.insertedCount} new, ${session.duplicateCount} duplicate`;
      }
    });

    if (control) {
      control.textContent =
        result.session.status === 'cancelled'
          ? `Cancelled: ${result.session.insertedCount} saved`
          : `Imported ${result.session.insertedCount} bookmarks`;
    }

    return { ok: true, data: { status: result.session.status, ...result } };
  } catch {
    if (control) {
      control.textContent = 'Import failed';
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
    startImport().then(sendResponse);
    return true;
  }

  sendResponse({ ok: false, error: 'Unknown content script message.' });
  return false;
});
