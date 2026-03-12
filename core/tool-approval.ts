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
 * - Optional durable synthetic approval prompt/resolution message persistence
 *
 * Implementation Notes:
 * - Delegates prompt transport/runtime behavior to `requestWorldOption`
 * - Returns normalized results to reduce duplicated approval mapping logic in tools
 * - When message context is available, persists canonical approval prompt/resolution artifacts
 *
 * Recent Changes:
 * - 2026-03-12: Added optional durable approval prompt/resolution persistence with separate requestId vs owning toolCallId support.
 * - 2026-02-28: Initial shared approval helper extracted for `load_skill`, `create_agent`, and `web_fetch`.
 */

import { requestWorldOption, type HitlOption } from './hitl.js';
import { createStorageWithWrappers } from './storage/storage-factory.js';
import { generateId } from './utils.js';
import { type AgentMessage, type World } from './types.js';

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
  toolCallId?: string;
  title: string;
  message: string;
  options: HitlOption[];
  defaultOptionId: string;
  approvedOptionIds: string[];
  metadata?: Record<string, unknown>;
  agentName?: string | null;
  messages?: AgentMessage[];
};

function normalizeApprovalMessages(messages: AgentMessage[] | undefined): AgentMessage[] | null {
  return Array.isArray(messages) ? messages : null;
}

function resolveApprovalRequestId(request: ToolApprovalRequest): string {
  const explicitRequestId = String(request.requestId || '').trim();
  if (explicitRequestId) {
    return explicitRequestId;
  }

  const explicitToolCallId = String(request.toolCallId || '').trim();
  if (explicitToolCallId) {
    return `${explicitToolCallId}::approval`;
  }

  const metadataToolCallId = request.metadata && typeof request.metadata.toolCallId === 'string'
    ? String(request.metadata.toolCallId).trim()
    : '';
  if (metadataToolCallId) {
    return `${metadataToolCallId}::approval`;
  }

  return generateId();
}

function resolveOwningToolCallId(request: ToolApprovalRequest, requestId: string): string {
  const explicitToolCallId = String(request.toolCallId || '').trim();
  if (explicitToolCallId) {
    return explicitToolCallId;
  }

  const metadataToolCallId = request.metadata && typeof request.metadata.toolCallId === 'string'
    ? String(request.metadata.toolCallId).trim()
    : '';
  if (metadataToolCallId) {
    return metadataToolCallId;
  }

  return requestId;
}

function resolveApprovalDefaultOptionLabel(request: ToolApprovalRequest): string | undefined {
  const defaultOptionId = String(request.defaultOptionId || '').trim();
  if (!defaultOptionId) {
    return undefined;
  }

  const match = request.options.find((option) => String(option?.id || '').trim() === defaultOptionId);
  const label = String(match?.label || '').trim();
  return label || undefined;
}

function buildApprovalAssistantContent(metadata: Record<string, unknown> | undefined): string {
  const source = typeof metadata?.source === 'string' ? metadata.source.trim() : '';
  const skillId = typeof metadata?.skillId === 'string' ? metadata.skillId.trim() : '';
  if (source === 'load_skill' && skillId) {
    return `Calling tool: human_intervention_request (skill_id: "${skillId}")`;
  }

  return 'Calling tool: human_intervention_request';
}

async function persistApprovalAgentMemoryIfAvailable(request: ToolApprovalRequest): Promise<void> {
  const messages = normalizeApprovalMessages(request.messages);
  const worldId = String(request.world?.id || '').trim();
  const agentName = String(request.agentName || '').trim();
  const world = request.world as any;

  if (!messages || !worldId || !agentName || !world?.agents || typeof world.agents.get !== 'function') {
    return;
  }

  const agent = world.agents.get(agentName);
  if (!agent) {
    return;
  }

  const storage = await createStorageWithWrappers();
  await storage.saveAgent(worldId, agent);
}

async function persistApprovalPromptMessage(options: {
  request: ToolApprovalRequest;
  requestId: string;
  toolCallId: string;
}): Promise<void> {
  const messages = normalizeApprovalMessages(options.request.messages);
  if (!messages) {
    return;
  }

  const existingPrompt = messages.some((message) =>
    message?.role === 'assistant'
    && Array.isArray(message?.tool_calls)
    && message.tool_calls.some((toolCall: any) => String(toolCall?.id || '').trim() === options.requestId)
  );
  if (existingPrompt) {
    return;
  }

  const approvalMetadata = {
    ...(options.request.metadata && typeof options.request.metadata === 'object' ? options.request.metadata : {}),
    toolCallId: options.toolCallId,
  };
  const promptArguments = {
    title: options.request.title,
    question: options.request.message,
    options: options.request.options.map((option) => ({
      id: option.id,
      label: option.label,
      ...(typeof option.description === 'string' && option.description.trim()
        ? { description: option.description.trim() }
        : {}),
    })),
    defaultOptionId: options.request.defaultOptionId,
    ...(resolveApprovalDefaultOptionLabel(options.request)
      ? { defaultOption: resolveApprovalDefaultOptionLabel(options.request) }
      : {}),
    metadata: approvalMetadata,
  };

  messages.push({
    role: 'assistant',
    content: buildApprovalAssistantContent(options.request.metadata),
    tool_calls: [{
      id: options.requestId,
      type: 'function',
      function: {
        name: 'human_intervention_request',
        arguments: JSON.stringify(promptArguments),
      },
    }],
    sender: String(options.request.agentName || '').trim() || 'assistant',
    createdAt: new Date(),
    chatId: options.request.chatId,
    messageId: generateId(),
    replyToMessageId: options.toolCallId || undefined,
    agentId: String(options.request.agentName || '').trim() || undefined,
  } as AgentMessage);

  await persistApprovalAgentMemoryIfAvailable(options.request);
}

async function persistApprovalResolutionMessage(options: {
  request: ToolApprovalRequest;
  requestId: string;
  toolCallId: string;
  result: ToolApprovalResult;
}): Promise<void> {
  const messages = normalizeApprovalMessages(options.request.messages);
  if (!messages) {
    return;
  }

  const existingResolution = messages.some((message) =>
    message?.role === 'tool'
    && String(message?.tool_call_id || '').trim() === options.requestId
  );
  if (existingResolution) {
    return;
  }

  const toolName = options.request.metadata && typeof options.request.metadata.tool === 'string'
    ? String(options.request.metadata.tool).trim() || null
    : null;
  const payload = {
    requestId: options.requestId,
    toolCallId: options.toolCallId,
    tool: toolName,
    optionId: options.result.optionId,
    source: options.result.source,
    reason: options.result.reason,
    status: options.result.approved
      ? 'approved'
      : options.result.reason === 'timeout'
        ? 'timeout'
        : 'denied',
  };

  messages.push({
    role: 'tool',
    content: JSON.stringify(payload),
    tool_call_id: options.requestId,
    sender: String(options.request.agentName || '').trim() || 'assistant',
    createdAt: new Date(),
    chatId: options.request.chatId,
    messageId: generateId(),
    agentId: String(options.request.agentName || '').trim() || undefined,
  } as AgentMessage);

  await persistApprovalAgentMemoryIfAvailable(options.request);
}

export async function requestToolApproval(request: ToolApprovalRequest): Promise<ToolApprovalResult> {
  const approvedSet = new Set(
    request.approvedOptionIds
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );

  const requestId = resolveApprovalRequestId(request);
  const toolCallId = resolveOwningToolCallId(request, requestId);

  await persistApprovalPromptMessage({
    request,
    requestId,
    toolCallId,
  });

  const resolution = await requestWorldOption(request.world, {
    requestId,
    title: request.title,
    message: request.message,
    chatId: request.chatId,
    defaultOptionId: request.defaultOptionId,
    options: request.options,
    metadata: {
      ...(request.metadata && typeof request.metadata === 'object' ? request.metadata : {}),
      toolCallId,
    },
    agentName: request.agentName ?? null,
  });

  const result: ToolApprovalResult = approvedSet.has(resolution.optionId)
    ? {
      approved: true,
      reason: 'approved',
      optionId: resolution.optionId,
      source: resolution.source,
    }
    : {
      approved: false,
      reason: resolution.source === 'timeout' ? 'timeout' : 'user_denied',
      optionId: resolution.optionId,
      source: resolution.source,
    };

  await persistApprovalResolutionMessage({
    request,
    requestId,
    toolCallId,
    result,
  });

  return result;
}
