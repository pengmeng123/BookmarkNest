import type { BookmarkListItem } from '../db/bookmarkRepository';

export interface BookmarkSignal {
  key: 'media' | 'link' | 'thread' | 'long-post' | 'export-queue';
  label: string;
}

const urlPattern = /https?:\/\/[^\s)]+/gi;

function hasExternalLink(bookmark: BookmarkListItem) {
  const urls = bookmark.contentText.match(urlPattern) ?? [];
  return urls.some((url) => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      return !['x.com', 'twitter.com', 't.co'].includes(host);
    } catch {
      return false;
    }
  });
}

function looksLikeThread(bookmark: BookmarkListItem) {
  const text = bookmark.contentText.toLowerCase();
  return text.includes('🧵') || /\bthread\b/.test(text) || /\b1\/\d+\b/.test(text) || /\b1\/\s*$/.test(text);
}

export function getBookmarkSignals(bookmark: BookmarkListItem): BookmarkSignal[] {
  const signals: BookmarkSignal[] = [];

  if (bookmark.markedForExport) {
    signals.push({ key: 'export-queue', label: 'Export list' });
  }
  if (bookmark.mediaUrls.length > 0) {
    signals.push({ key: 'media', label: 'Media' });
  }
  if (hasExternalLink(bookmark)) {
    signals.push({ key: 'link', label: 'Link' });
  }
  if (looksLikeThread(bookmark)) {
    signals.push({ key: 'thread', label: 'Thread' });
  }
  if (bookmark.contentText.length > 900) {
    signals.push({ key: 'long-post', label: 'Long post' });
  }

  return signals;
}
