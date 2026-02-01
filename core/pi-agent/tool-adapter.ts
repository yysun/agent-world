/**
 * Tool Adapter for Pi-AI Integration
 * 
 * Converts MCP tools to pi-ai Tool format.
 * 
 * Key Differences:
 * - MCP uses JSON Schema in inputSchema
 * - pi-ai uses TypeBox TSchema in parameters
 * 
 * For now, we'll pass the JSON Schema directly since TypeBox schemas
 * are compatible with JSON Schema at runtime.
 * 
 * Note: pi-ai doesn't execute tools - it only provides tool definitions
 * to the LLM. Tool execution remains in Agent-World's MCP layer.
 */

import type { Tool } from '@mariozechner/pi-ai';

/**
 * Convert MCP tool to pi-ai Tool format
 */
export function adaptMCPToolToPiAi(
  name: string,
  mcpTool: any
): Tool {
  return {
    name,
    description: mcpTool.description || '',
    // pi-ai expects TypeBox TSchema, but JSON Schema is compatible
    parameters: mcpTool.inputSchema || {} as any,
  };
}

/**
 * Convert all MCP tools to pi-ai format
 */
export function adaptMCPTools(mcpTools: Record<string, any>): Tool[] {
  return Object.entries(mcpTools).map(([name, schema]) => 
    adaptMCPToolToPiAi(name, schema)
  );
}

/**
 * Filter out client-side tools that shouldn't be sent to LLM
 * 
 * These tools are handled specially by Agent-World:
 * - client.approveToolUse: Approval flow
 * - client.humanIntervention: HITL flow
 */
export function filterClientSideTools(tools: Tool[]): Tool[] {
  const clientSideTools = new Set([
    'client.approveToolUse',
    'client.humanIntervention'
  ]);
  
  return tools.filter(tool => !clientSideTools.has(tool.name));
}

/**
 * Get tools for pi-ai from MCP tools
 * Combines adaptation and filtering
 */
export function preparePiAiTools(mcpTools: Record<string, any>): Tool[] {
  const adapted = adaptMCPTools(mcpTools);
  return filterClientSideTools(adapted);
}
