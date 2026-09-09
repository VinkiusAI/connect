/** Shared helpers for framework adapters. */
import { NotFoundError } from '../core/errors';
import type { Capability } from '../fluent/capability';
import type { JSONSchema } from '../types';

/** Ensure a usable JSON Schema object for function/tool parameters. */
export function normalizeParams(schema: JSONSchema): JSONSchema {
  if (schema && typeof schema === 'object' && Object.keys(schema).length > 0) return schema;
  return { type: 'object', properties: {} };
}

/** Parse a JSON arguments string into an object, tolerating malformed input. */
export function parseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Find a capability by display name or raw name, throwing a typed error when absent. */
export function findCapability(capabilities: readonly Capability[], name: string): Capability {
  const capability = capabilities.find((candidate) => candidate.name === name || candidate.rawName === name);
  if (!capability) throw new NotFoundError(`Unknown capability: ${name}`);
  return capability;
}
