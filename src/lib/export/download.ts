import type { ExportFormat } from './exportBookmarks';
import { createDownloadPayload } from './exportBookmarks';
import type { BookmarkListItem } from '../db/bookmarkRepository';

export async function downloadText(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
    try {
      const downloadId = await chrome.downloads.download({ url, filename, saveAs: true });
      await new Promise<void>((resolve) => {
        function onChange(delta: chrome.downloads.DownloadDelta) {
          if (delta.id !== downloadId) return;
          if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(onChange);
            resolve();
          }
        }
        chrome.downloads.onChanged.addListener(onChange);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadBookmarks(format: ExportFormat, bookmarks: BookmarkListItem[]) {
  const payload = createDownloadPayload(format, bookmarks);
  await downloadText(payload.filename, payload.content, payload.mimeType);
}
