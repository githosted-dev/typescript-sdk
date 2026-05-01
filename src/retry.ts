import { isRepoBusyError } from "./errors.js";
import type { RetryConfig } from "./types.js";

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
};

/**
 * Wraps an async operation with exponential backoff retry for RepoBusyError.
 * Only retries on repo_busy — all other errors propagate immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number) => void,
): Promise<T> {
  const { maxRetries, baseDelayMs } = { ...DEFAULT_RETRY_CONFIG, ...config };

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRepoBusyError(err) || attempt >= maxRetries) {
        throw err;
      }
      onRetry?.(attempt + 1);
      const jitter = Math.random() * 0.5 + 0.75; // 0.75–1.25x
      const delay = baseDelayMs * Math.pow(2, attempt) * jitter;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
