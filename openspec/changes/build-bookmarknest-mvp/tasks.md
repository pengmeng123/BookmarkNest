## 1. Project Scaffold

- [x] 1.1 Create the MV3 React/Vite/TypeScript/Tailwind project structure and build scripts.
- [x] 1.2 Add extension entry points for popup, management app, options, upgrade, background worker, and X/Twitter content script.
- [x] 1.3 Add manifest generation with constrained permissions and X/Twitter host permissions.
- [x] 1.4 Add shared TypeScript types for bookmarks, folders, tags, import sessions, license state, settings, and messages.
- [x] 1.5 Add base styling, theme tokens, dark mode support, and shared UI primitives.

## 2. Local Data Layer

- [x] 2.1 Add Dexie IndexedDB schema for bookmarks, folders, tags, import sessions, and search metadata.
- [x] 2.2 Add repository functions for bookmark upsert, soft delete, archive, reset, folder operations, and tag operations.
- [x] 2.3 Add `chrome.storage.local` adapters for settings and license state.
- [x] 2.4 Add tests for dedupe keys, soft delete behavior, folder deletion, tag deletion, and free-user manageable scope.

## 3. Extension Shell and Messaging

- [x] 3.1 Implement background message handlers for opening management and upgrade pages.
- [x] 3.2 Implement popup UI with import, open app, and upgrade/manage license actions.
- [x] 3.3 Implement options page with theme, default export format, data reset, backup import/export entry points, license entry, and privacy/support text.
- [x] 3.4 Implement management app layout with sidebar, top search/actions bar, bookmark list area, and empty states.
- [x] 3.5 Add tests or smoke checks for extension entry points and message routing.

## 4. X Bookmark Import

- [x] 4.1 Implement content script page detection for supported X/Twitter bookmark URLs.
- [x] 4.2 Add injected import control that appears only on supported bookmark pages.
- [x] 4.3 Implement isolated X bookmark card parser with fixtures for expected DOM shapes.
- [x] 4.4 Implement import session state, progress counts, cancellation, per-card failure handling, and completion summary.
- [x] 4.5 Wire content script import results to IndexedDB upsert while preserving user-maintained fields on duplicates.
- [x] 4.6 Add parser and import-flow tests for successful cards, duplicates, soft-deleted duplicates, card failures, and page parser failure.

## 5. Bookmark Management

- [x] 5.1 Render bookmark cards with author, handle, summary, tags, folder, imported time, source link, and quick actions.
- [x] 5.2 Implement folder create, rename, delete, uncategorized view, and move bookmark.
- [x] 5.3 Implement tag create, autocomplete, add/remove, usage counts, filter, delete, and batch add.
- [x] 5.4 Implement archive filter, soft delete, and default-list exclusion rules.
- [x] 5.5 Implement bulk selection, bulk move, bulk tag, and bulk delete with Pro gating where required.

## 6. Search and Filters

- [x] 6.1 Implement local searchable view over content, author name, handle, tag names, and folder name.
- [x] 6.2 Implement case-insensitive multi-word AND matching and handle matching with or without `@`.
- [x] 6.3 Apply deleted, archived, current filter, and free-user scope rules to search.
- [x] 6.4 Add debounce, clear search, highlight matches, and import-time descending default ordering.
- [x] 6.5 Add tests for search matching, scope, ordering, and free-user limits.

## 7. Export

- [x] 7.1 Implement free JSON backup export for the recent 200 manageable undeleted bookmarks and related folders/tags.
- [x] 7.2 Implement Pro Markdown export for all or current filtered eligible bookmarks.
- [x] 7.3 Implement Pro CSV export with correct comma, quote, and newline escaping.
- [x] 7.4 Add export dialog UI with format choices, current-filter option, empty-state handling, and Pro gating.
- [x] 7.5 Add tests for JSON scope, Markdown fallbacks, CSV escaping, deleted/archived exclusions, and filtered exports.

## 8. Pro and License

- [x] 8.1 Implement free/Pro capability checks and locked-record messaging without deleting local records.
- [x] 8.2 Implement upgrade page Free vs Pro comparison, one-time purchase copy, checkout button, license form, active status, deactivation, and support contact.
- [x] 8.3 Implement license Worker client for activate, validate, and deactivate endpoints with configurable base URL.
- [x] 8.4 Implement 7-day background validation, offline grace, invalid license fallback, and specific activation error states.
- [x] 8.5 Add tests for Pro activation visibility restore, Pro loss fallback, offline validation, and device-limit/invalid errors.

## 9. Compliance and Release Readiness

- [x] 9.1 Verify manifest permissions exclude `<all_urls>`, `activeTab`, and `scripting` for MVP.
- [x] 9.2 Ensure no remote executable code is loaded by extension pages or content scripts.
- [x] 9.3 Draft Chrome Web Store permission explanation, privacy policy text, and store copy aligned with actual behavior.
- [x] 9.4 Add manual QA checklist for install, import 50/200/500, duplicate import, search, folders/tags, free limit, Pro activation, exports, reset, dark mode, and build loading.
- [x] 9.5 Run build, unit tests, and available browser/UI smoke tests before marking the change complete.
