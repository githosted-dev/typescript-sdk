import { createConnectTransport } from "@connectrpc/connect-node";
import type { Transport } from "@connectrpc/connect";
import type { ClientTelemetryObserver } from "../types.js";

interface TransportOptions {
  clientName?: string;
  onTelemetry?: ClientTelemetryObserver;
}

export function createTransport(
  baseUrl: string,
  token?: string,
  options: TransportOptions = {},
): Transport {
  const clientName = normalizeClientName(options.clientName) || "sdk-ts-node";
  return createConnectTransport({
    baseUrl,
    httpVersion: "2",
    interceptors: [
      (next) => async (req) => {
        const requestId = newRequestId();
        const procedure = procedureFromRequest(req);
        const startedAt = Date.now();
        req.header.set("X-Request-Id", requestId);
        req.header.set("X-Githosted-Client", clientName);
        if (token) {
          req.header.set("Authorization", `Bearer ${token}`);
        }
        try {
          const res = await next(req);
          options.onTelemetry?.({
            requestId,
            clientName,
            procedure,
            durationMs: Date.now() - startedAt,
            outcome: "ok",
          });
          return res;
        } catch (err) {
          options.onTelemetry?.({
            requestId,
            clientName,
            procedure,
            durationMs: Date.now() - startedAt,
            outcome: "error",
            errorMessage: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    ],
  });
}

function newRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `req_${globalThis.crypto.randomUUID()}`;
  }
  return `req_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function normalizeClientName(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function procedureFromRequest(req: unknown): string {
  const url = typeof (req as { url?: unknown }).url === "string"
    ? (req as { url: string }).url
    : "";
  if (!url) return "";
  try {
    return new URL(url, "https://githosted.invalid").pathname;
  } catch {
    return url;
  }
}
