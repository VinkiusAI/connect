/**
 * OpenAI adapter (`@vinkius/connect/openai`).
 *
 * Converts Vinkius capabilities into OpenAI's chat-completions **tool** format
 * (that is OpenAI's own technical term for these). Zero-dependency: uses
 * structural types compatible with the OpenAI SDK — no import of `openai`.
 */
import type { Capability } from '../fluent/capability';
import type { CapabilityResult, JSONSchema } from '../types';
import { normalizeParams, parseArgs } from './shared';

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

/** Convert Vinkius capabilities to OpenAI chat-completions `tools`. */
export function toOpenAITools(capabilities: readonly Capability[]): OpenAIFunctionTool[] {
  return capabilities.map((capability) => ({
    type: 'function',
    function: {
      name: capability.name,
      description: capability.description,
      parameters: normalizeParams(capability.inputSchema),
    },
  }));
}

/** Execute the Vinkius capability named by an OpenAI tool call. */
export async function runOpenAIToolCall(
  capabilities: readonly Capability[],
  call: OpenAIToolCall,
): Promise<CapabilityResult> {
  const capability = capabilities.find((candidate) => candidate.name === call.function.name);
  if (!capability) throw new Error(`Unknown capability: ${call.function.name}`);
  return capability.execute(parseArgs(call.function.arguments));
}
