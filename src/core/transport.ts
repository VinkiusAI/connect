/**
 * Shared transport core: one fetch loop with per-request timeout, caller-signal
 * composition, full-jitter retries honoring `Retry-After`, and redacted
 * observability hooks.
 *
 * Both the control plane (HttpClient) and the data plane (RuntimeClient) go
 * through here so timeout, retry, abort, and hook semantics can never drift
 * apart. Hooks receive ONLY redacted data: secret headers are masked and any
 * `vk_live_*` path segment in the URL (the data-plane token) is replaced.
 */
import type { Hooks } from '../types';
import { ConnectionError } from './errors';
import { redactBody, redactHeaders, redactUrl } from './redact';
import { backoffDelay, isRetryableStatus, parseRetryAfter, sleep, type RetryPolicy } from './retry';

export type FetchLike = typeof globalThis.fetch;

export interface TransportConfig {
  timeoutMs: number;
  retry: RetryPolicy;
  fetch: FetchLike;
  userAgent: string;
  hooks?: Hooks | undefined;
}

export interface TransportRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | undefined;
  signal?: AbortSignal | undefined;
  /** Whether transport-level failures and transient statuses may be retried. */
  retryable: boolean;
  /** Noun used in error messages, e.g. "Request" / "Runtime request". */
  label: string;
}

export interface TransportResult {
  status: number;
  body: unknown;
  requestId: string | undefined;
  retryAfterMs: number | undefined;
}

const REQUEST_ID_HEADERS = ['x-request-id', 'x-vinkius-request-id'] as const;

export class Transport {
  constructor(private readonly cfg: TransportConfig) {}

  /**
   * Send one logical request, retrying transient failures when `retryable`.
   * Returns the final response (ok or not) — the caller maps non-ok statuses
   * to typed errors, since control-plane and data-plane contracts differ.
   */
  async send(req: TransportRequest): Promise<TransportResult> {
    const maxAttempts = req.retryable ? this.cfg.retry.maxRetries + 1 : 1;

    let attempt = 0;
    for (;;) {
      const { signal, cleanup } = composeSignal(req.signal, this.cfg.timeoutMs);

      this.cfg.hooks?.onRequest?.({
        method: req.method,
        url: redactUrl(req.url),
        headers: redactHeaders(req.headers),
      });

      let response: Response;
      try {
        const init: RequestInit = { method: req.method, headers: req.headers, signal };
        if (req.body !== undefined) init.body = req.body;
        response = await this.cfg.fetch(req.url, init);
      } catch (error) {
        cleanup();
        if (isCallerAbort(error, req.signal)) {
          throw new ConnectionError(`${req.label} aborted by caller`, { cause: error });
        }
        if (req.retryable && attempt < maxAttempts - 1) {
          await this.pause(req, attempt, undefined, req.signal);
          attempt += 1;
          continue;
        }
        if (isAbortError(error)) {
          throw new ConnectionError(`${req.label} timed out after ${this.cfg.timeoutMs}ms`, { cause: error });
        }
        throw new ConnectionError(`${req.label} failed`, { cause: error });
      } finally {
        cleanup();
      }

      const requestId = extractRequestId(response);
      const body = parseBody(await response.text());
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));

      this.cfg.hooks?.onResponse?.({
        status: response.status,
        url: redactUrl(req.url),
        ...(requestId !== undefined ? { requestId } : {}),
        body: redactBody(body),
      });

      if (response.status >= 200 && response.status < 300) {
        return { status: response.status, body, requestId, retryAfterMs };
      }

      if (req.retryable && isRetryableStatus(response.status) && attempt < maxAttempts - 1) {
        await this.pause(req, attempt, retryAfterMs, req.signal);
        attempt += 1;
        continue;
      }

      return { status: response.status, body, requestId, retryAfterMs };
    }
  }

  /** Backoff before the next attempt; a caller abort during the wait is a ConnectionError. */
  private async pause(
    req: TransportRequest,
    attempt: number,
    retryAfterMs: number | undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    try {
      await sleep(backoffDelay(attempt, this.cfg.retry, retryAfterMs), signal);
    } catch (cause) {
      throw new ConnectionError(`${req.label} aborted while waiting to retry`, { cause });
    }
  }
}

/** Combine the per-request timeout with an optional caller signal. */
function composeSignal(caller: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'AbortError')), timeoutMs);

  const forward = (): void => controller.abort(caller?.reason);
  if (caller) {
    if (caller.aborted) controller.abort(caller.reason);
    else caller.addEventListener('abort', forward, { once: true });
  }

  const cleanup = (): void => {
    clearTimeout(timer);
    caller?.removeEventListener('abort', forward);
  };
  return { signal: controller.signal, cleanup };
}

function extractRequestId(response: Response): string | undefined {
  for (const name of REQUEST_ID_HEADERS) {
    const value = response.headers.get(name);
    if (value) return value;
  }
  return undefined;
}

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isCallerAbort(error: unknown, callerSignal?: AbortSignal): boolean {
  return isAbortError(error) && callerSignal?.aborted === true;
}
