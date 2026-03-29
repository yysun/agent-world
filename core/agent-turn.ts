/**
 * Agent Turn Metadata Helpers
 *
 * Purpose:
 * - Centralize explicit turn-state and terminal-outcome metadata helpers.
 *
 * Key Features:
 * - Stable turn resume-key generation for unresolved tool-call resumes.
 * - Helpers for waiting-tool and terminal assistant metadata.
 * - Detection of successful `send_message` handoff dispatch results.
 * - In-process resume leases to prevent duplicate same-turn resume execution.
 *
 * Implementation Notes:
 * - Metadata is designed to be persisted on assistant/tool transcript records.
 * - Resume leases are intentionally process-local; persisted transcript state remains authoritative.
 *
 * Recent Changes:
 * - 2026-03-29: Initial helper module for explicit agent-turn loop metadata and resume guards.
 */

import type { AgentMessage, AgentTurnAction, AgentTurnMetadata, AgentTurnOutcome, AgentTurnSource } from './types.js';

const activeResumeLeases = new Set<string>();

function nowIsoString(): string {
  return new Date().toISOString();
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
