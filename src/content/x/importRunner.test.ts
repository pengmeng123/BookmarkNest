import { afterEach, describe, expect, it, vi } from 'vitest';

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
    vi.unstubAllGlobals();
  });

  function stubSaveResponse(response = { ok: true, data: { session: { id: 'import_1', startedAt: 1, sourceUrl: 'https://x.com/i/bookmarks', foundCount: 1, insertedCount: 1, updatedCount: 0, duplicateCount: 0, failedCount: 0, status: 'completed' } } }) {
    const sendMessage = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    return sendMessage;
  }

  it('imports parsed cards and records session counts', async () => {
    const root = render(`${card('1')}${card('2')}`);
    const sendMessage = stubSaveResponse({
      ok: true,
      data: {
        session: {
          id: 'import_1',
          startedAt: 1,
          sourceUrl: 'https://x.com/i/bookmarks',
          foundCount: 2,
          insertedCount: 2,
          updatedCount: 0,
          duplicateCount: 0,
          failedCount: 0,
          status: 'completed'
        }
      }
    });

    const { session } = await runImportFromLoadedCards('https://x.com/i/bookmarks', root);

    expect(session.insertedCount).toBe(2);
    expect(session.failedCount).toBe(0);
    expect(session.status).toBe('completed');
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SAVE_IMPORTED_BOOKMARKS',
        payload: expect.objectContaining({
          bookmarks: expect.arrayContaining([expect.objectContaining({ tweetId: '1' }), expect.objectContaining({ tweetId: '2' })])
        })
      })
    );
  });

  it('returns duplicate counts from the background save response', async () => {
    const root = render(card('1'));
    stubSaveResponse({
      ok: true,
      data: {
        session: {
          id: 'import_1',
          startedAt: 1,
          sourceUrl: 'https://x.com/i/bookmarks',
          foundCount: 1,
          insertedCount: 0,
          updatedCount: 1,
          duplicateCount: 1,
          failedCount: 0,
          status: 'completed'
        }
      }
    });

    const { session } = await runImportFromLoadedCards('https://x.com/i/bookmarks', root);

    expect(session.insertedCount).toBe(0);
    expect(session.duplicateCount).toBe(1);
    expect(session.updatedCount).toBe(1);
  });

  it('surfaces background save failures', async () => {
    const root = render(card('1'));
    stubSaveResponse({ ok: false, error: 'Unable to save.' });

    await expect(runImportFromLoadedCards('https://x.com/i/bookmarks', root)).rejects.toThrow('Unable to save.');
  });

  it('records card parse failures', async () => {
    const root = render(`${card('1')}<article><p>broken</p></article>`);
    const sendMessage = stubSaveResponse({
      ok: true,
      data: {
        session: {
          id: 'import_1',
          startedAt: 1,
          sourceUrl: 'https://x.com/i/bookmarks',
          foundCount: 2,
          insertedCount: 1,
          updatedCount: 0,
          duplicateCount: 0,
          failedCount: 1,
          status: 'completed'
        }
      }
    });

    const { session } = await runImportFromLoadedCards('https://x.com/i/bookmarks', root);

    expect(session.insertedCount).toBe(1);
    expect(session.failedCount).toBe(1);
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ failedCount: 1 }) }));
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
