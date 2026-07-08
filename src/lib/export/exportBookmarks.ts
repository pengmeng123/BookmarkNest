import type { BookmarkListItem } from '../db/bookmarkRepository';
import { getBookmarkSignals } from '../bookmarks/metadata';

export type ExportFormat = 'json' | 'markdown' | 'csv' | 'research-pack';
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

function yamlString(value: string | undefined | null) {
  return JSON.stringify(value ?? '');
}

function yamlList(values: string[]) {
  if (!values.length) {
    return '[]';
  }
  return `[${values.map(yamlString).join(', ')}]`;
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
          const note = options.includeNotes && bookmark.note?.trim() ? ['', '#### Note', '', bookmark.note.trim()] : [];
          return [
            `### @${bookmark.authorHandle} - ${bookmark.authorName}`,
            '',
            `> ${bookmark.contentText.replace(/\n/g, '\n> ')}`,
            '',
            ...(bookmark.mediaUrls?.length ? [`- Media: ${bookmark.mediaUrls.join(' , ')}`] : []),
            `- URL: ${bookmark.tweetUrl ?? ''}`,
            `- Folder: ${folderName}`,
            `- Tags: ${tags}`,
            `- Imported: ${formatDate(bookmark.importedAt)}`,
            ...note
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

export function createResearchPackExport(bookmarks: BookmarkListItem[], options: ExportOptions = {}) {
  const items = bookmarks.filter(eligible);
  const lines = [
    '---',
    'source: BookmarkNest',
    `exported_at: ${yamlString(new Date().toISOString())}`,
    `bookmark_count: ${items.length}`,
    '---',
    '',
    '# BookmarkNest Research Pack',
    '',
    'This pack was generated locally from the current BookmarkNest view.',
    ''
  ];

  for (const bookmark of items) {
    const folderName = bookmark.folder?.name ?? 'Uncategorized';
    const tags = bookmark.tags.map((tag) => tag.name);
    const signals = getBookmarkSignals(bookmark).map((signal) => signal.label);
    lines.push(
      '---',
      `tweet_id: ${yamlString(bookmark.tweetId)}`,
      `url: ${yamlString(bookmark.tweetUrl)}`,
      `author: ${yamlString(bookmark.authorName)}`,
      `handle: ${yamlString(bookmark.authorHandle)}`,
      `folder: ${yamlString(folderName)}`,
      `tags: ${yamlList(tags)}`,
      `signals: ${yamlList(signals)}`,
      `created_at: ${bookmark.createdAt ? yamlString(new Date(bookmark.createdAt).toISOString()) : 'null'}`,
      `imported_at: ${yamlString(new Date(bookmark.importedAt).toISOString())}`,
      '---',
      '',
      `## @${bookmark.authorHandle} - ${bookmark.authorName}`,
      '',
      bookmark.contentText,
      '',
      `Source: ${bookmark.tweetUrl ?? ''}`,
      ''
    );

    if (bookmark.mediaUrls.length) {
      lines.push('Media:', ...bookmark.mediaUrls.map((url) => `- ${url}`), '');
    }

    if (options.includeNotes && bookmark.note?.trim()) {
      lines.push('### Research note', '', bookmark.note.trim(), '');
    }
  }

  return lines.join('\n');
}

export function createExportFilename(format: ExportFormat, now = new Date()) {
  const extension = format === 'markdown' || format === 'research-pack' ? 'md' : format;
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

  if (format === 'research-pack') {
    return {
      filename: createExportFilename(format),
      mimeType: 'text/markdown',
      content: createResearchPackExport(bookmarks, options)
    };
  }

  return {
    filename: createExportFilename(format),
    mimeType: 'text/csv',
    content: createCsvExport(bookmarks, options)
  };
}
