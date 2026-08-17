/**
 * Execution Plane (low-level, 1:1 with the API).
 *
 *   GET  /apps/{app}/users/{externalId}/mcps/{connection}/tools          → { data: CapabilityData[] }
 *   POST /apps/{app}/users/{externalId}/mcps/{connection}/tools/execute  → CapabilityResult
 *
 * See ../../cloud/src/VINKIUS_EXECUTION_PLANE_SPEC.md. Execution is proxied by
 * the API; the SDK never handles the internal data-plane token. Capability errors
 * are returned as `{ isError: true }` results (HTTP 200), while quota/overage
 * surface as {@link QuotaError}/{@link OverageError}.
 */
import { ConfigError, ProtocolError } from '../core/errors';
import type { HttpClient } from '../core/http';
import { unwrapList } from '../core/pagination';
import { assertExternalId } from '../core/validate';
import type { CapabilityData, CapabilityResult, ExecuteOptions, RequestOptions } from '../types';

export interface ExecuteCapabilityInput {
  /** Raw capability name (as the connector exposes it). */
  name: string;
  arguments?: Record<string, unknown>;
}

function assertCapabilityResult(body: unknown): CapabilityResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ProtocolError('Capability execution returned an invalid response.', { details: body });
  }
  const result = body as Partial<CapabilityResult>;
  const contentIsValid =
    Array.isArray(result.content) &&
    result.content.every(
      (entry) => entry && typeof entry.type === 'string' && typeof entry.text === 'string',
    );
  if (typeof result.isError !== 'boolean' || !contentIsValid) {
    throw new ProtocolError('Capability execution returned an invalid response.', { details: body });
  }
  return result as CapabilityResult;
}

function idempotencyKey(options: ExecuteOptions): string | undefined {
  const key = options.idempotencyKey;
  if (key !== undefined && key.trim().length === 0) {
    throw new ConfigError('idempotencyKey must be a non-empty string when provided.');
  }
  return key;
}

export class ExecutionClient {
  constructor(
    private readonly http: HttpClient,
    private readonly appId: string,
    /** The client's external_id (addresses the user directly). */
    private readonly externalId: string,
    private readonly connectionId: string,
  ) {
    assertExternalId(externalId);
  }

  private base(): string {
    const app = encodeURIComponent(this.appId);
    const user = encodeURIComponent(this.externalId);
    const connection = encodeURIComponent(this.connectionId);
    return `/apps/${app}/users/${user}/mcps/${connection}/tools`;
  }

  /** List the capabilities this connection exposes. */
  async list(opts: RequestOptions = {}): Promise<CapabilityData[]> {
    const body = await this.http.get<unknown>(this.base(), { signal: opts.signal });
    return unwrapList<CapabilityData>(body);
  }

  /** Execute a capability by its raw name. */
  async execute(input: ExecuteCapabilityInput, opts: ExecuteOptions = {}): Promise<CapabilityResult> {
    const key = idempotencyKey(opts);
    const body = await this.http.post<unknown>(
      `${this.base()}/execute`,
      { tool_name: input.name, ...(input.arguments !== undefined ? { arguments: input.arguments } : {}) },
      {
        signal: opts.signal,
        idempotencyKey: key,
        // Retry only when the caller supplied a valid idempotency key.
        idempotent: key !== undefined,
      },
    );
    return assertCapabilityResult(body);
  }
}
