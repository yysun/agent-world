/**
 * Approval Checker - Tool Approval Validation Functions
 *
 * Purpose: Validate tool execution approvals
 * Features:
 * - Check for session-wide approvals
 * - Check for one-time approvals (not consumed)
 * - Match by tool name, directory, and parameters
 * - Enhanced protocol support with __type='tool_result'
 *
 * These functions are pure logic with no side effects
 */

import { AgentMessage, World } from '../types.js';
import { createCategoryLogger } from '../logger.js';

const loggerAgent = createCategoryLogger('events.agent');
const loggerMemory = createCategoryLogger('events.memory');

/**
 * Check if tool needs approval and if it can execute
 * Returns approval status and optional approval request data
 */
export async function checkToolApproval(
  world: World,
  toolName: string,
  toolArgs: any,
  message: string,
  messages: AgentMessage[],
  context: { workingDirectory?: string;[key: string]: any }
): Promise<{
  needsApproval: boolean;
  canExecute: boolean;
  approvalRequest?: any;
}> {
  try {
    // Check for session-wide approval ONLY (matches name + directory + params)
    const workingDirectory = context?.workingDirectory || process.cwd();
    const sessionApproval = findSessionApproval(messages, toolName, toolArgs, workingDirectory);

    if (sessionApproval) {
      return {
        needsApproval: false,
        canExecute: true
      };
    }

    // Check for one-time approval (not yet consumed)
    const onceApproval = findOnceApproval(messages, toolName, toolArgs, workingDirectory);
    if (onceApproval) {
      return {
        needsApproval: false,
        canExecute: true
      };
    }

    // No approval found - need to request approval
    return {
      needsApproval: true,
      canExecute: false,
      approvalRequest: {
        toolName,
        toolArgs,
        message,
        workingDirectory, // Include for session approval matching
        requestId: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        options: ['deny', 'approve_once', 'approve_session']
      }
    };
  } catch (error) {
    loggerAgent.error('Error checking tool approval', {
      toolName,
      error: error instanceof Error ? error.message : error
    });
    return {
      needsApproval: true,
      canExecute: false,
      approvalRequest: {
        toolName,
        toolArgs,
        message,
        workingDirectory: context?.workingDirectory || process.cwd(), // Include even in error case
        requestId: `approval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        options: ['deny', 'approve_once', 'approve_session']
      }
    };
  }
}

/**
 * Find one-time approval that hasn't been consumed yet
 * 
 * One-time approval is valid if:
 * - scope: 'once'
 * - Matches tool name, directory, and parameters
 * - NOT followed by a tool execution result (not consumed)
 * 
 * Once found and used, it should be "consumed" by checking for subsequent tool results
 */
export function findOnceApproval(
  messages: AgentMessage[],
  toolName: string,
  toolArgs?: any,
  workingDirectory?: string
): { decision: 'approve'; scope: 'once'; toolName: string } | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    // Look for tool result with scope: 'once'
    if (msg.role === 'tool' && msg.tool_call_id && msg.content) {
      try {
        const outerParsed = JSON.parse(msg.content);

        if (outerParsed.__type === 'tool_result' && outerParsed.content) {
          try {
            const result = JSON.parse(outerParsed.content);
            if (result.decision === 'approve' &&
              result.scope === 'once' &&
              result.toolName?.toLowerCase() === toolName.toLowerCase()) {

              // Match working directory if provided
              if (result.workingDirectory && workingDirectory) {
                if (result.workingDirectory !== workingDirectory) {
                  continue;
                }
              }

              // Match parameters
              if (result.toolArgs && toolArgs) {
                const argsMatch = JSON.stringify(result.toolArgs) === JSON.stringify(toolArgs);
                if (!argsMatch) {
                  continue;
                }
              }

              // Found a matching one-time approval
              // Check if it's been consumed by looking for a subsequent tool execution
              const toolCallId = msg.tool_call_id;

              // Look for messages AFTER this approval to see if tool was executed
              for (let j = i + 1; j < messages.length; j++) {
                const laterMsg = messages[j];

                // Check if there's a tool result that consumed this approval
                // Tool results have role='tool' but are NOT approval responses
                if (laterMsg.role === 'tool' && laterMsg.tool_call_id === toolCallId) {
                  // Check if this is NOT another approval response (check for __type)
                  try {
                    const laterParsed = JSON.parse(laterMsg.content || '{}');
                    if (laterParsed.__type !== 'tool_result') {
                      // This is an actual tool execution result, approval was consumed
                      loggerMemory.debug('One-time approval already consumed', {
                        toolName,
                        toolCallId
                      });
                      return undefined; // Approval consumed, don't reuse
                    }
                  } catch {
                    // If parse fails, assume it's a tool execution result
                    return undefined; // Approval consumed
                  }
                }
              }

              // Approval found and not consumed
              loggerMemory.debug('Found valid one-time approval', {
                toolName,
                toolCallId: msg.tool_call_id
              });
              return { decision: 'approve', scope: 'once', toolName };
            }
          } catch (innerError) {
            continue;
          }
        }
      } catch (outerError) {
        continue;
      }
    }
  }
  return undefined;
}

/**
 * Find session-wide approval for a tool in message history
 * Supports enhanced string protocol (JSON)
 * 
 * Session approval matches on:
 * - Tool name (required)
 * - Working directory (if provided)
 * - Parameters (exact match)
 * 
 * Enhanced protocol format:
 * {
 *   role: 'tool',
 *   tool_call_id: 'approval_...',
 *   content: '{"__type":"tool_result","content":"{\"decision\":\"approve\",\"scope\":\"session\",\"toolName\":\"...\",\"toolArgs\":{...},\"workingDirectory\":\"...\"}"}'
 * }
 */
export function findSessionApproval(
  messages: AgentMessage[],
  toolName: string,
  toolArgs?: any,
  workingDirectory?: string
): { decision: 'approve'; scope: 'session'; toolName: string } | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    // Primary: Enhanced string protocol (JSON tool result)
    if (msg.role === 'tool' && msg.tool_call_id && msg.content) {
      try {
        const outerParsed = JSON.parse(msg.content);

        // Enhanced protocol: Outer layer MUST have __type
        if (outerParsed.__type === 'tool_result') {
          if (!outerParsed.content) {
            loggerMemory.warn('Enhanced protocol missing content field', {
              toolCallId: msg.tool_call_id
            });
            continue; // Skip malformed enhanced protocol
          }

          try {
            const result = JSON.parse(outerParsed.content);
            if (result.decision === 'approve' &&
              result.scope === 'session' &&
              result.toolName?.toLowerCase() === toolName.toLowerCase()) {

              // Match working directory if provided in approval
              if (result.workingDirectory && workingDirectory) {
                if (result.workingDirectory !== workingDirectory) {
                  continue; // Directory mismatch, keep searching
                }
              }

              // Match parameters (exact deep equality)
              if (result.toolArgs && toolArgs) {
                const argsMatch = JSON.stringify(result.toolArgs) === JSON.stringify(toolArgs);
                if (!argsMatch) {
                  continue; // Parameters mismatch, keep searching
                }
              }

              return { decision: 'approve', scope: 'session', toolName };
            }
          } catch (innerError) {
            loggerMemory.error('Malformed enhanced protocol content', {
              toolCallId: msg.tool_call_id,
              content: outerParsed.content,
              error: innerError
            });
            continue; // Skip malformed inner JSON
          }
        }
        // If outer JSON parsed but no __type, might be legacy JSON approval
        // (not currently used, but future-proof)
      } catch (outerError) {
        // Outer JSON.parse failed - not JSON at all, try legacy text
      }
    }

    // No legacy fallback - enhanced protocol required
  }
  return undefined;
}
