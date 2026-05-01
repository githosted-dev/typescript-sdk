import type { Client } from "./client.js";
import { Transaction } from "./transaction.js";
import { mapConnectError } from "./errors.js";
import { withRetry } from "./retry.js";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import {
  normalizeRepoRef,
  type RepoRef,
  type RepoInfo,
  type FileEntry,
  type FileResult,
  type ReadOptions,
  type WriteOptions,
  type WriteResult,
  type CommitEntry,
  type LogOptions,
  type DiffResult,
  type BranchEntry,
  type CreateBranchOptions,
  type MergeOptions,
  type MergeResult,
  type TransactionOptions,
} from "./types.js";

/**
 * A handle to a githosted repo. Provides the Level 3 (filesystem) and
 * Level 2 (git) APIs.
 *
 * Created via client.repo() or client.createRepo().
 */
export class Repo {
  /** @internal */
  readonly _client: Client;
  /** @internal */
  readonly _ref: RepoRef;
  /** @internal */
  readonly _repoRef: string;

  /** Repo metadata, populated after createRepo or getRepo. */
  readonly info: RepoInfo | undefined;

  constructor(client: Client, ref: RepoRef, info?: RepoInfo) {
    this._client = client;
    this._ref = ref;
    this._repoRef = normalizeRepoRef(ref);
    this.info = info;
  }

  /** The stable repo ID if available. */
  get id(): string | undefined {
    if (typeof this._ref === "object") return this._ref.id;
    return this.info?.id;
  }

  // ── Level 3: Filesystem API ──

  /**
   * List files and directories at a path.
   */
  async ls(path: string = "", options: ReadOptions = {}): Promise<FileEntry[]> {
    try {
      const res = await this._client._repoService.listFiles({
        workspaceRef: "",
        repoRef: this._repoRef,
        ref: options.ref ?? "",
        path,
      });
      return res.entries.map((e) => ({
        name: e.name,
        type: e.type === "tree" ? ("directory" as const) : ("file" as const),
      }));
    } catch (err) {
      throw mapConnectError(err);
    }
  }

  /**
   * Read a file's content and metadata.
   * Returns headSha for use in subsequent writes with optimistic concurrency.
   */
  async read(path: string, options: ReadOptions = {}): Promise<FileResult> {
    try {
      const res = await this._client._repoService.readFile({
        workspaceRef: "",
        repoRef: this._repoRef,
        ref: options.ref ?? "",
        path,
      });
      // headSha and blobSha will be added to the proto response in a future
      // server release. Until then, extract them from the response if present.
      const resAny = res as Record<string, unknown>;
      return {
        content: new TextDecoder().decode(res.content),
        rawContent: res.content,
        headSha: (typeof resAny["headSha"] === "string" ? resAny["headSha"] : "") as string,
        blobSha: (typeof resAny["sha"] === "string" ? resAny["sha"] : "") as string,
      };
    } catch (err) {
      throw mapConnectError(err);
    }
  }

  /**
   * Write a file. Creates a commit on the target branch.
   * Pass expectedHead for optimistic concurrency.
   */
  async write(
    path: string,
    content: string | Uint8Array,
    options: WriteOptions,
  ): Promise<WriteResult> {
    const contentBytes =
      typeof content === "string" ? new TextEncoder().encode(content) : content;

    return withRetry(
      async () => {
        try {
          const res = await this._client._repoService.writeFile({
            workspaceRef: "",
            repoRef: this._repoRef,
            branch: options.ref ?? "",
            path,
            content: contentBytes,
            message: options.message,
            authorName: "",
            authorEmail: "",
          });
          return { commitSha: res.commit };
        } catch (err) {
          throw mapConnectError(err);
        }
      },
      this._client._retryConfig,
    );
  }

  /**
   * Delete a file. Creates a commit on the target branch.
   */
  async delete(path: string, options: WriteOptions): Promise<WriteResult> {
    // DeleteFile is a planned RPC — for now, write empty content as a placeholder.
    // The actual implementation will use a dedicated DeleteFile RPC.
    return this.write(path, new Uint8Array(0), options);
  }

  /**
   * Execute a transaction — multiple file changes committed atomically.
   * The callback receives a Transaction object to collect changes.
   */
  async transaction(
    message: string,
    fn: (tx: Transaction) => Promise<void>,
    options: TransactionOptions = {},
  ): Promise<WriteResult> {
    const tx = new Transaction(this, message, options);
    await fn(tx);
    return tx.commit();
  }

  // ── Level 2: Git API ──

  /**
   * Get the commit log for the repo.
   */
  async log(options: LogOptions = {}): Promise<CommitEntry[]> {
    try {
      const res = await this._client._repoService.log({
        workspaceRef: "",
        repoRef: this._repoRef,
        ref: options.ref ?? "",
        path: options.path ?? "",
        limit: options.limit ?? 0,
      });
      return res.commits.map((c) => ({
        hash: c.hash,
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        committedAt: c.committedAt ? timestampDate(c.committedAt) : new Date(0),
        subject: c.subject,
      }));
    } catch (err) {
      throw mapConnectError(err);
    }
  }

  /**
   * Get a diff between two refs.
   */
  async diff(baseRef: string, headRef: string): Promise<DiffResult> {
    try {
      const res = await this._client._repoService.diff({
        workspaceRef: "",
        repoRef: this._repoRef,
        base: baseRef,
        head: headRef,
        path: "",
      });
      return { patch: res.patch };
    } catch (err) {
      throw mapConnectError(err);
    }
  }

  /**
   * Create a new branch.
   */
  async createBranch(
    _name: string,
    _options: CreateBranchOptions = {},
  ): Promise<BranchEntry> {
    // CreateBranch is a planned RPC — stub for now
    throw new Error("createBranch not yet implemented on the server");
  }

  /**
   * List branches.
   */
  async listBranches(): Promise<BranchEntry[]> {
    // ListBranches is a planned RPC — stub for now
    throw new Error("listBranches not yet implemented on the server");
  }

  /**
   * Delete a branch.
   */
  async deleteBranch(_name: string): Promise<void> {
    // DeleteBranch is a planned RPC — stub for now
    throw new Error("deleteBranch not yet implemented on the server");
  }

  /**
   * Merge a branch into another.
   */
  async merge(
    _source: string,
    _options: MergeOptions,
  ): Promise<MergeResult> {
    // MergeBranch is a planned RPC — stub for now
    throw new Error("merge not yet implemented on the server");
  }
}
