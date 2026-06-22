## Why

X/Twitter power users save useful posts but cannot reliably search, organize, or export native X bookmarks. BookmarkNest will validate whether users will pay for a local-first Chrome extension that imports currently loaded X bookmarks and turns them into a searchable, taggable, exportable personal library.

## What Changes

- Build a Manifest V3 Chrome extension using React, Vite, TypeScript, Tailwind CSS, Zustand, and IndexedDB.
- Add popup, management app, options page, upgrade page, background service worker, and X/Twitter content script.
- Import currently loaded bookmarks from `x.com/i/bookmarks` and `twitter.com/i/bookmarks` with progress, cancellation, deduplication, and failure handling.
- Store bookmarks, folders, tags, import sessions, settings, and license state locally.
- Provide local search, filters, folder/tag organization, archive/delete behavior, and bulk operations.
- Export free-user JSON backups for the recent 200 manageable bookmarks and Pro Markdown/CSV exports for all eligible bookmarks.
- Add Creem license activation, validation, deactivation, and Pro gating through a Cloudflare Worker proxy.
- Prepare the extension for Chrome Web Store review with constrained permissions, no remote executable code, and clear privacy behavior.

## Capabilities

### New Capabilities

- `extension-shell`: Manifest, pages, background worker, messaging, storage setup, and extension navigation.
- `x-bookmark-import`: X/Twitter bookmark page detection, content-script import flow, parsing, progress, cancellation, deduplication, and import sessions.
- `bookmark-library`: Local bookmark management, folder/tag organization, archive/delete semantics, filtering, and bulk actions.
- `bookmark-search`: Local searchable index and deterministic matching behavior.
- `bookmark-export`: JSON, Markdown, and CSV export behavior including free/Pro limits and formatting rules.
- `license-pro`: Creem checkout, license activation, validation, deactivation, Pro state, and free-user gating.
- `privacy-compliance`: Permission minimization, local-first data handling, and Chrome Web Store privacy constraints.

### Modified Capabilities

- None.

## Impact

- New extension source under `src/` with popup, app, options, upgrade, background, content, shared libraries, and styles.
- New IndexedDB schema for bookmarks, folders, tags, import sessions, and search metadata.
- New `chrome.storage.local` usage for settings and license state.
- New build/test tooling for MV3 extension development.
- External network access limited to Creem checkout and the license Worker endpoints.
