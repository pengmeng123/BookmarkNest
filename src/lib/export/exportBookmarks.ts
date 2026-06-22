import type { BookmarkListItem } from '../db/bookmarkRepository';

export type ExportFormat = 'json' | 'markdown' | 'csv';

export interface JsonBackup {
  exportedAt: string;
  bookmarks: Array<{
    id: string;
    tweetId?: string;
    tweetUrl?: string;
    authorName: string;
    authorHandle: string;
    contentText: string;
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
      tags: bookmark.tags.map((tag) => tag.name),
      folder: bookmark.folder?.name ?? null,
      importedAt: bookmark.importedAt
    }))
  };
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function createMarkdownExport(bookmarks: BookmarkListItem[]) {
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
          return [
            `### @${bookmark.authorHandle} - ${bookmark.authorName}`,
            '',
            bookmark.contentText,
            '',
            `- URL: ${bookmark.tweetUrl ?? ''}`,
            `- Tags: ${tags}`,
            `- Imported: ${formatDate(bookmark.importedAt)}`
          ].join('\n');
        })
        .join('\n\n');

      return `## ${folderName}\n\n${body}`;
    })
    .join('\n\n');
}

function csvCell(value: string | number | undefined | null) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function createCsvExport(bookmarks: BookmarkListItem[]) {
  const header = ['tweet_id', 'author_name', 'author_handle', 'content', 'url', 'tags', 'folder', 'imported_at'];
  const rows = bookmarks.filter(eligible).map((bookmark) => [
    bookmark.tweetId,
    bookmark.authorName,
    bookmark.authorHandle,
    bookmark.contentText,
    bookmark.tweetUrl,
    bookmark.tags.map((tag) => tag.name).join('; '),
    bookmark.folder?.name ?? 'Uncategorized',
    formatDate(bookmark.importedAt)
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function createExportFilename(format: ExportFormat, now = new Date()) {
  const extension = format === 'markdown' ? 'md' : format;
  return `bookmarknest-export-${formatDate(now.getTime())}.${extension}`;
}

export function createDownloadPayload(format: ExportFormat, bookmarks: BookmarkListItem[]) {
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
      content: createMarkdownExport(bookmarks)
    };
  }

  return {
    filename: createExportFilename(format),
    mimeType: 'text/csv',
    content: createCsvExport(bookmarks)
  };
}
