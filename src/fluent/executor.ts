/** Factory for a {@link CapabilityExecutor} bound to a specific (app, external user id). */
import type { HttpClient } from '../core/http';
import { ConnectionsClient } from '../resources/connections';
import type { CapabilityExecutor } from './capability';

export function makeExecutor(http: HttpClient, appId: string, externalId: string): CapabilityExecutor {
  const connections = new ConnectionsClient(http, appId, externalId);
  return (connectionId, rawName, args, opts) =>
    connections.execution(connectionId).execute(
      { name: rawName, ...(args !== undefined ? { arguments: args } : {}) },
      opts ?? {},
    );
}
