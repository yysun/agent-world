/**
 * HITL Dialog Component - Generic Human-in-the-Loop decision interface
 *
 * Features:
 * - Displays prompt and context for human decision
 * - Dynamic button generation from options array
 * - Sanitized context display with syntax highlighting
 * - Modal dialog with backdrop for focus
 *
 * Implementation:
 * - AppRun JSX component with props-based state
 * - Emits HITL decisions via submit-hitl-decision event
 * - Responsive layout with scrollable content
 *
 * Changes:
 * - 2025-11-14: Initial implementation for HITL flow (Phase 3)
 */

import { app } from 'apprun';
import type { HITLRequest } from '../types';

export interface HITLDialogProps {
  hitl: HITLRequest | null;
}

export default function HITLDialog({ hitl }: HITLDialogProps) {
  if (!hitl) return null;

  const { toolCallId, prompt, options, context } = hitl;

  return (
    <div className="approval-dialog-backdrop" $onclick={['hide-hitl-request']}>
      <div
        className="approval-dialog"
        $onclick={(e: Event) => e.stopPropagation()}
      >
        <div className="approval-header">
          <h3>🤔 Human Input Required</h3>
        </div>

        <div className="approval-content">
          <div className="approval-section">
            <label>Request:</label>
            <p className="approval-message">{prompt}</p>
          </div>

          {context && (
            <div className="approval-section">
              <label>Context:</label>
              <pre className="tool-args">{typeof context === 'string' ? context : JSON.stringify(context, null, 2)}</pre>
            </div>
          )}
        </div>

        <div className="approval-actions">
          {options.map((option, index) => (
            <button
              key={index}
              className={index === 0 ? 'btn-primary' : 'btn-secondary'}
              $onclick={['submit-hitl-decision', { toolCallId, choice: option }]}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
