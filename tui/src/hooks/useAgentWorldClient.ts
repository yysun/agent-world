/**
 * useAgentWorldClient Hook
 * 
 * Purpose: High-level WebSocket protocol operations
 * 
 * Features:
 * - Subscribe to world events
 * - Enqueue messages for processing
 * - Execute CLI commands (with automatic parsing)
 * - Send approval responses for tool approval system
 * - Enhanced protocol: agentId embedded in JSON (server auto-prepends @mention)
 * - Unsubscribe from world
 * - Ping/heartbeat
 * 
 * Responsibilities:
 * - Protocol operations only
 * - Command parsing and mapping
 * - Tool approval response communication using enhanced protocol
 * - Depends on WebSocketClient instance
 * - No state management
 * - No event processing
 * 
 * Created: 2025-11-02 - Phase 1: Implement focused hooks
 * Updated: 2025-11-02 - Fix command execution - parse command strings and map to server format
 * Updated: Phase 7 - Add tool approval response functionality
 * Updated: 2025-11-06 - Updated approval protocol - agentId now embedded in JSON (matches CLI/Web)
 */

import { useCallback, useEffect } from 'react';
import type { WebSocketClient } from '../../../ws/ws-client.js';
import type { WSMessage } from '../../../ws/types.js';
import type { ApprovalResponse } from '../types/index.js';

export interface UseAgentWorldClientOptions {
  onEvent?: (event: any) => void;
  onStatus?: (status: any) => void;
}

export interface UseAgentWorldClientReturn {
  subscribe: (worldId: string, chatId: string | null, replayFrom: 'beginning' | number) => Promise<void>;
  enqueue: (worldId: string, chatId: string | null, content: string, sender?: string) => Promise<void>;
  executeCommand: (worldId: string, command: string) => Promise<void>;
  unsubscribe: (worldId: string, chatId?: string | null) => Promise<void>;
  sendApprovalResponse: (response: ApprovalResponse) => Promise<void>;
}

/**
 * Hook for high-level WebSocket protocol operations
 */
export function useAgentWorldClient(
  ws: WebSocketClient | null,
  connected: boolean,
  options: UseAgentWorldClientOptions = {}
): UseAgentWorldClientReturn {
  const { onEvent, onStatus } = options;

  // Setup event listeners with useEffect for proper cleanup
  useEffect(() => {
    if (!ws) return;

    if (onEvent) {
      ws.on('event', onEvent);
    }
    if (onStatus) {
      ws.on('status', onStatus);
    }

    // Cleanup listeners on unmount or when dependencies change
    return () => {
      if (onEvent) {
        ws.off('event', onEvent);
      }
      if (onStatus) {
        ws.off('status', onStatus);
      }
    };
  }, [ws, onEvent, onStatus]);

  const subscribe = useCallback(async (
    worldId: string,
    chatId: string | null,
    replayFrom: 'beginning' | number = 'beginning'
  ) => {
    if (!ws || !connected) {
      console.warn('Cannot subscribe: not connected');
      return;
    }
    const fromSeq = replayFrom === 'beginning' ? 0 : replayFrom;
    try {
      await ws.subscribe(worldId, chatId, fromSeq);
    } catch (error) {
      console.error('Subscribe failed:', error instanceof Error ? error.message : error);
    }
  }, [ws, connected]);

  const enqueue = useCallback(async (
    worldId: string,
    chatId: string | null,
    content: string,
    sender: string = 'user'
  ) => {
    if (!ws || !connected) {
      console.warn('Cannot enqueue: not connected');
      return;
    }
    try {
      await ws.sendMessage(worldId, content, chatId ?? undefined, sender);
    } catch (error) {
      console.error('Enqueue failed:', error instanceof Error ? error.message : error);
    }
  }, [ws, connected]);

  const executeCommand = useCallback(async (worldId: string, commandInput: string) => {
    if (!ws || !connected) {
      console.warn('Cannot execute command: not connected');
      return;
    }

    // Parse command input (e.g., "/help" or "/agent agent-id")
    // Remove leading slash if present
    const input = commandInput.startsWith('/') ? commandInput.substring(1) : commandInput;
    const parts = input.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Handle client-side commands that don't need server interaction
    if (command === 'help') {
      console.log('\n=== Available Commands ===');
      console.log('World: /list-worlds, /world');
      console.log('Agents: /list-agents, /agent <id>, /create-agent <name>, /delete-agent <id>');
      console.log('Chats: /list-chats, /new-chat, /delete-chat <id>');
      console.log('Export: /export');
      console.log('');
      return;
    }

    // Map command to server command format
    let serverCommand = command;
    let params: any = {};

    // Handle command-specific mappings
    switch (command) {
      case 'list-worlds':
      case 'worlds':
        serverCommand = 'list-worlds';
        break;
      case 'world':
        serverCommand = 'get-world';
        break;
      case 'list-agents':
      case 'agents':
        serverCommand = 'list-agents';
        break;
      case 'agent':
        serverCommand = 'get-agent';
        if (args[0]) {
          params.agentId = args[0];
        }
        break;
      case 'list-chats':
      case 'chats':
        serverCommand = 'list-chats';
        break;
      case 'new-chat':
        serverCommand = 'new-chat';
        break;
      case 'delete-chat':
        serverCommand = 'delete-chat';
        if (args[0]) {
          params.chatId = args[0];
        }
        break;
      case 'export':
        serverCommand = 'export-world';
        break;
      case 'create-agent':
        serverCommand = 'create-agent';
        if (args[0]) {
          params.name = args[0];
        }
        break;
      case 'delete-agent':
        serverCommand = 'delete-agent';
        if (args[0]) {
          params.agentId = args[0];
        }
        break;
    }

    // Send command to server and await response
    try {
      await ws.sendCommand(worldId, serverCommand, params);
    } catch (error) {
      console.error('Command failed:', error instanceof Error ? error.message : error);
    }
  }, [ws, connected]);

  const unsubscribe = useCallback(async (worldId: string, chatId?: string | null) => {
    if (!ws || !connected) {
      console.warn('Cannot unsubscribe: not connected');
      return;
    }
    try {
      await ws.unsubscribe(worldId, chatId);
    } catch (error) {
      console.error('Unsubscribe failed:', error instanceof Error ? error.message : error);
    }
  }, [ws, connected]);

  const sendApprovalResponse = useCallback(async (response: ApprovalResponse & { toolName?: string; toolCallId?: string; worldId?: string; chatId?: string | null; agentId?: string }) => {
    if (!ws || !connected) {
      console.warn('Cannot send approval response: not connected');
      return;
    }
    try {
      const { decision, scope, toolName = 'unknown_tool', toolCallId, worldId, chatId, agentId } = response;

      // Enhanced String Protocol: Send tool result as JSON string with __type marker
      // Transport layer uses strings, but storage layer will convert to OpenAI format
      // Server will parse this into: {role: 'tool', tool_call_id: '...', content: '...'}
      // AgentId is embedded in JSON; server will automatically prepend @mention

      const enhancedMessage = JSON.stringify({
        __type: 'tool_result',
        tool_call_id: toolCallId || `approval_${toolName}_${Date.now()}`,
        agentId: agentId, // Include agentId in JSON structure (server will auto-prepend @mention)
        content: JSON.stringify({
          decision: decision,
          scope: decision === 'approve' ? scope : undefined,
          toolName: toolName
        })
      });

      const messageContent = enhancedMessage;

      // Send as regular message (string protocol)
      // Note: worldId and chatId should be passed from the approval context
      if (worldId) {
        await ws.sendMessage(worldId, messageContent, chatId ?? undefined, 'human');
      } else {
        console.warn('Cannot send approval response: worldId not provided');
      }
    } catch (error) {
      console.error('Send approval response failed:', error instanceof Error ? error.message : error);
    }
  }, [ws, connected]);

  return {
    subscribe,
    enqueue,
    executeCommand,
    unsubscribe,
    sendApprovalResponse
  };
}
