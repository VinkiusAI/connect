import { describe, expect, it } from 'vitest';
import { CapabilitySet } from '../src';
import { capabilityData, makeVinkius, type Route } from './helpers/mock-fetch';

describe('golden path: user.capabilities() → execute (external_id addressing)', () => {
  const routes: Route[] = [
    {
      method: 'GET',
      path: /^\/apps\/vk_app_test\/users\/customer-123\/tools$/,
      respond: () => ({ body: { data: [capabilityData()] } }),
    },
    {
      method: 'POST',
      path: /^\/apps\/vk_app_test\/users\/customer-123\/mcps\/conn_1\/tools\/execute$/,
      respond: (c) => ({ body: { content: [{ type: 'text', text: `ok:${JSON.stringify(c.body)}` }], isError: false } }),
    },
  ];

  it('returns a CapabilitySet, finds a namespaced capability, and executes it', async () => {
    const { vinkius, calls } = makeVinkius(routes);

    const capabilities = await vinkius.user('customer-123').capabilities();
    expect(capabilities).toBeInstanceOf(CapabilitySet);
    expect(capabilities).toHaveLength(1);
    // No user-resolution request preceded the capabilities call.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe('/apps/vk_app_test/users/customer-123/tools');

    const capability = capabilities.findCapability('github__create_issue');
    expect(capability).toBeDefined();
    expect(capability?.rawName).toBe('create_issue');
    expect(capability?.connector).toBe('github');
    expect(capability?.connectionId).toBe('conn_1');

    const result = await capability?.execute({ title: 'Hello Vinkius' });
    expect(result?.isError).toBe(false);

    const execCall = calls.find((c) => c.path.endsWith('/tools/execute'));
    expect(execCall?.body).toEqual({ tool_name: 'create_issue', arguments: { title: 'Hello Vinkius' } });
  });

  it('passes an include filter to the API as ?connector=', async () => {
    const { vinkius, calls } = makeVinkius(routes);
    await vinkius.user('customer-123').capabilities({ include: ['github', 'slack'] });
    const call = calls.find((c) => c.path.endsWith('/tools'));
    expect(call?.query.get('connector')).toBe('github,slack');
  });

  it('applies exclude client-side', async () => {
    const { vinkius } = makeVinkius([
      {
        method: 'GET',
        path: /^\/apps\/vk_app_test\/users\/customer-123\/tools$/,
        respond: () => ({
          body: { data: [capabilityData('create_issue', 'github'), capabilityData('send', 'slack', 'conn_2')] },
        }),
      },
    ]);
    const capabilities = await vinkius.user('customer-123').capabilities({ exclude: ['slack'] });
    expect(capabilities.map((c) => c.connector)).toEqual(['github']);
  });
});
