// React entrypoint — @githosted/sdk/react

// Provider
export { GithostedProvider, type GithostedProviderProps } from "./provider.js";

// Query hooks
export {
  useFileTree,
  useFile,
  useJsonFile,
  useCommitLog,
  useBranches,
  type UseJsonFileOptions,
  type UseJsonFileResult,
} from "./hooks.js";

// Mutation hooks
export {
  useWriteFile,
  useWriteJsonFile,
  useDeleteFile,
  useTransaction,
  type WriteFileMutationArgs,
  type WriteJsonFileMutationArgs,
  type UseWriteJsonFileOptions,
  type DeleteFileMutationArgs,
  type TransactionMutationArgs,
} from "./hooks.js";

// Re-export core types that hooks consume
export type {
  RepoRef,
  FileEntry,
  FileResult,
  ReadOptions,
  WriteOptions,
  WriteResult,
  CommitEntry,
  LogOptions,
  BranchEntry,
} from "../types.js";

// Re-export error types for onError callbacks
export {
  NotFoundError,
  RepoBusyError,
  StaleHeadError,
  isNotFoundError,
  isRepoBusyError,
  isStaleHeadError,
} from "../errors.js";
