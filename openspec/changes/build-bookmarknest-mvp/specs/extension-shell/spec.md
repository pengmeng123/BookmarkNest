## ADDED Requirements

### Requirement: Extension pages are available
The extension SHALL provide popup, management app, options, and upgrade pages as separate extension entry points.

#### Scenario: Popup opens
- **WHEN** the user opens the toolbar popup
- **THEN** the popup displays import, management, and Pro/license entry points

#### Scenario: Management app opens
- **WHEN** the user selects the primary open action
- **THEN** the extension opens the management app page

#### Scenario: Options page opens
- **WHEN** the user opens extension options
- **THEN** the extension displays settings, data management, privacy, and license entry points

#### Scenario: Upgrade page opens
- **WHEN** the user selects an upgrade or manage license action
- **THEN** the extension opens the upgrade page

### Requirement: Extension messaging is routed
The extension SHALL route messages between popup, app pages, background worker, and content script for page opening and import actions.

#### Scenario: Popup starts import on bookmark page
- **WHEN** the popup requests import while the active tab is an injected X/Twitter bookmark page
- **THEN** the content script receives an import-start message

#### Scenario: Background opens internal page
- **WHEN** an extension page asks to open the management or upgrade page
- **THEN** the background worker opens the requested extension URL

### Requirement: Local stores are initialized
The extension SHALL initialize IndexedDB for domain data and `chrome.storage.local` for settings and license state.

#### Scenario: First run initializes stores
- **WHEN** the extension runs with no prior data
- **THEN** required tables and default settings are available without user action

#### Scenario: Store initialization failure
- **WHEN** local storage initialization fails
- **THEN** the UI displays a recoverable error instead of silently losing user actions
