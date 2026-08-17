import { describe, expect, it } from 'vitest';
import { CapabilitySet } from '../src';
import {
  connection,
  makeVinkius,
  runtimeRoute,
  runtimeTool,
  tokenRoute,
  type Route,
} from './helpers/mock-fetch';

/** GET .../mcps — the user's connections (drives the capabilities fan-out). */
function connectionsRoute(connections: Array<Record<string, unknown>>): Route {
  return {
    method: 'GET',
    path: /^\/apps\/vk_app_test\/users\/customer-123\/mcps$/,
    respond: () => ({ body: { data: connections } }),
  };
}

describe('golden path: user.capabilities() → execute (runtime surface)', () => {
  it('aggregates ready connectors from the runtime and executes a capability there', async () => {
    const { vinkius, calls } = makeVinkius([
      connectionsRoute([connection('conn_1', 'github', { ready: true })]),
      tokenRoute('conn_1'),
      runtimeRoute({
        call: (rpc) => ({
          content: [{ type: 'text', text: `ok:${JSON.stringify(rpc.params)}` }],
          isError: false,
        }),
      }),
    ]);

    const capabilities = await vinkius.user('customer-123').capabilities();
    expect(capabilities).toBeInstanceOf(CapabilitySet);
    expect(capabilities).toHaveLength(1);

    const capability = capabilities.findCapability('github__create_issue');
    expect(capability).toBeDefined();
    expect(capability?.rawName).toBe('create_issue');
    expect(capability?.connector).toBe('github');
    expect(capability?.connectionId).toBe('conn_1');

    const result = await capability?.execute({ title: 'Hello Vinkius' });
    expect(result?.isError).toBe(false);

    // Execution hits the runtime with a JSON-RPC tools/call, never the API.
    const execCall = calls.find((c) => c.path === '/vk_live_test/mcp' && (c.body as { method?: string }).method === 'tools/call');
    expect(execCall?.body).toMatchObject({
      method: 'tools/call',
      params: { name: 'create_issue', arguments: { title: 'Hello Vinkius' } },
    });
  });

  it('includes only the requested connectors (client-side fan-out filter)', async () => {
    const { vinkius, calls } = makeVinkius([
      connectionsRoute([
        connection('conn_1', 'github', { ready: true }),
        connection('conn_2', 'slack', { ready: true }),
      ]),
      tokenRoute('conn_1'),
      runtimeRoute(),
    ]);

    const capabilities = await vinkius.user('customer-123').capabilities({ include: ['github'] });
    expect(capabilities.map((c) => c.connector)).toEqual(['github']);
    // Only github's token was minted — slack was filtered out before any call.
    const tokenCalls = calls.filter((c) => c.path.endsWith('/tokens'));
    expect(tokenCalls.map((c) => c.path)).toEqual([
      '/apps/vk_app_test/users/customer-123/mcps/conn_1/tokens',
    ]);
  });

  it('applies exclude before touching the runtime', async () => {
    const { vinkius, calls } = makeVinkius([
      connectionsRoute([
        connection('conn_1', 'github', { ready: true }),
        connection('conn_2', 'slack', { ready: true }),
      ]),
      tokenRoute('conn_1'),
      runtimeRoute(),
    ]);
    const capabilities = await vinkius.user('customer-123').capabilities({ exclude: ['slack'] });
    expect(capabilities.map((c) => c.connector)).toEqual(['github']);
    expect(calls.some((c) => c.path.endsWith('/conn_2/tokens'))).toBe(false);
  });

  it('skips connectors that are not ready', async () => {
    const { vinkius } = makeVinkius([
      connectionsRoute([
        connection('conn_1', 'github', { ready: true }),
        connection('conn_2', 'slack', { ready: false }),
      ]),
      tokenRoute('conn_1'),
      runtimeRoute({ tools: [runtimeTool('create_issue')] }),
    ]);
    const capabilities = await vinkius.user('customer-123').capabilities();
    expect(capabilities.map((c) => c.connector)).toEqual(['github']);
  });
});
