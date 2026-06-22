import { describe, expect, it, vi } from 'vitest';

import { sendRuntimeMessage } from './runtime';

describe('sendRuntimeMessage', () => {
  it('returns an error when chrome runtime is unavailable', async () => {
    vi.stubGlobal('chrome', undefined);

    await expect(sendRuntimeMessage({ type: 'OPEN_APP' })).resolves.toEqual({
      ok: false,
      error: 'Chrome runtime is not available.'
    });

    vi.unstubAllGlobals();
  });

  it('sends messages through chrome.runtime', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage
      }
    });

    await expect(sendRuntimeMessage({ type: 'OPEN_UPGRADE' })).resolves.toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'OPEN_UPGRADE' });

    vi.unstubAllGlobals();
  });
});
