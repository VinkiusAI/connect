/**
 * OpenAI adapter (`@vinkius/connect/openai`).
 *
 * Converts Vinkius capabilities into OpenAI's chat-completions **tool** format
 * (that is OpenAI's own technical term for these). Zero-dependency: uses
 * structural types compatible with the OpenAI SDK — no import of `openai`.
 */
import { ConfigError } from '../core/errors';
import type { Capability } from '../fluent/capability';
import type { CapabilityResult, JSONSchema } from '../types';
import { findCapability, normalizeParams, parseArgs } from './shared';

export interface OpenAIFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

/** Subset of the OpenAI tool-call shape needed to dispatch execution. */
export interface OpenAIToolCall {
  function: { name: string; arguments: string };
}

/**
 * OpenAI tool-function names must be 1–64 chars of `[a-zA-Z0-9_-]`. The SDK
 * namespaces capabilities as `connector__name`, which can violate this (too long,
 * or containing dots/spaces from a connector or capability name). Catch it up
 * front with a clear error rather than a cryptic OpenAI 400 at call time.
 */
const OPENAI_NAME_RE = /^[a-zA-Z0-9_-]+$/;
const OPENAI_NAME_MAX = 64;

export function validateOpenAIFunctionName(name: string): void {
  if (name.length === 0 || name.length > OPENAI_NAME_MAX || !OPENAI_NAME_RE.test(name)) {
    throw new ConfigError(
      `Capability "${name}" cannot be exposed as an OpenAI tool name: it must be 1–${OPENAI_NAME_MAX} ` +
        `characters of [a-zA-Z0-9_-] (got ${name.length} char(s)). ` +
        'Override VinkiusOptions.namespaceCapability to produce OpenAI-compatible names.',
    );
  }
}

/** Convert Vinkius capabilities to OpenAI chat-completions `tools`. */
export function toOpenAITools(capabilities: readonly Capability[]): OpenAIFunctionTool[] {
  return capabilities.map((capability) => {
    validateOpenAIFunctionName(capability.name);
    return {
      type: 'function',
      function: {
        name: capability.name,
        description: capability.description,
        parameters: normalizeParams(capability.inputSchema),
      },
    };
  });
}

/** Execute the Vinkius capability named by an OpenAI tool call. */
export async function runOpenAIToolCall(
  capabilities: readonly Capability[],
  call: OpenAIToolCall,
): Promise<CapabilityResult> {
  const capability = findCapability(capabilities, call.function.name);
  return capability.execute(parseArgs(call.function.arguments));
}
