import type { ExportFormat } from './exportBookmarks';
import { createDownloadPayload } from './exportBookmarks';
import type { BookmarkListItem } from '../db/bookmarkRepository';

export async function downloadText(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  // A same-origin blob URL with a `download` attribute saves the file without
  // navigating the page. We deliberately avoid chrome.downloads here: its
  // onChanged-wait could hang forever (blanking the page until a reload) and
  // blob URLs hit MV3 quirks in extension pages.
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoke once the click has had time to kick off the download.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

export async function downloadBookmarks(format: ExportFormat, bookmarks: BookmarkListItem[]) {
  const payload = createDownloadPayload(format, bookmarks);
  await downloadText(payload.filename, payload.content, payload.mimeType);
}
