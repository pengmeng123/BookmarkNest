import type { ExportFormat } from './exportBookmarks';
import { createDownloadPayload } from './exportBookmarks';
import type { BookmarkListItem } from '../db/bookmarkRepository';

export async function downloadText(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  try {
    if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
      await chrome.downloads.download({ url, filename, saveAs: true });
      return;
    }

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadBookmarks(format: ExportFormat, bookmarks: BookmarkListItem[]) {
  const payload = createDownloadPayload(format, bookmarks);
  await downloadText(payload.filename, payload.content, payload.mimeType);
}
