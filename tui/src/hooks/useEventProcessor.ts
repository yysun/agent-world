/**
 * useEventProcessor Hook
 * 
 * Purpose: Process WebSocket events and update world state
 * 
 * Features:
 * - Event type routing (message, sse, world, approval) matching demo.ts structure
 * - Flattened event structure: { type: 'event', eventType: '...', payload: {...} }
 * - SSE streaming support - accumulate chunks in streaming messages
 * - Duplicate message prevention - skip final messages already shown via streaming
 * - World event display - tool execution and activity tracking (always shown)
 * - Tool approval event processing - show approval requests in UI
 * - Batching updates during replay for performance
 * - Throttling UI updates (max 60fps)
 * - Backward compatibility for legacy event types (chunk, start, end)
 * 
 * Responsibilities:
 * - Process events from ws-client (same structure as demo.ts)
 * - Update world state via callbacks
 * - Handle all event types from protocol including approval requests
 * - Display streaming responses in real-time
 * - Show world events (tool calls, activity) as system messages
 * - Route approval requests to ApprovalDialog via state management
 * - Performance optimizations (batching, throttling)
 * 
 * Created: 2025-11-02 - Phase 1: Implement event processing
 * Updated: 2025-11-02 - Add SSE streaming and world event display
 * Updated: 2025-11-02 - Prevent duplicate messages, always show world events
 * Updated: 2025-11-02 - Fix event structure to match demo.ts (eventType at top level)
 * Updated: Phase 7 - Add tool approval event processing
 */

import { useCallback, useRef } from 'react';
import type { WSMessage, Message } from '../../../ws/types.js';
import type { UseWorldStateReturn, CommandResult } from './useWorldState.js';

export interface UseEventProcessorOptions {
  batchDuringReplay?: boolean;    // Buffer updates during replay
  batchSize?: number;              // Process N at a time
  throttleMs?: number;             // Max update frequency
}

/**
 * Hook for processing WebSocket events
 */
export function useEventProcessor(
  worldState: UseWorldStateReturn,
  options: UseEventProcessorOptions = {}
): (event: any) => void {
  const {
    batchDuringReplay = true,
    batchSize = 50,
    throttleMs = 16 // ~60fps
  } = options;

  const batchRef = useRef<any[]>([]);
  const lastUpdateRef = useRef<number>(0);
  const processingRef = useRef<boolean>(false);

  const processBatch = useCallback(() => {
    if (batchRef.current.length === 0 || processingRef.current) {
      return;
    }

    processingRef.current = true;
    const batch = batchRef.current.splice(0, batchSize);

    batch.forEach(event => {
      processEvent(event);
    });

    processingRef.current = false;

    // Schedule next batch if needed
    if (batchRef.current.length > 0) {
      setTimeout(processBatch, 0);
    }
  }, [batchSize]);

  // Track streaming message
  const streamingMessageRef = useRef<{ id: string; sender: string; content: string } | null>(null);

  const processEvent = useCallback((event: any) => {
    // Flattened structure from ws-client: { type: 'event', eventType: 'world'|'message'|etc, payload: <data> }
    // Same structure as demo.ts
    const eventType = event.eventType;
    const payload = event.payload;

    // Debug logging
    if (process.env.DEBUG_EVENTS) {
      console.log('[TUI Event] Raw event:', JSON.stringify(event, null, 2));
      console.log('[TUI Event] eventType:', eventType);
      console.log('[TUI Event] payload:', JSON.stringify(payload, null, 2));
    }

    if (!eventType) return;

    switch (eventType) {
      case 'message': {
        // Message event from world (agent or human)
        const sender = payload?.sender || 'unknown';
        const content = payload?.content || '';
        const messageId = payload?.messageId;

        // Skip if this message was already displayed via streaming
        // Check if we have a streaming message with this messageId
        const existingMessages = worldState.messages;
        const alreadyDisplayed = messageId && existingMessages.some(
          msg => msg.messageId === messageId && !msg.isStreaming
        );

        if (alreadyDisplayed) {
          if (process.env.DEBUG_EVENTS) {
            console.log('[TUI] Skipping duplicate message:', messageId);
          }
          break;
        }

        const message: Message = {
          id: messageId || `msg-${Date.now()}`,
          type: 'message',
          sender: sender,
          text: content,
          createdAt: new Date(),
          messageId: messageId,
          replyToMessageId: payload?.replyToMessageId,
          worldName: payload?.worldName
        };
        worldState.addMessage(message);
        break;
      }

      case 'sse': {
        // SSE streaming events - payload contains the SSE event (start, chunk, end, error)
        const sseType = payload?.type;

        if (sseType === 'start') {
          // Stream start - create streaming message placeholder
          const agentName = payload?.agentName || 'Agent';
          const messageId = payload?.messageId || `streaming-${Date.now()}`;

          // Create placeholder message
          const streamingMessage: Message = {
            id: messageId,
            type: 'message',
            sender: agentName,
            text: '',
            createdAt: new Date(),
            isStreaming: true,
            messageId: messageId
          };

          streamingMessageRef.current = {
            id: messageId,
            sender: agentName,
            content: ''
          };

          worldState.addMessage(streamingMessage);
          worldState.updateAgentStatus(agentName, {
            agentId: agentName,
            message: 'Streaming response...',
            phase: 'thinking',
            activityId: null,
            updatedAt: Date.now()
          });
        }
        else if (sseType === 'chunk') {
          // Streaming chunk - accumulate content in streaming message
          const content = payload?.content || '';

          if (streamingMessageRef.current && content) {
            streamingMessageRef.current.content += content;

            // Update the streaming message in state
            worldState.updateMessage(streamingMessageRef.current.id, {
              text: streamingMessageRef.current.content
            });
          }
        }
        else if (sseType === 'end') {
          // Stream end - finalize streaming message
          const agentName = payload?.agentName || 'Agent';

          if (streamingMessageRef.current) {
            // Mark message as no longer streaming
            worldState.updateMessage(streamingMessageRef.current.id, {
              isStreaming: false
            });
            streamingMessageRef.current = null;
          }

          worldState.updateAgentStatus(agentName, {
            agentId: agentName,
            message: 'Idle',
            phase: 'thinking',
            activityId: null,
            updatedAt: Date.now()
          });
        }
        else if (sseType === 'error') {
          // Stream error
          const error = payload?.error || 'Unknown error';
          worldState.setError(error);
        }
        break;
      }

      case 'chunk':
      case 'start':
      case 'end': {
        // DEPRECATED: Legacy SSE events for backward compatibility
        // New format uses eventType='sse' with payload.type='chunk'|'start'|'end'
        if (eventType === 'start') {
          const agentName = payload?.agentName || 'Agent';
          const messageId = payload?.messageId || `streaming-${Date.now()}`;
          const streamingMessage: Message = {
            id: messageId,
            type: 'message',
            sender: agentName,
            text: '',
            createdAt: new Date(),
            isStreaming: true,
            messageId: messageId
          };
          streamingMessageRef.current = {
            id: messageId,
            sender: agentName,
            content: ''
          };
          worldState.addMessage(streamingMessage);
          worldState.updateAgentStatus(agentName, {
            agentId: agentName,
            message: 'Streaming response...',
            phase: 'thinking',
            activityId: null,
            updatedAt: Date.now()
          });
        }
        else if (eventType === 'chunk') {
          const content = payload?.content || '';
          if (streamingMessageRef.current && content) {
            streamingMessageRef.current.content += content;
            worldState.updateMessage(streamingMessageRef.current.id, {
              text: streamingMessageRef.current.content
            });
          }
        }
        else if (eventType === 'end') {
          if (streamingMessageRef.current) {
            worldState.updateMessage(streamingMessageRef.current.id, {
              isStreaming: false
            });
            streamingMessageRef.current = null;
          }
        }
        break;
      }

      case 'approval': {
        // Tool approval request event
        const approvalRequest = payload;
        if (approvalRequest) {
          worldState.showApprovalRequest(approvalRequest);
        }
        break;
      }

      case 'world': {
        // World event - display tool execution and activity tracking
        const subType = payload?.type;
        const source = payload?.source || '';
        const agentName = payload?.agentName || payload?.sender || (source.startsWith('agent:') ? source.replace('agent:', '') : null);

        // Tool events
        if (subType === 'tool-start' && payload?.toolExecution) {
          const toolName = payload.toolExecution.toolName;
          const displayName = agentName || 'agent';
          const systemMessage: Message = {
            id: `tool-${Date.now()}`,
            type: 'system',
            sender: 'system',
            text: `${displayName} calling tool - ${toolName} ...`,
            createdAt: new Date(),
            isSystemEvent: true
          };
          worldState.addMessage(systemMessage);
        }
        else if (subType === 'tool-progress' && payload?.toolExecution) {
          const toolName = payload.toolExecution.toolName;
          const displayName = agentName || 'agent';
          const systemMessage: Message = {
            id: `tool-${Date.now()}`,
            type: 'system',
            sender: 'system',
            text: `${displayName} continuing tool - ${toolName} ...`,
            createdAt: new Date(),
            isSystemEvent: true
          };
          worldState.addMessage(systemMessage);
        }
        else if (subType === 'tool-result' && payload?.toolExecution) {
          const { toolName, duration, resultSize } = payload.toolExecution;
          const durationText = duration ? `${Math.round(duration)}ms` : 'completed';
          const sizeText = resultSize ? `, ${resultSize} chars` : '';
          const displayName = agentName || 'agent';
          const systemMessage: Message = {
            id: `tool-${Date.now()}`,
            type: 'system',
            sender: 'system',
            text: `${displayName} tool finished - ${toolName} (${durationText}${sizeText})`,
            createdAt: new Date(),
            isSystemEvent: true
          };
          worldState.addMessage(systemMessage);
        }
        else if (subType === 'tool-error' && payload?.toolExecution) {
          const { toolName, error: toolError } = payload.toolExecution;
          const displayName = agentName || 'agent';
          const systemMessage: Message = {
            id: `tool-${Date.now()}`,
            type: 'system',
            sender: 'system',
            text: `${displayName} tool failed - ${toolName}: ${toolError}`,
            createdAt: new Date(),
            isSystemEvent: true
          };
          worldState.addMessage(systemMessage);
        }
        // Activity events - always show (matching demo.ts behavior)
        else if (subType === 'response-start' || subType === 'response-end' || subType === 'idle') {
          const pending = payload?.pendingOperations || 0;
          const activityId = payload?.activityId || 0;
          const activeSources = payload?.activeSources || [];
          const sourceName = source.startsWith('agent:') ? source.replace('agent:', '') : source;

          let activityText = '';
          if (subType === 'response-start') {
            const message = sourceName ? `${sourceName} started processing` : 'started';
            activityText = `${message} | pending: ${pending} | activityId: ${activityId} | source: ${sourceName}`;
          } else if (subType === 'idle' && pending === 0) {
            activityText = `All processing complete | pending: ${pending} | activityId: ${activityId} | source: ${sourceName}`;
          } else if (subType === 'response-end' && pending > 0 && activeSources.length > 0) {
            const activeList = activeSources.map((s: string) => s.startsWith('agent:') ? s.slice('agent:'.length) : s).join(', ');
            activityText = `Active: ${activeList} (${pending} pending) | pending: ${pending} | activityId: ${activityId} | source: ${sourceName}`;
          }

          if (activityText) {
            const systemMessage: Message = {
              id: `activity-${Date.now()}-${Math.random()}`,
              type: 'system',
              sender: 'system',
              text: `[World] ${activityText}`,
              createdAt: new Date(),
              isSystemEvent: true
            };
            worldState.addMessage(systemMessage);
          }

          // Update agent status
          if (agentName) {
            if (subType === 'response-start') {
              worldState.updateAgentStatus(agentName, {
                agentId: agentName,
                message: 'Processing...',
                phase: 'thinking',
                activityId: null,
                updatedAt: Date.now()
              });
            } else if (subType === 'response-end' || subType === 'idle') {
              worldState.updateAgentStatus(agentName, {
                agentId: agentName,
                message: 'Idle',
                phase: 'thinking',
                activityId: null,
                updatedAt: Date.now()
              });
            }
          }
        }
        break;
      }

      default:
        // Unknown event type
        if (process.env.DEBUG_EVENTS) {
          console.log('[DEBUG] Unknown event type:', eventType, payload);
        }
        break;
    }
  }, [worldState]);

  const handleEvent = useCallback((event: any) => {
    // Check if we should batch (during replay)
    const shouldBatch = batchDuringReplay && worldState.isReplaying;

    if (shouldBatch) {
      batchRef.current.push(event);

      // Start processing if not already running
      if (!processingRef.current) {
        processBatch();
      }
    } else {
      // Check throttle
      const now = Date.now();
      if (now - lastUpdateRef.current < throttleMs) {
        // Queue for later
        batchRef.current.push(event);
        setTimeout(() => {
          if (batchRef.current.length > 0) {
            const batch = batchRef.current.splice(0);
            batch.forEach(processEvent);
            lastUpdateRef.current = Date.now();
          }
        }, throttleMs);
      } else {
        processEvent(event);
        lastUpdateRef.current = now;
      }
    }
  }, [batchDuringReplay, throttleMs, worldState.isReplaying, processBatch, processEvent]);

  return handleEvent;
}
