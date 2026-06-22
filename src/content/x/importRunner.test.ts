import { afterEach, describe, expect, it } from 'vitest';

import { resetDomainData, softDeleteBookmark } from '../../lib/db/bookmarkRepository';
import { db } from '../../lib/db/database';
import { runImportFromLoadedCards } from './importRunner';

function render(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

const card = (id: string, content = `Content ${id}`) => `
  <article>
    <div data-testid="User-Name">User ${id} @user${id}</div>
    <a href="/user${id}/status/${id}">View post</a>
    <div data-testid="tweetText">${content}</div>
  </article>
`;

describe('runImportFromLoadedCards', () => {
  afterEach(async () => {
    await resetDomainData();
  });

  it('imports parsed cards and records session counts', async () => {
    const root = render(`${card('1')}${card('2')}`);

    const { session } = await runImportFromLoadedCards('https://x.com/i/bookmarks', root);

    expect(session.insertedCount).toBe(2);
    expect(session.failedCount).toBe(0);
    expect(session.status).toBe('completed');
    expect(await db.bookmarks.count()).toBe(2);
  });

  it('counts duplicates without creating records', async () => {
    const root = render(card('1'));
    await runImportFromLoadedCards('https://x.com/i/bookmarks', root);

    const { session } = await runImportFromLoadedCards('https://x.com/i/bookmarks', root);

    expect(session.insertedCount).toBe(0);
    expect(session.duplicateCount).toBe(1);
    expect(session.updatedCount).toBe(1);
    expect(await db.bookmarks.count()).toBe(1);
  });

  it('does not restore soft-deleted duplicates', async () => {
    const root = render(card('1'));
    await runImportFromLoadedCards('https://x.com/i/bookmarks', root);
    const existing = await db.bookmarks.toCollection().first();
    await softDeleteBookmark(existing!.id);

    await runImportFromLoadedCards('https://x.com/i/bookmarks', root);

    const stored = await db.bookmarks.get(existing!.id);
    expect(stored?.deleted).toBe(true);
  });

  it('records card parse failures', async () => {
    const root = render(`${card('1')}<article><p>broken</p></article>`);

    const { session } = await runImportFromLoadedCards('https://x.com/i/bookmarks', root);

    expect(session.insertedCount).toBe(1);
    expect(session.failedCount).toBe(1);
  });

  it('can cancel an import session', async () => {
    const root = render(`${card('1')}${card('2')}`);
    const controller = { cancelled: false };
    const progressStatuses: string[] = [];

    const { session } = await runImportFromLoadedCards('https://x.com/i/bookmarks', root, controller, (progress) => {
      progressStatuses.push(progress.status);
      controller.cancelled = true;
    });

    expect(session.status).toBe('cancelled');
    expect(session.insertedCount).toBe(0);
    expect(progressStatuses).toContain('running');
  });
});
