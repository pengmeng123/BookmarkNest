import { EXTENSION_PAGES } from '../shared/constants';
import { upsertBookmark } from '../lib/db/bookmarkRepository';
import { db } from '../lib/db/database';
import { parseGraphqlBookmarks } from '../content/x/graphqlParser';
import { findBottomCursor } from '../content/x/graphqlCursor';
import { getSettings } from '../lib/storage/localStorage';
import type { CapturedBookmarksRequest, ExtensionMessage, ImportDiagnostics, ImportPayload, ImportSession, MessageResponse } from '../shared/types';

let capturedBookmarksRequest: CapturedBookmarksRequest | null = null;
const X_BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const CAPTURED_BOOKMARKS_REQUEST_KEY = 'bookmarknest:x-bookmarks-request';
const LAST_IMPORT_DEBUG_KEY = 'bookmarknest:last-x-import-debug';
const BOOKMARKS_GRAPHQL_PATTERN = /\/i\/api\/graphql\/([^/]+)\/Bookmarks\b/;
const SYNC_ALARM_NAME = 'bookmarknest-auto-sync';

async function updateSyncAlarm() {
  if (!chrome.alarms) return;
  const settings = await getSettings();
  if (settings.autoSync && settings.syncIntervalMinutes > 0) {
    await chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: settings.syncIntervalMinutes });
  } else {
    await chrome.alarms.clear(SYNC_ALARM_NAME);
  }
}
const USER_BY_REST_ID_OPERATION = 'UserByRestId';
const DEFAULT_BOOKMARKS_FEATURES: Record<string, boolean> = {
  graphql_timeline_v2_bookmark_timeline: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  responsive_web_media_download_video_enabled: false,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_awards_web_tipping_enabled: false,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: false,
  responsive_web_grok_share_attachment_enabled: false
};
const UNSAFE_FETCH_HEADERS = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'cookie',
  'host',
  'origin',
  'referer',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site'
]);

function openExtensionPage(path: string) {
  return chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

async function sendStartImportToActiveTab(mode: 'visible' | 'auto-scroll' = 'visible'): Promise<MessageResponse> {
  if (mode === 'auto-scroll') {
    const apiResponse = await importBookmarksFromCapturedApi();
    if (apiResponse.ok) {
      return apiResponse;
    }

    if (!isMissingCapturedRequestError(apiResponse.error)) {
      if (isRefreshableCapturedRequestError(apiResponse.error)) {
        await clearCapturedBookmarksRequest();
        const recaptured = await primeCapturedBookmarksRequest();
        if (recaptured) {
          return importBookmarksFromCapturedApi();
        }
      }
      return apiResponse;
    }

    const primed = await primeCapturedBookmarksRequest();
    if (primed) {
      const primedApiResponse = await importBookmarksFromCapturedApi();
      if (primedApiResponse.ok || !isMissingCapturedRequestError(primedApiResponse.error)) {
        return primedApiResponse;
      }
    }
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const bookmarkTabs = await chrome.tabs.query({ url: ['https://x.com/i/bookmarks*', 'https://twitter.com/i/bookmarks*'] });
  const tab = bookmarkTabs.find((candidate) => candidate.windowId === activeTab?.windowId) ?? bookmarkTabs[0] ?? activeTab;

  if (!tab?.id) {
    return { ok: false, error: 'No active tab found.' };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'START_X_IMPORT', mode });
    if (response?.ok) {
      await chrome.tabs.update(tab.id, { active: true });
    }
    return response;
  } catch {
    return {
      ok: false,
      error: 'No loaded X bookmarks page detected. Open x.com/i/bookmarks, wait for the list to appear, then try Import again.'
    };
  }
}

function isMissingCapturedRequestError(error?: string) {
  return Boolean(error?.startsWith('No captured X Bookmarks API request.'));
}

function isRefreshableCapturedRequestError(error?: string) {
  return Boolean(error && /X Bookmarks API request failed with (401|403|404)/.test(error));
}

async function captureBookmarksRequest(payload: CapturedBookmarksRequest) {
  if (!payload.queryId && !parseBookmarksQueryId(payload.url)) {
    return;
  }

  capturedBookmarksRequest = payload;
  await chrome.storage?.local?.set?.({ [CAPTURED_BOOKMARKS_REQUEST_KEY]: payload });
}

async function clearCapturedBookmarksRequest() {
  capturedBookmarksRequest = null;
  await chrome.storage?.local?.remove?.(CAPTURED_BOOKMARKS_REQUEST_KEY);
}

async function loadCapturedBookmarksRequest() {
  if (capturedBookmarksRequest) {
    if (capturedBookmarksRequest.queryId || parseBookmarksQueryId(capturedBookmarksRequest.url)) {
      return capturedBookmarksRequest;
    }
    capturedBookmarksRequest = null;
  }

  const stored = await chrome.storage?.local?.get?.(CAPTURED_BOOKMARKS_REQUEST_KEY);
  const payload = stored?.[CAPTURED_BOOKMARKS_REQUEST_KEY] as CapturedBookmarksRequest | undefined;
  if (payload?.url && payload.headers && (payload.queryId || parseBookmarksQueryId(payload.url))) {
    capturedBookmarksRequest = payload;
  }
  return capturedBookmarksRequest;
}

function isBookmarksGraphqlUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return BOOKMARKS_GRAPHQL_PATTERN.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

function parseBookmarksQueryId(url: string) {
  try {
    return new URL(url).pathname.match(BOOKMARKS_GRAPHQL_PATTERN)?.[1];
  } catch {
    return undefined;
  }
}

function requestHeadersToRecord(headers?: chrome.webRequest.HttpHeader[]) {
  const record: Record<string, string> = {};
  for (const header of headers ?? []) {
    const name = header.name?.toLowerCase();
    if (name && typeof header.value === 'string' && !UNSAFE_FETCH_HEADERS.has(name)) {
      record[name] = header.value;
    }
  }
  return record;
}

function captureBookmarksRequestFromWebRequest(details: chrome.webRequest.WebRequestHeadersDetails) {
  if (!isBookmarksGraphqlUrl(details.url)) {
    return;
  }

  const parsedUrl = new URL(details.url);
  const queryId = parseBookmarksQueryId(details.url);
  void captureBookmarksRequest({
    url: details.url,
    operationName: 'Bookmarks',
    queryId,
    features: parsedUrl.searchParams.get('features') ?? undefined,
    variables: parsedUrl.searchParams.get('variables') ?? undefined,
    headers: requestHeadersToRecord(details.requestHeaders)
  });
}

async function installGraphqlHeaderRule() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    return;
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            requestHeaders: [
              { header: 'Origin', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation.SET, value: 'https://x.com' },
              { header: 'Referer', operation: 'set' as chrome.declarativeNetRequest.HeaderOperation.SET, value: 'https://x.com/' }
            ]
          },
          condition: {
            urlFilter: 'https://x.com/i/api/graphql/*',
            resourceTypes: ['xmlhttprequest' as chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
            initiatorDomains: [chrome.runtime.id]
          }
        }
      ]
    });
  } catch (error) {
    console.warn('Unable to install X GraphQL header rule.', error);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getGraphqlErrorMessage(body: unknown) {
  if (!isRecord(body) || !Array.isArray(body.errors) || body.errors.length === 0) {
    return undefined;
  }

  return body.errors
    .map((error) => isRecord(error) && typeof error.message === 'string' ? error.message : undefined)
    .filter(Boolean)
    .join('; ');
}

async function saveImportDebugSnapshot(detail: Record<string, unknown>) {
  await chrome.storage?.local?.set?.({
    [LAST_IMPORT_DEBUG_KEY]: {
      createdAt: Date.now(),
      ...detail
    }
  });
}

function toIsoDate(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function optionalStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 25) : undefined;
}

function sanitizeImportDiagnostics(raw: Record<string, unknown> | undefined): ImportDiagnostics {
  const manifest = chrome.runtime?.getManifest?.();
  const session = isRecord(raw?.session) ? raw.session : undefined;

  return {
    exportedAt: new Date().toISOString(),
    extensionVersion: manifest?.version ?? 'unknown',
    createdAt: toIsoDate(raw?.createdAt),
    reason: optionalString(raw?.reason),
    status: optionalString(raw?.status) as ImportDiagnostics['status'],
    source: optionalString(raw?.source),
    page: optionalNumber(raw?.page),
    queryId: optionalString(raw?.queryId) ?? null,
    apiFoundCount: optionalNumber(raw?.apiFoundCount),
    domMatchedCount: optionalNumber(raw?.domMatchedCount),
    avatarMatchedCount: optionalNumber(raw?.avatarMatchedCount),
    missingAvatarCount: optionalNumber(raw?.missingAvatarCount),
    missingAuthorCount: optionalNumber(raw?.missingAuthorCount),
    missingTweetIdSample: optionalStringArray(raw?.missingTweetIdSample),
    session: session
      ? {
          foundCount: optionalNumber(session.foundCount) ?? 0,
          insertedCount: optionalNumber(session.insertedCount) ?? 0,
          updatedCount: optionalNumber(session.updatedCount) ?? 0,
          duplicateCount: optionalNumber(session.duplicateCount) ?? 0,
          failedCount: optionalNumber(session.failedCount) ?? 0,
          status: optionalString(session.status) as ImportSession['status']
        }
      : undefined,
    error: optionalString(raw?.error)
  };
}

export async function getImportDiagnostics(): Promise<MessageResponse<{ diagnostics: ImportDiagnostics }>> {
  const result = await chrome.storage?.local?.get?.(LAST_IMPORT_DEBUG_KEY);
  const raw = result?.[LAST_IMPORT_DEBUG_KEY];
  if (!isRecord(raw)) {
    return { ok: false, error: 'No import diagnostics are available yet.' };
  }

  return { ok: true, data: { diagnostics: sanitizeImportDiagnostics(raw) } };
}

function parseJsonParam(param?: string) {
  if (!param) {
    return undefined;
  }

  try {
    return JSON.parse(param) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(param)) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }
}

function getCapturedFeatures(requestTemplate: CapturedBookmarksRequest) {
  return parseJsonParam(requestTemplate.features) ?? DEFAULT_BOOKMARKS_FEATURES;
}

function buildBookmarksGraphqlUrl(requestTemplate: CapturedBookmarksRequest, cursor?: string) {
  const queryId = requestTemplate.queryId ?? parseBookmarksQueryId(requestTemplate.url);
  if (!queryId) {
    throw new Error('No Bookmarks query ID was captured.');
  }

  const capturedVariables = parseJsonParam(requestTemplate.variables) ?? {};
  const variables: Record<string, unknown> = { ...capturedVariables, count: 100 };
  delete variables.cursor;
  if (cursor) {
    variables.cursor = cursor;
  }

  const params = new URLSearchParams();
  params.set('variables', JSON.stringify(variables));
  params.set('features', JSON.stringify(getCapturedFeatures(requestTemplate)));
  return `https://x.com/i/api/graphql/${queryId}/Bookmarks?${params.toString()}`;
}

function buildGraphqlUrl(queryId: string, operationName: string, variables: Record<string, unknown>, features: Record<string, unknown>) {
  const params = new URLSearchParams();
  params.set('variables', JSON.stringify(variables));
  params.set('features', JSON.stringify(features));
  return `https://x.com/i/api/graphql/${queryId}/${operationName}?${params.toString()}`;
}

function extractOperationQueryIdFromJs(js: string, operationName: string) {
  const escapedOperationName = operationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`queryId:\\s*"([A-Za-z0-9_-]+)"[^}]{0,500}operationName:\\s*"${escapedOperationName}"`, 'g'),
    new RegExp(`operationName:\\s*"${escapedOperationName}"[^}]{0,500}queryId:\\s*"([A-Za-z0-9_-]+)"`, 'g'),
    new RegExp(`"queryId"\\s*:\\s*"([A-Za-z0-9_-]+)"[^}]{0,500}"operationName"\\s*:\\s*"${escapedOperationName}"`, 'g'),
    new RegExp(`"operationName"\\s*:\\s*"${escapedOperationName}"[^}]{0,500}"queryId"\\s*:\\s*"([A-Za-z0-9_-]+)"`, 'g')
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(js);
    if (match?.[1]) {
      return match[1];
    }
  }

  const operationIndex = js.indexOf(`"${operationName}"`);
  if (operationIndex >= 0) {
    const nearby = js.slice(Math.max(0, operationIndex - 300), operationIndex + 320);
    return [...nearby.matchAll(/"([A-Za-z0-9_-]{15,})"/g)]
      .map((match) => match[1])
      .find((candidate) => candidate !== operationName && !/^[a-z_]+$/.test(candidate));
  }

  return undefined;
}

function collectBundleUrls(html: string) {
  const urls = [
    ...html.matchAll(/https:\/\/[^"'\s]+\.js(?=["'\s])/g),
    ...html.matchAll(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/g)
  ].map((match) => match[1] ?? match[0]);

  return [...new Set(urls.map((url) => new URL(url, 'https://x.com').toString()))];
}

async function scrapeOperationQueryIdFromBundles(operationName: string) {
  const pages = ['https://x.com', 'https://x.com/i/bookmarks'];
  const allBundleUrls = new Set<string>();

  for (const pageUrl of pages) {
    try {
      const response = await fetch(pageUrl, { credentials: 'include' });
      if (response.ok) {
        collectBundleUrls(await response.text()).forEach((url) => allBundleUrls.add(url));
      }
    } catch {
      // Continue with the next page.
    }
  }

  const bundleUrls = Array.from(allBundleUrls);
  const orderedUrls = [
    ...bundleUrls.filter((url) => url.includes('client-web') || url.includes('responsive-web')),
    ...bundleUrls.filter((url) => !url.includes('client-web') && !url.includes('responsive-web'))
  ];

  for (const url of orderedUrls.slice(0, 60)) {
    try {
      const jsResponse = await fetch(url, { credentials: 'include' });
      const queryId = extractOperationQueryIdFromJs(await jsResponse.text(), operationName);
      if (queryId) {
        return queryId;
      }
    } catch {
      // Continue scanning other bundles.
    }
  }

  return undefined;
}

async function ensureBookmarksRequestTemplate() {
  const existing = await loadCapturedBookmarksRequest();
  if (existing?.queryId || (existing?.url && parseBookmarksQueryId(existing.url))) {
    return existing;
  }

  const queryId = await scrapeOperationQueryIdFromBundles('Bookmarks');
  if (!queryId) {
    return null;
  }

  const capturedHeaders = existing?.headers ?? {};
  const payload: CapturedBookmarksRequest = {
    url: `https://x.com/i/api/graphql/${queryId}/Bookmarks`,
    operationName: 'Bookmarks',
    queryId,
    features: existing?.features,
    variables: existing?.variables,
    headers: capturedHeaders
  };
  await captureBookmarksRequest(payload);
  return payload;
}

function parseUserProfile(body: unknown) {
  const data = isRecord(body) ? body.data : undefined;
  const user = isRecord(data) ? data.user : undefined;
  const result = isRecord(user) ? user.result : undefined;
  const legacy = isRecord(result) && isRecord(result.legacy) ? result.legacy : undefined;
  const screenName = typeof legacy?.screen_name === 'string' ? legacy.screen_name : undefined;
  const name = typeof legacy?.name === 'string' ? legacy.name : undefined;
  const avatar = typeof legacy?.profile_image_url_https === 'string' ? legacy.profile_image_url_https : undefined;

  if (!screenName && !name && !avatar) {
    return null;
  }

  return { screenName, name, avatar };
}

async function enrichBookmarkAuthors(bookmarks: ImportPayload['bookmarks'], requestTemplate: CapturedBookmarksRequest) {
  const missingAuthorIds = Array.from(new Set(
    bookmarks
      .filter((bookmark) => bookmark.authorId && (!bookmark.authorAvatarUrl || bookmark.authorHandle.startsWith('user_') || bookmark.authorHandle === 'unknown'))
      .map((bookmark) => bookmark.authorId as string)
  ));

  if (missingAuthorIds.length === 0) {
    return bookmarks;
  }

  const queryId = await scrapeOperationQueryIdFromBundles(USER_BY_REST_ID_OPERATION);
  if (!queryId) {
    await saveImportDebugSnapshot({
      reason: 'missing_user_by_rest_id_query',
      missingAuthorCount: missingAuthorIds.length,
      operationName: USER_BY_REST_ID_OPERATION
    });
    return bookmarks;
  }

  const profiles = new Map<string, { screenName?: string; name?: string; avatar?: string }>();
  let firstDebugResponse: Record<string, unknown> | undefined;
  for (const authorId of missingAuthorIds.slice(0, 100)) {
    try {
      const url = buildGraphqlUrl(
        queryId,
        USER_BY_REST_ID_OPERATION,
        { userId: authorId, withSafetyModeUserFields: true },
        getCapturedFeatures(requestTemplate)
      );
      const response = await fetch(url, {
        method: 'GET',
        headers: await buildXHeaders(requestTemplate.headers),
        credentials: 'include'
      });
      const body = await response.json().catch(() => null);
      if (!firstDebugResponse) {
        firstDebugResponse = {
          authorId,
          status: response.status,
          ok: response.ok,
          body
        };
      }
      if (response.ok) {
        const profile = parseUserProfile(body);
        if (profile) {
          profiles.set(authorId, profile);
        }
      }
    } catch {
      // Keep the original bookmark if profile enrichment fails.
    }
    await sleep(250 + Math.floor(Math.random() * 250));
  }

  if (profiles.size === 0) {
    await saveImportDebugSnapshot({
      reason: 'no_user_profiles_enriched',
      missingAuthorCount: missingAuthorIds.length,
      userByRestIdQueryId: queryId,
      firstResponse: firstDebugResponse
    });
    return bookmarks;
  }

  return bookmarks.map((bookmark) => {
    const profile = bookmark.authorId ? profiles.get(bookmark.authorId) : undefined;
    if (!profile) {
      return bookmark;
    }

    const authorHandle = profile.screenName ?? bookmark.authorHandle;
    return {
      ...bookmark,
      tweetUrl: bookmark.tweetId && profile.screenName ? `https://x.com/${profile.screenName}/status/${bookmark.tweetId}` : bookmark.tweetUrl,
      authorName: profile.name ?? profile.screenName ?? bookmark.authorName,
      authorHandle,
      authorAvatarUrl: profile.avatar ?? bookmark.authorAvatarUrl
    };
  });
}

async function collectLoadedXBookmarkMetadata(tweetIds: string[] = []) {
  let tabs = await chrome.tabs.query({ url: ['https://x.com/i/bookmarks*', 'https://twitter.com/i/bookmarks*'] });
  const byTweetId = new Map<string, ImportPayload['bookmarks'][number]>();
  const [previousActiveTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const shouldActivateXTab = tweetIds.length > 0;
  let temporaryTabId: number | undefined;

  try {
    if (shouldActivateXTab && tabs.length === 0) {
      const tab = await chrome.tabs.create({ url: 'https://x.com/i/bookmarks', active: true });
      temporaryTabId = tab.id;
      tabs = tab ? [tab] : [];
      await sleep(2500);
    }

    for (const tab of tabs) {
      if (!tab.id) {
        continue;
      }

      try {
        if (shouldActivateXTab) {
          if (typeof tab.windowId === 'number') {
            await chrome.windows?.update?.(tab.windowId, { focused: true }).catch(() => undefined);
          }
          await chrome.tabs.update(tab.id, { active: true });
          await sleep(900);
        }

        let parsed: MessageResponse<ImportPayload['bookmarks']> | null = null;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          try {
            const response = await chrome.tabs.sendMessage(tab.id, {
              type: 'GET_LOADED_X_BOOKMARKS',
              tweetIds,
              autoScroll: tweetIds.length > 0
            });
            parsed = response as MessageResponse<ImportPayload['bookmarks']>;
            break;
          } catch {
            await sleep(700);
          }
        }

        if (!parsed?.ok || !Array.isArray(parsed.data)) {
          continue;
        }

        for (const bookmark of parsed.data) {
          if (bookmark.tweetId) {
            byTweetId.set(bookmark.tweetId, bookmark);
          }
        }
      } catch {
        // Ignore tabs without the current content script.
      }
    }
  } finally {
    if (temporaryTabId) {
      await chrome.tabs.remove(temporaryTabId).catch(() => undefined);
    }
    if (shouldActivateXTab && previousActiveTab?.id) {
      if (typeof previousActiveTab.windowId === 'number') {
        await chrome.windows?.update?.(previousActiveTab.windowId, { focused: true }).catch(() => undefined);
      }
      await chrome.tabs.update(previousActiveTab.id, { active: true }).catch(() => undefined);
    }
  }

  return byTweetId;
}

async function mergeLoadedXMetadata(bookmarks: ImportPayload['bookmarks']) {
  const loaded = await collectLoadedXBookmarkMetadata(bookmarks.map((bookmark) => bookmark.tweetId).filter((tweetId): tweetId is string => Boolean(tweetId)));
  const loadedValues = Array.from(loaded.values());
  const stats = {
    domMatchedCount: loaded.size,
    avatarMatchedCount: loadedValues.filter((bookmark) => Boolean(bookmark.authorAvatarUrl)).length
  };

  if (loaded.size === 0) {
    return { bookmarks, stats };
  }

  return {
    bookmarks: bookmarks.map((bookmark) => {
      const metadata = bookmark.tweetId ? loaded.get(bookmark.tweetId) : undefined;
      if (!metadata) {
        return bookmark;
      }

      return {
        ...bookmark,
        tweetUrl: metadata.tweetUrl ?? bookmark.tweetUrl,
        authorName: metadata.authorName || bookmark.authorName,
        authorHandle: metadata.authorHandle || bookmark.authorHandle,
        authorAvatarUrl: metadata.authorAvatarUrl ?? bookmark.authorAvatarUrl,
        createdAtText: metadata.createdAtText ?? bookmark.createdAtText,
        createdAt: metadata.createdAt ?? bookmark.createdAt,
        mediaUrls: metadata.mediaUrls?.length ? metadata.mediaUrls : bookmark.mediaUrls
      };
    }),
    stats
  };
}

async function waitForCapturedBookmarksRequest(timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await loadCapturedBookmarksRequest()) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

async function primeCapturedBookmarksRequest() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const bookmarkTabs = await chrome.tabs.query({ url: ['https://x.com/i/bookmarks*', 'https://twitter.com/i/bookmarks*'] });
  const existingTab = bookmarkTabs.find((candidate) => candidate.windowId === activeTab?.windowId) ?? bookmarkTabs[0];

  if (existingTab?.id) {
    await chrome.tabs.update(existingTab.id, { active: true, url: 'https://x.com/i/bookmarks' });
  } else {
    await chrome.tabs.create({ url: 'https://x.com/i/bookmarks', active: true });
  }

  return waitForCapturedBookmarksRequest();
}

async function importBookmarksFromCapturedApi(): Promise<MessageResponse<{ session: ImportSession }>> {
  const requestTemplate = await ensureBookmarksRequestTemplate();
  if (!requestTemplate) {
    return { ok: false, error: 'No captured X Bookmarks API request. Open x.com/i/bookmarks, refresh it, then try Import more again.' };
  }

  const bookmarks = [];
  const seenTweetIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let nextUrl: string;
  let lastResponseBody: unknown = null;
  let page = 0;
  let fetchError: string | null = null;

  while (page < 120) {
    page += 1;
    nextUrl = buildBookmarksGraphqlUrl(requestTemplate, cursor ?? undefined);
    let response: Response;
    try {
      response = await fetch(nextUrl, {
        method: 'GET',
        headers: await buildXHeaders(requestTemplate.headers),
        credentials: 'include'
      });
    } catch {
      fetchError = 'Network error while fetching X bookmarks.';
      break;
    }

    if (!response.ok) {
      fetchError = `X Bookmarks API request failed with ${response.status}.`;
      await saveImportDebugSnapshot({ reason: 'api_error', page, status: response.status });
      break;
    }

    const body = await response.json().catch(() => null);
    if (!body) {
      fetchError = 'X Bookmarks API returned an invalid response.';
      break;
    }
    lastResponseBody = body;
    const graphqlError = getGraphqlErrorMessage(body);
    if (graphqlError) {
      fetchError = `X Bookmarks GraphQL error: ${graphqlError}`;
      await saveImportDebugSnapshot({
        reason: 'graphql_error',
        page,
        url: nextUrl,
        error: graphqlError,
        body
      });
      break;
    }

    const pageBookmarks = parseGraphqlBookmarks(body);
    for (const bookmark of pageBookmarks) {
      const key = bookmark.input.tweetId ?? bookmark.input.tweetUrl;
      if (key && !seenTweetIds.has(key)) {
        seenTweetIds.add(key);
        bookmarks.push(bookmark.input);
      }
    }

    const bottomCursor = findBottomCursor(body);
    if (!bottomCursor || bottomCursor === cursor || seenCursors.has(bottomCursor)) {
      break;
    }

    seenCursors.add(bottomCursor);
    cursor = bottomCursor;
    await sleep(1200 + Math.floor(Math.random() * 800));
  }

  if (bookmarks.length === 0) {
    const baseError = fetchError ?? 'The X Bookmarks API returned no bookmark items.';
    await saveImportDebugSnapshot({
      reason: fetchError ? 'fetch_error_no_data' : 'no_bookmark_items',
      queryId: requestTemplate.queryId ?? parseBookmarksQueryId(requestTemplate.url),
      features: requestTemplate.features ?? null,
      variables: requestTemplate.variables ?? null,
      body: lastResponseBody,
      error: fetchError
    });
    return { ok: false, error: `${baseError} Refresh x.com/i/bookmarks and try again.` };
  }

  const domEnriched = await mergeLoadedXMetadata(bookmarks);
  const enrichedBookmarks = await enrichBookmarkAuthors(domEnriched.bookmarks, requestTemplate);
  const diagnostics = {
    reason: fetchError ? 'import_partial' : 'import_completed',
    status: fetchError ? 'partial' : 'completed',
    source: 'x_graphql_bookmarks',
    queryId: requestTemplate.queryId ?? parseBookmarksQueryId(requestTemplate.url) ?? null,
    apiFoundCount: bookmarks.length,
    domMatchedCount: domEnriched.stats.domMatchedCount,
    avatarMatchedCount: enrichedBookmarks.filter((bookmark) => Boolean(bookmark.authorAvatarUrl)).length,
    missingAvatarCount: enrichedBookmarks.filter((bookmark) => !bookmark.authorAvatarUrl).length,
    missingAuthorCount: enrichedBookmarks.filter((bookmark) => bookmark.authorHandle.startsWith('user_') || bookmark.authorHandle === 'unknown').length,
    missingTweetIdSample: bookmarks
      .filter((bookmark) => bookmark.tweetId && !enrichedBookmarks.find((enriched) => enriched.tweetId === bookmark.tweetId && enriched.authorAvatarUrl))
      .map((bookmark) => bookmark.tweetId as string)
      .slice(0, 25),
    fetchError: fetchError ?? undefined
  };

  const response = await saveImportedBookmarks({
    sourceUrl: 'https://x.com/i/bookmarks',
    bookmarks: enrichedBookmarks,
    foundCount: enrichedBookmarks.length,
    failedCount: 0
  });
  await saveImportDebugSnapshot({ ...diagnostics, session: response.data?.session });
  return response;
}

async function getCt0Cookie() {
  if (!chrome.cookies?.get) {
    return undefined;
  }

  return new Promise<string | undefined>((resolve) => {
    chrome.cookies.get({ url: 'https://x.com', name: 'ct0' }, (cookie) => resolve(cookie?.value));
  });
}

async function buildXHeaders(capturedHeaders: Record<string, string>) {
  const ct0 = await getCt0Cookie();
  const headers = new Headers(capturedHeaders);
  for (const header of UNSAFE_FETCH_HEADERS) {
    headers.delete(header);
  }

  if (!headers.has('authorization')) {
    headers.set('authorization', `Bearer ${X_BEARER_TOKEN}`);
  }
  if (ct0) {
    headers.set('x-csrf-token', ct0);
  }
  if (!headers.has('x-twitter-active-user')) {
    headers.set('x-twitter-active-user', 'yes');
  }
  if (!headers.has('x-twitter-auth-type')) {
    headers.set('x-twitter-auth-type', 'OAuth2Session');
  }
  if (!headers.has('x-twitter-client-language')) {
    headers.set('x-twitter-client-language', 'en');
  }

  return headers;
}

function createId(prefix: string) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function saveImportedBookmarks(payload: ImportPayload): Promise<MessageResponse<{ session: ImportSession }>> {
  const now = Date.now();
  const session: ImportSession = {
    id: createId('import'),
    startedAt: now,
    sourceUrl: payload.sourceUrl,
    foundCount: payload.foundCount,
    insertedCount: 0,
    updatedCount: 0,
    duplicateCount: 0,
    failedCount: payload.failedCount,
    status: 'running'
  };

  await db.importSessions.add(session);

  for (const [index, bookmark] of payload.bookmarks.entries()) {
    try {
      const result = await upsertBookmark({ ...bookmark, sourceOrder: index });
      if (result.inserted || result.restored) {
        session.insertedCount += 1;
      } else {
        session.duplicateCount += 1;
        session.updatedCount += 1;
      }
    } catch {
      session.failedCount += 1;
    }
  }

  session.status = session.failedCount > 0 && session.insertedCount === 0 && session.duplicateCount === 0 ? 'failed' : 'completed';
  session.finishedAt = Date.now();
  await db.importSessions.put(session);

  return { ok: true, data: { session } };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onInstalled?.addListener(() => {
    void installGraphqlHeaderRule();
  });

  void installGraphqlHeaderRule();

  chrome.webRequest?.onSendHeaders?.addListener(
    captureBookmarksRequestFromWebRequest,
    { urls: ['https://x.com/i/api/graphql/*', 'https://twitter.com/i/api/graphql/*'], types: ['xmlhttprequest'] },
    ['requestHeaders', 'extraHeaders']
  );

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    if (message.type === 'OPEN_APP') {
      void chrome.action?.setBadgeText?.({ text: '' });
      openExtensionPage(EXTENSION_PAGES.app).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.type === 'OPEN_UPGRADE') {
      openExtensionPage(EXTENSION_PAGES.upgrade).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.type === 'START_X_IMPORT') {
      sendStartImportToActiveTab(message.mode).then(sendResponse).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.type === 'GET_IMPORT_DIAGNOSTICS') {
      getImportDiagnostics().then(sendResponse).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.type === 'CAPTURE_X_BOOKMARKS_REQUEST') {
      captureBookmarksRequest(message.payload).then(() => sendResponse({ ok: true })).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.type === 'SAVE_IMPORTED_BOOKMARKS') {
      saveImportedBookmarks(message.payload).then(sendResponse).catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    sendResponse({ ok: false, error: 'Unknown message.' });
    return false;
  });

  chrome.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM_NAME) {
      importBookmarksFromCapturedApi().then((result) => {
        if (result.ok && result.data?.session) {
          const { insertedCount } = result.data.session;
          if (insertedCount > 0) {
            void chrome.action?.setBadgeText?.({ text: String(insertedCount) });
            void chrome.action?.setBadgeBackgroundColor?.({ color: '#14786f' });
          }
        }
      }).catch(() => undefined);
    }
  });

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      void updateSyncAlarm();
    }
  });

  void updateSyncAlarm();
}
