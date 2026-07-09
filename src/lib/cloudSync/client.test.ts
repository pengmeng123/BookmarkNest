import { describe, expect, it, vi } from 'vitest';

import type { LocalBackup } from '../db/bookmarkRepository';
import {
  decryptCloudSnapshot,
  encryptLocalBackup,
  fingerprintLocalBackup,
  getLatestCloudSnapshot,
  uploadCloudSnapshot
} from './client';

const backup: LocalBackup = {
  schemaVersion: 3,
  exportedAt: 1710000000000,
  bookmarks: [
    {
      id: 'bookmark_1',
      tweetId: '1',
      tweetUrl: 'https://x.com/user/status/1',
      authorName: 'User',
      authorHandle: 'user',
      contentText: 'Sensitive bookmark text',
      mediaUrls: [],
      importedAt: 1710000000000,
      updatedAt: 1710000000000,
      note: 'Private research note',
      noteUpdatedAt: 1710000000001,
      tagIds: ['tag_1'],
      archived: false,
      deleted: false,
      dedupeKey: 'tweet:1',
      source: 'x-bookmarks-page'
    }
  ],
  folders: [],
  tags: [
    {
      id: 'tag_1',
      name: 'Strategy',
      color: '#14786f',
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
      usageCount: 1
    }
  ],
  importSessions: [],
  savedViews: []
};

describe('cloud sync client', () => {
  it('encrypts and decrypts local backups with the license key', async () => {
    const snapshot = await encryptLocalBackup(backup, 'license_test');

    expect(snapshot.data).not.toContain('Sensitive bookmark text');
    expect(snapshot.data).not.toContain('Private research note');
    expect(snapshot.metadata.contentHash).toBe(await fingerprintLocalBackup(backup, 'license_test'));

    await expect(decryptCloudSnapshot(snapshot, 'wrong_key')).rejects.toThrow(/could not be decrypted/i);
    await expect(decryptCloudSnapshot(snapshot, 'license_test')).resolves.toEqual(backup);
  });

  it('fingerprints backup content without treating export time as a content change', async () => {
    const first = await fingerprintLocalBackup({ ...backup, exportedAt: 1710000000000 }, 'license_test');
    const second = await fingerprintLocalBackup({ ...backup, exportedAt: 1710000010000 }, 'license_test');

    expect(second).toBe(first);
  });

  it('scopes backup fingerprints by license key', async () => {
    const first = await fingerprintLocalBackup(backup, 'license_1');
    const second = await fingerprintLocalBackup(backup, 'license_2');

    expect(second).not.toBe(first);
  });

  it('uploads encrypted snapshots without plaintext backup content', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ snapshotId: 'snap_1', createdAt: 1710000000000 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await encryptLocalBackup(backup, 'license_test');
    const response = await uploadCloudSnapshot(
      {
        pro: true,
        licenseKey: 'license_test',
        instanceId: 'instance_1',
        email: 'user@example.com',
        activatedAt: null,
        expiresAt: null,
        lastValidatedAt: null,
        validationStatus: 'valid'
      },
      snapshot,
      'MacBook Pro',
      { baseUrl: 'https://api.example.com' }
    );

    expect(response.snapshotId).toBe('snap_1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/cloud-sync/snapshots',
      expect.objectContaining({ method: 'POST' })
    );

    const requestBody = JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1].body as string));
    expect(requestBody).toContain('license_test');
    expect(requestBody).toContain(snapshot.metadata.contentHash);
    expect(requestBody).not.toContain('Sensitive bookmark text');
    expect(requestBody).not.toContain('Private research note');
  });

  it('surfaces a clear error when no remote backup exists for the active license', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));

    await expect(
      getLatestCloudSnapshot(
        {
          pro: true,
          licenseKey: 'license_test',
          instanceId: 'instance_1',
          email: 'user@example.com',
          activatedAt: null,
          expiresAt: null,
          lastValidatedAt: null,
          validationStatus: 'valid'
        },
        { baseUrl: 'https://api.example.com' }
      )
    ).rejects.toThrow(/no remote cloud backup was found/i);
  });
});
