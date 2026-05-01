import { useMemo, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Client } from "../client.js";
import type { ClientOptions } from "../types.js";
import type { RepoBusyError } from "../errors.js";
import { GithostedContext, type GithostedContextValue } from "./context.js";

export interface GithostedProviderProps {
  /** A pre-built Client instance. Takes precedence over token/baseUrl. */
  client?: Client;
  /** Token to create a Client from. Ignored if client is provided. */
  token?: string;
  /** Base URL. Ignored if client is provided. */
  baseUrl?: string;
  /** Called on any RPC error. App decides how to handle. */
  onError?: (error: Error) => void;
  /** Called on each auto-retry attempt for repo_busy errors. */
  onRepoBusy?: (error: RepoBusyError, attempt: number) => void;
  children: ReactNode;
}

function computeScope(client: Client): string {
  // Stable hash from baseUrl + token to scope query keys
  const input = `${client.baseUrl}:${client.token ?? "anonymous"}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `gh_${hash.toString(36)}`;
}

/**
 * Provides the githosted Client to descendant hooks.
 *
 * Requires an outer QueryClientProvider — does NOT create its own QueryClient.
 *
 * When the client/token changes, all cached queries from the previous scope
 * are invalidated.
 */
export function GithostedProvider({
  client: externalClient,
  token,
  baseUrl,
  onError,
  onRepoBusy,
  children,
}: GithostedProviderProps) {
  const client = useMemo(() => {
    if (externalClient) return externalClient;
    const opts: ClientOptions = {};
    if (token) opts.token = token;
    if (baseUrl !== undefined) opts.baseUrl = baseUrl;
    return new Client(opts);
  }, [externalClient, token, baseUrl]);

  const clientScope = useMemo(() => computeScope(client), [client]);
  const queryClient = useQueryClient();
  const prevScopeRef = useRef(clientScope);

  useEffect(() => {
    if (prevScopeRef.current !== clientScope) {
      // Token or client changed — invalidate all queries from the old scope
      queryClient.invalidateQueries({
        queryKey: ["githosted", prevScopeRef.current],
      });
      prevScopeRef.current = clientScope;
    }
  }, [clientScope, queryClient]);

  const value = useMemo<GithostedContextValue>(
    () => ({ client, clientScope, onError, onRepoBusy }),
    [client, clientScope, onError, onRepoBusy],
  );

  return (
    <GithostedContext.Provider value={value}>
      {children}
    </GithostedContext.Provider>
  );
}
