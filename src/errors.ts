import { ConnectError, Code } from "@connectrpc/connect";
import {
  RepoBusyDetailSchema,
  StaleHeadDetailSchema,
} from "./gen/githosted/v1/errors_pb.js";

/**
 * Thrown when the requested resource (repo, file, branch, ...) does not exist.
 */
export class NotFoundError extends Error {
  readonly code = "not_found";

  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Thrown when a repo is currently being mutated by another operation.
 * The SDK auto-retries with exponential backoff before surfacing this error.
 */
export class RepoBusyError extends Error {
  readonly code = "repo_busy";
  readonly repoId: string;
  readonly operation: string;

  constructor(repoId: string, operation: string) {
    super(
      `Repository ${repoId} is currently being updated by another operation (${operation})`,
    );
    this.name = "RepoBusyError";
    this.repoId = repoId;
    this.operation = operation;
  }
}

/**
 * Thrown when the branch tip has moved past the expected SHA.
 * Contains actualHead so callers can re-read and decide how to proceed.
 * Never auto-retried — the caller must handle this explicitly.
 */
export class StaleHeadError extends Error {
  readonly code = "stale_head";
  readonly repoId: string;
  readonly ref: string;
  readonly expectedHead: string;
  readonly actualHead: string;

  constructor(
    repoId: string,
    ref: string,
    expectedHead: string,
    actualHead: string,
  ) {
    super(
      `Branch ${ref} has moved: expected ${expectedHead}, actual ${actualHead}`,
    );
    this.name = "StaleHeadError";
    this.repoId = repoId;
    this.ref = ref;
    this.expectedHead = expectedHead;
    this.actualHead = actualHead;
  }
}

/**
 * Maps a ConnectError to a typed SDK error if it matches a known error detail.
 * Returns the original error if no known detail is found.
 */
export function mapConnectError(err: unknown): Error {
  if (!(err instanceof ConnectError)) {
    return err instanceof Error ? err : new Error(String(err));
  }

  if (err.code === Code.NotFound) {
    return new NotFoundError(err.message || "not found");
  }

  if (err.code === Code.Aborted) {
    const details = err.findDetails(RepoBusyDetailSchema);
    if (details.length > 0) {
      const d = details[0];
      return new RepoBusyError(d.repoId, d.operation);
    }
  }

  if (err.code === Code.FailedPrecondition) {
    const details = err.findDetails(StaleHeadDetailSchema);
    if (details.length > 0) {
      const d = details[0];
      return new StaleHeadError(
        d.repoId,
        d.ref,
        d.expectedHead,
        d.actualHead,
      );
    }
  }

  return err;
}

/**
 * Checks if an error is a not-found error.
 */
export function isNotFoundError(err: unknown): err is NotFoundError {
  return err instanceof NotFoundError;
}

/**
 * Checks if an error is a repo_busy error (suitable for auto-retry).
 */
export function isRepoBusyError(err: unknown): err is RepoBusyError {
  return err instanceof RepoBusyError;
}

/**
 * Checks if an error is a stale head error (requires caller intervention).
 */
export function isStaleHeadError(err: unknown): err is StaleHeadError {
  return err instanceof StaleHeadError;
}
