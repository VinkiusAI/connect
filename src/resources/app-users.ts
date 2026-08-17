/**
 * Application end-users (low-level, 1:1 with the API).
 *
 *   GET/POST         /apps/{app}/users
 *   GET/PATCH/DELETE /apps/{app}/users/{externalId}
 *
 * Users are addressed by their client-supplied `external_id`. `create` is
 * idempotent: the API upserts by `(application_id, external_id)`.
 *
 * Tool listing/execution is NOT here — that is the runtime's job, reached per
 * connection via {@link ConnectionsClient.tokens} (see fluent Connector).
 */
import type { HttpClient } from '../core/http';
import { normalizePaginated, unwrapItem } from '../core/pagination';
import { assertExternalId } from '../core/validate';
import type { AppUser, Paginated, RequestOptions } from '../types';
import { ConnectionsClient } from './connections';

export interface CreateAppUserInput {
  external_id: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateAppUserInput {
  status?: string;
  metadata?: Record<string, unknown>;
}

export class AppUsersClient {
  constructor(
    private readonly http: HttpClient,
    private readonly appId: string,
  ) {}

  private base(): string {
    return `/apps/${encodeURIComponent(this.appId)}/users`;
  }

  private userPath(externalId: string): string {
    assertExternalId(externalId);
    return `${this.base()}/${encodeURIComponent(externalId)}`;
  }

  /** Get-or-create a user by external id (idempotent). */
  async create(input: CreateAppUserInput, opts: RequestOptions = {}): Promise<AppUser> {
    assertExternalId(input.external_id);
    const body = await this.http.post<unknown>(this.base(), input, {
      idempotent: true,
      signal: opts.signal,
    });
    return unwrapItem<AppUser>(body);
  }

  async get(externalId: string, opts: RequestOptions = {}): Promise<AppUser> {
    const body = await this.http.get<unknown>(this.userPath(externalId), { signal: opts.signal });
    return unwrapItem<AppUser>(body);
  }

  async update(externalId: string, patch: UpdateAppUserInput, opts: RequestOptions = {}): Promise<AppUser> {
    const body = await this.http.patch<unknown>(this.userPath(externalId), patch, { signal: opts.signal });
    return unwrapItem<AppUser>(body);
  }

  async delete(externalId: string, opts: RequestOptions = {}): Promise<void> {
    await this.http.delete<unknown>(this.userPath(externalId), { signal: opts.signal });
  }

  /** List users (page-based, supports `?status=`). */
  async list(opts: { status?: string; page?: number } & RequestOptions = {}): Promise<Paginated<AppUser>> {
    const body = await this.http.get<unknown>(this.base(), {
      query: { status: opts.status, page: opts.page },
      signal: opts.signal,
    });
    return normalizePaginated<AppUser>(body);
  }

  /** Scoped connections client for a specific user. */
  connections(externalId: string): ConnectionsClient {
    return new ConnectionsClient(this.http, this.appId, externalId);
  }
}
