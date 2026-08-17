/**
 * RuntimeClient — the ONLY surface for tool listing and execution.
 *
 * Vinkius meters, bills, and kill-switches every tool call at the runtime, keyed
 * by the `vk_live_*` token embedded in the connection's `mcp_url` path. The API
 * is NEVER an execution surface. This client therefore talks JSON-RPC 2.0 over
 * Streamable HTTP directly to `{RUNTIME}/{token}/mcp`, statelessly (one POST, no
 * `initialize` handshake, no session id).
 *
 * Responsibilities:
 *  - `tools/list` (free, un-metered) and `tools/call` (metered) as single POSTs.
 *  - Per-request timeout composed with a caller AbortSignal.
 *  - Retries for the idempotent `tools/list` only; `tools/call` retries solely
 *    when the caller supplies an idempotency key (side-effect safety).
 *  - Runtime error mapping: revoked token (403) → AuthError, unknown (404) →
 *    NotFoundError, transient (5xx) → ConnectionError, JSON-RPC errors →
 *    ProtocolError. Tool-level failures are returned as `{ isError: true }`.
 */
import {
  AuthError,
  ConnectionError,
  NotFoundError,
  ProtocolError,
  VinkiusError,
} from './errors';
import { backoffDelay, isRetryableStatus, parseRetryAfter, sleep, type RetryPolicy } from './retry';
import type { CapabilityData, CapabilityResult } from '../types';

type FetchLike = typeof globalThis.fetch;

/** JSON-RPC protocol version advertised to the runtime (2026-era stateless). */
const MCP_PROTOCOL_VERSION = '2026-07-28';

export interface RuntimeClientConfig {
  timeoutMs: number;
  retry: RetryPolicy;
  fetch: FetchLike;
  userAgent: string;
}

interface RuntimeCallOptions {
  signal?: AbortSignal | undefined;
  /** When set, retries the (otherwise non-idempotent) call safely. */
  idempotencyKey?: string | undefined;
}

interface JsonRpcEnvelope {
  jsonrpc?: string;
  id?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

/**
 * A stateless JSON-RPC client bound to ONE runtime endpoint (mcp_url). The mcp_url
 * already embeds the `vk_live_*` token, so no auth headers are added here.
 */
export class RuntimeClient {
  private nextId = 1;

  constructor(
    /** Full runtime endpoint: {RUNTIME}/{token}/mcp. Embeds the vk_live_* token. */
    private readonly mcpUrl: string,
    private readonly cfg: RuntimeClientConfig,
  ) {}

  /** List the tools this connection exposes. Free (un-metered) at the runtime. */
  async listTools(opts: { signal?: AbortSignal } = {}): Promise<CapabilityData[]> {
    const result = await this.rpc('tools/list', {}, { signal: opts.signal }, true);
    const tools = (result as { tools?: unknown }).tools;
    if (!Array.isArray(tools)) {
      throw new ProtocolError('Runtime tools/list returned no tools array.', { details: result });
    }
    return tools.map(normalizeToolDefinition);
  }

  /** Execute a tool. Metered against the connection's token. */
  async callTool(
    name: string,
    args: Record<string, unknown> | undefined,
    opts: RuntimeCallOptions = {},
  ): Promise<CapabilityResult> {
    const result = await this.rpc(
      'tools/call',
      { name, arguments: args ?? {} },
      opts,
      opts.idempotencyKey !== undefined,
    );
    return normalizeCallResult(result);
  }

  /** Issue one stateless JSON-RPC request, mapping transport + protocol errors. */
  private async rpc(
    method: string,
    params: Record<string, unknown>,
    opts: RuntimeCallOptions,
    retryable: boolean,
  ): Promise<unknown> {
    const bodyText = JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params });
    const maxAttempts = retryable ? this.cfg.retry.maxRetries + 1 : 1;

    let attempt = 0;
    for (;;) {
      const { signal, cleanup } = this.composeSignal(opts.signal);
      let response: Response;
      try {
        response = await this.cfg.fetch(this.mcpUrl, {
          method: 'POST',
          headers: this.headers(opts.idempotencyKey),
          body: bodyText,
          signal,
        });
      } catch (error) {
        cleanup();
        if (isCallerAbort(error, opts.signal)) {
          throw new ConnectionError('Runtime request aborted by caller', { cause: error });
        }
        if (retryable && attempt < maxAttempts - 1) {
          await this.pause(attempt, undefined, opts.signal);
          attempt += 1;
          continue;
        }
        if (isAbortError(error)) {
          throw new ConnectionError(`Runtime request timed out after ${this.cfg.timeoutMs}ms`, {
            cause: error,
          });
        }
        throw new ConnectionError('Runtime request failed', { cause: error });
      } finally {
        cleanup();
      }

      const text = await response.text();

      if (!response.ok) {
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
        if (retryable && isRetryableStatus(response.status) && attempt < maxAttempts - 1) {
          await this.pause(attempt, retryAfterMs, opts.signal);
          attempt += 1;
          continue;
        }
        throw mapRuntimeHttpError(response.status, parseBody(text));
      }

      return this.unwrapEnvelope(parseBody(text));
    }
  }

  /** Extract the JSON-RPC `result`, or map a JSON-RPC `error` object. */
  private unwrapEnvelope(body: unknown): unknown {
    // The runtime may answer as an SSE stream; take the last data frame.
    const envelope = extractEnvelope(body);
    if (!envelope || typeof envelope !== 'object') {
      throw new ProtocolError('Runtime returned a non-JSON-RPC response.', { details: body });
    }
    const rpc = envelope as JsonRpcEnvelope;
    if (rpc.error) {
      throw new ProtocolError(rpc.error.message ?? 'Runtime returned a JSON-RPC error.', {
        details: rpc.error,
      });
    }
    if (rpc.result === undefined) {
      throw new ProtocolError('Runtime JSON-RPC response has no result.', { details: body });
    }
    return rpc.result;
  }

  private headers(idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': MCP_PROTOCOL_VERSION,
      'user-agent': this.cfg.userAgent,
    };
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    return headers;
  }

  private async pause(attempt: number, retryAfterMs: number | undefined, signal?: AbortSignal): Promise<void> {
    await sleep(backoffDelay(attempt, this.cfg.retry, retryAfterMs), signal);
  }

  private composeSignal(caller?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DOMException('Timeout', 'AbortError')),
      this.cfg.timeoutMs,
    );
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

/** Map a raw runtime tool definition (camelCase) to the SDK's CapabilityData. */
function normalizeToolDefinition(tool: unknown): CapabilityData {
  const t = (tool && typeof tool === 'object' ? tool : {}) as Record<string, unknown>;
  const name = t['name'];
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new ProtocolError('Runtime tool definition is missing a name.', { details: tool });
  }
  return {
    name,
    title: typeof t['title'] === 'string' ? (t['title'] as string) : null,
    description: typeof t['description'] === 'string' ? (t['description'] as string) : null,
    // Runtime uses JSON-Schema `inputSchema` (camelCase); the SDK contract is snake_case.
    input_schema: (t['inputSchema'] ?? t['input_schema'] ?? {}) as CapabilityData['input_schema'],
    ...(t['annotations'] !== undefined ? { annotations: t['annotations'] } : {}),
  };
}

/** Map a runtime tools/call JSON-RPC result to the SDK's CapabilityResult. */
function normalizeCallResult(result: unknown): CapabilityResult {
  const r = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
  const rawContent = r['content'];
  const content = Array.isArray(rawContent)
    ? rawContent
        .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
        .map((e) => ({
          type: typeof e['type'] === 'string' ? (e['type'] as string) : 'text',
          text: typeof e['text'] === 'string' ? (e['text'] as string) : JSON.stringify(e),
        }))
    : [];
  return { content, isError: r['isError'] === true };
}

/** Runtime transport errors are plain `{ error }` bodies (see runtime routes). */
function mapRuntimeHttpError(status: number, body: unknown): VinkiusError {
  const message = pickRuntimeMessage(body, `Runtime request failed with status ${status}`);
  const base = { status, details: body } as const;
  if (status === 401 || status === 403) return new AuthError(message, base);
  if (status === 404) return new NotFoundError(message, base);
  return new VinkiusError(message, { ...base, code: 'connection_error' });
}

function pickRuntimeMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b['error'] === 'string' && b['error']) return b['error'];
    const err = b['error'];
    if (err && typeof err === 'object' && typeof (err as Record<string, unknown>)['message'] === 'string') {
      return (err as Record<string, unknown>)['message'] as string;
    }
    if (typeof b['message'] === 'string' && b['message']) return b['message'];
  }
  if (typeof body === 'string' && body) return body;
  return fallback;
}

/** Parse a runtime body: JSON, or the last data frame of an SSE stream. */
function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Accept either a JSON object or an SSE stream string; return the JSON-RPC envelope. */
function extractEnvelope(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  let last: unknown;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data: ')) {
      try {
        const payload = JSON.parse(trimmed.slice(6));
        if (payload && typeof payload === 'object') last = payload;
      } catch {
        // Ignore non-JSON SSE frames (comments, keep-alives).
      }
    }
  }
  return last ?? body;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isCallerAbort(error: unknown, callerSignal?: AbortSignal): boolean {
  return isAbortError(error) && callerSignal?.aborted === true;
}
