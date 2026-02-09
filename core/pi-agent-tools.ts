/**
 * Pi-Agent Tools Module
 *
 * Defines built-in tools for pi-agent-core using AgentTool format with TypeBox schemas.
 * Tools execute directly without MCP/approval wrappers.
 *
 * Features:
 * - Shell command execution tool with directory parameter
 * - TypeBox schema definitions for parameter validation
 * - Tool result formatting for LLM consumption
 * - Error handling with structured responses
 *
 * Implementation:
 * - Uses @sinclair/typebox for parameter schemas
 * - Returns AgentToolResult with content array
 * - Integrates with existing shell-cmd-tool.ts for execution
 *
 * Created: 2026-02-01
 */

import { Type, type Static } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { executeShellCommand, formatResultForLLM } from './shell-cmd-tool.js';
import { createCategoryLogger } from './logger.js';

const logger = createCategoryLogger('pi-tools');

// ============================================================================
// Tool Parameter Schemas
// ============================================================================

/**
 * Schema for shell_cmd tool parameters
 */
export const ShellCmdParams = Type.Object({
  command: Type.String({
    description: 'The shell command to execute (e.g., ls, cat, git, npm)'
  }),
  parameters: Type.Optional(Type.Array(Type.String(), {
    description: 'Array of command parameters/arguments',
    default: []
  })),
  directory: Type.String({
    description: 'Working directory for command execution. Use absolute path or ~ for home directory. Ask user if unclear.'
  })
});

export type ShellCmdParamsType = Static<typeof ShellCmdParams>;

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Shell command execution tool
 *
 * Executes shell commands in a specified directory and returns output.
 * Supports all standard shell commands with parameters.
 */
export const shellCmdTool: AgentTool<typeof ShellCmdParams> = {
  name: 'shell_cmd',
  label: 'Shell Command',
  description: `Execute a shell command in a specified directory.

Use this tool to:
- Run shell commands (ls, cat, grep, find, etc.)
- Execute build tools (npm, cargo, make, etc.)
- Run version control commands (git status, git diff, etc.)
- Execute scripts and programs

IMPORTANT:
- Always provide an explicit working directory
- If you don't know the directory, ASK the user first
- Use absolute paths or ~ for home directory
- Commands run through shell with PATH resolution`,

  parameters: ShellCmdParams,

  execute: async (
    toolCallId: string,
    params: ShellCmdParamsType,
    signal?: AbortSignal
  ): Promise<AgentToolResult<{ exitCode: number | null; duration: number }>> => {
    logger.debug('Executing shell_cmd tool', {
      toolCallId,
      command: params.command,
      parameters: params.parameters,
      directory: params.directory
    });

    // Validate required parameters
    if (!params.command || params.command.trim() === '') {
      return {
        content: [{ type: 'text', text: 'Error: command parameter is required and cannot be empty' }],
        details: { exitCode: 1, duration: 0 }
      };
    }

    if (!params.directory || params.directory.trim() === '') {
      return {
        content: [{ type: 'text', text: 'Error: directory parameter is required. Please specify the working directory for command execution.' }],
        details: { exitCode: 1, duration: 0 }
      };
    }

    try {
      // Execute the command using existing shell-cmd-tool
      const result = await executeShellCommand(
        params.command,
        params.parameters || [],
        params.directory
      );

      // Format the result for LLM consumption
      const formattedResult = formatResultForLLM(result);

      logger.debug('shell_cmd execution complete', {
        toolCallId,
        exitCode: result.exitCode,
        duration: result.duration,
        hasError: !!result.error
      });

      return {
        content: [{ type: 'text', text: formattedResult }],
        details: {
          exitCode: result.exitCode,
          duration: result.duration
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('shell_cmd execution error', { toolCallId, error: errorMessage });

      return {
        content: [{ type: 'text', text: `Error executing command: ${errorMessage}` }],
        details: { exitCode: 1, duration: 0 }
      };
    }
  }
};


// ============================================================================
// Sheet Music Tools
// ============================================================================

export const RenderSheetMusicParams = Type.Object({
  clef: Type.Optional(Type.String({ description: 'Clef type (e.g., treble, bass)' })),
  keySignature: Type.Optional(Type.String({ description: 'Key signature (e.g., C, G, Am)' })),
  timeSignature: Type.Optional(Type.String({ description: 'Time signature (e.g., 4/4, 3/4)' })),
  notes: Type.Array(
    Type.Object({
      keys: Type.Array(Type.String(), { description: 'Keys e.g. ["c/4"]' }),
      duration: Type.String({ description: 'Duration e.g. "q", "h", "w"' })
    }),
    { description: 'Array of note objects' }
  )
});

export type RenderSheetMusicParamsType = Static<typeof RenderSheetMusicParams>;

export const renderSheetMusicTool: AgentTool<typeof RenderSheetMusicParams> = {
  name: 'render_sheet_music',
  label: 'Render Sheet Music',
  description: 'Render musical notes as sheet music on the frontend using VexFlow.',
  parameters: RenderSheetMusicParams,
  execute: async (toolCallId, params, signal) => {
    // Ack only
    return {
      content: [{ type: 'text', text: `Rendered ${params.notes.length} notes.` }],
      details: {}
    };
  }
};

// ============================================================================
// Tool Collection
// ============================================================================

/**
 * Get all built-in tools
 */
export function getBuiltInTools(): AgentTool<any>[] {
  return [shellCmdTool, renderSheetMusicTool];
}

/**
 * Get tools for a specific agent
 * 
 * Returns tools appropriate for the agent's role.
 */
export function getToolsForAgent(agentId: string): AgentTool<any>[] {
  // Disable tools for testing if env var is set
  if (process.env.DISABLE_AGENT_TOOLS === 'true') {
    return [];
  }

  // Only Monsieur Engraver gets the render tool
  if (agentId === 'monsieur-engraver') {
      return [renderSheetMusicTool];
  }

  // Everyone else gets Shell
  return [shellCmdTool];
}
