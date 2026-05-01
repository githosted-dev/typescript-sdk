/** Reference to a repo — either a slug string or a stable ID object. */
export type RepoRef = string | { id: string };

/** Options for creating a Client. */
export interface ClientOptions {
  /** Workspace or repo token (gw_ or gr_ prefix). In Node.js, falls back to GITHOSTED_TOKEN env var. */
  token?: string;
  /** API base URL. Defaults to "https://api.githosted.dev". */
  baseUrl?: string;
  /** Optional client surface tag sent as X-Githosted-Client. */
  clientName?: string;
  /** Optional observer for per-call client-side telemetry. */
  onTelemetry?: ClientTelemetryObserver;
}

export interface ClientCallTelemetry {
  requestId: string;
  clientName: string;
  procedure: string;
  durationMs: number;
  outcome: "ok" | "error";
  errorMessage?: string;
}

export type ClientTelemetryObserver = (
  event: ClientCallTelemetry,
) => void;

/** A file entry returned by ls(). */
export interface FileEntry {
  name: string;
  type: "file" | "directory";
}

/** Result of reading a file — includes content and metadata for optimistic concurrency. */
export interface FileResult {
  /** File content as a string (UTF-8 decoded). */
  content: string;
  /** Raw file content as bytes. */
  rawContent: Uint8Array;
  /** SHA of the branch tip at read time. Pass back as expectedHead on writes. */
  headSha: string;
  /** Content-addressable hash of the blob. */
  blobSha: string;
}

/** Options for read operations. */
export interface ReadOptions {
  /** Branch or ref to read from. Defaults to the repo's default branch. */
  ref?: string;
}

/** Options for write operations. */
export interface WriteOptions {
  /** Commit message. */
  message: string;
  /** Target branch. Defaults to the repo's default branch. */
  ref?: string;
  /** Expected branch tip SHA for optimistic concurrency. */
  expectedHead?: string;
}

/** Options for transaction. */
export interface TransactionOptions {
  /** Target branch. Defaults to the repo's default branch. */
  ref?: string;
  /** Expected branch tip SHA for optimistic concurrency. */
  expectedHead?: string;
}

/** Result of a write operation. */
export interface WriteResult {
  /** SHA of the commit created by the write. */
  commitSha: string;
}

/** A commit entry from the log. */
export interface CommitEntry {
  hash: string;
  authorName: string;
  authorEmail: string;
  committedAt: Date;
  subject: string;
}

/** Options for log operations. */
export interface LogOptions {
  /** Branch or ref. Defaults to the repo's default branch. */
  ref?: string;
  /** Limit results to a specific file path. */
  path?: string;
  /** Maximum number of commits to return. */
  limit?: number;
}

/** A diff patch result. */
export interface DiffResult {
  patch: string;
}

/** A branch entry. */
export interface BranchEntry {
  name: string;
  sha: string;
  isDefault: boolean;
}

/** Options for creating a branch. */
export interface CreateBranchOptions {
  /** Ref to branch from. Defaults to the repo's default branch. */
  from?: string;
}

/** Options for merging a branch. */
export interface MergeOptions {
  /** Target branch to merge into. */
  into: string;
  /** Commit message for the merge. */
  message?: string;
}

/** Result of a merge operation. */
export interface MergeResult {
  commitSha: string;
}

/** Repo metadata returned by createRepo / getRepo. */
export interface RepoInfo {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  defaultBranch: string;
  createdAt: Date;
}

/** Options for listing repos. */
export interface ListReposOptions {
  pageSize?: number;
  pageToken?: string;
}

/** Paginated list result. */
export interface ListReposResult {
  repos: RepoInfo[];
  nextPageToken?: string;
}

/** Token info returned by listTokens / createToken. */
export interface TokenInfo {
  id: string;
  prefix: string;
  name: string;
  kind: "workspace" | "repo";
  organizationId: string;
  workspaceId: string;
  permission: "read" | "write";
  repoAllowlist: string[];
  createdAt: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  createdByUserId: string;
  createdByName: string;
  createdByTokenPrefix: string;
}

/** Result of creating a token — includes the raw token value (shown once). */
export interface CreateTokenResult {
  /** The raw token string (gw_ or gr_ prefix). Only returned at creation time. */
  token: string;
  /** Token metadata. */
  record: TokenInfo;
}

/** Options for creating a token. */
export interface CreateTokenOptions {
  name: string;
  kind?: "workspace" | "repo";
  permission?: "read" | "write";
  repoAllowlist?: string[];
  ttlHours?: number;
}

/** Options for exchanging a workspace token for a short-lived repo token. */
export interface ExchangeTokenOptions {
  /**
   * Repos the issued token is allowed to access. Required — exchange
   * tokens are always narrow-scoped.
   */
  repoAllowlist: string[];
  /**
   * Permission granted to the issued token. Defaults to "read". Cannot
   * exceed the parent token's permission.
   */
  permission?: "read" | "write";
  /**
   * TTL in seconds. 0 picks the server default (1h); clamped to the
   * server maximum (24h).
   */
  ttlSeconds?: number;
  /**
   * Optional opaque identifier for the end user/session the token is
   * being issued for. Stored on the token record for auditing.
   */
  subject?: string;
}

/** Options for listing tokens. */
export interface ListTokensOptions {
  pageSize?: number;
  pageToken?: string;
}

/** Paginated token list result. */
export interface ListTokensResult {
  tokens: TokenInfo[];
  nextPageToken?: string;
}

/** Retry configuration for repo_busy auto-retry. */
export interface RetryConfig {
  /** Maximum number of retries. Default: 3. */
  maxRetries: number;
  /** Base delay in ms for exponential backoff. Default: 100. */
  baseDelayMs: number;
}

/** Normalizes a RepoRef to the string used in RPC calls. */
export function normalizeRepoRef(ref: RepoRef): string {
  return typeof ref === "string" ? ref : ref.id;
}

/** Returns a stable string key for a RepoRef (for cache keys, etc.). */
export function repoRefKey(ref: RepoRef): string {
  return typeof ref === "string" ? `slug:${ref}` : `id:${ref.id}`;
}
