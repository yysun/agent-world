/**
 * World Initialization Handlers
 *
 * Extracted from WorldComponent (World.tsx)
 * Handles world data loading and initialization.
 *
 * Features:
 * - Loads world and agent data
 * - Deduplicates and sorts messages
 * - Handles loading and error states
 *
 * Changes:
 * - Extracted from World.tsx on 2025-07-25
 */

import { getWorld } from '../api';
import type { WorldComponentState, Agent } from '../types';

export const worldInitHandlers = {
  '/World': async function* (state: WorldComponentState, name: string): AsyncGenerator<WorldComponentState> {
    const worldName = name ? decodeURIComponent(name) : 'New World';

    try {
      yield {
        ...state,
        worldName,
        loading: true,
        error: null,
        isWaiting: false,
        activeAgent: null
      };

      const world = await getWorld(worldName);
      const messageMap = new Map();

      const worldAgents: Agent[] = await Promise.all(world.agents.map(async (agent, index) => {
        if (agent.memory && Array.isArray(agent.memory)) {
          agent.memory.forEach((memoryItem: any) => {
            const messageKey = `${memoryItem.createdAt || Date.now()}-${memoryItem.text || memoryItem.content || ''}`;

            if (!messageMap.has(messageKey)) {
              const originalSender = memoryItem.sender || agent.name;
              let messageType = 'agent';
              if (originalSender === 'HUMAN' || originalSender === 'USER') {
                messageType = 'user';
              }

              messageMap.set(messageKey, {
                id: memoryItem.id || messageKey,
                sender: originalSender,
                text: memoryItem.text || memoryItem.content || '',
                createdAt: memoryItem.createdAt || new Date().toISOString(),
                type: messageType,
                streamComplete: true,
                fromAgentId: agent.id
              });
            }
          });
        }

        const systemPrompt = agent.systemPrompt || '';

        return {
          ...agent,
          spriteIndex: index % 9,
          messageCount: agent.memory?.length || 0,
          provider: agent.provider || 'openai',
          model: agent.model || 'gpt-4',
          temperature: agent.temperature ?? 0.7,
          systemPrompt: systemPrompt,
          description: agent.description || '',
          type: agent.type || 'default',
          status: agent.status || 'active',
          llmCallCount: agent.llmCallCount || 0,
          memory: agent.memory || [],
          createdAt: agent.createdAt || new Date(),
          lastActive: agent.lastActive || new Date()
        } as Agent;
      }));

      const sortedMessages = Array.from(messageMap.values()).sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeA - timeB;
      });

      yield {
        ...state,
        worldName,
        world: {
          name: worldName,
          agents: worldAgents,
          llmCallLimit: (world as any).llmCallLimit || (world as any).turnLimit
        },
        agents: worldAgents,
        messages: sortedMessages,
        loading: false,
        error: null,
        isWaiting: false,
        selectedSettingsTarget: 'world',
        selectedAgent: null,
        activeAgent: null
      };

    } catch (error: any) {
      yield {
        ...state,
        worldName,
        world: { name: worldName, agents: [], llmCallLimit: undefined },
        loading: false,
        error: error.message || 'Failed to load world data',
        isWaiting: false,
        selectedSettingsTarget: 'world',
        selectedAgent: null,
        activeAgent: null
      };
    }
  }
};
