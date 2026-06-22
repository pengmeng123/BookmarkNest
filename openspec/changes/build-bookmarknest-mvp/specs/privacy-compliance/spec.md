## ADDED Requirements

### Requirement: Permission minimization
The extension SHALL request only permissions required for the MVP and SHALL avoid `<all_urls>`.

#### Scenario: MVP manifest permissions
- **WHEN** the extension manifest is built
- **THEN** permissions include local storage and downloads, plus clipboard only if copy-link behavior is implemented

#### Scenario: Host permissions
- **WHEN** the extension manifest is built
- **THEN** host permissions are limited to `https://x.com/*` and `https://twitter.com/*`

### Requirement: Local-first data handling
The extension SHALL store bookmark content, authors, media URLs, tags, and folders locally and SHALL NOT upload that content to a server.

#### Scenario: Import bookmark
- **WHEN** a bookmark is imported
- **THEN** its content and organization data are stored locally

#### Scenario: License request
- **WHEN** the extension calls the license Worker
- **THEN** the request includes only license and device activation data, not bookmark content

### Requirement: No remote executable code
The extension SHALL NOT load or execute remote scripts.

#### Scenario: Extension loads
- **WHEN** extension pages or content scripts run
- **THEN** executable code comes from the packaged extension bundle

### Requirement: Store listing accuracy
Chrome Web Store copy, screenshots, permissions explanation, and privacy policy SHALL match actual extension behavior.

#### Scenario: Import promise
- **WHEN** store copy describes import
- **THEN** it does not claim guaranteed one-click import of all historical X bookmarks

#### Scenario: Privacy policy
- **WHEN** the privacy policy is published
- **THEN** it describes local storage, license activation data flow, export, and deletion behavior
