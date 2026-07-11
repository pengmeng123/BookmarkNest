# Chrome Web Store Notes

## Permission Explanation

BookmarkNest requests permissions needed for local storage, user-triggered X bookmark import, optional background auto-sync, and local exports:

- `storage`: store settings and license status in Chrome local storage.
- `downloads`: download JSON, Markdown, and CSV exports created locally.
- `clipboardWrite`: copy original X post links from the management app.
- `webRequest`: detect the X Bookmarks GraphQL request shape after the user opens X bookmarks so imports can follow X's current API format.
- `declarativeNetRequest` and `declarativeNetRequestWithHostAccess`: set the request headers required for extension-initiated X GraphQL requests.
- `cookies`: read the X CSRF cookie needed to make authenticated X bookmark requests in the user's existing X session.
- `alarms`: run optional background auto-sync at the interval selected by the user.
- `https://x.com/*` and `https://twitter.com/*`: detect the user's X/Twitter bookmarks page, import bookmarks after user action, and scan the rendered bookmarks page for metadata such as avatars.

BookmarkNest does not request `<all_urls>`, `activeTab`, or `scripting`.

## Store Copy Guardrails

- Describe import as user-triggered import from the user's X/Twitter bookmarks using the logged-in X session.
- Do not claim one-click import of all historical X bookmarks.
- State that bookmark content stays local by default.
- State that optional Cloud Sync uploads an encrypted backup and does not send plaintext bookmark content.
- State that License activation sends license/device data to the license service.
- State that import diagnostics contain counters and technical errors, not bookmark text.
- Describe Pro pricing as $2.99/month, $24.99/year, or a $49 one-time Lifetime Pro purchase before taxes; checkout displays any applicable taxes.
- Describe Lifetime Pro as access to the Pro features available in BookmarkNest while the product is available. Do not describe Cloud Sync as unlimited: it retains up to five backup versions and may throttle changed backups to one per minute.

## Short Description

Search, organize, export, and restore X/Twitter bookmarks in a local-first research desk.

## Full Description Draft

BookmarkNest helps creators, analysts, and indie builders turn native X/Twitter bookmarks into a local-first research desk. Import bookmarks after user action, search saved posts, organize them with folders and tags, save repeat research views, annotate important posts, export your library to common formats, and restore it after reinstall with encrypted Cloud Sync.

Core features:

- Import X/Twitter bookmarks after user action using your existing logged-in X session.
- Search locally by post text, research notes, author, handle, tags, and folders.
- Organize with single-level folders and flexible tags.
- Archive or delete local bookmark records.
- Save named research views for repeated searches and filter combinations with Pro.
- Add local research notes to bookmarks with Pro.
- Export JSON backups on Free.
- Unlock Markdown and CSV exports, notes, saved views, bulk actions, background sync, mirror removals, and encrypted Cloud Sync with Pro.
- Choose Monthly Pro for $2.99/month, Annual Pro for $24.99/year, or Lifetime Pro for a one-time $49 purchase. Taxes may apply at checkout. Lifetime Pro covers the Pro features available in BookmarkNest while the product is available. Cloud Sync retains up to five backup versions and may throttle changed backups to one per minute.

Bookmark content, notes, saved views, authors, tags, folders, and media URLs are stored locally in your browser by default. If you enable Cloud Sync, BookmarkNest uploads an encrypted backup that is decrypted with your License Key. Plain bookmark content is not sent to the Cloud Sync service.
