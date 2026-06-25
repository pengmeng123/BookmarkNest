# Privacy Policy Draft

BookmarkNest is a local-first Chrome extension for managing X/Twitter bookmarks.

## Data Stored Locally

BookmarkNest stores imported bookmark data in the browser's local extension storage, including post text, author name, handle, post URL, media URLs, imported time, tags, folders, archive status, and local delete status.

Settings and license status are stored in Chrome local storage.

BookmarkNest may also store the latest import diagnostics locally. Diagnostics include technical counters, timestamps, extension version, limited tweet ID samples, and error messages. Diagnostics do not include bookmark text.

## Data Sent to Servers

BookmarkNest does not upload bookmark content, authors, media URLs, tags, or folders to a server.

When the user starts an import, BookmarkNest sends authenticated requests to X/Twitter from the extension using the user's existing logged-in X session. These requests are used to read the user's X bookmarks and related profile metadata needed to display the local library.

When activating or validating a Pro license, BookmarkNest sends license activation data to the license service, such as license key, device instance ID, email returned by the license provider, and extension version or similar activation metadata.

## User Controls

Users can:

- Delete individual local bookmark records.
- Clear all local BookmarkNest data.
- Export local data as a backup.
- Export local import diagnostics for support.
- Deactivate a Pro license on the current device.

## Third-Party Services

BookmarkNest uses Creem for monthly subscription checkout, lifetime checkout, and license keys. License activation and validation are proxied through a Cloudflare Worker so the extension does not include Creem API secrets.

## Contact

Support email: pp12111@outlook.com
