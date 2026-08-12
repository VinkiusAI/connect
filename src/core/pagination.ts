/**
 * Pagination normalization.
 *
 * The API is heterogeneous: some list endpoints return the full Laravel
 * length-aware envelope (`{ data, links, meta }`), others return only
 * `{ data: [...] }`. This module coerces both into {@link Paginated} and
 * exposes the raw array when a plain list is expected.
 */
import type { Paginated } from '../types';

interface RawList<T> {
  data?: T[];
  meta?: Paginated<T>['meta'];
  links?: Paginated<T>['links'];
}

/** Normalize any list response into a {@link Paginated} value. */
export function normalizePaginated<T>(body: unknown): Paginated<T> {
  const raw = (body ?? {}) as RawList<T>;
  const data = Array.isArray(raw.data) ? raw.data : [];
  const result: Paginated<T> = { data };
  if (raw.meta) result.meta = raw.meta;
  if (raw.links) result.links = raw.links;
  return result;
}

/** Unwrap a `{ data: [...] }` (or bare array) response into a plain array. */
export function unwrapList<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  const raw = (body ?? {}) as RawList<T>;
  return Array.isArray(raw.data) ? raw.data : [];
}

/** Unwrap a single-resource `{ data: {...} }` response. */
export function unwrapItem<T>(body: unknown): T {
  const raw = (body ?? {}) as { data?: T };
  return (raw.data ?? (body as T)) as T;
}
