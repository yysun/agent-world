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
 * - Unsubscribe from world
 * - Ping/heartbeat
 * 
 * Responsibilities:
 * - Protocol operations only
 * - Command parsing and mapping
 * - Tool approval response communication
 * - Depends on WebSocketClient instance
 * - No state management
 * - No event processing
 * 
 * Created: 2025-11-02 - Phase 1: Implement focused hooks
 * Updated: 2025-11-02 - Fix command execution - parse command strings and map to server format
 * Updated: Phase 7 - Add tool approval response functionality
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

  const sendApprovalResponse = useCallback(async (response: ApprovalResponse) => {
    if (!ws || !connected) {
      console.warn('Cannot send approval response: not connected');
      return;
    }
    try {
      await ws.sendCommand(undefined, 'approval-response', response);
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
