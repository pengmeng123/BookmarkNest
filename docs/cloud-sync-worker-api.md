# Cloud Sync Worker API

BookmarkNest extension calls these endpoints on the existing license Worker base URL (`VITE_LICENSE_WORKER_URL`).
The extension sends encrypted snapshot payloads. The Worker stores and returns them, but does not need to read bookmark content.

## `POST /cloud-sync/snapshots`

Create a cloud backup snapshot.

Request:

```json
{
  "licenseKey": "string",
  "instanceId": "string",
  "deviceName": "Chrome on macOS",
  "snapshot": {
    "schemaVersion": 1,
    "algorithm": "AES-GCM",
    "kdf": "PBKDF2-SHA256",
    "iterations": 120000,
    "salt": "base64",
    "iv": "base64",
    "data": "base64",
    "createdAt": 1710000000000,
    "metadata": {
      "bookmarkCount": 1200,
      "savedViewCount": 8,
      "contentHash": "license-scoped-base64-sha256"
    }
  }
}
```

Response:

```json
{
  "snapshotId": "snap_...",
  "createdAt": 1710000000000,
  "unchanged": false
}
```

## `POST /cloud-sync/snapshots/latest`

Return the latest cloud backup snapshot for the license.

Request:

```json
{
  "licenseKey": "string",
  "instanceId": "string"
}
```

Response:

```json
{
  "snapshotId": "snap_...",
  "createdAt": 1710000000000,
  "snapshot": {
    "schemaVersion": 1,
    "algorithm": "AES-GCM",
    "kdf": "PBKDF2-SHA256",
    "iterations": 120000,
    "salt": "base64",
    "iv": "base64",
    "data": "base64",
    "createdAt": 1710000000000,
    "metadata": {
      "bookmarkCount": 1200,
      "savedViewCount": 8,
      "contentHash": "license-scoped-base64-sha256"
    }
  }
}
```

## `POST /cloud-sync/snapshots/list`

Optional for backup history UI. The current extension client has the method, but the UI does not depend on it yet.

Request:

```json
{
  "licenseKey": "string",
  "instanceId": "string"
}
```

Response:

```json
{
  "snapshots": [
    {
      "id": "snap_...",
      "createdAt": 1710000000000,
      "bookmarkCount": 1200,
      "savedViewCount": 8,
      "deviceName": "Chrome on macOS"
    }
  ]
}
```

## Status Codes

- `200`: success
- `401` or `403`: license is invalid, expired, or not Pro
- `404`: no cloud snapshot exists
- `429`: per-license or per-instance write rate limit exceeded
- `5xx`: Worker/D1/R2 error

## Storage Shape

D1 should store snapshot metadata:

- `id`
- `license_key_hash`
- `instance_id`
- `device_name`
- `created_at`
- `bookmark_count`
- `saved_view_count`
- `content_hash`
- `r2_key`

R2 should store the full encrypted `snapshot` JSON.

## Abuse Controls

The Worker must enforce storage growth limits; extension-side guards are only UX protection.

- Reject frequent writes per license/instance with `429` before writing D1 or R2. A practical starting point is 1 accepted changed snapshot per minute, 10 per hour, and 100 per day.
- Treat `snapshot.metadata.contentHash` as the encrypted payload's license-scoped content fingerprint. If the latest stored row for the same license has the same `content_hash`, return the existing `snapshotId` with `"unchanged": true` and do not create a new R2 object.
- Keep a bounded history. Recommended default: retain the latest 5 snapshots per license. After a new snapshot is committed, select older rows beyond the retention limit, delete their R2 objects, then delete the D1 rows.
- Store every snapshot under a license-scoped prefix, for example `cloud-sync/{licenseKeyHash}/{snapshotId}.json`, so retention cleanup never scans the whole bucket.
- Never rely on the client for abuse protection. The client can be modified, so D1/R2 writes must only happen after server-side license validation, rate limiting, duplicate detection, and retention cleanup.
