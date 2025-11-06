/**
 * Tool Call Response Box Component - Display tool call approval result
 *
 * Features:
 * - Displays approval decision (approved/denied)
 * - Shows approval scope (once/session)
 * - Visual styling based on decision (green for approve, red for deny)
 * - Shows tool name that was approved/denied
 *
 * Implementation:
 * - AppRun component with props-based rendering
 * - Conditional styling based on approval decision
 * - Integrates with existing message display flow
 *
 * Changes:
 * - 2025-11-05: Initial implementation for inline tool call approval responses
 */

import { app } from 'apprun';
import type { Message } from '../types';

export interface ToolCallResponseBoxProps {
  message: Message;
}

export default function ToolCallResponseBox({ message }: ToolCallResponseBoxProps) {
  if (!message.toolCallData) {
    return null;
  }

  const { toolName, approvalDecision, approvalScope } = message.toolCallData;
  const isApproved = approvalDecision === 'approve';
  const isDenied = approvalDecision === 'deny';

  // Determine display text
  const statusIcon = isApproved ? '✓' : '✗';
  const statusClass = isApproved ? 'approved' : 'denied';
  const statusText = isApproved ? 'Approved' : 'Denied';

  // Format scope text
  let scopeText = '';
  if (isApproved && approvalScope) {
    scopeText = approvalScope === 'once' ? ' (once)' : ' (session)';
  }

  return (
    <div className={`tool-call-response-box ${statusClass}`}>
      <div className="tool-call-response-header">
        <span className="tool-call-response-icon">{statusIcon}</span>
        <span className="tool-call-response-status">{statusText}{scopeText}</span>
      </div>

      <div className="tool-call-response-info">
        <div className="tool-call-response-name">
          <strong>Tool:</strong> {toolName}
        </div>
      </div>
    </div>
  );
}
