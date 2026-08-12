/**
 * Connector — a lazy handle to one connector for a user.
 *
 * `user.connector("github")` performs no network call. The connection is
 * addressed by the user's `external_id` directly; the connection id is resolved
 * on demand and memoized for the handle.
 */
import { ConnectorNotConnectedError } from '../core/errors';
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

  /** Connect this connector for the user (get-or-create; idempotent). */
  async connect(opts: RequestOptions = {}): Promise<Connection> {
    const connection = await this.connections().create({ connector: this.slug }, opts);
    this.connectionId = connection.id;
    return connection;
  }

  /** Disconnect this connector for the user. */
  async disconnect(opts: RequestOptions = {}): Promise<void> {
    const connectionId = await this.resolveConnectionId(opts);
    await this.connections().delete(connectionId, opts);
    this.connectionId = undefined;
  }

  /** Current readiness state. */
  async status(opts: RequestOptions = {}): Promise<ConnectorStatus> {
    const connection = await this.findConnection(opts);
    return connection ? deriveStatus(connection) : 'not_connected';
  }

  /** Capabilities exposed by this connector for the user. */
  async capabilities(opts: RequestOptions = {}): Promise<CapabilitySet> {
    const connectionId = await this.resolveConnectionId(opts);
    const raw = await this.connections().execution(connectionId).list(opts);
    const executor = makeExecutor(this.ctx.http, this.ctx.appId, this.user.externalId);
    return CapabilitySet.fromCapabilities(
      raw.map((data) =>
        buildCapability(data, { connector: this.slug, connectionId, namespace: this.ctx.namespace, executor }),
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

  private async findConnection(opts: RequestOptions): Promise<Connection | undefined> {
    const connections = await this.connections().list(opts);
    const match = connections.find((c) => c.slug === this.slug || c.id === this.slug);
    if (match) this.connectionId = match.id;
    return match;
  }
}
