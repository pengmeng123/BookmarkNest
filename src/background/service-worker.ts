import { EXTENSION_PAGES } from '../shared/constants';
import { upsertBookmark } from '../lib/db/bookmarkRepository';
import { db } from '../lib/db/database';
import type { ExtensionMessage, ImportPayload, ImportSession, MessageResponse } from '../shared/types';

function openExtensionPage(path: string) {
  return chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

async function sendStartImportToActiveTab(): Promise<MessageResponse> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const bookmarkTabs = await chrome.tabs.query({ url: ['https://x.com/i/bookmarks*', 'https://twitter.com/i/bookmarks*'] });
  const tab = bookmarkTabs.find((candidate) => candidate.windowId === activeTab?.windowId) ?? bookmarkTabs[0] ?? activeTab;

  if (!tab?.id) {
    return { ok: false, error: 'No active tab found.' };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_X_IMPORT' });
    if (response?.ok) {
      await chrome.tabs.update(tab.id, { active: true });
    }
    return response;
  } catch {
    return {
      ok: false,
      error: 'Open your X bookmarks page, wait for bookmarks to load, then try Import again.'
    };
  }
}

function createId(prefix: string) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function saveImportedBookmarks(payload: ImportPayload): Promise<MessageResponse<{ session: ImportSession }>> {
  const now = Date.now();
  const session: ImportSession = {
    id: createId('import'),
    startedAt: now,
    sourceUrl: payload.sourceUrl,
    foundCount: payload.foundCount,
    insertedCount: 0,
    updatedCount: 0,
    duplicateCount: 0,
    failedCount: payload.failedCount,
    status: 'running'
  };

  await db.importSessions.add(session);

  for (const bookmark of payload.bookmarks) {
    try {
      const result = await upsertBookmark(bookmark);
      if (result.inserted) {
        session.insertedCount += 1;
      } else {
        session.duplicateCount += 1;
        session.updatedCount += 1;
      }
    } catch {
      session.failedCount += 1;
    }
  }

  session.status = 'completed';
  session.finishedAt = Date.now();
  await db.importSessions.put(session);

  return { ok: true, data: { session } };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === 'OPEN_APP') {
      openExtensionPage(EXTENSION_PAGES.app).then(() => sendResponse({ ok: true }));
      return true;
    }

    if (message.type === 'OPEN_UPGRADE') {
      openExtensionPage(EXTENSION_PAGES.upgrade).then(() => sendResponse({ ok: true }));
      return true;
    }

    if (message.type === 'START_X_IMPORT') {
      sendStartImportToActiveTab().then(sendResponse);
      return true;
    }

    if (message.type === 'SAVE_IMPORTED_BOOKMARKS') {
      saveImportedBookmarks(message.payload).then(sendResponse);
      return true;
    }

    sendResponse({ ok: false, error: 'Unknown message.' });
    return false;
  });
}
