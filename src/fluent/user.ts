/**
 * UserContext — a lazy handle to one end-user's connectors and capabilities.
 *
 * `vinkius.user("usr_123")` performs zero network calls and stores nothing but
 * the client's `external_id`. Every operation addresses the API by that
 * external_id directly — the SDK never resolves nor holds an internal user id.
 */
import { assertExternalId } from '../core/validate';
import { AppUsersClient, type CreateAppUserInput } from '../resources/app-users';
import type { AppUser, CapabilityQuery, ConnectorSummary, RequestOptions } from '../types';
import { buildCapability, CapabilitySet } from './capability';
import { Connector } from './connector';
import type { SdkContext } from './context';
import { makeExecutor } from './executor';
import { summarize } from './status';

export class UserContext {
  private readonly users: AppUsersClient;

  constructor(
    private readonly ctx: SdkContext,
    public readonly externalId: string,
  ) {
    assertExternalId(externalId);
    this.users = new AppUsersClient(ctx.http, ctx.appId);
  }

  /** Explicitly upsert the user (e.g. to attach metadata up front). Optional. */
  ensure(metadata?: Record<string, unknown>): Promise<AppUser> {
    const input: CreateAppUserInput = {
      external_id: this.externalId,
      ...(metadata ? { metadata } : {}),
    };
    return this.users.create(input);
  }

  /** Fetch the underlying user resource. */
  get(opts: RequestOptions = {}): Promise<AppUser> {
    return this.users.get(this.externalId, opts);
  }

  /** Lazy handle to one connector. */
  connector(slug: string): Connector {
    return new Connector(this.ctx, this, slug);
  }

  /** Connected connectors for this user, with derived status. */
  async connectors(opts: RequestOptions = {}): Promise<ConnectorSummary[]> {
    const connections = await this.users.connections(this.externalId).list(opts);
    return connections.map(summarize);
  }

  /** Aggregated, executable capabilities for this user (the primary contract). */
  async capabilities(opts: CapabilityQuery = {}): Promise<CapabilitySet> {
    const listOpts: { connectors?: string[]; signal?: AbortSignal } = {};
    if (opts.include && opts.include.length > 0) listOpts.connectors = opts.include;
    if (opts.signal) listOpts.signal = opts.signal;

    const raw = await this.users.capabilities(this.externalId, listOpts);
    const executor = makeExecutor(this.ctx.http, this.ctx.appId, this.externalId);

    let capabilities = raw.map((data) =>
      buildCapability(data, {
        connector: data.connector ?? '',
        connectionId: data.connection_id ?? '',
        namespace: this.ctx.namespace,
        executor,
      }),
    );

    if (opts.exclude && opts.exclude.length > 0) {
      const exclude = new Set(opts.exclude);
      capabilities = capabilities.filter((capability) => !exclude.has(capability.connector));
    }

    return CapabilitySet.fromCapabilities(capabilities);
  }
}
