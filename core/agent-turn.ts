/**
 * Agent Turn Metadata Helpers
 *
 * Purpose:
 * - Centralize explicit turn-state and terminal-outcome metadata helpers.
 *
 * Key Features:
 * - Stable turn resume-key generation for unresolved tool-call resumes.
 * - Helpers for waiting-tool and terminal assistant metadata.
 * - Canonical action classification for tool calls, handoffs, and HITL requests.
 * - Detection of successful `send_message` handoff dispatch results.
 * - Read-model helper to resolve persisted turn lifecycle state from chat messages.
 * - In-process resume leases to prevent duplicate same-turn resume execution.
 *
 * Implementation Notes:
 * - Metadata is designed to be persisted on assistant/tool transcript records.
 * - Resume leases are intentionally process-local; persisted transcript state remains authoritative.
 *
 * Recent Changes:
 * - 2026-03-29: Added canonical HITL/handoff action classification and waiting-for-HITL metadata helpers.
 * - 2026-03-29: Added persisted turn lifecycle read-model helper for queue/restore terminality decisions.
 * - 2026-03-29: Initial helper module for explicit agent-turn loop metadata and resume guards.
 */

import { isHitlToolName } from './hitl-tool-names.js';
import type { AgentMessage, AgentTurnAction, AgentTurnMetadata, AgentTurnOutcome, AgentTurnSource } from './types.js';

const activeResumeLeases = new Set<string>();

function nowIsoString(): string {
  return new Date().toISOString();
}

export function resolveAgentTurnActionForToolName(toolName: string): AgentTurnAction {
  const normalizedToolName = String(toolName || '').trim();
  if (normalizedToolName === 'send_message') {
    return 'agent_handoff';
  }
  if (isHitlToolName(normalizedToolName)) {
    return 'hitl_request';
  }
  return 'tool_call';
}

export function buildAgentTurnResumeKey(params: {
  worldId: string;
  agentId: string;
  chatId: string;
  assistantMessageId: string;
  toolCallId: string;
}): string {
  return [
    String(params.worldId || '').trim(),
    String(params.agentId || '').trim(),
    String(params.chatId || '').trim(),
    String(params.assistantMessageId || '').trim(),
    String(params.toolCallId || '').trim(),
  ].join(':');
}

export function setWaitingForToolResultMetadata(
  message: AgentMessage,
  params: {
    turnId: string;
    source: AgentTurnSource;
    action?: AgentTurnAction;
    resumeKey?: string;
  }
): AgentMessage {
  message.agentTurn = {
    turnId: params.turnId,
    source: params.source,
    action: params.action ?? 'tool_call',
    state: 'waiting_for_tool_result',
    resumeKey: params.resumeKey,
    updatedAt: nowIsoString(),
  };
  return message;
}

export function setWaitingForHitlMetadata(
  message: AgentMessage,
  params: {
    turnId: string;
    source: AgentTurnSource;
    action?: AgentTurnAction;
    resumeKey?: string;
  }
): AgentMessage {
  message.agentTurn = {
    turnId: params.turnId,
    source: params.source,
    action: params.action ?? 'hitl_request',
    state: 'waiting_for_hitl',
    resumeKey: params.resumeKey,
    updatedAt: nowIsoString(),
  };
  return message;
}

export function clearWaitingForToolResultMetadata(message: AgentMessage): AgentMessage {
  if (!message.agentTurn) {
    return message;
  }

  const nextMetadata: AgentTurnMetadata = {
    ...message.agentTurn,
    state: undefined,
    updatedAt: nowIsoString(),
  };

  if (!nextMetadata.outcome && !nextMetadata.completion && !nextMetadata.resumeKey && !nextMetadata.action) {
    delete message.agentTurn;
    return message;
  }

  message.agentTurn = nextMetadata;
  return message;
}

export function setTerminalTurnMetadata(
  message: AgentMessage,
  params: {
    turnId: string;
    source: AgentTurnSource;
    action: AgentTurnAction;
    outcome: AgentTurnOutcome;
  }
): AgentMessage {
  message.agentTurn = {
    turnId: params.turnId,
    source: params.source,
    action: params.action,
    outcome: params.outcome,
    completion: {
      mechanism: 'assistant_message_metadata',
      completedAt: nowIsoString(),
    },
    updatedAt: nowIsoString(),
  };
  return message;
}

export function isSuccessfulSendMessageDispatchResult(serializedToolResult: string): boolean {
  try {
    const parsed = JSON.parse(String(serializedToolResult || ''));
    return Boolean(
      parsed
      && typeof parsed === 'object'
      && parsed.ok === true
      && Number(parsed.dispatched || 0) > 0
      && (parsed.status === 'dispatched' || parsed.status === 'partial')
    );
  } catch {
    return false;
  }
}

export function acquireAgentTurnResumeLease(resumeKey: string): boolean {
  const normalized = String(resumeKey || '').trim();
  if (!normalized) {
    return false;
  }
  if (activeResumeLeases.has(normalized)) {
    return false;
  }
  activeResumeLeases.add(normalized);
  return true;
}

export function releaseAgentTurnResumeLease(resumeKey: string): void {
  const normalized = String(resumeKey || '').trim();
  if (!normalized) {
    return;
  }
  activeResumeLeases.delete(normalized);
}

export type AgentTurnLifecycleState =
  | { status: 'terminal'; outcome: AgentTurnOutcome; action?: AgentTurnAction; messageId?: string }
  | { status: 'waiting_for_tool_result'; action?: AgentTurnAction; messageId?: string }
  | { status: 'waiting_for_hitl'; action?: AgentTurnAction; messageId?: string }
  | { status: 'running'; action?: AgentTurnAction; messageId?: string }
  | { status: 'missing' };

function getMetadataTimestamp(message: AgentMessage, metadata: AgentTurnMetadata): number {
  const completionTime = String(metadata.completion?.completedAt || '').trim();
  if (completionTime) {
    const parsed = Date.parse(completionTime);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const updatedTime = String(metadata.updatedAt || '').trim();
  if (updatedTime) {
    const parsed = Date.parse(updatedTime);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const createdAt = message.createdAt instanceof Date
    ? message.createdAt.getTime()
    : Date.parse(String(message.createdAt || ''));
  return Number.isFinite(createdAt) ? createdAt : 0;
}

export function readAgentTurnLifecycleFromMessages(
  messages: AgentMessage[],
  params: {
    turnId: string;
    chatId?: string | null;
  }
): AgentTurnLifecycleState {
  const turnId = String(params.turnId || '').trim();
  if (!turnId) {
    return { status: 'missing' };
  }

  const normalizedChatId = String(params.chatId || '').trim();
  const scopedMessages = (Array.isArray(messages) ? messages : []).filter((message) => {
    if (!normalizedChatId) {
      return true;
    }
    return String(message?.chatId || '').trim() === normalizedChatId;
  });

  const matchingEntries = scopedMessages
    .map((message) => ({
      message,
      metadata: message.agentTurn,
    }))
    .filter((entry): entry is { message: AgentMessage; metadata: AgentTurnMetadata } => {
      return Boolean(entry.metadata && String(entry.metadata.turnId || '').trim() === turnId);
    })
    .sort((left, right) => getMetadataTimestamp(right.message, right.metadata) - getMetadataTimestamp(left.message, left.metadata));

  if (matchingEntries.length === 0) {
    return { status: 'missing' };
  }

  const terminalEntry = matchingEntries.find((entry) => Boolean(entry.metadata.outcome));
  if (terminalEntry?.metadata.outcome) {
    return {
      status: 'terminal',
      outcome: terminalEntry.metadata.outcome,
      action: terminalEntry.metadata.action,
      messageId: terminalEntry.message.messageId,
    };
  }

  const waitingHitlEntry = matchingEntries.find((entry) => entry.metadata.state === 'waiting_for_hitl');
  if (waitingHitlEntry) {
    return {
      status: 'waiting_for_hitl',
      action: waitingHitlEntry.metadata.action,
      messageId: waitingHitlEntry.message.messageId,
    };
  }

  const waitingToolEntry = matchingEntries.find((entry) => entry.metadata.state === 'waiting_for_tool_result');
  if (waitingToolEntry) {
    return {
      status: 'waiting_for_tool_result',
      action: waitingToolEntry.metadata.action,
      messageId: waitingToolEntry.message.messageId,
    };
  }

  const runningEntry = matchingEntries[0];
  return {
    status: 'running',
    action: runningEntry.metadata.action,
    messageId: runningEntry.message.messageId,
  };
}
