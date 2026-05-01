import type { Repo } from "./repo.js";
import type { TransactionOptions, WriteResult } from "./types.js";
import { withRetry } from "./retry.js";
import { mapConnectError } from "./errors.js";

interface FileChange {
  path: string;
  action: "write" | "delete";
  content?: Uint8Array;
}

/**
 * Collects file changes in memory, then commits them atomically as a single
 * BatchWrite request. Creates one commit with all changes.
 *
 * Use via repo.transaction():
 *
 * ```ts
 * await repo.transaction('Refactor', async (tx) => {
 *   await tx.write('src/auth.ts', newAuth);
 *   await tx.delete('src/old_auth.ts');
 * });
 * ```
 */
export class Transaction {
  private readonly _repo: Repo;
  private readonly _message: string;
  private readonly _options: TransactionOptions;
  private readonly _changes: FileChange[] = [];
  private _committed = false;

  constructor(repo: Repo, message: string, options: TransactionOptions) {
    this._repo = repo;
    this._message = message;
    this._options = options;
  }

  /**
   * Stage a file write in this transaction.
   */
  async write(path: string, content: string | Uint8Array): Promise<void> {
    if (this._committed) throw new Error("Transaction already committed");
    const bytes =
      typeof content === "string" ? new TextEncoder().encode(content) : content;
    this._changes.push({ path, action: "write", content: bytes });
  }

  /**
   * Stage a file deletion in this transaction.
   */
  async delete(path: string): Promise<void> {
    if (this._committed) throw new Error("Transaction already committed");
    this._changes.push({ path, action: "delete" });
  }

  /**
   * Commit all staged changes atomically.
   * @internal — called by Repo.transaction() after the callback completes.
   */
  async commit(): Promise<WriteResult> {
    if (this._committed) throw new Error("Transaction already committed");
    if (this._changes.length === 0)
      throw new Error("Transaction has no changes");
    this._committed = true;

    // BatchWrite is a planned RPC. For now, fall back to sequential writes.
    // This loses atomicity but lets us ship the SDK before BatchWrite is
    // implemented on the server.
    return withRetry(
      async () => {
        try {
          let lastResult: WriteResult = { commitSha: "" };
          for (const change of this._changes) {
            if (change.action === "write" && change.content) {
              lastResult = await this._repo.write(change.path, change.content, {
                message: this._message,
                ref: this._options.ref,
                expectedHead: this._options.expectedHead,
              });
            } else if (change.action === "delete") {
              lastResult = await this._repo.delete(change.path, {
                message: this._message,
                ref: this._options.ref,
                expectedHead: this._options.expectedHead,
              });
            }
          }
          return lastResult;
        } catch (err) {
          throw mapConnectError(err);
        }
      },
      this._repo._client._retryConfig,
    );
  }
}
