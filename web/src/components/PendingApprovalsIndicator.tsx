// web/src/components/PendingApprovalsIndicator.ts

import { app } from 'apprun';
import { countPendingApprovals } from '../domain/approval-detection.js';

export default function PendingApprovalsIndicator({ messages, dismissedApprovals }) {
  const pendingCount = countPendingApprovals(messages, dismissedApprovals);

  if (pendingCount === 0) return null;

  return (
    <div class="pending-approvals-indicator">
      <button
        class="btn btn-warning btn-sm"
        $onclick={['show-next-approval']}
        title="Show pending approval requests"
      >
        ⚠️ {pendingCount} Pending Approval{pendingCount > 1 ? 's' : ''}
      </button>
    </div>
  );
}
