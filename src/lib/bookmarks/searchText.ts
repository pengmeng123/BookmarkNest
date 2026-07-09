import type { Folder, Tag } from '../../shared/types';

interface SearchableBookmark {
  contentText: string;
  note?: string;
  authorName: string;
  authorHandle: string;
  folder?: Folder;
  tags: Tag[];
}

export function normalizeSearchValue(value: string) {
  return value.normalize('NFC').toLowerCase().trim();
}

export function normalizeHandleSearchValue(value: string) {
  return normalizeSearchValue(value).replace(/^@/, '');
}

export function buildBookmarkSearchText(bookmark: SearchableBookmark) {
  return normalizeSearchValue(
    [
      bookmark.contentText,
      bookmark.note ?? '',
      bookmark.authorName,
      bookmark.authorHandle,
      `@${bookmark.authorHandle}`,
      bookmark.folder?.name ?? '',
      ...bookmark.tags.map((tag) => tag.name)
    ].join(' ')
  );
}

export function buildBookmarkAuthorSearchText(bookmark: Pick<SearchableBookmark, 'authorName' | 'authorHandle'>) {
  return normalizeSearchValue(`${bookmark.authorName} ${bookmark.authorHandle}`);
}

export function tokenizeSearchText(value: string) {
  return Array.from(
    new Set(
      normalizeSearchValue(value)
        .split(/[\s.,/#!$%^&*;:{}=\-_`~()|[\]\\"'<>?+]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  );
}
