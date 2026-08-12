import { describe, expect, it } from 'vitest';
import { makeVinkius, type Route } from './helpers/mock-fetch';

describe('CatalogClient', () => {
  it('normalizes a paginated list response', async () => {
    const route: Route = {
      method: 'GET',
      path: /^\/catalog\/mcps$/,
      respond: () => ({
        body: {
          data: [{ id: 'github', slug: 'github', title: 'GitHub' }],
          links: { first: 'a', last: 'b', prev: null, next: null },
          meta: { current_page: 1, from: 1, last_page: 1, path: '/', per_page: 50, to: 1, total: 1 },
        },
      }),
    };
    const { vinkius } = makeVinkius([route]);
    const page = await vinkius.catalog.list();
    expect(page.data).toHaveLength(1);
    expect(page.meta?.total).toBe(1);
  });

  it('unwraps a single-resource detail response', async () => {
    const route: Route = {
      method: 'GET',
      path: /^\/catalog\/mcps\/github$/,
      respond: () => ({ body: { data: { id: 'github', slug: 'github', credential_schema: {} } } }),
    };
    const { vinkius } = makeVinkius([route]);
    const detail = await vinkius.catalog.get('github');
    expect(detail.slug).toBe('github');
  });

  it('sends the ?q= query on search', async () => {
    const route: Route = {
      method: 'GET',
      path: /^\/catalog\/mcps$/,
      respond: () => ({ body: { data: [] } }),
    };
    const { vinkius, calls } = makeVinkius([route]);
    await vinkius.catalog.search('project management');
    expect(calls[0]?.query.get('q')).toBe('project management');
  });
});
