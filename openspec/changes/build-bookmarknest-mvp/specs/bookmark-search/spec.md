## ADDED Requirements

### Requirement: Local search fields
The system SHALL search locally across tweet content, author name, author handle, tag names, and folder name.

#### Scenario: Search content
- **WHEN** the user searches for text contained in a bookmark's content
- **THEN** that bookmark appears in the result list

#### Scenario: Search tag
- **WHEN** the user searches for an existing tag name
- **THEN** bookmarks with that tag can appear in the result list

### Requirement: Search matching rules
The system SHALL use case-insensitive multi-word AND matching for MVP search.

#### Scenario: Case-insensitive match
- **WHEN** the user searches with different letter casing than stored text
- **THEN** matching bookmarks are returned

#### Scenario: Multi-word AND
- **WHEN** the user searches for multiple words
- **THEN** only bookmarks matching every word across searchable fields are returned

#### Scenario: Handle with at sign
- **WHEN** the user searches for a handle with or without `@`
- **THEN** matching author handles are returned

### Requirement: Search scope and ordering
The system SHALL search only the current eligible scope and order default results by import time descending.

#### Scenario: Deleted excluded
- **WHEN** a bookmark is soft-deleted
- **THEN** it does not appear in search results

#### Scenario: Archived scoped
- **WHEN** a bookmark is archived and the user is not in the archive filter
- **THEN** it does not appear in search results

#### Scenario: Free scope
- **WHEN** a free user has more than 200 undeleted bookmarks
- **THEN** search only includes the recent 200 manageable bookmarks
