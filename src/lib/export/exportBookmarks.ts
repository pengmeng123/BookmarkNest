import type { BookmarkListItem } from '../db/bookmarkRepository';

export type ExportFormat = 'json' | 'markdown' | 'csv';
export interface ExportOptions {
  includeNotes?: boolean;
}

export interface JsonBackup {
  exportedAt: string;
  bookmarks: Array<{
    id: string;
    tweetId?: string;
    tweetUrl?: string;
    authorName: string;
    authorHandle: string;
    contentText: string;
    note?: string;
    mediaUrls: string[];
    tags: string[];
    folder: string | null;
    importedAt: number;
  }>;
}

function eligible(bookmark: BookmarkListItem) {
  return !bookmark.deleted;
}

export function createJsonBackup(bookmarks: BookmarkListItem[], now = new Date()): JsonBackup {
  return {
    exportedAt: now.toISOString(),
    bookmarks: bookmarks.filter(eligible).map((bookmark) => ({
      id: bookmark.id,
      tweetId: bookmark.tweetId,
      tweetUrl: bookmark.tweetUrl,
      authorName: bookmark.authorName,
      authorHandle: bookmark.authorHandle,
      contentText: bookmark.contentText,
      note: bookmark.note,
      mediaUrls: bookmark.mediaUrls ?? [],
      tags: bookmark.tags.map((tag) => tag.name),
      folder: bookmark.folder?.name ?? null,
      importedAt: bookmark.importedAt
    }))
  };
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function createMarkdownExport(bookmarks: BookmarkListItem[], options: ExportOptions = {}) {
  const groups = new Map<string, BookmarkListItem[]>();

  for (const bookmark of bookmarks.filter(eligible)) {
    const folderName = bookmark.folder?.name ?? 'Uncategorized';
    groups.set(folderName, [...(groups.get(folderName) ?? []), bookmark]);
  }

  return Array.from(groups.entries())
    .map(([folderName, items]) => {
      const body = items
        .map((bookmark) => {
          const tags = bookmark.tags.map((tag) => tag.name).join(', ') || 'None';
          const note = options.includeNotes && bookmark.note?.trim() ? ['', `- Note: ${bookmark.note.trim()}`] : [];
          return [
            `### @${bookmark.authorHandle} - ${bookmark.authorName}`,
            '',
            bookmark.contentText,
            '',
            ...(bookmark.mediaUrls?.length ? [`- Media: ${bookmark.mediaUrls.join(' , ')}`] : []),
            `- URL: ${bookmark.tweetUrl ?? ''}`,
            `- Tags: ${tags}`,
            ...note,
            `- Imported: ${formatDate(bookmark.importedAt)}`
          ].join('\n');
        })
        .join('\n\n');

      return `## ${folderName}\n\n${body}`;
    })
    .join('\n\n');
}

function csvCell(value: string | number | undefined | null) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function createCsvExport(bookmarks: BookmarkListItem[], options: ExportOptions = {}) {
  const header = ['tweet_id', 'author_name', 'author_handle', 'content', 'url', 'media_urls', 'tags', 'folder', ...(options.includeNotes ? ['note'] : []), 'imported_at'];
  const rows = bookmarks.filter(eligible).map((bookmark) => [
    bookmark.tweetId,
    bookmark.authorName,
    bookmark.authorHandle,
    bookmark.contentText,
    bookmark.tweetUrl,
    (bookmark.mediaUrls ?? []).join(' '),
    bookmark.tags.map((tag) => tag.name).join('; '),
    bookmark.folder?.name ?? 'Uncategorized',
    ...(options.includeNotes ? [bookmark.note ?? ''] : []),
    formatDate(bookmark.importedAt)
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function createExportFilename(format: ExportFormat, now = new Date()) {
  const extension = format === 'markdown' ? 'md' : format;
  return `bookmarknest-export-${formatDate(now.getTime())}.${extension}`;
}

export function createDownloadPayload(format: ExportFormat, bookmarks: BookmarkListItem[], options: ExportOptions = {}) {
  if (format === 'json') {
    return {
      filename: createExportFilename(format),
      mimeType: 'application/json',
      content: JSON.stringify(createJsonBackup(bookmarks), null, 2)
    };
  }

  if (format === 'markdown') {
    return {
      filename: createExportFilename(format),
      mimeType: 'text/markdown',
      content: createMarkdownExport(bookmarks, options)
    };
  }

  return {
    filename: createExportFilename(format),
    mimeType: 'text/csv',
    content: createCsvExport(bookmarks, options)
  };
}
