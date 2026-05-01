// Core SDK
export { Client } from "./client.js";
export { Repo } from "./repo.js";
export { Transaction } from "./transaction.js";

// Errors
export {
  NotFoundError,
  RepoBusyError,
  StaleHeadError,
  isNotFoundError,
  isRepoBusyError,
  isStaleHeadError,
} from "./errors.js";

// Types
export type {
  RepoRef,
  ClientOptions,
  ClientCallTelemetry,
  ClientTelemetryObserver,
  FileEntry,
  FileResult,
  ReadOptions,
  WriteOptions,
  WriteResult,
  TransactionOptions,
  CommitEntry,
  LogOptions,
  DiffResult,
  BranchEntry,
  CreateBranchOptions,
  MergeOptions,
  MergeResult,
  RepoInfo,
  ListReposOptions,
  ListReposResult,
  TokenInfo,
  CreateTokenOptions,
  CreateTokenResult,
  ExchangeTokenOptions,
  ListTokensOptions,
  ListTokensResult,
  RetryConfig,
} from "./types.js";

// Utilities
export { normalizeRepoRef, repoRefKey } from "./types.js";
