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

  it('throws ConnectorNotConnectedError when listing capabilities of an unconnected connector', async () => {
    const { vinkius } = makeVinkius([listRoute([])]);
    await expect(vinkius.user('customer-123').connector('github').capabilities()).rejects.toBeInstanceOf(
      ConnectorNotConnectedError,
    );
  });
});
