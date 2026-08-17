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
import { CapabilitySet } from './capability';
import { Connector } from './connector';
import type { SdkContext } from './context';
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

  /**
   * Aggregated, executable capabilities across the user's ready connectors.
   *
   * Tools are listed and executed exclusively at the MCP runtime — the sole
   * metered, revocable surface. Because each connection is billed and
   * kill-switched independently by its own `vk_live_*` token, aggregation is a
   * fan-out over the connected connectors (each resolves its own runtime), not a
   * single API call. Only `ready` connectors are included; the rest cannot list
   * tools until connected/credentialed.
   *
   * For a single connector, prefer `user.connector(slug).capabilities()` — it
   * avoids resolving every connection.
   */
  async capabilities(opts: CapabilityQuery = {}): Promise<CapabilitySet> {
    const include = opts.include && opts.include.length > 0 ? new Set(opts.include) : undefined;
    const exclude = opts.exclude && opts.exclude.length > 0 ? new Set(opts.exclude) : undefined;
    const reqOpts: RequestOptions = opts.signal ? { signal: opts.signal } : {};

    const summaries = await this.connectors(reqOpts);
    const targets = summaries.filter(
      (s) =>
        s.status === 'ready' &&
        (!include || include.has(s.slug)) &&
        (!exclude || !exclude.has(s.slug)),
    );

    const perConnector = await Promise.all(
      targets.map((s) => this.connector(s.slug).capabilities(reqOpts)),
    );

    const all = new CapabilitySet();
    for (const set of perConnector) all.push(...set);
    return all;
  }
}
