import { createClient, ConnectError, Code } from "@connectrpc/connect";
import type { Transport } from "@connectrpc/connect";
import { createTransport } from "./transport.js";
import { Repo } from "./repo.js";
import type {
  ClientOptions,
  RepoRef,
  RepoInfo,
  ListReposOptions,
  ListReposResult,
  CreateTokenOptions,
  CreateTokenResult,
  ExchangeTokenOptions,
  ListTokensOptions,
  ListTokensResult,
  TokenInfo,
  RetryConfig,
} from "./types.js";
import { mapConnectError, NotFoundError } from "./errors.js";
import { RepoService } from "./gen/githosted/v1/repo_pb.js";
import { ApiService } from "./gen/githosted/v1/api_pb.js";
import type { Repo as ProtoRepo, Token as ProtoToken } from "./gen/githosted/v1/types_pb.js";
import { TokenKind, Permission } from "./gen/githosted/v1/types_pb.js";
import { timestampDate } from "@bufbuild/protobuf/wkt";

const DEFAULT_BASE_URL = "https://api.githosted.dev";

function resolveToken(explicitToken?: string): string | undefined {
  if (explicitToken) return explicitToken;
  if (typeof process !== "undefined" && process.env?.GITHOSTED_TOKEN) {
    return process.env.GITHOSTED_TOKEN;
  }
  return undefined;
}

function protoRepoToInfo(r: ProtoRepo): RepoInfo {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    name: r.name,
    slug: r.slug,
    defaultBranch: r.defaultBranch,
    createdAt: r.createdAt ? timestampDate(r.createdAt) : new Date(0),
  };
}

function toTokenKind(kind?: "workspace" | "repo"): TokenKind {
  if (kind === "repo") return TokenKind.REPO;
  return TokenKind.WORKSPACE;
}

function toPermission(perm?: "read" | "write"): Permission {
  if (perm === "read") return Permission.READ;
  return Permission.WRITE;
}

function fromTokenKind(kind: TokenKind): "workspace" | "repo" {
  return kind === TokenKind.REPO ? "repo" : "workspace";
}

function fromPermission(perm: Permission): "read" | "write" {
  return perm === Permission.READ ? "read" : "write";
}

function protoTokenToInfo(t: ProtoToken): TokenInfo {
  return {
    id: t.id,
    prefix: t.prefix,
    name: t.name,
    kind: fromTokenKind(t.kind),
    organizationId: t.organizationId,
    workspaceId: t.workspaceId,
    permission: fromPermission(t.permission),
    repoAllowlist: t.repoAllowlist,
    createdAt: t.createdAt ? timestampDate(t.createdAt) : new Date(0),
    expiresAt: t.expiresAt ? timestampDate(t.expiresAt) : undefined,
    revokedAt: t.revokedAt ? timestampDate(t.revokedAt) : undefined,
    lastUsedAt: t.lastUsedAt ? timestampDate(t.lastUsedAt) : undefined,
    createdByUserId: t.createdByUserId,
    createdByName: t.createdByName,
    createdByTokenPrefix: t.createdByTokenPrefix,
  };
}

/**
 * The githosted client. Entry point for all SDK operations.
 *
 * The client is workspace-scoped — the workspace is determined by the token.
 * It creates internal clients for both RepoService (file/git operations) and
 * ApiService (control-plane: list repos, manage tokens).
 *
 * In Node.js, auto-reads GITHOSTED_TOKEN from env if no token is provided.
 * In the browser, pass the token explicitly.
 */
export class Client {
  /** @internal */
  readonly _transport: Transport;
  /** @internal */
  readonly _repoService: ReturnType<typeof createClient<typeof RepoService>>;
  /** @internal */
  readonly _apiService: ReturnType<typeof createClient<typeof ApiService>>;
  /** @internal */
  readonly _retryConfig: Partial<RetryConfig>;

  readonly baseUrl: string;
  readonly token: string | undefined;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.token = resolveToken(options.token);
    this._transport = createTransport(this.baseUrl, this.token, {
      clientName: options.clientName,
      onTelemetry: options.onTelemetry,
    });
    this._repoService = createClient(RepoService, this._transport);
    this._apiService = createClient(ApiService, this._transport);
    this._retryConfig = {};
  }

  /**
   * Get a Repo handle for an existing repo.
   * Accepts a slug string ("my-project") or a stable ID ({ id: "rp_xxx" }).
   * Workspace is inferred from the token — no need to specify it.
   */
  repo(ref: RepoRef): Repo {
    return new Repo(this, ref);
  }

  /**
   * Return a Repo handle for `slug`, creating the repo if it does not
   * already exist.
   *
   * Safe to call concurrently — if two callers race the creation, the
   * loser catches `AlreadyExists` and falls back to the winner's repo.
   *
   * `name` defaults to `slug` when omitted.
   */
  async getOrCreateRepo(
    slug: string,
    options: { name?: string } = {},
  ): Promise<Repo> {
    const repo = this.repo(slug);
    try {
      await repo.ls("");
      return repo;
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
    try {
      return await this.createRepo(options.name ?? slug, { slug });
    } catch (err) {
      if (err instanceof ConnectError && err.code === Code.AlreadyExists) {
        return this.repo(slug);
      }
      throw err;
    }
  }

  /**
   * Create a new repo in the current workspace.
   * Returns a Repo handle with a stable ID.
   */
  async createRepo(
    name: string,
    options: { workspaceRef?: string; slug?: string } = {},
  ): Promise<Repo> {
    try {
      const res = await this._repoService.createRepo({
        workspaceRef: options.workspaceRef ?? "",
        name,
        slug: options.slug ?? "",
      });
      const repo = res.repo;
      if (!repo) throw new Error("CreateRepo returned no repo");
      return new Repo(this, { id: repo.id }, protoRepoToInfo(repo));
    } catch (err) {
      throw mapConnectError(err);
    }
  }

  /**
   * List repos in the current workspace.
   * Requires a workspace token (gw_). Repo tokens (gr_) are rejected.
   */
  async listRepos(options: ListReposOptions = {}): Promise<ListReposResult> {
    try {
      const res = await this._apiService.listRepos({
        workspaceRef: "",
        organizationRef: "",
        pageSize: options.pageSize ?? 0,
        pageToken: options.pageToken ?? "",
      });
      return {
        repos: res.repos.map(protoRepoToInfo),
        nextPageToken: res.nextPageToken || undefined,
      };
    } catch (err) {
      throw mapConnectError(err);
    }
  }

  /**
   * List tokens in the current workspace.
   * Requires a workspace token (gw_). Repo tokens (gr_) are rejected.
   */
  async listTokens(
    options: ListTokensOptions = {},
  ): Promise<ListTokensResult> {
    try {
      const res = await this._apiService.listTokens({
        workspaceRef: "",
        organizationRef: "",
        pageSize: options.pageSize ?? 0,
        pageToken: options.pageToken ?? "",
      });
      return {
        tokens: res.tokens.map(protoTokenToInfo),
        nextPageToken: res.nextPageToken || undefined,
      };
    } catch (err) {
      throw mapConnectError(err);
    }
  }

  /**
   * Create a new token in the current workspace.
   * Requires a workspace token (gw_) with write permission.
   * Repo tokens (gr_) are rejected.
   *
   * The returned token value is only available at creation time — store it
   * immediately.
   */
  async createToken(options: CreateTokenOptions): Promise<CreateTokenResult> {
    try {
      const res = await this._apiService.createToken({
        workspaceRef: "",
        organizationRef: "",
        name: options.name,
        kind: toTokenKind(options.kind),
        permission: toPermission(options.permission),
        repoAllowlist: options.repoAllowlist ?? [],
        ttlHours: options.ttlHours ?? 0,
      });
      const record = res.record;
      if (!record) throw new Error("CreateToken returned no record");
      return {
        token: res.token,
        record: protoTokenToInfo(record),
      };
    } catch (err) {
      throw mapConnectError(err);
    }
  }

  /**
   * Exchange this client's workspace (gw_) token for a short-lived,
   * narrowly-scoped repo (gr_) token on behalf of an end-user session.
   *
   * Intended for the "customer backend mints a per-user token" pattern:
   * the backend holds a gw_ in its environment, calls this method per
   * signed-in end user, and hands the returned gr_ back to the browser.
   * The browser then uses it to talk to githosted directly — without
   * ever seeing the gw_.
   *
   * Requires this client to be authenticated with a gw_ with write
   * permission. The issued token is always kind=repo and cannot be
   * more privileged than the parent token.
   */
  async exchangeToken(
    options: ExchangeTokenOptions,
  ): Promise<CreateTokenResult> {
    if (!options.repoAllowlist || options.repoAllowlist.length === 0) {
      throw new Error(
        "exchangeToken: repoAllowlist must contain at least one repo",
      );
    }
    try {
      const res = await this._apiService.exchangeToken({
        repoAllowlist: options.repoAllowlist,
        permission: toPermission(options.permission ?? "read"),
        ttlSeconds: options.ttlSeconds ?? 0,
        subject: options.subject ?? "",
      });
      const record = res.record;
      if (!record) throw new Error("ExchangeToken returned no record");
      return {
        token: res.token,
        record: protoTokenToInfo(record),
      };
    } catch (err) {
      throw mapConnectError(err);
    }
  }
}
