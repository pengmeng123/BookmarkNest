## Context

BookmarkNest starts from an empty repository with a reviewed product requirements document in `inputs/BookmarkNest需求文档.md`. The MVP is a local-first Chrome extension for X/Twitter bookmarks. The highest-risk parts are X page parsing, IndexedDB data semantics, free/Pro gating, and Chrome Web Store compliance.

The extension must run under Manifest V3, avoid remote executable code, minimize permissions, and keep bookmark content local. The only planned external network integration is Creem checkout and a Cloudflare Worker license proxy.

## Goals / Non-Goals

**Goals:**

- Establish a working MV3 extension shell with popup, management app, options, upgrade page, background worker, and content script.
- Persist bookmarks, folders, tags, import sessions, and search metadata in IndexedDB.
- Persist settings and license state in `chrome.storage.local`.
- Import currently loaded X/Twitter bookmark cards through a content script without auto-scrolling or bypassing X limits.
- Provide deterministic local search, organization, export, and Pro gating behavior.
- Keep implementation testable with unit tests for parsing/export/search/data rules and Playwright coverage for core extension pages where practical.

**Non-Goals:**

- Cloud sync, AI tagging, Notion/Readwise export, X API/OAuth import, background scheduled scraping, cross-browser sync, mobile support, team features, and generic web bookmarking.
- Guaranteed import of all historical X bookmarks.
- Server-side storage of bookmark content.

## Decisions

1. **Static content script for X/Twitter pages**

   Use manifest-declared content scripts for `https://x.com/*` and `https://twitter.com/*`, then show UI only on `/i/bookmarks`. This avoids needing `activeTab` and `scripting` for MVP and makes behavior easier to explain during Chrome Web Store review.

   Alternative considered: dynamically inject after popup click. That reduces always-loaded code but requires additional permissions and creates a less direct page button flow.

2. **IndexedDB through Dexie**

   Use Dexie for typed local tables, indexes, and versioned schema upgrades. Tables include bookmarks, folders, tags, import sessions, and optional search index metadata. Keep settings and license data in `chrome.storage.local` because extension pages and background code need simple shared access.

   Alternative considered: raw IndexedDB or `idb`. Both are viable, but Dexie reduces boilerplate for filtering, paging, and migrations.

3. **Keep the full local library available on Free**

   Free users can import, browse, search, and organize the full local library. Pro conversion comes from higher-value workflows: research notes, saved views, Markdown/CSV exports, bulk actions, background sync, mirror removals, and encrypted Cloud Sync.

   Alternative considered: lock records after the latest 200 undeleted bookmarks. That creates a clearer quantity paywall, but it adds product friction, weakens the local-first promise, and can make users feel their imported data is being held back.

4. **Soft delete for item deletion**

   Single-item delete sets `deleted: true` and `deletedAt`. Default list, search, and export exclude deleted records. Full data reset performs a hard delete of all local tables. This allows dedupe logic to avoid silently resurrecting deleted records.

   Alternative considered: hard delete individual bookmarks. That is simpler but makes duplicate re-import and recovery behavior less predictable.

5. **Deterministic MVP search**

   MVP search is local, case-insensitive, multi-word AND matching over content, author name, handle, tags, and folder name. Results default to import time descending. A search library such as MiniSearch can be introduced behind the same behavior if performance requires it.

   Alternative considered: fuzzy search by default. It can feel better for typos but is harder to explain, test, and gate consistently.

6. **License validation with offline grace**

   Activation, deactivation, and validation go through a Worker. Activated users keep Pro access while offline, with background validation every 7 days when the app opens. Invalid or revoked licenses return to free behavior without deleting local data.

   Alternative considered: validate every launch synchronously. That is stricter but creates bad UX for a local-first tool.

7. **Export generated locally**

   JSON, Markdown, and CSV files are generated in the extension from local IndexedDB data and downloaded with `chrome.downloads`. CSV escaping and Markdown empty-state formatting are specified to keep exports testable.

## Risks / Trade-offs

- X DOM changes break parsing -> Keep parser isolated, count per-card failures, and show a clear parsing failure message.
- Large imports can block UI -> Batch parsing and writes, expose progress, and test 50/200/500 record imports.
- MV3 service worker lifecycle can interrupt long work -> Keep import parsing in content/app context and persist import session progress promptly.
- Local license state can be tampered with -> Treat client-side gating as product UX, validate periodically with Worker, and avoid storing server secrets in the extension.
- Chrome Web Store privacy review rejects broad behavior -> Avoid `<all_urls>`, avoid remote code, document X host access, and keep bookmark content local.
- Free/Pro gating can confuse users -> Always explain that locked local data is retained and becomes manageable after Pro activation.

## Migration Plan

This is the initial implementation, so no user data migration is required. Dexie schema versioning must be introduced from the first version so later migrations can evolve tables safely.

Rollback during development is to remove or disable the unpacked extension build. User-created local IndexedDB data can be cleared from the options page or browser extension storage during testing.

## Open Questions

- Final Creem product URL, Worker base URL, and support email need configuration before production.
- Final Chrome Web Store name, icon set, screenshots, and privacy policy URL need to be supplied before submission.
- X DOM selectors require live validation during implementation and may need parser fixture updates.
