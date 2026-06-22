import type { BookmarkInput } from '../../shared/types';

export interface ParsedBookmarkCard {
  input: BookmarkInput;
}

function textFrom(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function parseTweetUrl(article: Element) {
  const statusLink = Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')).find((link) =>
    /\/status\/\d+/.test(link.getAttribute('href') ?? '')
  );

  if (!statusLink) {
    return {};
  }

  const href = statusLink.getAttribute('href') ?? '';
  const tweetId = href.match(/\/status\/(\d+)/)?.[1];
  const tweetUrl = new URL(href, 'https://x.com').toString();
  return { tweetId, tweetUrl };
}

function parseAuthor(article: Element, tweetUrl?: string) {
  const userName = article.querySelector('[data-testid="User-Name"]');
  const authorText = textFrom(userName);
  const handleMatch = authorText.match(/@([A-Za-z0-9_]+)/);
  const handleFromUrl = tweetUrl ? new URL(tweetUrl).pathname.split('/').filter(Boolean)[0] : undefined;
  const authorHandle = handleMatch?.[1] ?? handleFromUrl ?? 'unknown';
  const authorName = authorText
    .replace(/@([A-Za-z0-9_]+).*/, '')
    .replace(/\s+·.*/, '')
    .trim();

  return {
    authorName: authorName || authorHandle,
    authorHandle
  };
}

function parseMediaUrls(article: Element) {
  return Array.from(article.querySelectorAll<HTMLImageElement>('img[src]'))
    .map((image) => image.src)
    .filter((src) => !src.includes('profile_images'));
}

export function parseBookmarkCard(article: Element): ParsedBookmarkCard | null {
  const { tweetId, tweetUrl } = parseTweetUrl(article);
  const contentText = textFrom(article.querySelector('[data-testid="tweetText"]'));

  if (!contentText || !tweetUrl) {
    return null;
  }

  const { authorName, authorHandle } = parseAuthor(article, tweetUrl);
  const avatar = article.querySelector<HTMLImageElement>('img[src*="profile_images"]');
  const time = article.querySelector('time');

  return {
    input: {
      tweetId,
      tweetUrl,
      authorName,
      authorHandle,
      authorAvatarUrl: avatar?.src,
      contentText,
      mediaUrls: parseMediaUrls(article),
      createdAtText: time?.getAttribute('datetime') ?? textFrom(time),
      createdAt: time?.getAttribute('datetime') ? Date.parse(time.getAttribute('datetime') as string) : undefined,
      source: 'x-bookmarks-page'
    }
  };
}

export function parseLoadedBookmarkCards(root: ParentNode = document) {
  const articles = Array.from(root.querySelectorAll('article'));
  const parsed: ParsedBookmarkCard[] = [];
  let failedCount = 0;

  for (const article of articles) {
    const card = parseBookmarkCard(article);
    if (card) {
      parsed.push(card);
    } else {
      failedCount += 1;
    }
  }

  return {
    foundCount: articles.length,
    parsed,
    failedCount
  };
}
