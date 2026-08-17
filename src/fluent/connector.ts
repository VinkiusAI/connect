/**
 * Connector — a lazy handle to one connector for a user.
 *
 * `user.connector("github")` performs no network call. The connection is
 * addressed by the user's `external_id` directly; the connection id is resolved
 * on demand and memoized for the handle.
 */
import { ConnectorNotConnectedError, ProtocolError } from '../core/errors';
import type { RuntimeClient } from '../core/runtime';
import { ConnectionsClient } from '../resources/connections';
import type { Connection, ConnectorStatus, RequestOptions } from '../types';
import { buildCapability, CapabilitySet } from './capability';
import type { SdkContext } from './context';
import { CredentialsHandle } from './credentials';
import { makeExecutor } from './executor';
import { deriveStatus } from './status';
import type { UserContext } from './user';

export class Connector {
  private connectionId: string | undefined;
  /** Runtime client for this connection — the sole execution surface. Memoized. */
  private runtimeClient: RuntimeClient | undefined;
  /** Credential management for this connector (operates on an existing connection). */
  readonly credentials: CredentialsHandle;

  constructor(
    private readonly ctx: SdkContext,
    private readonly user: UserContext,
    public readonly slug: string,
  ) {
    this.credentials = new CredentialsHandle(ctx, user, this);
  }

  private connections(): ConnectionsClient {
    return new ConnectionsClient(this.ctx.http, this.ctx.appId, this.user.externalId);
  }

  /**
   * Connect this connector for the user (get-or-create; idempotent), then
   * provision the connection's `vk_live_*` data-plane token. The returned
   * Connection carries `runtime_url` — the sole surface for listing/executing
   * this connection's tools, metered and revocable. Callers should persist it;
   * the URL (and its embedded token) is returned ONLY here.
   */
  async connect(opts: RequestOptions = {}): Promise<Connection> {
    const connection = await this.connections().create({ connector: this.slug }, opts);
    this.connectionId = connection.id;
    const runtimeUrl = await this.provisionRuntime(connection.id, opts);
    return { ...connection, runtime_url: runtimeUrl };
  }

  /** Disconnect this connector for the user. */
  async disconnect(opts: RequestOptions = {}): Promise<void> {
    const connectionId = await this.resolveConnectionId(opts);
    await this.connections().delete(connectionId, opts);
    this.connectionId = undefined;
    this.runtimeClient = undefined;
  }

  /** Current readiness state. */
  async status(opts: RequestOptions = {}): Promise<ConnectorStatus> {
    const connection = await this.findConnection(opts);
    return connection ? deriveStatus(connection) : 'not_connected';
  }

  /** Capabilities exposed by this connector, listed directly from the runtime. */
  async capabilities(opts: RequestOptions = {}): Promise<CapabilitySet> {
    const { runtime, connectionId } = await this.resolveRuntime(opts);
    const raw = await runtime.listTools({ signal: opts.signal });
    const executor = makeExecutor(runtime);
    return CapabilitySet.fromCapabilities(
      raw.map((data) =>
        buildCapability(data, {
          connector: this.slug,
          connectionId,
          namespace: this.ctx.namespace,
          executor,
        }),
      ),
    );
  }

  /** @internal Resolve (and memoize) this connector's connection id, or throw if not connected. */
  async resolveConnectionId(opts: RequestOptions = {}): Promise<string> {
    if (this.connectionId !== undefined) return this.connectionId;
    const connection = await this.findConnection(opts);
    if (!connection) {
      throw new ConnectorNotConnectedError(
        `Connector "${this.slug}" is not connected for this user — call connect() first.`,
      );
    }
    return connection.id;
  }

  /**
   * @internal Resolve the runtime client for this connection, provisioning a
   * token on demand. Memoized per handle so a single connect()/capabilities()
   * flow mints at most one token.
   */
  private async resolveRuntime(
    opts: RequestOptions,
  ): Promise<{ runtime: RuntimeClient; connectionId: string }> {
    const connectionId = await this.resolveConnectionId(opts);
    if (this.runtimeClient) return { runtime: this.runtimeClient, connectionId };
    await this.provisionRuntime(connectionId, opts);
    return { runtime: this.runtimeClient!, connectionId };
  }

  /** Mint the connection's data-plane token and memoize a runtime client from its mcp_url. */
  private async provisionRuntime(connectionId: string, opts: RequestOptions): Promise<string> {
    const issued = await this.connections().tokens(connectionId).issue({}, opts);
    if (!issued.mcp_url) {
      throw new ProtocolError('Token provisioning did not return a runtime URL (mcp_url).', {
        details: { connectionId },
      });
    }
    this.runtimeClient = this.ctx.runtime(issued.mcp_url);
    return issued.mcp_url;
  }

  private async findConnection(opts: RequestOptions): Promise<Connection | undefined> {
    const connections = await this.connections().list(opts);
    const match = connections.find((c) => c.slug === this.slug || c.id === this.slug);
    this.connectionId = match?.id;
    return match;
  }
}
