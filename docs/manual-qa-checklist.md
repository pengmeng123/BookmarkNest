# Manual QA Checklist

## Install and Shell

- Load `dist/` as an unpacked Chrome extension.
- Popup opens from the toolbar.
- Management app opens from popup.
- Options page opens from Chrome extension options.
- Upgrade page opens from popup and options.

## Import

- X/Twitter non-bookmark pages do not show the injected import button.
- `https://x.com/i/bookmarks` can be opened or focused by the import flow.
- App page `Import more` imports through X Bookmarks GraphQL pagination.
- Popup `Import more` imports through the same flow as the app page.
- Import works when an X bookmarks tab is already open.
- Import works when no X bookmarks tab is open and the extension opens a temporary one.
- Import restores the previous active tab after metadata scanning.
- Imported order matches the visible X bookmarks order for the tested account.
- Imported count matches the X account's expected bookmark count where practical.
- Author names, handles, and avatars are present for rendered X bookmarks.
- Import duplicate bookmarks without creating duplicate records.
- Deleted local bookmarks are restored when imported again.
- Import diagnostics can be revealed from Options by clicking the version label five times.
- Diagnostics export contains counts and errors but does not contain bookmark text.
- Parser failure shows a clear error or failed count.
- Test import scale with approximately 50, 200, and 500 loaded cards where practical.

## Library

- Bookmark cards show author, handle, content, folder, tags, imported date, source link, and quick actions.
- Create, rename, delete folders.
- Move bookmarks to a folder and to Uncategorized.
- Create, add, remove, filter, and delete tags.
- Archive hides bookmarks from the default list and shows them in Archived.
- Delete hides bookmarks from default list, search, and export.

## Search

- Search matches post content, note text, author, handle, tag, and folder.
- Search is case-insensitive.
- Multi-word search uses AND behavior.
- `@handle` and `handle` both match author handle.
- Focus filter can show all evidence, bookmarks with notes, bookmarks needing notes, media bookmarks, and unfiled bookmarks.
- Author filter narrows the list by display name or handle.
- Clear search resets the visible list.

## Free and Pro

- Free users can browse, search, organize, archive/delete, and JSON-export the full local library.
- Markdown, CSV, notes, saved views, bulk actions, auto-sync, and mirror removals are gated for Free users.
- Free users attempting note saves or saved-view actions are sent to upgrade.
- Downgrade keeps local notes and saved views stored, visible, and non-destructive while editing/use is gated.
- Activated Pro unlocks notes, saved views, bulk actions, Pro exports, auto-sync, and mirror removals.
- Offline validation keeps active Pro access.
- Invalid/revoked/device-limit states return to Free without deleting local bookmarks.

## Export

- Free JSON export includes bookmarks, notes, and folder/tag relationships for local backup.
- Pro Markdown export handles empty tags, folders, and note sections.
- Pro CSV export correctly escapes commas, quotes, and newlines.
- Empty export scope disables export or shows a clear message.
- Deleted bookmarks are excluded.
- Archived bookmarks are excluded unless the Archived scope is active.

## Visual

- Light mode is readable.
- Dark mode is readable.
- Long post text, long author names, and long tags do not break card layout.
- Buttons show disabled and loading states where applicable.
