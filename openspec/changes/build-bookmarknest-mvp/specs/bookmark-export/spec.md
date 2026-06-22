## ADDED Requirements

### Requirement: Free JSON export
The system SHALL allow free users to export a JSON backup for the recent 200 manageable undeleted bookmarks and their folder/tag relationships.

#### Scenario: Free JSON export
- **WHEN** a free user exports JSON
- **THEN** a JSON file downloads containing only the recent 200 manageable undeleted bookmarks and related folders/tags

### Requirement: Pro Markdown and CSV export
The system SHALL allow Pro users to export eligible bookmarks as Markdown or CSV, including all bookmarks or the current filtered result.

#### Scenario: Pro full CSV export
- **WHEN** a Pro user exports all bookmarks as CSV
- **THEN** a CSV file downloads containing all eligible non-deleted bookmarks

#### Scenario: Pro filtered Markdown export
- **WHEN** a Pro user exports current filtered results as Markdown
- **THEN** a Markdown file downloads matching the current visible filter scope

### Requirement: Export exclusions and empty states
The system SHALL exclude deleted bookmarks from all exports and SHALL exclude archived bookmarks unless the current filter includes archived items.

#### Scenario: Deleted excluded
- **WHEN** a deleted bookmark exists
- **THEN** it is not included in export output

#### Scenario: Empty result
- **WHEN** the current export scope contains no bookmarks
- **THEN** export is disabled or a clear no-content message is shown

### Requirement: Export formatting
The system SHALL produce CSV with correct comma, quote, and newline escaping and Markdown with empty tag/folder fallbacks.

#### Scenario: CSV escaping
- **WHEN** exported content contains commas, double quotes, or newlines
- **THEN** the generated CSV remains valid

#### Scenario: Markdown fallbacks
- **WHEN** an exported bookmark has no tags or folder
- **THEN** Markdown shows `Tags: None` and places it under `Uncategorized`
