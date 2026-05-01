// Re-export generated service descriptors and proto types for consumers that
// need raw Connect clients (e.g., the web admin's session-cookie client).

export { ApiService } from "./gen/githosted/v1/api_pb.js";
export { RepoService } from "./gen/githosted/v1/repo_pb.js";

export type {
  GetViewerRequest,
  GetViewerResponse,
  ListOrganizationsRequest,
  ListOrganizationsResponse,
  ListWorkspacesRequest,
  ListWorkspacesResponse,
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  ListTokensRequest,
  ListTokensResponse,
  CreateTokenRequest,
  CreateTokenResponse,
  ListReposRequest,
  ListReposResponse,
} from "./gen/githosted/v1/api_pb.js";

export type {
  User,
  Organization,
  Workspace,
  Repo as ProtoRepo,
  Token as ProtoToken,
  Commit as ProtoCommit,
  FileEntry as ProtoFileEntry,
} from "./gen/githosted/v1/types_pb.js";

export { Permission, TokenKind } from "./gen/githosted/v1/types_pb.js";
