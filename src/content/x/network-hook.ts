import { findBottomCursor, updateGraphqlCursorUrl } from './graphqlCursor';

const EVENT_NAME = 'bookmarknest:x-graphql-response';
const REQUEST_EVENT_NAME = 'bookmarknest:x-bookmarks-request';
const FETCH_ALL_EVENT_NAME = 'bookmarknest:x-fetch-all-bookmarks';
const FETCH_ALL_PROGRESS_EVENT_NAME = 'bookmarknest:x-fetch-all-bookmarks-progress';
const FETCH_ALL_CANCEL_EVENT_NAME = 'bookmarknest:x-fetch-all-bookmarks-cancel';

interface BookmarkRequestTemplate {
  url: string;
  init?: RequestInit;
  headers: Record<string, string>;
  features?: string;
  variables?: string;
}

let lastBookmarkRequest: BookmarkRequestTemplate | null = null;
let lastBottomCursor: string | null = null;

export function shouldCaptureGraphqlUrl(url: string, baseUrl = window.location.origin) {
  const resolvedUrl = new URL(url, baseUrl);
  return /\/i\/api\/graphql\/[^/]+\/Bookmarks\b/.test(resolvedUrl.pathname);
}

function emitGraphqlResponse(url: string, body: unknown) {
  lastBottomCursor = findBottomCursor(body);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { url, body } }));
}

function headersToRecord(headers?: HeadersInit) {
  const record: Record<string, string> = {};
  if (!headers) {
    return record;
  }

  new Headers(headers).forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

function emitBookmarkRequest(template: BookmarkRequestTemplate) {
  const queryId = new URL(template.url, window.location.origin).pathname.match(/\/i\/api\/graphql\/([^/]+)\/Bookmarks\b/)?.[1];
  window.dispatchEvent(new CustomEvent(REQUEST_EVENT_NAME, {
    detail: {
      url: template.url,
      operationName: 'Bookmarks',
      queryId,
      features: template.features,
      variables: template.variables,
      headers: template.headers
    }
  }));
}

function emitFetchAllProgress(requestId: string, detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(FETCH_ALL_PROGRESS_EVENT_NAME, { detail: { requestId, ...detail } }));
}

function cloneRequestInit(init?: RequestInit): RequestInit | undefined {
  if (!init) {
    return { credentials: 'include' };
  }

  return {
    method: init.method,
    headers: init.headers,
    body: init.body,
    credentials: init.credentials ?? 'include',
    mode: init.mode,
    cache: init.cache,
    redirect: init.redirect,
    referrer: init.referrer,
    referrerPolicy: init.referrerPolicy,
    integrity: init.integrity,
    keepalive: init.keepalive
  };
}

function createRequestTemplate(input: RequestInfo | URL, init?: RequestInit): BookmarkRequestTemplate {
  const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
  const parsedUrl = new URL(url, window.location.origin);
  if (input instanceof Request) {
    return {
      url,
      features: parsedUrl.searchParams.get('features') ?? undefined,
      variables: parsedUrl.searchParams.get('variables') ?? undefined,
      headers: {
        ...headersToRecord(input.headers),
        ...headersToRecord(init?.headers)
      },
      init: {
        method: init?.method ?? input.method,
        headers: init?.headers ?? input.headers,
        body: init?.body,
        credentials: init?.credentials ?? input.credentials,
        mode: init?.mode ?? input.mode,
        cache: init?.cache ?? input.cache,
        redirect: init?.redirect ?? input.redirect,
        referrer: init?.referrer ?? input.referrer,
        referrerPolicy: init?.referrerPolicy ?? input.referrerPolicy,
        integrity: init?.integrity ?? input.integrity,
        keepalive: init?.keepalive ?? input.keepalive
      }
    };
  }

  return {
    url,
    features: parsedUrl.searchParams.get('features') ?? undefined,
    variables: parsedUrl.searchParams.get('variables') ?? undefined,
    headers: headersToRecord(init?.headers),
    init: cloneRequestInit(init)
  };
}

function readResponse(url: string, response: Response) {
  if (!shouldCaptureGraphqlUrl(url)) {
    return;
  }

  void response.clone().json().then((body) => emitGraphqlResponse(url, body)).catch(() => undefined);
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await originalFetch(input, init);
  const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
  if (shouldCaptureGraphqlUrl(url)) {
    lastBookmarkRequest = createRequestTemplate(input, init);
    emitBookmarkRequest(lastBookmarkRequest);
  }
  readResponse(url, response);
  return response;
};

const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;
const requestUrls = new WeakMap<XMLHttpRequest, string>();

XMLHttpRequest.prototype.open = function open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
  requestUrls.set(this, url.toString());
  return originalOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
};

XMLHttpRequest.prototype.send = function send(body?: Document | XMLHttpRequestBodyInit | null) {
  const requestUrl = requestUrls.get(this);
  if (requestUrl && shouldCaptureGraphqlUrl(requestUrl)) {
    this.addEventListener('load', () => {
      try {
        emitGraphqlResponse(requestUrl, JSON.parse(this.responseText));
      } catch {
        // Ignore non-JSON responses.
      }
    });
  }

  return originalSend.call(this, body);
};

function sleep(ms: number) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

window.addEventListener(FETCH_ALL_EVENT_NAME, (event) => {
  const detail = (event as CustomEvent<{ requestId?: string; maxPages?: number }>).detail;
  const requestId = detail?.requestId;
  if (!requestId) {
    return;
  }

  void (async () => {
    if (!lastBookmarkRequest) {
      emitFetchAllProgress(requestId, { phase: 'error', error: 'No Bookmarks API request was captured. Refresh x.com/i/bookmarks and try again.' });
      return;
    }

    const maxPages = Math.max(1, Math.min(detail.maxPages ?? 80, 200));
    const seenCursors = new Set<string>();
    let cursor = lastBottomCursor;
    let completedPages = 0;
    let cancelled = false;

    const cancelHandler = (e: Event) => {
      if ((e as CustomEvent<{ requestId?: string }>).detail?.requestId === requestId) {
        cancelled = true;
      }
    };
    window.addEventListener(FETCH_ALL_CANCEL_EVENT_NAME, cancelHandler);

    try {
      for (let page = 1; page <= maxPages && cursor; page += 1) {
        if (cancelled || seenCursors.has(cursor)) {
          break;
        }
        seenCursors.add(cursor);
        emitFetchAllProgress(requestId, { phase: 'fetching', page, cursor });

        try {
          const nextUrl = updateGraphqlCursorUrl(lastBookmarkRequest.url, cursor);
          const response = await originalFetch(nextUrl, cloneRequestInit(lastBookmarkRequest.init));
          const body = await response.clone().json().catch(() => null);
          if (!response.ok || !body) {
            if (completedPages > 0) {
              emitFetchAllProgress(requestId, { phase: 'partial', pages: completedPages, error: `API returned ${response.status} on page ${page}` });
            } else {
              emitFetchAllProgress(requestId, { phase: 'error', error: `Bookmarks API request failed with ${response.status}.` });
            }
            return;
          }

          emitGraphqlResponse(nextUrl, body);
          completedPages += 1;
          cursor = findBottomCursor(body);

          if (cursor && page < maxPages && !cancelled) {
            await sleep(1000 + Math.floor(Math.random() * 800));
          }
        } catch {
          if (completedPages > 0) {
            emitFetchAllProgress(requestId, { phase: 'partial', pages: completedPages, error: 'Network error during fetch' });
          } else {
            emitFetchAllProgress(requestId, { phase: 'error', error: 'Network error while fetching bookmarks.' });
          }
          return;
        }
      }

      if (cancelled && completedPages > 0) {
        emitFetchAllProgress(requestId, { phase: 'partial', pages: completedPages });
      } else if (cancelled) {
        emitFetchAllProgress(requestId, { phase: 'error', error: 'Import cancelled.' });
      } else {
        emitFetchAllProgress(requestId, { phase: 'done', pages: seenCursors.size });
      }
    } finally {
      window.removeEventListener(FETCH_ALL_CANCEL_EVENT_NAME, cancelHandler);
    }
  })();
});
