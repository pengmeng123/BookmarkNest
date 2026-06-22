import { describe, expect, it } from 'vitest';

import { isXBookmarkPage } from './pageDetection';

describe('isXBookmarkPage', () => {
  it('accepts supported bookmark URLs', () => {
    expect(isXBookmarkPage('https://x.com/i/bookmarks')).toBe(true);
    expect(isXBookmarkPage('https://twitter.com/i/bookmarks?cursor=1#top')).toBe(true);
  });

  it('rejects unsupported pages', () => {
    expect(isXBookmarkPage('https://x.com/home')).toBe(false);
    expect(isXBookmarkPage('https://example.com/i/bookmarks')).toBe(false);
    expect(isXBookmarkPage('not a url')).toBe(false);
  });
});
