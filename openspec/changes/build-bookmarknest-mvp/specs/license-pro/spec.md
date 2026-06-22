## ADDED Requirements

### Requirement: Free and Pro visibility rules
The system SHALL let free users store more than 200 bookmarks locally but only view, search, organize, bulk manage, and export the recent 200 undeleted bookmarks.

#### Scenario: Free user exceeds limit
- **WHEN** a free user imports more than 200 undeleted bookmarks
- **THEN** only the recent 200 are manageable and the UI explains the Pro upgrade value

#### Scenario: Pro activation restores visibility
- **WHEN** a user activates Pro after importing more than 200 bookmarks
- **THEN** all undeleted local bookmarks become visible and manageable

#### Scenario: Pro loss keeps data
- **WHEN** Pro becomes invalid or the user deactivates the license
- **THEN** the app returns to free visibility rules without deleting local bookmarks

### Requirement: Upgrade page and checkout
The extension SHALL provide an upgrade page with Free vs Pro comparison, one-time purchase messaging, Creem checkout entry, license activation, active status, deactivation, and support contact.

#### Scenario: Checkout starts
- **WHEN** the user selects the purchase action
- **THEN** the extension opens the configured Creem checkout URL

#### Scenario: Active license shown
- **WHEN** the local license state is valid
- **THEN** the upgrade page displays active Pro status

### Requirement: License lifecycle
The extension SHALL activate, validate, and deactivate licenses through Worker endpoints without storing Creem API keys in the extension.

#### Scenario: Activate license
- **WHEN** the user submits a valid license key
- **THEN** the extension stores valid Pro license state locally

#### Scenario: Validate stale license
- **WHEN** the management app opens and last validation is older than 7 days
- **THEN** the extension validates the license in the background

#### Scenario: Offline validation
- **WHEN** validation cannot reach the network for an already activated license
- **THEN** the user keeps Pro access and the state is marked offline

#### Scenario: Invalid license
- **WHEN** the Worker reports the license is revoked, invalid, or over device limit
- **THEN** the extension returns to free rules and shows a clear status

#### Scenario: Deactivate license
- **WHEN** the user deactivates a license successfully
- **THEN** local license state is cleared and bookmark data remains
