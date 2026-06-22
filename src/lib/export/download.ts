import type { ExportFormat } from './exportBookmarks';
import { createDownloadPayload } from './exportBookmarks';
import type { BookmarkListItem } from '../db/bookmarkRepository';

export async function downloadBookmarks(format: ExportFormat, bookmarks: BookmarkListItem[]) {
  const payload = createDownloadPayload(format, bookmarks);
  const blob = new Blob([payload.content], { type: payload.mimeType });
  const url = URL.createObjectURL(blob);

  try {
    if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
      await chrome.downloads.download({ url, filename: payload.filename, saveAs: true });
      return;
    }

    const link = document.createElement('a');
    link.href = url;
    link.download = payload.filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
