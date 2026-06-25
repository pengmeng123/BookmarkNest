import { describe, expect, it } from 'vitest';

import { findBottomCursor, updateGraphqlCursorUrl } from './graphqlCursor';
import { shouldCaptureGraphqlUrl } from './network-hook';

describe('shouldCaptureGraphqlUrl', () => {
  it('captures only the main Bookmarks GraphQL request', () => {
    const baseUrl = 'https://x.com';

    expect(shouldCaptureGraphqlUrl('/i/api/graphql/abc/Bookmarks?variables={}', baseUrl)).toBe(true);
    expect(shouldCaptureGraphqlUrl('/i/api/graphql/abc/BookmarkFoldersSlice?variables={}', baseUrl)).toBe(false);
    expect(shouldCaptureGraphqlUrl('/i/api/graphql/abc/BookmarkTimeline?variables={}', baseUrl)).toBe(false);
    expect(shouldCaptureGraphqlUrl('/i/api/graphql/abc/HomeTimeline?variables={}', baseUrl)).toBe(false);
    expect(shouldCaptureGraphqlUrl('/i/api/graphql/abc/SearchTimeline?variables={}', baseUrl)).toBe(false);
  });

  it('extracts bottom cursors and updates GraphQL variables', () => {
    const cursor = findBottomCursor({
      data: {
        timeline: {
          instructions: [
            {
              entries: [
                { entryId: 'tweet-1' },
                { entryId: 'cursor-bottom-1', content: { cursorType: 'Bottom', value: 'cursor_next' } }
              ]
            }
          ]
        }
      }
    });

    const nextUrl = updateGraphqlCursorUrl(
      '/i/api/graphql/abc/Bookmarks?variables=%7B%22count%22%3A20%7D&features=%7B%7D',
      cursor ?? '',
      'https://x.com'
    );
    const variables = JSON.parse(new URL(nextUrl).searchParams.get('variables') ?? '{}') as Record<string, unknown>;

    expect(cursor).toBe('cursor_next');
    expect(variables).toMatchObject({ count: 20, cursor: 'cursor_next' });
  });
});
