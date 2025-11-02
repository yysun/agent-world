/**
 * useEventProcessor Hook
 * 
 * Purpose: Process WebSocket events and update world state
 * 
 * Features:
 * - Event type routing (message, sse, world, crud, status, error)
 * - Batching updates during replay for performance
 * - Throttling UI updates (max 60fps)
 * - Uses domain logic from ws/domain.ts
 * 
 * Responsibilities:
 * - Process WSEvent and WSMessage types
 * - Update world state via callbacks
 * - Handle all event types from protocol
 * - Performance optimizations (batching, throttling)
 * 
 * Created: 2025-11-02 - Phase 1: Implement event processing
 */

import { useCallback, useRef } from 'react';
import type { WSMessage, Message } from '../../ws/types.js';
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
): (message: WSMessage) => void {
  const {
    batchDuringReplay = true,
    batchSize = 50,
    throttleMs = 16 // ~60fps
  } = options;

  const batchRef = useRef<WSMessage[]>([]);
  const lastUpdateRef = useRef<number>(0);
  const processingRef = useRef<boolean>(false);

  const processBatch = useCallback(() => {
    if (batchRef.current.length === 0 || processingRef.current) {
      return;
    }

    processingRef.current = true;
    const batch = batchRef.current.splice(0, batchSize);

    batch.forEach(msg => {
      processMessage(msg);
    });

    processingRef.current = false;

    // Schedule next batch if needed
    if (batchRef.current.length > 0) {
      setTimeout(processBatch, 0);
    }
  }, [batchSize]);

  const processMessage = useCallback((msg: WSMessage) => {
    const { type, payload } = msg;

    switch (type) {
      case 'event': {
        // Server sends event update
        if (!payload) break;

        const { type: eventType, data } = payload;

        if (eventType === 'message') {
          // New message event
          const message: Message = {
            id: data.id || `msg-${Date.now()}`,
            type: data.type || 'message',
            sender: data.sender || 'unknown',
            text: data.content || data.text || '',
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
            messageId: data.messageId,
            replyToMessageId: data.replyToMessageId,
            worldName: data.worldName
          };
          worldState.addMessage(message);
        } else if (eventType === 'sse') {
          // SSE streaming event
          const agentName = data.sender || data.agentName;

          if (data.type === 'start') {
            worldState.updateAgentStatus(agentName, {
              agentId: agentName,
              message: 'Starting response...',
              phase: 'thinking',
              activityId: null,
              updatedAt: Date.now()
            });
          } else if (data.type === 'end') {
            worldState.updateAgentStatus(agentName, {
              agentId: agentName,
              message: 'Completed',
              phase: 'thinking',
              activityId: null,
              updatedAt: Date.now()
            });
          }
        } else if (eventType === 'world') {
          // World activity event
          const source = data.source || '';

          if (data.type === 'response-start' && source.startsWith('agent:')) {
            const agentName = source.replace('agent:', '');
            worldState.updateAgentStatus(agentName, {
              agentId: agentName,
              message: 'Processing...',
              phase: 'thinking',
              activityId: null,
              updatedAt: Date.now()
            });
          } else if (data.type === 'response-end' && source.startsWith('agent:')) {
            const agentName = source.replace('agent:', '');
            worldState.updateAgentStatus(agentName, {
              agentId: agentName,
              message: 'Idle',
              phase: 'thinking',
              activityId: null,
              updatedAt: Date.now()
            });
          }
        }
        break;
      }

      case 'crud': {
        // CRUD event (agent/chat/world changes)
        // For now, just log - could trigger refresh
        console.log('CRUD event:', payload);
        break;
      }

      case 'status': {
        // Processing status update
        if (payload?.replayProgress) {
          const { current, total } = payload.replayProgress;
          worldState.setReplayProgress(current, total);
        }
        if (payload?.replayComplete) {
          worldState.setReplayProgress(0, 0); // Marks replay as complete
        }
        break;
      }

      case 'error': {
        // Error message
        worldState.setError(msg.error || 'Unknown error');
        break;
      }

      default:
        // Ignore other message types (pong, etc.)
        break;
    }
  }, [worldState]);

  const processEvent = useCallback((msg: WSMessage) => {
    // Check if we should batch (during replay)
    const shouldBatch = batchDuringReplay && worldState.isReplaying;

    if (shouldBatch) {
      batchRef.current.push(msg);

      // Start processing if not already running
      if (!processingRef.current) {
        processBatch();
      }
    } else {
      // Check throttle
      const now = Date.now();
      if (now - lastUpdateRef.current < throttleMs) {
        // Queue for later
        batchRef.current.push(msg);
        setTimeout(() => {
          if (batchRef.current.length > 0) {
            const batch = batchRef.current.splice(0);
            batch.forEach(processMessage);
            lastUpdateRef.current = Date.now();
          }
        }, throttleMs);
      } else {
        processMessage(msg);
        lastUpdateRef.current = now;
      }
    }
  }, [batchDuringReplay, throttleMs, worldState.isReplaying, processBatch, processMessage]);

  return processEvent;
}
