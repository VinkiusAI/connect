import { Vinkius } from '../../src';
import type { VinkiusOptions } from '../../src';

export interface RecordedCall {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Headers;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Simulate latency; honors the request's AbortSignal (for timeout tests). */
  delayMs?: number;
}

export type Responder = (call: RecordedCall) => MockResponse | Promise<MockResponse>;

export interface Route {
  method: string;
  path: RegExp;
  respond: Responder;
}

export function createMockFetch(routes: Route[]): {
  fetch: typeof globalThis.fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl = typeof input === 'string' ? input : input.toString();
    const url = new URL(rawUrl);
    const method = (init?.method ?? 'GET').toUpperCase();
    const bodyText = typeof init?.body === 'string' ? init.body : undefined;
    const call: RecordedCall = {
      method,
      url: rawUrl,
      path: url.pathname,
      query: url.searchParams,
      body: bodyText ? JSON.parse(bodyText) : undefined,
      headers: new Headers(init?.headers as HeadersInit | undefined),
    };
    calls.push(call);

    const route = routes.find((r) => r.method === method && r.path.test(url.pathname));
    if (!route) throw new Error(`No mock route for ${method} ${url.pathname}`);

    const res = await route.respond(call);

    if (res.delayMs && res.delayMs > 0) {
      await waitOrAbort(res.delayMs, init?.signal ?? undefined);
    }

    const payload = res.body === undefined ? '' : JSON.stringify(res.body);
    return new Response(payload, {
      status: res.status ?? 200,
      headers: new Headers(res.headers),
    });
  };

  return { fetch: fetchImpl as unknown as typeof globalThis.fetch, calls };
}

function abortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

function waitOrAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // Faithful to real fetch: an already-aborted signal rejects immediately.
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

/** Build a Vinkius client wired to a mock fetch. Retries off by default. */
export function makeVinkius(
  routes: Route[],
  overrides: Partial<VinkiusOptions> = {},
): { vinkius: Vinkius; calls: RecordedCall[] } {
  const { fetch, calls } = createMockFetch(routes);
  const vinkius = new Vinkius({
    appId: 'vk_app_test',
    apiKey: 'vk_app_sk_test',
    baseUrl: 'http://localhost:8080',
    maxRetries: 0,
    fetch,
    ...overrides,
  });
  return { vinkius, calls };
}

// ── Fixtures ────────────────────────────────────────────────────────────────

export function appUser(id: string, externalId: string): Record<string, unknown> {
  return {
    id,
    external_id: externalId,
    status: 'active',
    metadata: null,
    application_id: 'vk_app_test',
    created_at: '2026-01-01T00:00:00+00:00',
    updated_at: '2026-01-01T00:00:00+00:00',
  };
}

export function connection(
  id: string,
  slug: string,
  opts: { ready?: boolean; status?: string } = {},
): Record<string, unknown> {
  return {
    id,
    slug,
    name: slug,
    description: null,
    status: opts.status ?? 'active',
    ready: opts.ready ?? true,
    created_at: '2026-01-01T00:00:00+00:00',
  };
}

export function capabilityData(
  name = 'create_issue',
  connector = 'github',
  connectionId = 'conn_1',
): Record<string, unknown> {
  return {
    name,
    title: 'Create Issue',
    description: 'Create a GitHub issue',
    input_schema: { type: 'object', properties: { title: { type: 'string' } } },
    connector,
    connection_id: connectionId,
  };
}
