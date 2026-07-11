# Privacy Policy Draft

BookmarkNest is a local-first Chrome extension for managing X/Twitter bookmarks.

## Data Stored Locally

BookmarkNest stores imported bookmark data in the browser's local extension storage, including post text, author name, handle, post URL, media URLs, imported time, tags, folders, research notes, saved views, archive status, and local delete status.

Settings and license status are stored in Chrome local storage.

BookmarkNest may also store the latest import diagnostics locally. Diagnostics include technical counters, timestamps, extension version, limited tweet ID samples, and error messages. Diagnostics do not include bookmark text.

## Data Sent to Servers

BookmarkNest stores bookmark content, research notes, saved views, authors, media URLs, tags, and folders locally by default.

If the user enables optional Cloud Sync, BookmarkNest creates an encrypted backup of the local library and uploads that encrypted snapshot to the Cloud Sync service. The snapshot is encrypted in the extension with a key derived from the user's License Key. Plain bookmark content, notes, saved views, authors, media URLs, tags, and folders are not sent to the Cloud Sync service.

When the user starts an import or enables optional auto-sync, BookmarkNest sends authenticated requests to X/Twitter from the extension using the user's existing logged-in X session. These requests are used to read the user's X bookmarks and related profile metadata needed to display the local library.

When activating or validating a Pro license, BookmarkNest sends license activation data to the license service, such as license key, device instance ID, email returned by the license provider, and extension version or similar activation metadata.

## User Controls

Users can:

- Delete individual local bookmark records.
- Clear all local BookmarkNest data.
- Export local data as a backup.
- Enable or disable optional encrypted Cloud Sync.
- Keep Pro-only notes and saved views stored locally after downgrade, with editing and use gated by the active plan.
- Export local import diagnostics for support.
- Deactivate a Pro license on the current device.

## Third-Party Services

BookmarkNest uses Creem for Monthly Pro, Annual Pro, and Lifetime Pro checkout and license keys. License activation and validation are proxied through a Cloudflare Worker so the extension does not include Creem API secrets.

Lifetime Pro is a one-time purchase for the Pro features available in BookmarkNest while the product is available. Cloud Sync retains up to five encrypted backup versions and may throttle changed backups to one per minute.

## Contact

Support email: pp12111@outlook.com
