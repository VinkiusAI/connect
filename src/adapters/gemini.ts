/**
 * Google Gemini adapter (`@vinkius/connect/gemini`).
 *
 * Converts Vinkius capabilities into Gemini **function declarations** (Gemini's
 * own term). Zero-dependency: structural types compatible with the unified
 * Google GenAI SDK (`@google/genai`) — no import required.
 *
 * @example
 * const decls = toGeminiTools(await user.capabilities());
 * const response = await model.generateContent({
 *   contents,
 *   tools: [{ functionDeclarations: decls }],
 * });
 */
import type { Capability } from '../fluent/capability';
import type { CapabilityResult, JSONSchema } from '../types';
import { normalizeParams } from './shared';

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: JSONSchema;
}

/** Subset of the Gemini `functionCall` part needed to dispatch execution. */
export interface GeminiFunctionCall {
  name: string;
  args?: Record<string, unknown>;
}

/** Convert Vinkius capabilities to Gemini function declarations. */
export function toGeminiTools(capabilities: readonly Capability[]): GeminiFunctionDeclaration[] {
  return capabilities.map((capability) => ({
    name: capability.name,
    description: capability.description,
    parameters: normalizeParams(capability.inputSchema),
  }));
}

/** Execute the Vinkius capability named by a Gemini function call. */
export async function runGeminiFunctionCall(
  capabilities: readonly Capability[],
  call: GeminiFunctionCall,
): Promise<CapabilityResult> {
  const capability = capabilities.find((candidate) => candidate.name === call.name);
  if (!capability) throw new Error(`Unknown capability: ${call.name}`);
  return capability.execute(call.args ?? {});
}
