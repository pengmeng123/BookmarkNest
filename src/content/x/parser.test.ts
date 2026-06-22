import { describe, expect, it } from 'vitest';

import { parseLoadedBookmarkCards } from './parser';

function render(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('parseLoadedBookmarkCards', () => {
  it('parses loaded bookmark cards', () => {
    const root = render(`
      <article>
        <div data-testid="User-Name">Ada Lovelace @ada · Jun 22</div>
        <a href="/ada/status/12345">View post</a>
        <time datetime="2026-06-22T10:00:00.000Z"></time>
        <div data-testid="tweetText">Useful thread about local-first tools.</div>
        <img src="https://pbs.twimg.com/profile_images/avatar.jpg" />
        <img src="https://pbs.twimg.com/media/example.jpg" />
      </article>
    `);

    const result = parseLoadedBookmarkCards(root);

    expect(result.foundCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.parsed[0].input).toMatchObject({
      tweetId: '12345',
      tweetUrl: 'https://x.com/ada/status/12345',
      authorName: 'Ada Lovelace',
      authorHandle: 'ada',
      contentText: 'Useful thread about local-first tools.',
      mediaUrls: ['https://pbs.twimg.com/media/example.jpg']
    });
  });

  it('counts cards that cannot be parsed', () => {
    const root = render(`
      <article>
        <div data-testid="User-Name">Missing Tweet @missing</div>
      </article>
    `);

    const result = parseLoadedBookmarkCards(root);

    expect(result.foundCount).toBe(1);
    expect(result.parsed).toHaveLength(0);
    expect(result.failedCount).toBe(1);
  });
});
