/**
 * Unified Managers Module - World, Agent, and Chat Management
 * 
 * Core Features:
 * - Complete lifecycle management for worlds, agents, and chat sessions
 * - EventEmitter integration for runtime world instances
 * - Memory management with archiving and restoration capabilities
 * - Chat session management with auto-save and title generation
 * - Static imports and environment-aware storage operations
 * 
 * API Functions:
 * World: createWorld, getWorld, updateWorld, deleteWorld, listWorlds
 * Agent: createAgent, getAgent, updateAgent, deleteAgent, listAgents, updateAgentMemory, clearAgentMemory
 * Chat: createChatData, getChatData, listChatHistories, deleteChatData, newChat, loadChatById
 * Snapshot: createWorldChat, restoreWorldChat, exportWorldToMarkdown
 * 
 * Implementation Notes:
 * - Wraps storage layer with business logic and runtime object reconstruction
 * - Automatic ID normalization to kebab-case for consistency
 * - Environment detection delegated to storage-factory module
 * - Single moduleInitialization promise for all async operations
 */

// Core module imports
import { createCategoryLogger, initializeLogger } from './logger.js';
import { EventEmitter } from 'events';
import * as llmManager from './llm-manager.js';
import * as storageFactory from './storage/storage-factory.js';
import * as utils from './utils.js';

// Type imports
import type {
  World, CreateWorldParams, UpdateWorldParams, Agent, CreateAgentParams, UpdateAgentParams,
  AgentMessage, Chat, CreateChatParams, UpdateChatParams, WorldChat, LLMProvider
} from './types.js';

// Initialize logger
const logger = createCategoryLogger('core');

// Storage and module initialization
let storageWrappers: storageFactory.StorageAPI | null = null;

async function initializeModules() {
  initializeLogger();
  storageWrappers = await storageFactory.createStorageWithWrappers();
}

const moduleInitialization = initializeModules();

// Configuration constants
const NEW_CHAT_CONFIG = {
  REUSABLE_CHAT_TITLE: 'New Chat',
} as const;

/**
 * Create new world with configuration
 */
export async function createWorld(rootPath: string, params: CreateWorldParams): Promise<World | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Convert name to kebab-case for consistent ID format
  const worldId = utils.toKebabCase(params.name);

  // Check if world already exists
  const exists = await storageWrappers!.worldExists(worldId);
  if (exists) {
    throw new Error(`World with name '${params.name}' already exists`);
  }

  const worldData: World = {
    id: worldId,
    name: params.name,
    description: params.description,
    turnLimit: params.turnLimit || 5,
    createdAt: new Date(),
    lastUpdated: new Date(),
    totalAgents: 0,
    totalMessages: 0,
    eventEmitter: new EventEmitter(),
    agents: new Map<string, Agent>(),
  };

  await storageWrappers!.saveWorld(worldData);

  // Return runtime World object with EventEmitter and agents Map
  return getWorld(rootPath, worldId);
}

/**
 * Update world configuration
 */
export async function updateWorld(rootPath: string, worldId: string, updates: UpdateWorldParams): Promise<World | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically convert worldId to kebab-case for consistent lookup
  const normalizedWorldId = utils.toKebabCase(worldId);

  const existingData = await storageWrappers!.loadWorld(normalizedWorldId);

  if (!existingData) {
    return null;
  }

  // Merge updates with existing configuration
  const updatedData: World = {
    ...existingData,
    ...updates,
    lastUpdated: new Date() // Always update the timestamp on any world update
  };

  await storageWrappers!.saveWorld(updatedData);
  return getWorld(rootPath, normalizedWorldId);
}

/**
 * Delete world and all associated data
 */
export async function deleteWorld(rootPath: string, worldId: string): Promise<boolean> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically convert worldId to kebab-case for consistent lookup
  const normalizedWorldId = utils.toKebabCase(worldId);

  return await storageWrappers!.deleteWorld(normalizedWorldId);
}

/**
 * Get all world IDs and basic information
 */
export async function listWorlds(rootPath: string): Promise<World[]> {
  // Ensure modules are initialized
  await moduleInitialization;

  const allWorldData = await storageWrappers!.listWorlds();

  // Count agents for each world
  const worldsWithAgentCount = await Promise.all(
    allWorldData.map(async (data: World) => {
      try {
        const agents = await storageWrappers!.listAgents(data.id);
        return {
          ...data, // Include all WorldData properties
          agentCount: agents.length
        };
      } catch (error) {
        // If agent loading fails, still return world info with 0 agents
        return {
          ...data, // Include all WorldData properties
          agentCount: 0
        };
      }
    })
  );

  return worldsWithAgentCount;
}

/**
 * Get world configuration and create runtime instance
 */
export async function getWorld(rootPath: string, worldId: string): Promise<World | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically convert worldId to kebab-case for consistent lookup
  const normalizedWorldId = utils.toKebabCase(worldId);

  logger.debug('getWorldConfig called', {
    originalWorldId: worldId,
    normalizedWorldId,
    rootPath
  });

  const worldData = await storageWrappers!.loadWorld(normalizedWorldId);

  logger.debug('loadWorld result', {
    worldFound: !!worldData,
    worldId: worldData?.id,
    worldName: worldData?.name
  });

  if (!worldData) {
    logger.debug('World not found, returning null');
    return null;
  }

  return {
    ...worldData,
    eventEmitter: new EventEmitter(),
    agents: new Map(), // Empty agents map - to be populated by agent manager
  };
}

/**
 * Create new agent with configuration and system prompt
 */
export async function createAgent(rootPath: string, worldId: string, params: CreateAgentParams): Promise<Agent> {
  // Ensure modules are initialized
  await moduleInitialization;

  // Automatically generate ID from name if not provided
  const agentId = params.id || utils.toKebabCase(params.name);

  // Check if agent already exists
  const exists = await storageWrappers!.agentExists(worldId, agentId);
  if (exists) {
    throw new Error(`Agent with ID '${agentId}' already exists`);
  }

  const now = new Date();
  const agent: Agent = {
    id: agentId,
    name: params.name,
    type: params.type,
    status: 'inactive',
    provider: params.provider,
    model: params.model,
    systemPrompt: params.systemPrompt,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    createdAt: now,
    lastActive: now,
    llmCallCount: 0,
    memory: [],
  };

  await storageWrappers!.saveAgent(worldId, agent);
  return agent;
}

/**
 * Load agent by ID with full configuration and memory
 */
export async function getAgent(rootPath: string, worldId: string, agentId: string): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  const agentData = await storageWrappers!.loadAgent(worldId, agentId);
  return agentData;
}

/**
 * Update agent configuration and/or memory
 */
export async function updateAgent(rootPath: string, worldId: string, agentId: string, updates: UpdateAgentParams): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  const existingAgentData = await storageWrappers!.loadAgent(worldId, agentId);

  if (!existingAgentData) {
    return null;
  }

  // Merge updates with existing agent
  const updatedAgent: Agent = {
    ...existingAgentData,
    name: updates.name || existingAgentData.name,
    type: updates.type || existingAgentData.type,
    status: updates.status || existingAgentData.status,
    provider: updates.provider || existingAgentData.provider,
    model: updates.model || existingAgentData.model,
    systemPrompt: updates.systemPrompt !== undefined ? updates.systemPrompt : existingAgentData.systemPrompt,
    temperature: updates.temperature !== undefined ? updates.temperature : existingAgentData.temperature,
    maxTokens: updates.maxTokens !== undefined ? updates.maxTokens : existingAgentData.maxTokens,
    lastActive: new Date()
  };

  await storageWrappers!.saveAgent(worldId, updatedAgent);
  return updatedAgent;
}

/**
 * Delete agent and all associated data
 */
export async function deleteAgent(rootPath: string, worldId: string, agentId: string): Promise<boolean> {
  // Ensure modules are initialized
  await moduleInitialization;

  return await storageWrappers!.deleteAgent(worldId, agentId);
}

/**
 * Get all agent IDs and basic information
 */
export async function listAgents(rootPath: string, worldId: string): Promise<Agent[]> {
  // Ensure modules are initialized
  await moduleInitialization;
  const allAgents = await storageWrappers!.listAgents(worldId);
  return allAgents;
}

/**
 * Add messages to agent memory
 */
export async function updateAgentMemory(rootPath: string, worldId: string, agentId: string, messages: AgentMessage[]): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  const existingAgentData = await storageWrappers!.loadAgent(worldId, agentId);

  if (!existingAgentData) {
    return null;
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [...existingAgentData.memory, ...messages],
    lastActive: new Date()
  };

  // Save memory to memory.json and update config timestamps
  await storageWrappers!.saveAgentMemory(worldId, agentId, updatedAgent.memory);
  await storageWrappers!.saveAgent(worldId, updatedAgent);
  return updatedAgent;
}

/**
 * Clear agent memory and reset LLM call count
 */
export async function clearAgentMemory(rootPath: string, worldId: string, agentId: string): Promise<Agent | null> {
  // Ensure modules are initialized
  await moduleInitialization;

  logger.debug('Core clearAgentMemory called', {
    rootPath,
    worldId,
    agentId
  });

  const existingAgentData = await storageWrappers!.loadAgent(worldId, agentId);

  logger.debug('loadAgent result', {
    agentFound: !!existingAgentData,
    agentName: existingAgentData?.name,
    memoryLength: existingAgentData?.memory?.length || 0,
    currentLLMCallCount: existingAgentData?.llmCallCount || 0
  });

  if (!existingAgentData) {
    logger.debug('Agent not found on disk, returning null');
    return null;
  }

  // Archive current memory if it exists and has content
  if (existingAgentData.memory && existingAgentData.memory.length > 0) {
    try {
      logger.debug('Archiving existing memory');
      await storageWrappers!.archiveMemory(worldId, agentId, existingAgentData.memory);
      logger.debug('Memory archived successfully');
    } catch (error) {
      logger.warn('Failed to archive memory', { agentId, error: error instanceof Error ? error.message : error });
      // Continue with clearing even if archiving fails
    }
  }

  const updatedAgent: Agent = {
    ...existingAgentData,
    memory: [],
    llmCallCount: 0,
    lastActive: new Date()
  };

  logger.debug('Saving cleared memory to disk');

  // Save empty memory to memory.json and update config timestamps
  await storageWrappers!.saveAgentMemory(worldId, agentId, []);
  await storageWrappers!.saveAgent(worldId, updatedAgent);

  logger.debug('Memory and LLM call count cleared and saved successfully', {
    agentId,
    newLLMCallCount: updatedAgent.llmCallCount
  });
  return updatedAgent;
}

/**
 * Create new chat data entry with optional world snapshot
 */
async function createChat(rootPath: string, worldId: string, params: CreateChatParams): Promise<Chat> {
  await moduleInitialization;

  const chatId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  // Optionally capture WorldChat (full world state)
  let worldChat: WorldChat | undefined;
  if (params.captureChat) {
    worldChat = await createWorldChat(rootPath, worldId);
  }

  // Always use "New Chat" as initial title
  const initialTitle = params.name || "New Chat";

  // Create ChatData entry (metadata)
  const chatData: Chat = {
    id: chatId,
    worldId,
    name: initialTitle,
    description: params.description,
    createdAt: now,
    updatedAt: now,
    messageCount: worldChat?.messages?.length || 0,
  };

  await storageWrappers!.saveChatData(worldId, chatData);

  // Save the snapshot data separately if it exists
  if (worldChat) {
    await storageWrappers!.saveWorldChat(worldId, chatId, worldChat);
  }

  return chatData;
}

/**
 * Create a new chat and optionally set it as current for a world
 */
export async function newChat(rootPath: string, worldId: string, setAsCurrent: boolean = true): Promise<World | null> {
  await moduleInitialization;

  // Create a new chat
  const chatData = await createChat(rootPath, worldId, {
    name: "New Chat",
    captureChat: false
  });

  if (setAsCurrent) {
    // Update world's currentChatId
    const world = await updateWorld(rootPath, worldId, {
      currentChatId: chatData.id
    });
    return world;
  }

  // Return the world without updating currentChatId
  return await getWorld(rootPath, worldId);
}

export async function listChats(rootPath: string, worldId: string): Promise<Chat[]> {
  await moduleInitialization;
  return await storageWrappers!.listChats(worldId);
}

export async function deleteChat(rootPath: string, worldId: string, chatId: string): Promise<boolean> {
  await moduleInitialization;
  return await storageWrappers!.deleteChatData(worldId, chatId);
}

export async function restoreChat(rootPath: string, worldId: string, chatId: string): Promise<World | null> {
  await moduleInitialization;
  // return await storageWrappers!.restoreChatData(worldId, chatId);

  // Check if chat exists
  const chatData = await storageWrappers!.loadChatData(worldId, chatId);
  if (!chatData) {
    return null;
  }

  let world = await getWorld(rootPath, worldId);
  if (!world) {
    return null;
  }

  if (world.currentChatId === chatId && chatData.worldId === worldId) {
    return world;
  }

  world = await updateWorld(rootPath, worldId, {
    currentChatId: chatId
  });
  return world;
}





/**
 * Generate chat title from message content with LLM support
 */
async function generateChatTitleFromMessages(messages: AgentMessage[], world?: World, maxLength: number = 50): Promise<string> {
  if (!messages || messages.length === 0) {
    return 'New Chat';
  }

  // Try LLM-based title generation if world has LLM provider configured
  if (world && world.chatLLMProvider && world.chatLLMModel) {
    try {
      // Get last 10 human messages for title generation
      const humanMessages = messages
        .filter(msg => msg.role === 'user' && msg.content && msg.content.trim().length > 0)
        .slice(-10);

      if (humanMessages.length > 0) {
        const titlePrompt = `Generate a concise, informative title for this chat conversation. The title should be descriptive but brief.

Recent messages:
${humanMessages.map(msg => `User: ${msg.content}`).join('\n')}

Generate only the title, no quotes or explanations:`;

        const titleMessages: AgentMessage[] = [
          { role: 'user', content: titlePrompt, createdAt: new Date() }
        ];

        // Create a temporary agent configuration for title generation
        const tempAgent: any = {
          id: 'chat-title-generator',
          name: 'Chat Title Generator',
          type: 'title-generator',
          provider: world.chatLLMProvider,
          model: world.chatLLMModel,
          systemPrompt: 'You are a helpful assistant that creates concise, informative titles for chat conversations.',
          temperature: 0.8,
          maxTokens: 50,
          memory: [],
          llmCallCount: 0
        };

        const generatedTitle = await llmManager.generateAgentResponse(world, tempAgent, titleMessages);

        // Clean up the generated title
        let title = generatedTitle.trim().replace(/^["']|["']$/g, ''); // Remove quotes
        title = title.replace(/[\n\r]+/g, ' '); // Replace newlines with spaces
        title = title.replace(/\s+/g, ' '); // Normalize whitespace

        // Truncate if too long
        if (title.length > maxLength) {
          title = title.substring(0, maxLength - 3) + '...';
        }

        if (title && title.length > 0) {
          return title;
        }
      }
    } catch (error) {
      logger.warn('Failed to generate LLM title, using fallback', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  // Fallback: Use first agent message or user message
  const firstAgentMessage = messages.find(msg =>
    msg.role === 'assistant' &&
    msg.content &&
    msg.content.trim().length > 0
  );

  const firstUserMessage = messages.find(msg =>
    msg.role === 'user' &&
    msg.content &&
    msg.content.trim().length > 0 &&
    !msg.content.startsWith('@') // Skip mention-only messages
  );

  const messageToUse = firstAgentMessage || firstUserMessage;

  if (!messageToUse) {
    return 'New Chat';
  }

  let title = messageToUse.content.trim();

  // Clean up the title
  title = title.replace(/[\n\r]+/g, ' '); // Replace newlines with spaces
  title = title.replace(/\s+/g, ' '); // Normalize whitespace

  // Truncate if too long
  if (title.length > maxLength) {
    title = title.substring(0, maxLength - 3) + '...';
  }

  return title || 'New Chat';
}

/**
 * Create snapshot of current world state
 */
export async function createWorldChat(rootPath: string, worldId: string): Promise<WorldChat> {
  // Ensure modules are initialized
  await moduleInitialization;

  const worldData = await storageWrappers!.loadWorld(worldId);
  if (!worldData) {
    throw new Error(`World ${worldId} not found`);
  }

  const agents = await storageWrappers!.listAgents(worldId);
  const allMessages: AgentMessage[] = [];
  let totalMessages = 0;

  // Collect all agent messages
  for (const agent of agents) {
    if (agent.memory && agent.memory.length > 0) {
      allMessages.push(...agent.memory);
      totalMessages += agent.memory.length;
    }
  }

  const snapshot: WorldChat = {
    world: worldData,
    agents,
    messages: allMessages,
    metadata: {
      capturedAt: new Date(),
      version: '1.0',
      totalMessages,
      activeAgents: agents.filter((a: any) => a.status === 'active').length
    }
  };

  return snapshot;
}

export async function exportWorldToMarkdown(rootPath: string, worldName: string): Promise<string> {
  await moduleInitialization;

  // Load world configuration
  const worldData = await getWorld(rootPath, worldName);
  if (!worldData) {
    throw new Error(`World '${worldName}' not found`);
  }

  // Load all agents in the world
  const agents = await listAgents(rootPath, worldData.id);

  // Generate markdown content
  let markdown = `# World Export: ${worldData.name}\n\n`;
  markdown += `**Exported on:** ${new Date().toISOString()}\n\n`;

  // World information
  markdown += `## World Configuration\n\n`;
  markdown += `- **Name:** ${worldData.name}\n`;
  markdown += `- **ID:** ${worldData.id}\n`;
  markdown += `- **Description:** ${worldData.description || 'No description'}\n`;
  markdown += `- **Turn Limit:** ${worldData.turnLimit}\n`;
  markdown += `- **Total Agents:** ${agents.length}\n\n`;

  // Agents section
  if (agents.length > 0) {
    markdown += `## Agents (${agents.length})\n\n`;

    for (const agentInfo of agents) {
      // Load full agent data to get memory
      const fullAgent = await getAgent(rootPath, worldData.id, agentInfo.name);
      if (!fullAgent) continue;

      markdown += `### ${fullAgent.name}\n\n`;
      markdown += `**Configuration:**\n`;
      markdown += `- **ID:** ${fullAgent.id}\n`;
      markdown += `- **Type:** ${fullAgent.type}\n`;
      markdown += `- **LLM Provider:** ${fullAgent.provider}\n`;
      markdown += `- **Model:** ${fullAgent.model}\n`;
      markdown += `- **Status:** ${fullAgent.status || 'active'}\n`;
      markdown += `- **Temperature:** ${fullAgent.temperature || 'default'}\n`;
      markdown += `- **Max Tokens:** ${fullAgent.maxTokens || 'default'}\n`;
      markdown += `- **LLM Calls:** ${fullAgent.llmCallCount}\n`;
      markdown += `- **Created:** ${fullAgent.createdAt ? (fullAgent.createdAt instanceof Date ? fullAgent.createdAt.toISOString() : fullAgent.createdAt) : 'Unknown'}\n`;
      markdown += `- **Last Active:** ${fullAgent.lastActive ? (fullAgent.lastActive instanceof Date ? fullAgent.lastActive.toISOString() : fullAgent.lastActive) : 'Unknown'}\n\n`;

      if (fullAgent.systemPrompt) {
        markdown += `**System Prompt:**\n`;
        markdown += `\`\`\`\n${fullAgent.systemPrompt}\n\`\`\`\n\n`;
      }

      // Agent memory
      if (fullAgent.memory && fullAgent.memory.length > 0) {
        markdown += `**Memory (${fullAgent.memory.length} messages):**\n\n`;

        fullAgent.memory.forEach((message, index) => {
          markdown += `${index + 1}. **${message.role}** ${message.sender ? `(${message.sender})` : ''}\n`;
          if (message.createdAt) {
            markdown += `   *${message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt}*\n`;
          }
          markdown += '   ```markdown\n';
          // Pad each line of content with 4 spaces, preserving original newlines
          let paddedContent = '';
          if (typeof message.content === 'string') {
            // Split by /(?<=\n)/ to preserve empty lines and trailing newlines
            paddedContent = message.content
              .split(/(\n)/)
              .map(part => part === '\n' ? '\n' : '    ' + part)
              .join('');
          }
          markdown += `${paddedContent}\n`;
          markdown += '   ```\n\n';
        });
      } else {
        markdown += `**Memory:** No messages\n\n`;
      }

      markdown += `---\n\n`;
    }
  } else {
    markdown += `## Agents\n\nNo agents found in this world.\n\n`;
  }

  return markdown;
}
