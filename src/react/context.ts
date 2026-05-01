import { createContext } from "react";
import type { Client } from "../client.js";
import type { RepoBusyError } from "../errors.js";

export interface GithostedContextValue {
  client: Client;
  clientScope: string;
  onError?: (error: Error) => void;
  onRepoBusy?: (error: RepoBusyError, attempt: number) => void;
}

export const GithostedContext = createContext<GithostedContextValue | null>(
  null,
);
