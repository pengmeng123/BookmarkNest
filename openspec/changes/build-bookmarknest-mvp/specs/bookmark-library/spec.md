## ADDED Requirements

### Requirement: Bookmark list management
The management app SHALL list non-deleted bookmarks with author, handle, content summary, tags, folder, imported time, source link, and quick actions.

#### Scenario: Default list
- **WHEN** the user opens the management app with stored bookmarks
- **THEN** the default list shows non-deleted and non-archived manageable bookmarks

#### Scenario: Open source tweet
- **WHEN** the user selects the original tweet link
- **THEN** the extension opens the stored tweet URL

### Requirement: Folder organization
The management app SHALL support single-level folders, uncategorized bookmarks, create, rename, delete, and move actions.

#### Scenario: Delete folder
- **WHEN** the user deletes a folder
- **THEN** bookmarks in that folder move to uncategorized and are not deleted

#### Scenario: Move bookmark to folder
- **WHEN** the user moves a bookmark to a folder
- **THEN** the bookmark stores that folder as its only folder

### Requirement: Tag organization
The management app SHALL support multiple tags per bookmark, tag creation, autocomplete, removal, usage counts, filtering, and batch add.

#### Scenario: Add tag
- **WHEN** the user adds a tag to a bookmark
- **THEN** the bookmark references the tag and the tag usage count reflects the change

#### Scenario: Delete tag
- **WHEN** the user deletes a tag
- **THEN** the tag is removed from all bookmarks

### Requirement: Archive and delete semantics
The management app SHALL hide archived bookmarks from the default list, soft-delete individual bookmarks, and hard-delete all local domain data only through data reset.

#### Scenario: Archive bookmark
- **WHEN** the user archives a bookmark
- **THEN** it is hidden from the default list and visible in the archive filter

#### Scenario: Delete bookmark
- **WHEN** the user deletes a bookmark
- **THEN** it is marked deleted and excluded from default list, search, and export

#### Scenario: Clear local data
- **WHEN** the user confirms clearing local data
- **THEN** bookmarks, folders, tags, import sessions, and search metadata are removed from IndexedDB

### Requirement: Bulk actions
The management app SHALL expose bulk actions only after one or more bookmarks are selected.

#### Scenario: No selection
- **WHEN** no bookmarks are selected
- **THEN** bulk actions are not shown

#### Scenario: Batch move
- **WHEN** the user selects multiple bookmarks and moves them to a folder
- **THEN** each selected bookmark is assigned to that folder
