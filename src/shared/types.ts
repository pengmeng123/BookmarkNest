export type BookmarkSource = 'x-bookmarks-page' | 'manual-import';
export type BookmarkSortKey = 'source' | 'date-posted' | 'date-imported' | 'author';
export type BookmarkFocusFilter = 'all' | 'with-notes' | 'without-notes' | 'with-media' | 'unfiled' | 'export-queue';

export interface Bookmark {
  id: string;
  tweetId?: string;
  tweetUrl?: string;
  authorId?: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl?: string;
  contentText: string;
  mediaUrls: string[];
  createdAtText?: string;
  createdAt?: number;
  importedAt: number;
  sourceOrder?: number;
  updatedAt: number;
  note?: string;
  noteUpdatedAt?: number;
  markedForExport?: boolean;
  exportMarkedAt?: number;
  folderId?: string;
  tagIds: string[];
  archived: boolean;
  deleted: boolean;
  deletedAt?: number;
  dedupeKey: string;
  source: BookmarkSource;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sortOrder: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

export interface SavedView {
  id: string;
  name: string;
  query: string;
  sortKey: BookmarkSortKey;
  focus?: BookmarkFocusFilter;
  authorQuery?: string;
  folderId?: string | null;
  tagId?: string | null;
  includeArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ImportSessionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface ImportSession {
  id: string;
  startedAt: number;
  finishedAt?: number;
  sourceUrl: string;
  foundCount: number;
  insertedCount: number;
  updatedCount: number;
  duplicateCount: number;
  failedCount: number;
  status: ImportSessionStatus;
}

export interface ImportPayload {
  sourceUrl: string;
  bookmarks: BookmarkInput[];
  foundCount: number;
  failedCount: number;
  // True only when `bookmarks` is the complete, authoritative X bookmark set
  // (full pagination reached its natural end). Required before mirror-removal
  // may soft-delete local bookmarks missing from the set.
  mirrorComplete?: boolean;
}

export type ThemePreference = 'light' | 'dark' | 'system';
export type ExportFormat = 'json' | 'markdown' | 'csv';
export type CloudSyncPhase = 'idle' | 'syncing' | 'protected' | 'attention';

export interface Settings {
  theme: ThemePreference;
  defaultExportFormat: ExportFormat;
  language: 'en';
  autoSync: boolean;
  syncIntervalMinutes: number;
  cloudSyncEnabled: boolean;
  cloudSyncIntervalMinutes: number;
  cloudSyncDeviceName?: string;
  // When true, a complete import soft-deletes local X bookmarks that are no
  // longer present on x.com (i.e. were un-bookmarked there). Default off.
  mirrorRemovals: boolean;
}

export type LicenseValidationStatus = 'valid' | 'invalid' | 'offline' | 'unknown';
export type LicensePlan = 'monthly' | 'annual' | 'lifetime' | 'unknown';

// Outcome of the most recent X sync (auto or manual API import). Persisted so
// the popup can surface silent background failures instead of just going stale.
export interface LastSyncStatus {
  at: number;
  ok: boolean;
  inserted?: number;
  updated?: number;
  duplicate?: number;
  failed?: number;
  removed?: number;
  found?: number;
  visibleBookmarkCount?: number;
  totalStoredBookmarkCount?: number;
  error?: string;
}

export interface AutoSyncStatus {
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt?: number;
}

export interface LastBackupStatus {
  at: number;
  bookmarkCount: number;
  savedViewCount: number;
  filename: string;
}

export interface CloudSyncStatus {
  phase: CloudSyncPhase;
  enabled: boolean;
  lastRunAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  remoteSnapshotId?: string;
  lastSnapshotHash?: string;
  lastUploadResult?: 'uploaded' | 'unchanged' | 'rate-limited';
  bookmarkCount?: number;
  savedViewCount?: number;
  nextRunAt?: number;
}

export interface CloudSyncSnapshotSummary {
  id: string;
  createdAt: number;
  bookmarkCount: number;
  savedViewCount: number;
  deviceName?: string;
}

export interface LicenseData {
  pro: boolean;
  licenseKey: string;
  instanceId: string;
  email: string;
  plan?: LicensePlan;
  activatedAt: string | null;
  expiresAt: string | null;
  lastValidatedAt: string | null;
  validationStatus: LicenseValidationStatus;
}

export type ExtensionMessage =
  | { type: 'OPEN_APP' }
  | { type: 'OPEN_UPGRADE' }
  | { type: 'START_X_IMPORT'; mode?: 'visible' | 'auto-scroll' }
  | { type: 'RUN_X_API_IMPORT' }
  | { type: 'GET_AUTO_SYNC_STATUS' }
  | { type: 'RUN_CLOUD_BACKUP' }
  | { type: 'RESTORE_CLOUD_BACKUP' }
  | { type: 'GET_IMPORT_DIAGNOSTICS' }
  | { type: 'CAPTURE_X_BOOKMARKS_REQUEST'; payload: CapturedBookmarksRequest }
  | { type: 'SAVE_IMPORTED_BOOKMARKS'; payload: ImportPayload }
  | { type: 'GET_ACTIVE_TAB_IMPORT_STATE' };

export interface MessageResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface BookmarkInput {
  tweetId?: string;
  tweetUrl?: string;
  authorId?: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl?: string;
  contentText: string;
  mediaUrls?: string[];
  createdAtText?: string;
  createdAt?: number;
  sourceOrder?: number;
  source: BookmarkSource;
}

export interface CapturedBookmarksRequest {
  url: string;
  operationName?: 'Bookmarks';
  queryId?: string;
  features?: string;
  variables?: string;
  headers: Record<string, string>;
}

export interface ImportDiagnostics {
  exportedAt: string;
  extensionVersion: string;
  createdAt?: string;
  reason?: string;
  status?: ImportSessionStatus | 'failed';
  source?: string;
  page?: number;
  queryId?: string | null;
  apiFoundCount?: number;
  domMatchedCount?: number;
  avatarMatchedCount?: number;
  missingAvatarCount?: number;
  missingAuthorCount?: number;
  visibleBookmarkCount?: number;
  totalStoredBookmarkCount?: number;
  missingTweetIdSample?: string[];
  session?: Pick<ImportSession, 'foundCount' | 'insertedCount' | 'updatedCount' | 'duplicateCount' | 'failedCount' | 'status'>;
  error?: string;
}
