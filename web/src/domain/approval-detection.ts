/**
 * Approval Detection Domain Logic
 * 
 * Purpose: Provides reusable functions to find pending approval requests in message history
 * 
 * Features:
 * - Find the first pending approval in messages (excludes dismissed)
 * - Find all pending approvals (for showing approval queue)
 * - Count pending approvals (for badge display)
 * - Memory-driven detection (checks for unanswered tool_call_id)
 * 
 * Architecture:
 * - Frontend detection only checks for pending requests (unanswered tool_call_id)
 * - Session approval matching (name + directory + params) is done by backend
 * - Dismissal tracking is separate from approval state
 * 
 * Changes:
 * - 2025-11-08: Initial creation for Phase 2 of approval race condition fix
 */

import type { Message } from '../types/index.js';

export interface ApprovalRequest {
  toolCallId: string;
  toolName: string;
  toolArgs: any;
  message: string;
  options: string[];
  agentId: string;
  workingDirectory?: string; // For session approval matching
}

/**
 * Find the first pending approval in message history
 * Excludes dismissed approvals from the result
 * 
 * Note: Frontend detection only checks for pending requests (unanswered tool_call_id).
 * Session approval matching (name + directory + params) is done by backend.
 * 
 * @param messages - All messages in current chat
 * @param dismissedToolCallIds - Set of toolCallIds user has dismissed
 * @returns First pending approval, or null if none found
 */
export function findPendingApproval(
  messages: Message[],
  dismissedToolCallIds?: Set<string>
): ApprovalRequest | null {
  const dismissed = dismissedToolCallIds || new Set<string>();
  
  for (const msg of messages) {
    // Skip non-approval messages
    if (!msg.isToolCallRequest || !msg.toolCallData) continue;
    
    const toolCallId = msg.toolCallData.toolCallId;
    
    // Skip dismissed approvals
    if (dismissed.has(toolCallId)) continue;
    
    // Check if approval already has a response (tool message with matching tool_call_id)
    const hasResponse = messages.some(m =>
      m.role === 'tool' &&
      m.messageId === toolCallId
    );
    
    if (!hasResponse) {
      // Found pending approval without response
      return {
        toolCallId: msg.toolCallData.toolCallId,
        toolName: msg.toolCallData.toolName,
        toolArgs: msg.toolCallData.toolArgs,
        message: msg.toolCallData.approvalMessage || '',
        options: msg.toolCallData.approvalOptions || ['deny', 'approve_once', 'approve_session'],
        agentId: msg.toolCallData.agentId || msg.sender,
        workingDirectory: msg.toolCallData.workingDirectory
      };
    }
  }
  
  return null;
}

/**
 * Find all pending approvals in message history
 * Useful for showing approval queue UI
 * 
 * @param messages - All messages in current chat
 * @param dismissedToolCallIds - Set of toolCallIds user has dismissed
 * @returns Array of all pending approvals
 */
export function findAllPendingApprovals(
  messages: Message[],
  dismissedToolCallIds?: Set<string>
): ApprovalRequest[] {
  const dismissed = dismissedToolCallIds || new Set<string>();
  const pendingApprovals: ApprovalRequest[] = [];
  
  for (const msg of messages) {
    if (!msg.isToolCallRequest || !msg.toolCallData) continue;
    
    const toolCallId = msg.toolCallData.toolCallId;
    if (dismissed.has(toolCallId)) continue;
    
    const hasResponse = messages.some(m =>
      m.role === 'tool' &&
      m.messageId === toolCallId
    );
    
    if (!hasResponse) {
      pendingApprovals.push({
        toolCallId: msg.toolCallData.toolCallId,
        toolName: msg.toolCallData.toolName,
        toolArgs: msg.toolCallData.toolArgs,
        message: msg.toolCallData.approvalMessage || '',
        options: msg.toolCallData.approvalOptions || ['deny', 'approve_once', 'approve_session'],
        agentId: msg.toolCallData.agentId || msg.sender,
        workingDirectory: msg.toolCallData.workingDirectory
      });
    }
  }
  
  return pendingApprovals;
}

/**
 * Count pending approvals (excludes dismissed)
 */
export function countPendingApprovals(
  messages: Message[],
  dismissedToolCallIds?: Set<string>
): number {
  return findAllPendingApprovals(messages, dismissedToolCallIds).length;
}
