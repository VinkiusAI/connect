/**
 * The HTTP client: fetch-based, dependency-free, runtime-agnostic.
 *
 * Responsibilities:
 *  - Bearer auth with the `vk_app_sk_*` key (never logged).
 *  - Per-request timeout composed with a caller-supplied AbortSignal.
 *  - Automatic retries (idempotent requests only) with full-jitter backoff,
 *    honoring `Retry-After`.
 *  - Consistent error mapping (see {@link mapHttpError}).
 *  - Redacted observability hooks.
 */
import type { Hooks } from '../types';
import { ConnectionError, mapHttpError } from './errors';
import { redactBody, redactHeaders } from './redact';
import { backoffDelay, isRetryableStatus, parseRetryAfter, sleep, type RetryPolicy } from './retry';

type FetchLike = typeof globalThis.fetch;

export interface HttpClientConfig {
  baseUrl: string;
  apiKey: string;
  /** Public application id (`vk_app_*`) — sent on every request as the tenant binding. */
  appId: string;
  timeoutMs: number;
  retry: RetryPolicy;
  fetch: FetchLike;
  userAgent: string;
  hooks?: Hooks | undefined;
}

/** Header carrying the public app id — the API authenticates it against the key. */
const APP_ID_HEADER = 'x-vinkius-app-id';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined | null> | undefined;
  body?: unknown;
  signal?: AbortSignal | undefined;
  /** Force retry-safety. Defaults to true for GET/PUT/DELETE, false otherwise. */
  idempotent?: boolean | undefined;
  idempotencyKey?: string | undefined;
  headers?: Record<string, string> | undefined;
}

const REQUEST_ID_HEADERS = ['x-request-id', 'x-vinkius-request-id'] as const;

export class HttpClient {
  constructor(private readonly cfg: HttpClientConfig) {}

  get<T>(path: string, req: Omit<HttpRequest, 'method' | 'path' | 'body'> = {}): Promise<T> {
    return this.request<T>({ ...req, method: 'GET', path });
  }

  post<T>(path: string, body?: unknown, req: Omit<HttpRequest, 'method' | 'path' | 'body'> = {}): Promise<T> {
    return this.request<T>({ ...req, method: 'POST', path, body });
  }

  put<T>(path: string, body?: unknown, req: Omit<HttpRequest, 'method' | 'path' | 'body'> = {}): Promise<T> {
    return this.request<T>({ ...req, method: 'PUT', path, body });
  }

  patch<T>(path: string, body?: unknown, req: Omit<HttpRequest, 'method' | 'path' | 'body'> = {}): Promise<T> {
    return this.request<T>({ ...req, method: 'PATCH', path, body });
  }

  delete<T>(path: string, req: Omit<HttpRequest, 'method' | 'path' | 'body'> = {}): Promise<T> {
    return this.request<T>({ ...req, method: 'DELETE', path });
  }

  async request<T>(req: HttpRequest): Promise<T> {
    const url = this.buildUrl(req.path, req.query);
    const headers = this.buildHeaders(req);
    const retryable = req.idempotent ?? isIdempotentMethod(req.method);
    const maxAttempts = retryable ? this.cfg.retry.maxRetries + 1 : 1;
    const bodyText = req.body === undefined ? undefined : JSON.stringify(req.body);

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    for (;;) {
      const { signal, cleanup } = this.composeSignal(req.signal);

      this.cfg.hooks?.onRequest?.({ method: req.method, url, headers: redactHeaders(headers) });

      let response: Response;
      try {
        const init: RequestInit = { method: req.method, headers, signal };
        if (bodyText !== undefined) init.body = bodyText;
        response = await this.cfg.fetch(url, init);
      } catch (error) {
        cleanup();
        if (isCallerAbort(error, req.signal)) {
          throw new ConnectionError('Request aborted by caller', { cause: error });
        }
        if (isAbortError(error)) {
          if (retryable && attempt < maxAttempts - 1) {
            await this.pause(attempt, undefined, req.signal);
            attempt += 1;
            continue;
          }
          throw new ConnectionError(`Request timed out after ${this.cfg.timeoutMs}ms`, { cause: error });
        }
        if (retryable && attempt < maxAttempts - 1) {
          await this.pause(attempt, undefined, req.signal);
          attempt += 1;
          continue;
        }
        throw new ConnectionError('Network request failed', { cause: error });
      } finally {
        cleanup();
      }

      const requestId = this.extractRequestId(response);
      const parsed = parseBody(await response.text());
      this.cfg.hooks?.onResponse?.({
        status: response.status,
        url,
        ...(requestId !== undefined ? { requestId } : {}),
        body: redactBody(parsed),
      });

      if (response.ok) return parsed as T;

      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      if (retryable && isRetryableStatus(response.status) && attempt < maxAttempts - 1) {
        await this.pause(attempt, retryAfterMs, req.signal);
        attempt += 1;
        continue;
      }

      throw mapHttpError(response.status, parsed, requestId, retryAfterMs);
    }
  }

  private async pause(attempt: number, retryAfterMs: number | undefined, signal?: AbortSignal): Promise<void> {
    await sleep(backoffDelay(attempt, this.cfg.retry, retryAfterMs), signal);
  }

  private buildUrl(path: string, query?: HttpRequest['query']): string {
    const base = this.cfg.baseUrl.replace(/\/+$/, '');
    const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private buildHeaders(req: HttpRequest): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.cfg.apiKey}`,
      [APP_ID_HEADER]: this.cfg.appId,
      accept: 'application/json',
      'user-agent': this.cfg.userAgent,
      ...req.headers,
    };
    if (req.body !== undefined) headers['content-type'] = 'application/json';
    if (req.idempotencyKey) headers['idempotency-key'] = req.idempotencyKey;
    return headers;
  }

  private extractRequestId(response: Response): string | undefined {
    for (const name of REQUEST_ID_HEADERS) {
      const value = response.headers.get(name);
      if (value) return value;
    }
    return undefined;
  }

  /** Combine the per-request timeout with an optional caller signal. */
  private composeSignal(caller?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'AbortError')), this.cfg.timeoutMs);

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
}

function isIdempotentMethod(method: HttpMethod): boolean {
  return method === 'GET' || method === 'PUT' || method === 'DELETE';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isCallerAbort(error: unknown, callerSignal?: AbortSignal): boolean {
  return isAbortError(error) && callerSignal?.aborted === true;
}

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
