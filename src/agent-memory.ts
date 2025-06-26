/**
 * Agent Memory Manager - Agent Memory Management Operations
 *
 * Features:
 * - Agent conversation history management with LLM-compatible schema
 * - Memory persistence operations (save/load agent memory)
 * - Memory clearing with archival functionality
 * - Message limit management for performance optimization
 * - Integration with agent lookup and persistence systems
 *
 * Core Functions:
 * - addToAgentMemory: Add chat message to agent's conversation history
 * - getAgentConversationHistory: Retrieve agent's recent conversation messages
 * - clearAgentMemory: Archive existing memory and create fresh simplified structure
 *
 * Implementation:
 * - Uses shared world state for agent lookup
 * - Delegates memory persistence to world-persistence.ts
 * - Maintains LLM-compatible message format (ChatMessage schema)
 * - Implements memory limit (50 messages) for performance
 * - Archives old memory before clearing with timestamped backups
 * - Updates agent activity timestamps on memory operations
 * - Stores messages as-is with proper sender information populated upstream
 */

import * as path from 'path';
import fs from 'fs/promises';
import { ChatMessage, AgentMemory } from './types';
import { getAgent, getAgents, updateAgent } from './agent-manager';
import { saveAgentMemory, loadAgentMemory, getAgentsDir } from './world-persistence';
import { ensureDirectory } from './storage';
import { toKebabCase } from './utils';

/**
 * Add message to agent's conversation history using LLM-compatible schema
 */
export async function addToAgentMemory(worldName: string, agentName: string, message: ChatMessage): Promise<void> {
  const agent = getAgent(worldName, agentName);
  if (!agent) return;

  // Load current memory using agent name
  const memory = await loadAgentMemory(worldName, agent.name);

  // Add message to conversation history
  if (!memory.messages) {
    memory.messages = [];
  }

  // Store message as-is with timestamp
  memory.messages.push({
    ...message,
    createdAt: message.createdAt || new Date()
  });

  // Keep only last 50 messages for performance
  if (memory.messages.length > 50) {
    memory.messages = memory.messages.slice(-50);
  }

  memory.lastActivity = new Date().toISOString();

  // Save updated memory using agent name
  await saveAgentMemory(worldName, agent.name, memory);
}

/**
 * Get agent's conversation history for LLM context
 */
export async function getAgentConversationHistory(worldName: string, agentName: string, limit: number = 20): Promise<ChatMessage[]> {
  const agent = getAgent(worldName, agentName);
  if (!agent) return [];

  const memory = await loadAgentMemory(worldName, agent.name);
  const history = memory.messages || [];

  // Return last N messages
  return history.slice(-limit);
}

/**
 * Clear agent's memory - archives existing memory.json then creates fresh simplified memory
 */
export async function clearAgentMemory(worldName: string, agentName: string): Promise<boolean> {
  const agent = getAgent(worldName, agentName);
  if (!agent) return false;

  try {
    const agentDir = path.join(getAgentsDir(worldName), toKebabCase(agent.name));
    const memoryPath = path.join(agentDir, 'memory.json');

    // Archive the existing memory.json file if it exists
    try {
      // Check if memory file exists and has content
      const existingMemory = await fs.readFile(memoryPath, 'utf8');
      const memoryData = JSON.parse(existingMemory);

      // Only archive if there's meaningful content (messages)
      if (memoryData.messages && memoryData.messages.length > 0) {
        // Create archives directory within agent folder
        const archivesDir = path.join(agentDir, 'archives');
        await ensureDirectory(archivesDir);

        // Create timestamped archive filename
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = path.join(archivesDir, `memory_archive_${timestamp}.json`);

        // Copy the existing memory to archive
        await fs.copyFile(memoryPath, archivePath);
      }
    } catch (error) {
      // File might not exist or be invalid JSON, which is fine - continue with clear
    }

    // Delete the existing memory.json file if it exists
    try {
      await fs.unlink(memoryPath);
    } catch (error) {
      // File might not exist, which is fine
    }

    // Create simplified memory structure - only stores LLM messages
    const emptyMemory: AgentMemory = {
      messages: [], // Empty array for LLM messages
      lastActivity: new Date().toISOString()
    };

    // Save the simplified empty memory to the agent's memory file
    await saveAgentMemory(worldName, agent.name, emptyMemory);

    // Update agent's last active timestamp
    const agents = getAgents(worldName);
    const agentForUpdate = agents.find(a => a.name === agent.name);
    if (agentForUpdate) {
      await updateAgent(worldName, agentForUpdate.name, {
        lastActive: new Date()
      });
    }

    return true;
  } catch (error) {
    const agentNameStr = agent ? agent.name : agentName;
    console.error(`Failed to clear memory for agent ${agentNameStr}:`, error);
    return false;
  }
}
