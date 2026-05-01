import { useContext, useCallback, useMemo } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { GithostedContext, type GithostedContextValue } from "./context.js";
import type {
  RepoRef,
  ReadOptions,
  LogOptions,
  WriteResult,
} from "../types.js";
import { repoRefKey } from "../types.js";
import { isNotFoundError } from "../errors.js";

function useGithosted(): GithostedContextValue {
  const ctx = useContext(GithostedContext);
  if (!ctx) {
    throw new Error(
      "useGithosted: GithostedProvider not found. Wrap your component tree with <GithostedProvider>.",
    );
  }
  return ctx;
}

function buildKey(
  scope: string,
  repoRef: RepoRef,
  hook: string,
  ...params: unknown[]
): unknown[] {
  return ["githosted", scope, repoRefKey(repoRef), hook, ...params];
}

// ── Query Hooks ──

/**
 * List files at a path in a repo.
 */
export function useFileTree(
  repoRef: RepoRef,
  path: string = "",
  options: ReadOptions & { enabled?: boolean } = {},
) {
  const { client, clientScope, onError } = useGithosted();
  const repo = client.repo(repoRef);

  return useQuery({
    queryKey: buildKey(clientScope, repoRef, "fileTree", path, options.ref),
    queryFn: async () => {
      try {
        return await repo.ls(path, { ref: options.ref });
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    enabled: options.enabled,
  });
}

/**
 * Read a file's content and metadata.
 * Returns { content, headSha, blobSha }.
 */
export function useFile(
  repoRef: RepoRef,
  path: string,
  options: ReadOptions & { enabled?: boolean } = {},
) {
  const { client, clientScope, onError } = useGithosted();
  const repo = client.repo(repoRef);

  return useQuery({
    queryKey: buildKey(clientScope, repoRef, "file", path, options.ref),
    queryFn: async () => {
      try {
        return await repo.read(path, { ref: options.ref });
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    enabled: options.enabled,
  });
}

export interface UseJsonFileOptions<T> extends ReadOptions {
  enabled?: boolean;
  /**
   * Value returned when the file does not exist (NotFoundError). If
   * omitted, the not-found error bubbles up via `error`. Accepts either
   * a plain value or a factory — the factory is only called when the
   * not-found branch fires.
   */
  defaultValue?: T | (() => T);
  /**
   * Optional schema validator run on the JSON-parsed value. Pass a
   * Zod, Valibot, io-ts, etc. schema's parse function to get runtime
   * validation and type inference — the hook's `T` is inferred from
   * the validator's return type. If omitted, the parsed JSON is cast
   * to `T` unchecked.
   *
   * Must be referentially stable across renders (define at module
   * scope, or wrap in `useCallback`).
   */
  parse?: (value: unknown) => T;
}

export interface UseJsonFileResult<T> {
  /** Parsed and (optionally) validated value, or the defaultValue, or undefined. */
  data: T | undefined;
  /** Any underlying read error or schema-validation error. Null when the file is not found and a defaultValue was supplied. */
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  /** Branch tip at read time. Pass to a subsequent write as expectedHead for optimistic concurrency. */
  headSha: string | undefined;
  /** Refetch the underlying file. */
  refetch: () => void;
}

/**
 * Read a file's JSON contents, optionally validated by a schema.
 *
 * Compared with `useFile`, this hook:
 * - Calls `JSON.parse` on the content.
 * - Runs an optional `parse` validator (pass a schema's parse function
 *   for runtime validation + type inference).
 * - Substitutes a `defaultValue` when the file does not exist, so the
 *   not-found case doesn't have to be handled at every call site.
 *
 * Example (no validation):
 *
 * ```ts
 * const todos = useJsonFile<Todo[]>("todo-cli", "todos.json", {
 *   defaultValue: [],
 * });
 * ```
 *
 * Example (with Zod):
 *
 * ```ts
 * const Todos = z.array(z.object({ id: z.number(), text: z.string() }));
 * const todos = useJsonFile("todo-cli", "todos.json", {
 *   parse: (v) => Todos.parse(v),
 *   defaultValue: [],
 * });
 * // todos.data is Todo[] | undefined — type inferred from the schema.
 * ```
 */
export function useJsonFile<T = unknown>(
  repoRef: RepoRef,
  path: string,
  options: UseJsonFileOptions<T> = {},
): UseJsonFileResult<T> {
  const fileQuery = useFile(repoRef, path, {
    ref: options.ref,
    enabled: options.enabled,
  });

  const hasDefault = options.defaultValue !== undefined;
  const notFound = isNotFoundError(fileQuery.error);
  const swallowedError = notFound && hasDefault;

  const parse = options.parse;
  const fileContent = fileQuery.data?.content;

  const parsed = useMemo<{ data: T | undefined; error: Error | null }>(() => {
    if (fileContent === undefined) return { data: undefined, error: null };
    try {
      const raw = JSON.parse(fileContent) as unknown;
      return {
        data: parse ? parse(raw) : (raw as T),
        error: null,
      };
    } catch (err) {
      return {
        data: undefined,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }, [fileContent, parse]);

  let data = parsed.data;
  if (data === undefined && swallowedError) {
    const dv = options.defaultValue as T | (() => T);
    data = typeof dv === "function" ? (dv as () => T)() : dv;
  }

  const error =
    parsed.error ??
    (swallowedError ? null : (fileQuery.error as Error | null));

  return {
    data,
    error,
    isLoading: fileQuery.isLoading && !swallowedError,
    isFetching: fileQuery.isFetching,
    headSha: fileQuery.data?.headSha,
    refetch: () => {
      void fileQuery.refetch();
    },
  };
}

/**
 * Get the commit log for a repo. Returns an infinite query with cursor pagination.
 */
export function useCommitLog(
  repoRef: RepoRef,
  options: LogOptions & { enabled?: boolean } = {},
) {
  const { client, clientScope, onError } = useGithosted();
  const repo = client.repo(repoRef);

  return useQuery({
    queryKey: buildKey(
      clientScope,
      repoRef,
      "commitLog",
      options.ref,
      options.path,
      options.limit,
    ),
    queryFn: async () => {
      try {
        return await repo.log(options);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    enabled: options.enabled,
  });
}

/**
 * List branches for a repo.
 */
export function useBranches(
  repoRef: RepoRef,
  options: { enabled?: boolean } = {},
) {
  const { client, clientScope, onError } = useGithosted();
  const repo = client.repo(repoRef);

  return useQuery({
    queryKey: buildKey(clientScope, repoRef, "branches"),
    queryFn: async () => {
      try {
        return await repo.listBranches();
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    },
    enabled: options.enabled,
  });
}

// ── Mutation Hooks ──

/** Invalidate all queries that could be affected by a write to a repo. */
function useInvalidateOnWrite(repoRef: RepoRef) {
  const { clientScope } = useGithosted();
  const queryClient = useQueryClient();
  const repoKey = repoRefKey(repoRef);

  return useCallback(() => {
    const prefix = ["githosted", clientScope, repoKey];
    // Invalidate file tree, file content, commit log, and branches
    queryClient.invalidateQueries({ queryKey: [...prefix, "fileTree"] });
    queryClient.invalidateQueries({ queryKey: [...prefix, "file"] });
    queryClient.invalidateQueries({ queryKey: [...prefix, "commitLog"] });
    queryClient.invalidateQueries({ queryKey: [...prefix, "branches"] });
  }, [clientScope, repoKey, queryClient]);
}

export interface WriteFileMutationArgs {
  path: string;
  content: string | Uint8Array;
  message: string;
  ref?: string;
  expectedHead?: string;
}

/**
 * Mutation hook for writing a file. Automatically invalidates file tree,
 * file content, commit log, and branch caches on success.
 */
export function useWriteFile(repoRef: RepoRef) {
  const { client, onError } = useGithosted();
  const repo = client.repo(repoRef);
  const invalidate = useInvalidateOnWrite(repoRef);

  return useMutation({
    mutationFn: async (args: WriteFileMutationArgs) => {
      try {
        return await repo.write(args.path, args.content, {
          message: args.message,
          ref: args.ref,
          expectedHead: args.expectedHead,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        throw err;
      }
    },
    onSuccess: () => {
      invalidate();
    },
  });
}

export interface WriteJsonFileMutationArgs<T> {
  path: string;
  value: T;
  message: string;
  ref?: string;
  expectedHead?: string;
}

export interface UseWriteJsonFileOptions<T> {
  /**
   * Serialize `value` into the string body written to the file.
   * Defaults to `JSON.stringify(value, null, 2) + "\n"` — human-diff-
   * friendly and trailing-newline-clean.
   *
   * Pass a schema's serializer here when you want to strip unknown
   * fields on write (e.g. `(v) => JSON.stringify(Schema.parse(v), null, 2)`).
   */
  serialize?: (value: T) => string;
}

function defaultJsonSerialize<T>(value: T): string {
  return JSON.stringify(value, null, 2) + "\n";
}

/**
 * Mutation hook for writing a file whose contents are JSON.
 *
 * Thin wrapper over `useWriteFile` that serializes `value` for you.
 * Pair with `useJsonFile` to avoid hand-rolled `JSON.parse` /
 * `JSON.stringify` plumbing at every call site.
 *
 * ```ts
 * const writeTodos = useWriteJsonFile<Todo[]>("todo-cli");
 * await writeTodos.mutateAsync({
 *   path: "todos.json",
 *   value: nextTodos,
 *   message: "Add todo",
 * });
 * ```
 */
export function useWriteJsonFile<T = unknown>(
  repoRef: RepoRef,
  options: UseWriteJsonFileOptions<T> = {},
) {
  const writeFile = useWriteFile(repoRef);
  const serialize = options.serialize ?? defaultJsonSerialize;

  const toFileArgs = useCallback(
    (args: WriteJsonFileMutationArgs<T>): WriteFileMutationArgs => ({
      path: args.path,
      content: serialize(args.value),
      message: args.message,
      ref: args.ref,
      expectedHead: args.expectedHead,
    }),
    [serialize],
  );

  const mutate = useCallback(
    (args: WriteJsonFileMutationArgs<T>) => writeFile.mutate(toFileArgs(args)),
    [writeFile, toFileArgs],
  );
  const mutateAsync = useCallback(
    (args: WriteJsonFileMutationArgs<T>): Promise<WriteResult> =>
      writeFile.mutateAsync(toFileArgs(args)),
    [writeFile, toFileArgs],
  );

  return { ...writeFile, mutate, mutateAsync };
}

export interface DeleteFileMutationArgs {
  path: string;
  message: string;
  ref?: string;
  expectedHead?: string;
}

/**
 * Mutation hook for deleting a file.
 */
export function useDeleteFile(repoRef: RepoRef) {
  const { client, onError } = useGithosted();
  const repo = client.repo(repoRef);
  const invalidate = useInvalidateOnWrite(repoRef);

  return useMutation({
    mutationFn: async (args: DeleteFileMutationArgs) => {
      try {
        return await repo.delete(args.path, {
          message: args.message,
          ref: args.ref,
          expectedHead: args.expectedHead,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        throw err;
      }
    },
    onSuccess: () => {
      invalidate();
    },
  });
}

export interface TransactionMutationArgs {
  message: string;
  changes: Array<
    | { action: "write"; path: string; content: string | Uint8Array }
    | { action: "delete"; path: string }
  >;
  ref?: string;
  expectedHead?: string;
}

/**
 * Mutation hook for executing a transaction (atomic multi-file commit).
 */
export function useTransaction(repoRef: RepoRef) {
  const { client, onError } = useGithosted();
  const repo = client.repo(repoRef);
  const invalidate = useInvalidateOnWrite(repoRef);

  return useMutation({
    mutationFn: async (args: TransactionMutationArgs) => {
      try {
        return await repo.transaction(
          args.message,
          async (tx) => {
            for (const change of args.changes) {
              if (change.action === "write") {
                await tx.write(change.path, change.content);
              } else {
                await tx.delete(change.path);
              }
            }
          },
          { ref: args.ref, expectedHead: args.expectedHead },
        );
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error);
        throw err;
      }
    },
    onSuccess: () => {
      invalidate();
    },
  });
}
