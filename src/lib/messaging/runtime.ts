import type { ExtensionMessage, MessageResponse } from '../../shared/types';

export async function sendRuntimeMessage<T = unknown>(message: ExtensionMessage): Promise<MessageResponse<T>> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return { ok: false, error: 'Chrome runtime is not available.' };
  }

  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to send extension message.'
    };
  }
}
