export type BookmarkSource = 'x-bookmarks-page' | 'manual-import';

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
}

export type ThemePreference = 'light' | 'dark' | 'system';
export type ExportFormat = 'json' | 'markdown' | 'csv';

export interface Settings {
  theme: ThemePreference;
  defaultExportFormat: ExportFormat;
  language: 'en';
  autoSync: boolean;
  syncIntervalMinutes: number;
}

export type LicenseValidationStatus = 'valid' | 'invalid' | 'offline' | 'unknown';

export interface LicenseData {
  pro: boolean;
  licenseKey: string;
  instanceId: string;
  email: string;
  activatedAt: string | null;
  expiresAt: string | null;
  lastValidatedAt: string | null;
  validationStatus: LicenseValidationStatus;
}

export type ExtensionMessage =
  | { type: 'OPEN_APP' }
  | { type: 'OPEN_UPGRADE' }
  | { type: 'START_X_IMPORT'; mode?: 'visible' | 'auto-scroll' }
  | { type: 'GET_IMPORT_DIAGNOSTICS' }
  | { type: 'CAPTURE_X_BOOKMARKS_REQUEST'; payload: CapturedBookmarksRequest }
  | { type: 'GET_LOADED_X_BOOKMARKS'; tweetIds?: string[]; autoScroll?: boolean }
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
  missingTweetIdSample?: string[];
  session?: Pick<ImportSession, 'foundCount' | 'insertedCount' | 'updatedCount' | 'duplicateCount' | 'failedCount' | 'status'>;
  error?: string;
}
