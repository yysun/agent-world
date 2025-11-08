/**
 * Pending Approvals Indicator Component
 * 
 * Purpose: Show visual indicator when approvals are dismissed, allow re-opening
 * 
 * Features:
 * - Displays count of pending approvals (excludes current active one)
 * - Only shows when there are dismissed approvals
 * - Clicking re-opens the first pending approval
 * 
 * Changes:
 * - 2025-11-08: Initial creation for Phase 6 of approval race condition fix
 */

import { app } from 'apprun';
import { countPendingApprovals } from '../domain/approval-detection.js';
import type { Message } from '../types/index.js';

interface PendingApprovalsIndicatorProps {
  messages: Message[];
  dismissedApprovals: Set<string>;
}

export default function PendingApprovalsIndicator({ messages, dismissedApprovals }: PendingApprovalsIndicatorProps) {
  const pendingCount = countPendingApprovals(messages, dismissedApprovals);
  
  if (pendingCount === 0) return null;
  
  return (
    <div class="pending-approvals-indicator" style="margin-bottom: 0.5rem;">
      <button
        class="btn btn-warning btn-sm"
        $onclick="show-next-approval"
        title="Show pending approval requests"
        style="font-size: 0.875rem; padding: 0.25rem 0.75rem;"
      >
        ⚠️ {pendingCount} Pending Approval{pendingCount > 1 ? 's' : ''}
      </button>
    </div>
  );
}
