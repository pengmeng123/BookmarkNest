# Chrome Web Store Notes

## Permission Explanation

BookmarkNest requests the minimum permissions needed for the MVP:

- `storage`: store settings and license status in Chrome local storage.
- `downloads`: download JSON, Markdown, and CSV exports created locally.
- `clipboardWrite`: copy original X post links from the management app.
- `webRequest`: detect the X Bookmarks GraphQL request shape after the user opens X bookmarks so imports can follow X's current API format.
- `declarativeNetRequest` and `declarativeNetRequestWithHostAccess`: set the request headers required for extension-initiated X GraphQL requests.
- `cookies`: read the X CSRF cookie needed to make authenticated X bookmark requests in the user's existing X session.
- `https://x.com/*` and `https://twitter.com/*`: detect the user's X/Twitter bookmarks page, import bookmarks after user action, and scan the rendered bookmarks page for metadata such as avatars.

BookmarkNest does not request `<all_urls>`, `activeTab`, or `scripting` in the MVP.

## Store Copy Guardrails

- Describe import as user-triggered import from the user's X/Twitter bookmarks using the logged-in X session.
- Do not claim one-click import of all historical X bookmarks.
- State that bookmark content stays local by default.
- State that License activation sends license/device data to the license service.
- State that import diagnostics contain counters and technical errors, not bookmark text.
- Describe Pro pricing as either $1/month or $29 lifetime, depending on the selected checkout option.

## Short Description

Search, organize, and export your X bookmarks with a local-first Chrome extension.

## Full Description Draft

X Bookmark Manager helps X/Twitter power users turn native bookmarks into a searchable local library. Import bookmarks from your X bookmarks page after user action, search saved posts, organize them with folders and tags, and export your library to common formats.

Core features:

- Import X/Twitter bookmarks after user action using your existing logged-in X session.
- Search locally by post text, author, handle, tags, and folders.
- Organize with single-level folders and flexible tags.
- Archive or delete local bookmark records.
- Export JSON backups on Free.
- Unlock unlimited management plus Markdown and CSV exports with Pro.
- Choose Monthly Pro for $1/month or Lifetime Pro for $29 one-time.

Bookmark content is stored locally in your browser by default. The extension does not upload bookmark text, authors, tags, folders, or media URLs to a server.
