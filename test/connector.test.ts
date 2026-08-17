import { describe, expect, it } from 'vitest';
import { ConnectorNotConnectedError } from '../src';
import { connection, makeVinkius, type Route } from './helpers/mock-fetch';

function listRoute(connections: Array<Record<string, unknown>>): Route {
  return {
    method: 'GET',
    path: /^\/apps\/vk_app_test\/users\/customer-123\/mcps$/,
    respond: () => ({ body: { data: connections } }),
  };
}

describe('Connector (external_id addressing)', () => {
  it('connect() addresses by external_id and memoizes the connection id', async () => {
    const { vinkius, calls } = makeVinkius([
      {
        method: 'POST',
        path: /^\/apps\/vk_app_test\/users\/customer-123\/mcps$/,
        respond: () => ({ body: { data: connection('conn_1', 'github') } }),
      },
    ]);
    const github = vinkius.user('customer-123').connector('github');
    const result = await github.connect();
    expect(result.id).toBe('conn_1');
    expect(result.slug).toBe('github');
    expect(calls).toHaveLength(1);
  });

  it('derives status from connection.ready', async () => {
    const ready = makeVinkius([listRoute([connection('conn_1', 'github', { ready: true })])]);
    expect(await ready.vinkius.user('customer-123').connector('github').status()).toBe('ready');

    const needs = makeVinkius([listRoute([connection('conn_1', 'github', { ready: false })])]);
    expect(await needs.vinkius.user('customer-123').connector('github').status()).toBe('needs_credentials');

    const disabled = makeVinkius([listRoute([connection('conn_1', 'github', { status: 'suspended' })])]);
    expect(await disabled.vinkius.user('customer-123').connector('github').status()).toBe('disabled');

    const missing = makeVinkius([listRoute([])]);
    expect(await missing.vinkius.user('customer-123').connector('slack').status()).toBe('not_connected');
  });

  it('clears a memoized connection id when status no longer finds the connection', async () => {
    const { vinkius } = makeVinkius([
      {
        method: 'POST',
        path: /^\/apps\/vk_app_test\/users\/customer-123\/mcps$/,
        respond: () => ({ body: { data: connection('conn_1', 'github') } }),
      },
      listRoute([]),
      listRoute([]),
    ]);
    const github = vinkius.user('customer-123').connector('github');
    await github.connect();
    expect(await github.status()).toBe('not_connected');
    await expect(github.capabilities()).rejects.toBeInstanceOf(ConnectorNotConnectedError);
  });

  it('lists scoped capabilities with the resolved connection id', async () => {
    const { vinkius, calls } = makeVinkius([
      listRoute([connection('conn_1', 'github')]),
      {
        method: 'GET',
        path: /^\/apps\/vk_app_test\/users\/customer-123\/mcps\/conn_1\/tools$/,
        respond: () => ({
          body: {
            data: [
              {
                name: 'create_issue',
                title: 'Create Issue',
                description: 'Create a GitHub issue',
                input_schema: { type: 'object', properties: { title: { type: 'string' } } },
              },
            ],
          },
        }),
      },
    ]);

    const capabilities = await vinkius.user('customer-123').connector('github').capabilities();

    expect(capabilities).toHaveLength(1);
    expect(capabilities[0]).toMatchObject({
      connector: 'github',
      connectionId: 'conn_1',
      rawName: 'create_issue',
      name: 'github__create_issue',
    });
    expect(calls.map((call) => call.path)).toEqual([
      '/apps/vk_app_test/users/customer-123/mcps',
      '/apps/vk_app_test/users/customer-123/mcps/conn_1/tools',
    ]);
  });

  it('throws ConnectorNotConnectedError when listing capabilities of an unconnected connector', async () => {
    const { vinkius } = makeVinkius([listRoute([])]);
    await expect(vinkius.user('customer-123').connector('github').capabilities()).rejects.toBeInstanceOf(
      ConnectorNotConnectedError,
    );
  });
});
