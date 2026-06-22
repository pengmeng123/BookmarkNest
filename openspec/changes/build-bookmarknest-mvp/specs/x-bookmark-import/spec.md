## ADDED Requirements

### Requirement: Bookmark page detection
The extension SHALL detect X/Twitter bookmark pages at `https://x.com/i/bookmarks` and `https://twitter.com/i/bookmarks`, including URLs with query strings or hashes.

#### Scenario: Supported page
- **WHEN** the user visits a supported bookmark URL
- **THEN** the content script exposes an import control

#### Scenario: Unsupported page
- **WHEN** the user visits a non-bookmark X/Twitter URL
- **THEN** the content script does not show the import control

### Requirement: User-triggered import
The extension SHALL import only currently loaded bookmark cards after explicit user action and SHALL NOT auto-scroll the page or bypass X limits.

#### Scenario: Start import
- **WHEN** the user starts import on a supported bookmark page
- **THEN** the extension scans currently loaded bookmark cards

#### Scenario: User scrolls for more
- **WHEN** the user scrolls and more bookmark cards load during an import session
- **THEN** the extension can discover and import the newly loaded cards

#### Scenario: No automatic infinite scrolling
- **WHEN** an import session is running
- **THEN** the extension does not programmatically scroll the page indefinitely

### Requirement: Import progress and cancellation
The extension SHALL show found, saved, duplicate, failed, and updated counts during import and SHALL allow cancellation.

#### Scenario: Progress updates
- **WHEN** bookmark cards are processed
- **THEN** the visible import progress reflects current counts

#### Scenario: Cancel import
- **WHEN** the user cancels an import
- **THEN** the session stops and already saved bookmarks remain stored

### Requirement: Bookmark deduplication
The extension SHALL deduplicate imported bookmarks by `tweetId`, then `tweetUrl`, then a hash of `authorHandle + contentText`.

#### Scenario: Duplicate by tweet id
- **WHEN** an imported card has a `tweetId` already stored
- **THEN** the extension updates mutable tweet fields and preserves tags, folder, and archive state

#### Scenario: Duplicate soft-deleted bookmark
- **WHEN** an imported card matches a soft-deleted bookmark
- **THEN** the extension does not automatically restore it

### Requirement: Import failure handling
The extension SHALL continue after per-card parse failures and SHALL display a clear error when the page structure cannot be parsed.

#### Scenario: Single card fails
- **WHEN** one loaded card cannot be parsed
- **THEN** the failed count increments and remaining cards continue processing

#### Scenario: Page parser fails
- **WHEN** the page structure cannot be recognized
- **THEN** the user sees an error explaining that the current X/Twitter page cannot be read
