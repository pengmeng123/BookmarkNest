import type { LocalBackup } from '../db/bookmarkRepository';
import type { CloudSyncSnapshotSummary, LicenseData } from '../../shared/types';

export interface EncryptedCloudSnapshot {
  schemaVersion: 1;
  algorithm: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  data: string;
  createdAt: number;
  metadata: {
    bookmarkCount: number;
    savedViewCount: number;
    contentHash: string;
  };
}

export interface CloudSyncClientConfig {
  baseUrl?: string;
}

export type CloudSyncErrorCode =
  | 'missing-config'
  | 'missing-license'
  | 'network-error'
  | 'unauthorized'
  | 'not-found'
  | 'rate-limited'
  | 'server-error'
  | 'invalid-snapshot';

export class CloudSyncError extends Error {
  constructor(
    message: string,
    public code: CloudSyncErrorCode
  ) {
    super(message);
  }
}

const DEFAULT_BASE_URL = import.meta.env.VITE_LICENSE_WORKER_URL as string | undefined;
const KDF_ITERATIONS = 120_000;

function getBaseUrl(config: CloudSyncClientConfig = {}) {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  if (!baseUrl) {
    throw new CloudSyncError('Cloud Sync service is not configured.', 'missing-config');
  }
  return baseUrl.replace(/\/$/, '');
}

function assertLicense(license: LicenseData) {
  if (!license.licenseKey || !license.instanceId) {
    throw new CloudSyncError('Activate Pro before using Cloud Sync.', 'missing-license');
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'undefined';
}

function sortByStableId<T extends { id?: string; startedAt?: number }>(items: T[]) {
  return [...items].sort((a, b) => {
    const left = a.id ?? String(a.startedAt ?? '');
    const right = b.id ?? String(b.startedAt ?? '');
    return left.localeCompare(right);
  });
}

export async function fingerprintLocalBackup(backup: LocalBackup, scope = '') {
  const canonicalBackup = {
    schemaVersion: backup.schemaVersion,
    bookmarks: sortByStableId(backup.bookmarks),
    folders: sortByStableId(backup.folders),
    tags: sortByStableId(backup.tags),
    importSessions: sortByStableId(backup.importSessions),
    savedViews: sortByStableId(backup.savedViews)
  };
  const digest = await crypto.subtle.digest(
    'SHA-256',
    toArrayBuffer(new TextEncoder().encode(stableStringify({ scope, backup: canonicalBackup })))
  );
  return bytesToBase64(new Uint8Array(digest));
}

async function deriveSnapshotKey(licenseKey: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(new TextEncoder().encode(licenseKey)),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations: KDF_ITERATIONS
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptLocalBackup(backup: LocalBackup, licenseKey: string, contentHash?: string): Promise<EncryptedCloudSnapshot> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveSnapshotKey(licenseKey, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    toArrayBuffer(new TextEncoder().encode(JSON.stringify(backup)))
  );

  return {
    schemaVersion: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: KDF_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
    createdAt: backup.exportedAt,
    metadata: {
      bookmarkCount: backup.bookmarks.length,
      savedViewCount: backup.savedViews.length,
      contentHash: contentHash ?? (await fingerprintLocalBackup(backup, licenseKey))
    }
  };
}

export async function decryptCloudSnapshot(snapshot: EncryptedCloudSnapshot, licenseKey: string): Promise<LocalBackup> {
  if (snapshot.schemaVersion !== 1 || snapshot.algorithm !== 'AES-GCM' || snapshot.kdf !== 'PBKDF2-SHA256') {
    throw new CloudSyncError('Cloud snapshot format is not supported.', 'invalid-snapshot');
  }

  const salt = base64ToBytes(snapshot.salt);
  const iv = base64ToBytes(snapshot.iv);
  const key = await deriveSnapshotKey(licenseKey, salt);
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(snapshot.data));
  } catch {
    throw new CloudSyncError('Cloud snapshot could not be decrypted with this License Key.', 'invalid-snapshot');
  }

  return JSON.parse(new TextDecoder().decode(decrypted)) as LocalBackup;
}

async function requestCloud<T>(path: string, body: unknown, config?: CloudSyncClientConfig): Promise<T> {
  const baseUrl = getBaseUrl(config);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new CloudSyncError('Unable to reach Cloud Sync.', 'network-error');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new CloudSyncError('Cloud Sync is not available for this License Key.', 'unauthorized');
    }
    if (response.status === 404) {
      throw new CloudSyncError(
        'This License Key is active, but no remote cloud backup was found. Run Cloud Backup on the device that has your data first.',
        'not-found'
      );
    }
    if (response.status === 429) {
      throw new CloudSyncError('Cloud Sync is running too often. Try again later.', 'rate-limited');
    }
    throw new CloudSyncError('Cloud Sync service error.', 'server-error');
  }

  return response.json() as Promise<T>;
}

export async function uploadCloudSnapshot(
  license: LicenseData,
  snapshot: EncryptedCloudSnapshot,
  deviceName: string,
  config?: CloudSyncClientConfig
) {
  assertLicense(license);
  return requestCloud<{ snapshotId: string; createdAt: number; unchanged?: boolean }>(
    '/cloud-sync/snapshots',
    {
      licenseKey: license.licenseKey,
      instanceId: license.instanceId,
      deviceName,
      snapshot
    },
    config
  );
}

export async function getLatestCloudSnapshot(license: LicenseData, config?: CloudSyncClientConfig) {
  assertLicense(license);
  return requestCloud<{ snapshotId: string; createdAt: number; snapshot: EncryptedCloudSnapshot }>(
    '/cloud-sync/snapshots/latest',
    {
      licenseKey: license.licenseKey,
      instanceId: license.instanceId
    },
    config
  );
}

export async function getCloudSnapshotById(license: LicenseData, snapshotId: string, config?: CloudSyncClientConfig) {
  assertLicense(license);
  return requestCloud<{ snapshotId: string; createdAt: number; snapshot: EncryptedCloudSnapshot }>(
    '/cloud-sync/snapshots/get',
    { licenseKey: license.licenseKey, instanceId: license.instanceId, snapshotId },
    config
  );
}

export async function listCloudSnapshots(license: LicenseData, config?: CloudSyncClientConfig) {
  assertLicense(license);
  return requestCloud<{ snapshots: CloudSyncSnapshotSummary[] }>(
    '/cloud-sync/snapshots/list',
    {
      licenseKey: license.licenseKey,
      instanceId: license.instanceId
    },
    config
  );
}
