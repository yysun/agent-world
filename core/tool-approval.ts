/**
 * Tool Approval Module - Shared HITL approval flow for built-in tools.
 *
 * Purpose:
 * - Provide a reusable wrapper around HITL option prompts for tool-level approvals.
 *
 * Key Features:
 * - Standardized approval result contract (`approved`, `reason`, `optionId`, `source`)
 * - Configurable options/default and multiple approved option IDs
 * - Deterministic deny/timeout handling for sensitive tool operations
 *
 * Implementation Notes:
 * - Delegates prompt transport/runtime behavior to `requestWorldOption`
 * - Returns normalized results to reduce duplicated approval mapping logic in tools
 *
 * Recent Changes:
 * - 2026-02-28: Initial shared approval helper extracted for `load_skill`, `create_agent`, and `web_fetch`.
 */

import { requestWorldOption, type HitlOption } from './hitl.js';
import { type World } from './types.js';

export type ToolApprovalReason = 'approved' | 'user_denied' | 'timeout';

export type ToolApprovalResult = {
  approved: boolean;
  reason: ToolApprovalReason;
  optionId: string;
  source: 'user' | 'timeout';
};

export type ToolApprovalRequest = {
  world: World;
  chatId: string | null;
  requestId?: string;
  title: string;
  message: string;
  options: HitlOption[];
  defaultOptionId: string;
  approvedOptionIds: string[];
  metadata?: Record<string, unknown>;
  agentName?: string | null;
};

export async function requestToolApproval(request: ToolApprovalRequest): Promise<ToolApprovalResult> {
  const approvedSet = new Set(
    request.approvedOptionIds
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );

  const resolution = await requestWorldOption(request.world, {
    requestId: request.requestId,
    title: request.title,
    message: request.message,
    chatId: request.chatId,
    defaultOptionId: request.defaultOptionId,
    options: request.options,
    metadata: request.metadata,
    agentName: request.agentName ?? null,
  });

  if (approvedSet.has(resolution.optionId)) {
    return {
      approved: true,
      reason: 'approved',
      optionId: resolution.optionId,
      source: resolution.source,
    };
  }

  return {
    approved: false,
    reason: resolution.source === 'timeout' ? 'timeout' : 'user_denied',
    optionId: resolution.optionId,
    source: resolution.source,
  };
}
