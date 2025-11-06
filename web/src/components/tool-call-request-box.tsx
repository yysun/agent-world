/**
 * Tool Call Request Box Component - Display tool call approval request with action buttons
 *
 * Features:
 * - Displays tool name, arguments in formatted JSON
 * - Shows approval message/warning
 * - Renders approval option buttons (Cancel, Once, Always)
 * - Emits submit-approval-decision event on button click
 * - Supports both backend format (deny/approve_once/approve_session) and frontend format (Cancel/Once/Always)
 *
 * Implementation:
 * - AppRun component with props-based rendering
 * - JSON formatting for tool arguments
 * - Button styling matches approval dialog theme
 * - Integrates with existing approval flow
 * - Flexible option checking to support multiple naming conventions
 *
 * Changes:
 * - 2025-11-06: Fix button rendering - support backend option format (deny/approve_once/approve_session)
 * - 2025-11-05: Initial implementation for inline tool call approval requests
 */

import { app } from 'apprun';
import type { Message } from '../types';

export interface ToolCallRequestBoxProps {
  message: Message;
}

export default function ToolCallRequestBox({ message }: ToolCallRequestBoxProps) {
  if (!message.toolCallData) {
    return null;
  }

  const { toolCallId, toolName, toolArgs, approvalMessage, approvalOptions } = message.toolCallData;
  const options = approvalOptions || ['deny', 'approve_once', 'approve_session'];

  // Check if deny option is available (deny or Cancel)
  const hasDeny = options.some(opt => opt === 'deny' || opt === 'Cancel');
  // Check if approve once option is available (approve_once or Once)
  const hasOnce = options.some(opt => opt === 'approve_once' || opt === 'Once');
  // Check if approve session option is available (approve_session or Always)
  const hasSession = options.some(opt => opt === 'approve_session' || opt === 'Always');

  // Format tool arguments for display
  const formattedArgs = JSON.stringify(toolArgs, null, 2);

  return (
    <div className="tool-call-request-box">
      <div className="tool-call-header">
        <span className="tool-call-icon">⚠️</span>
        <span className="tool-call-title">Tool Approval Required</span>
      </div>

      <div className="tool-call-info">
        <div className="tool-call-name">
          <strong>Tool:</strong> {toolName}
        </div>

        {approvalMessage && (
          <div className="tool-call-message">
            {approvalMessage}
          </div>
        )}

        <details className="tool-call-args-details">
          <summary>Arguments</summary>
          <pre className="tool-call-args">{formattedArgs}</pre>
        </details>
      </div>

      <div className="tool-call-actions">
        {hasDeny && (
          <button
            className="btn-danger tool-call-btn"
            $onclick={['submit-approval-decision', { toolCallId, decision: 'deny', scope: 'none' }]}
            title="Deny this tool execution"
          >
            Cancel
          </button>
        )}
        {hasOnce && (
          <button
            className="btn-secondary tool-call-btn"
            $onclick={['submit-approval-decision', { toolCallId, decision: 'approve', scope: 'once' }]}
            title="Approve this tool execution once"
          >
            Once
          </button>
        )}
        {hasSession && (
          <button
            className="btn-primary tool-call-btn"
            $onclick={['submit-approval-decision', { toolCallId, decision: 'approve', scope: 'session' }]}
            title="Approve this tool for the entire session"
          >
            Always
          </button>
        )}
      </div>
    </div>
  );
}
