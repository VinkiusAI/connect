/**
 * Anthropic adapter (`@vinkius/connect/anthropic`).
 *
 * Converts Vinkius capabilities into the Anthropic Messages API **tool** format
 * (Anthropic's own term). Zero-dependency: structural types compatible with
 * `@anthropic-ai/sdk` — no import required.
 */
import type { Capability } from '../fluent/capability';
import type { CapabilityResult, JSONSchema } from '../types';
import { findCapability, normalizeParams } from './shared';

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

/** Subset of the Anthropic `tool_use` block needed to dispatch execution. */
export interface AnthropicToolUse {
  name: string;
  input: Record<string, unknown>;
}

/** Convert Vinkius capabilities to Anthropic Messages `tools`. */
export function toAnthropicTools(capabilities: readonly Capability[]): AnthropicTool[] {
  return capabilities.map((capability) => ({
    name: capability.name,
    description: capability.description,
    input_schema: normalizeParams(capability.inputSchema),
  }));
}

/** Execute the Vinkius capability named by an Anthropic `tool_use` block. */
export async function runAnthropicToolUse(
  capabilities: readonly Capability[],
  use: AnthropicToolUse,
): Promise<CapabilityResult> {
  const capability = findCapability(capabilities, use.name);
  return capability.execute(use.input ?? {});
}
