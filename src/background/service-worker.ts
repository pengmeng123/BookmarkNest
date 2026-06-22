import { EXTENSION_PAGES } from '../shared/constants';
import type { ExtensionMessage, MessageResponse } from '../shared/types';

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

  sendResponse({ ok: false, error: 'Unknown message.' });
  return false;
});
