/**
 * Catalog discovery (low-level, 1:1 with the API).
 *
 *   GET /catalog/mcps          → paginated CatalogConnector
 *   GET /catalog/mcps/{slug}   → CatalogConnectorDetail (+ credential_schema)
 *
 * The transport path is `/catalog/mcps` (MCP is the platform's internal data
 * plane); the SDK exposes these as connectors.
 */
import type { HttpClient } from '../core/http';
import { normalizePaginated, unwrapItem } from '../core/pagination';
import type { CatalogConnector, CatalogConnectorDetail, Paginated, RequestOptions } from '../types';

export class CatalogClient {
  constructor(private readonly http: HttpClient) {}

  /** List public connectors (page-based, 50 per page). */
  async list(opts: { page?: number } & RequestOptions = {}): Promise<Paginated<CatalogConnector>> {
    const body = await this.http.get<unknown>('/catalog/mcps', {
      query: { page: opts.page },
      signal: opts.signal,
    });
    return normalizePaginated<CatalogConnector>(body);
  }

  /** Fetch a single connector by slug (or uuid), including its credential schema. */
  async get(slug: string, opts: RequestOptions = {}): Promise<CatalogConnectorDetail> {
    const body = await this.http.get<unknown>(`/catalog/mcps/${encodeURIComponent(slug)}`, {
      signal: opts.signal,
    });
    return unwrapItem<CatalogConnectorDetail>(body);
  }

  /**
   * Server-side search over the catalog.
   *
   * NOTE: requires backend support for the `?q=` parameter (pending). Until
   * enabled, this will return the same results as `list()`. Check the Vinkius
   * Cloud release notes or test the response before relying on filtered results.
   */
  async search(query: string, opts: RequestOptions = {}): Promise<CatalogConnector[]> {
    const body = await this.http.get<unknown>('/catalog/mcps', {
      query: { q: query },
      signal: opts.signal,
    });
    return normalizePaginated<CatalogConnector>(body).data;
  }
}
