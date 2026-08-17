/** Shared runtime context threaded through the fluent layer. */
import type { HttpClient } from '../core/http';
import type { RuntimeClient } from '../core/runtime';

export interface SdkContext {
  readonly http: HttpClient;
  readonly appId: string;
  readonly namespace: (connector: string, name: string) => string;
  /**
   * Build a client for the MCP runtime — the ONLY surface for tool listing and
   * execution. Given a connection's `mcp_url` (which embeds its `vk_live_*`
   * token), returns a client that talks JSON-RPC directly to the runtime.
   */
  readonly runtime: (mcpUrl: string) => RuntimeClient;
}
