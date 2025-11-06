/**
 * Approval Dialog Component - User approval interface for dangerous tool execution
 *
 * Features:
 * - Displays tool name, arguments, and approval message
 * - Three-button interface: Deny, Approve Once, Approve for Session
 * - Supports both new format (deny/approve_once/approve_session) and legacy (Cancel/Once/Always)
 * - Sanitized argument display with syntax highlighting
 * - Modal dialog with backdrop for focus
 *
 * Implementation:
 * - AppRun JSX component with props-based state
 * - Emits approval decisions via submit-approval-decision event
 * - Responsive layout with scrollable content
 *
 * Changes:
 * - 2025-11-05: Updated to support new three-option format with backward compatibility
 * - 2025-11-05: Changed event from 'approve-tool' to 'submit-approval-decision'
 * - 2025-11-04: Initial implementation for tool approval flow
 */

import { app } from 'apprun';
import type { ApprovalRequest } from '../types';

export interface ApprovalDialogProps {
  approval: ApprovalRequest | null;
}

export default function ApprovalDialog({ approval }: ApprovalDialogProps) {
  if (!approval) return null;

  const { toolName, toolArgs, message, options, toolCallId } = approval;

  return (
    <div className="approval-dialog-backdrop" $onclick={['hide-approval-request']}>
      <div
        className="approval-dialog"
        $onclick={(e: Event) => e.stopPropagation()}
      >
        <div className="approval-header">
          <h3>⚠️ Tool Approval Required</h3>
        </div>

        <div className="approval-content">
          <div className="approval-section">
            <label>Tool:</label>
            <div className="tool-name">{toolName}</div>
          </div>

          {toolArgs && Object.keys(toolArgs).length > 0 && (
            <div className="approval-section">
              <label>Arguments:</label>
              <pre className="tool-args">{JSON.stringify(toolArgs, null, 2)}</pre>
            </div>
          )}

          <div className="approval-section">
            <label>Message:</label>
            <p className="approval-message">{message}</p>
          </div>
        </div>

        <div className="approval-actions">
          {(options.includes('deny') || options.includes('Cancel')) && (
            <button
              className="btn-danger"
              $onclick={['submit-approval-decision', { toolCallId, decision: 'deny', scope: 'none' }]}
            >
              Deny
            </button>
          )}
          {(options.includes('approve_once') || options.includes('Once')) && (
            <button
              className="btn-primary"
              $onclick={['submit-approval-decision', { toolCallId, decision: 'approve', scope: 'once' }]}
            >
              Approve Once
            </button>
          )}
          {(options.includes('approve_session') || options.includes('Always')) && (
            <button
              className="btn-success"
              $onclick={['submit-approval-decision', { toolCallId, decision: 'approve', scope: 'session' }]}
            >
              Approve for Session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
