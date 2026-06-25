import type { BookmarkInput } from '../../shared/types';

export interface GraphqlBookmark {
  input: BookmarkInput;
  sortIndex?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function findTweetObject(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  const legacy = isRecord(value.legacy) ? value.legacy : undefined;
  if (value.__typename === 'TweetWithVisibilityResults' && isRecord(value.tweet)) {
    return findTweetObject(value.tweet);
  }

  if (value.__typename === 'Tweet' && legacy) {
    return value;
  }

  if (isRecord(value.tweet)) {
    const nested = findTweetObject(value.tweet);
    if (nested) {
      return nested;
    }
  }

  if (isRecord(value.tweet_results)) {
    const result = isRecord(value.tweet_results.result) ? value.tweet_results.result : undefined;
    const nested = findTweetObject(result);
    if (nested) {
      return nested;
    }
  }

  for (const nestedValue of Object.values(value)) {
    if (Array.isArray(nestedValue)) {
      for (const item of nestedValue) {
        const nested = findTweetObject(item);
        if (nested) {
          return nested;
        }
      }
      continue;
    }

    const nested = findTweetObject(nestedValue);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function findUserLegacy(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  const legacy = isRecord(value.legacy) ? value.legacy : undefined;
  if (legacy && (legacy.screen_name || legacy.name)) {
    return legacy;
  }

  for (const key of ['result', 'user', 'user_results', 'user_result']) {
    const nested = findUserLegacy(value[key]);
    if (nested) {
      return nested;
    }
  }

  for (const nestedValue of Object.values(value)) {
    if (isRecord(nestedValue)) {
      const nested = findUserLegacy(nestedValue);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function findUserId(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const restId = stringValue(value.rest_id);
  if (restId) {
    return restId;
  }

  const legacy = isRecord(value.legacy) ? value.legacy : undefined;
  const legacyId = stringValue(legacy?.id_str);
  if (legacyId) {
    return legacyId;
  }

  for (const key of ['result', 'user', 'user_results']) {
    const nested = findUserId(value[key]);
    if (nested) {
      return nested;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const nested = findUserId(nestedValue);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function findEntryObjects(value: unknown, entries: Record<string, unknown>[] = []) {
  if (!isRecord(value)) {
    return entries;
  }

  if (typeof value.entryId === 'string' && value.entryId.includes('tweet') && isRecord(value.content)) {
    entries.push(value);
  }

  for (const nestedValue of Object.values(value)) {
    if (Array.isArray(nestedValue)) {
      for (const item of nestedValue) {
        findEntryObjects(item, entries);
      }
      continue;
    }
    findEntryObjects(nestedValue, entries);
  }

  return entries;
}

function getTimelineInstructions(responseJson: unknown) {
  if (!isRecord(responseJson)) {
    return [];
  }

  const data = isRecord(responseJson.data) ? responseJson.data : undefined;
  const bookmarkTimelineV2 = isRecord(data?.bookmark_timeline_v2) ? data.bookmark_timeline_v2 : undefined;
  const bookmarkTimeline = isRecord(data?.bookmark_timeline) ? data.bookmark_timeline : undefined;
  const collectionTimeline = isRecord(data?.bookmark_collection_timeline) ? data.bookmark_collection_timeline : undefined;
  const timeline =
    (isRecord(bookmarkTimelineV2?.timeline) ? bookmarkTimelineV2.timeline : undefined) ??
    (isRecord(bookmarkTimeline?.timeline) ? bookmarkTimeline.timeline : undefined) ??
    (isRecord(collectionTimeline?.timeline) ? collectionTimeline.timeline : undefined);
  return Array.isArray(timeline?.instructions) ? timeline.instructions.filter(isRecord) : [];
}

function getTimelineEntries(responseJson: unknown) {
  const entries: Record<string, unknown>[] = [];
  for (const instruction of getTimelineInstructions(responseJson)) {
    if (instruction.type !== 'TimelineAddEntries' || !Array.isArray(instruction.entries)) {
      continue;
    }
    entries.push(...instruction.entries.filter(isRecord));
  }
  return entries;
}

function parseMediaUrls(legacy: Record<string, unknown>) {
  const extendedEntities = isRecord(legacy.extended_entities) ? legacy.extended_entities : undefined;
  const media = Array.isArray(extendedEntities?.media) ? extendedEntities.media : [];
  return media
    .map((item) => {
      if (!isRecord(item)) {
        return undefined;
      }
      return stringValue(item.media_url_https) ?? stringValue(item.media_url);
    })
    .filter((url): url is string => Boolean(url));
}

function expandTcoUrls(text: string, legacy: Record<string, unknown>): string {
  const entities = isRecord(legacy.entities) ? legacy.entities : undefined;
  const extendedEntities = isRecord(legacy.extended_entities) ? legacy.extended_entities : undefined;
  const urls = Array.isArray(entities?.urls) ? entities.urls : [];
  let expanded = text;

  for (const entry of urls) {
    if (!isRecord(entry)) continue;
    const tco = stringValue(entry.url);
    const full = stringValue(entry.expanded_url);
    if (tco && full) {
      expanded = expanded.replaceAll(tco, full);
    }
  }

  const mediaEntities = Array.isArray(extendedEntities?.media) ? extendedEntities.media
    : Array.isArray(entities?.media) ? entities.media : [];
  for (const entry of mediaEntities) {
    if (!isRecord(entry)) continue;
    const tco = stringValue(entry.url);
    if (tco) {
      expanded = expanded.replaceAll(tco, '').trim();
    }
  }

  return expanded;
}

function parseTweet(tweet: Record<string, unknown>, sortIndex?: string): GraphqlBookmark | null {
  const legacy = isRecord(tweet.legacy) ? tweet.legacy : undefined;
  if (!legacy) {
    return null;
  }

  const tweetId = stringValue(tweet.rest_id) ?? stringValue(legacy.id_str);
  const noteTweet = isRecord(tweet.note_tweet) ? tweet.note_tweet : undefined;
  const noteTweetResults = isRecord(noteTweet?.note_tweet_results) ? noteTweet.note_tweet_results : undefined;
  const noteTweetResult = isRecord(noteTweetResults?.result) ? noteTweetResults.result : undefined;
  const rawText = stringValue(noteTweetResult?.text) ?? stringValue(legacy.full_text);
  if (!tweetId || !rawText) {
    return null;
  }

  const contentText = expandTcoUrls(rawText, legacy);
  const userLegacy = findUserLegacy(tweet.core ?? tweet);
  const userId = findUserId(tweet.core ?? tweet);
  const screenName = stringValue(userLegacy?.screen_name);
  const authorHandle = screenName ?? (userId ? `user_${userId}` : 'unknown');
  const authorName = stringValue(userLegacy?.name) ?? screenName ?? (userId ? `User ${userId}` : 'Unknown user');
  const createdAtText = stringValue(legacy.created_at);
  const createdAt = createdAtText ? Date.parse(createdAtText) : undefined;

  return {
    sortIndex,
    input: {
      tweetId,
      tweetUrl: screenName ? `https://x.com/${screenName}/status/${tweetId}` : `https://x.com/i/web/status/${tweetId}`,
      authorId: userId,
      authorName,
      authorHandle,
      authorAvatarUrl: stringValue(userLegacy?.profile_image_url_https),
      contentText,
      mediaUrls: parseMediaUrls(legacy),
      createdAtText,
      createdAt: Number.isFinite(createdAt) ? createdAt : undefined,
      source: 'x-bookmarks-page'
    }
  };
}

function parseTimelineEntry(entry: Record<string, unknown>): GraphqlBookmark | null {
  const entryId = stringValue(entry.entryId) ?? '';
  if (!entryId.startsWith('tweet-')) {
    return null;
  }

  const sortIndex = stringValue(entry.sortIndex);
  const content = isRecord(entry.content) ? entry.content : undefined;
  const itemContent = isRecord(content?.itemContent) ? content.itemContent : undefined;
  const tweetResults = isRecord(itemContent?.tweet_results) ? itemContent.tweet_results : undefined;
  let result = isRecord(tweetResults?.result) ? tweetResults.result : undefined;
  const tweetIdFromEntry = entryId.replace(/^tweet-/, '');

  if (!result) {
    return {
      sortIndex,
      input: {
        tweetId: tweetIdFromEntry,
        tweetUrl: `https://x.com/i/web/status/${tweetIdFromEntry}`,
        authorName: 'Unavailable tweet',
        authorHandle: 'unknown',
        contentText: 'Tweet unavailable',
        mediaUrls: [],
        source: 'x-bookmarks-page'
      }
    };
  }

  if (result.__typename === 'TweetWithVisibilityResults' && isRecord(result.tweet)) {
    result = result.tweet;
  }

  if (result.__typename === 'TweetTombstone') {
    const tombstone = isRecord(result.tombstone) ? result.tombstone : undefined;
    const text = isRecord(tombstone?.text) ? stringValue(tombstone.text.text) : undefined;
    return {
      sortIndex,
      input: {
        tweetId: tweetIdFromEntry,
        tweetUrl: `https://x.com/i/web/status/${tweetIdFromEntry}`,
        authorName: 'Unavailable tweet',
        authorHandle: 'unknown',
        contentText: text ?? 'Tweet unavailable',
        mediaUrls: [],
        source: 'x-bookmarks-page'
      }
    };
  }

  return parseTweet(result, sortIndex);
}

export function parseGraphqlBookmarks(responseJson: unknown): GraphqlBookmark[] {
  const seenTweetIds = new Set<string>();
  const bookmarks: GraphqlBookmark[] = [];
  const timelineEntries = getTimelineEntries(responseJson);
  const entries = timelineEntries.length ? timelineEntries : findEntryObjects(responseJson);

  for (const entry of entries) {
    const bookmark = timelineEntries.length ? parseTimelineEntry(entry) : (() => {
      const tweet = findTweetObject(entry);
      return tweet ? parseTweet(tweet, stringValue(entry.sortIndex)) : null;
    })();
    if (!bookmark?.input.tweetId || seenTweetIds.has(bookmark.input.tweetId)) {
      continue;
    }
    seenTweetIds.add(bookmark.input.tweetId);
    bookmarks.push(bookmark);
  }

  return bookmarks.sort((left, right) => {
    if (left.sortIndex && right.sortIndex && left.sortIndex !== right.sortIndex) {
      if (left.sortIndex.length !== right.sortIndex.length) {
        return right.sortIndex.length - left.sortIndex.length;
      }
      return right.sortIndex > left.sortIndex ? 1 : -1;
    }
    return 0;
  });
}
