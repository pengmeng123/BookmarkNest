# Chrome Web Store Notes

## Permission Explanation

BookmarkNest requests the minimum permissions needed for the MVP:

- `storage`: store settings and license status in Chrome local storage.
- `downloads`: download JSON, Markdown, and CSV exports created locally.
- `clipboardWrite`: copy original X post links from the management app.
- `https://x.com/*` and `https://twitter.com/*`: detect the user's X/Twitter bookmarks page and import currently loaded bookmark cards after user action.

BookmarkNest does not request `<all_urls>`, `activeTab`, or `scripting` in the MVP.

## Store Copy Guardrails

- Describe import as importing currently loaded X/Twitter bookmarks.
- Do not claim one-click import of all historical X bookmarks.
- State that bookmark content stays local by default.
- State that License activation sends license/device data to the license service.

## Short Description

Search, organize, and export your X bookmarks with a local-first Chrome extension.

## Full Description Draft

X Bookmark Manager helps X/Twitter power users turn native bookmarks into a searchable local library. Import currently loaded bookmarks from your X bookmarks page, search saved posts, organize them with folders and tags, and export your library to common formats.

Core features:

- Import currently loaded X/Twitter bookmarks after user action.
- Search locally by post text, author, handle, tags, and folders.
- Organize with single-level folders and flexible tags.
- Archive or delete local bookmark records.
- Export JSON backups on Free.
- Unlock unlimited management plus Markdown and CSV exports with Pro.

Bookmark content is stored locally in your browser by default. The extension does not upload bookmark text, authors, tags, folders, or media URLs to a server.
