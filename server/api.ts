/**
 * API Routes for Agent World
 *
 * Features:
 * - REST API with Zod validation for world/agent management
 * - SSE streaming for real-time chat responses
 * - Consistent serialization with serializeWorld() and serializeAgent()
 * - Optimized world existence checks using getWorldConfig
 * - Timer management for streaming (15s initial, 5s stall timeout)
 *
 * Implementation:
 * - Core module integration with event handling
 * - Simplified API structure (World objects contain agents[] and chats[])
 * - Reusable getWorldOrError utility for error handling
 * - Non-streaming mode for CLI pipeline compatibility
 * - **Updated to use WorldClass for object-oriented world management**
 *
 * WorldClass Usage:
 * - Most routes now use WorldClass for cleaner, more maintainable code
 * - Example: const worldClass = new WorldClass(worldName); await worldClass.delete();
 * - Eliminates repetitive rootPath, worldId parameter passing
 * - Provides better encapsulation and type safety
 * - Root path parameter removed - storage factory handles path management
 *
 * Recent Changes:
 * - Fixed PATCH /worlds/:worldName to handle all schema fields including chatLLMProvider and chatLLMModel
 * - Previously only processed name, description, turnLimit; now handles complete WorldUpdateSchema
 * - Added .nullable() support for chatLLMProvider and chatLLMModel to handle null values from clients
 * - Updated update logic to filter out null values (treat as no-op rather than validation error)
 * - Added comprehensive test coverage for world update endpoint validation and null handling
 */
import express, { Request, Response } from 'express';
import { z } from 'zod';
import {
  createWorld, listWorlds, createCategoryLogger, publishMessage, enableStreaming, disableStreaming, WorldClass,
  type World, type Agent, type Chat, LLMProvider
} from '../core/index.js';
import { subscribeWorld, ClientConnection } from '../core/index.js';

const logger = createCategoryLogger('api');
const DEFAULT_WORLD_NAME = 'Default World';

/**
 * Serialize World object for API responses
 */
async function serializeWorld(world: World): Promise<{
  id: string;
  name: string;
  description?: string | null;
  turnLimit: number;
  chatLLMProvider?: string;
  chatLLMModel?: string;
  currentChatId: string | null;
  agents: any[];
  chats: any[];
}> {
  const agentsArray = Array.from(world.agents.values()).map(agent => serializeAgent(agent));
  const chatsArray = Array.from(world.chats.values()).map(chat => serializeChat(chat));
  // Use WorldClass to get chats
  const worldClass = new WorldClass(world.id);
  const chats = await worldClass.listChats();

  return {
    id: world.id,
    name: world.name,
    description: world.description,
    turnLimit: world.turnLimit,
    chatLLMProvider: world.chatLLMProvider,
    chatLLMModel: world.chatLLMModel,
    currentChatId: world.currentChatId || null,
    agents: agentsArray,
    chats: chatsArray
  };
}

/**
 * Serialize Agent object for API responses
 */
function serializeAgent(agent: Agent): {
  id: string;
  name: string;
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  llmCallCount: number;
  lastLLMCall?: Date;
  memory: any[];
} {
  return {
    id: agent.id,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    systemPrompt: agent.systemPrompt,
    llmCallCount: agent.llmCallCount,
    memory: agent.memory || [],
  };
}

function serializeChat(chat: Chat): {
  id: string;
  name: string;
  messageCount: number;
} {
  return {
    id: chat.id,
    name: chat.name,
    messageCount: chat.messageCount
  };
}

// Utility functions
function sendError(res: Response, status: number, message: string, code?: string, details?: any) {
  const error: { error: string; code?: string; details?: any } = { error: message };
  if (code) error.code = code;
  if (details) error.details = details;
  res.status(status).json(error);
}

function toKebabCase(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function isAgentNameUnique(worldClass: WorldClass, agentName: string, excludeAgent?: string): Promise<boolean> {
  const normalizedAgentName = toKebabCase(agentName);
  const normalizedExcludeAgent = excludeAgent ? toKebabCase(excludeAgent) : undefined;

  if (normalizedExcludeAgent && normalizedAgentName === normalizedExcludeAgent) return true;
  const existingAgent = await worldClass.getAgent(normalizedAgentName);
  return !existingAgent;
}

async function getWorldOrError(res: Response, worldName: string): Promise<WorldClass | null> {
  const worldClass = new WorldClass(worldName);
  const world = await worldClass.reload();
  if (!world) {
    sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
    return null;
  }
  // Return WorldClass instance for OOP operations
  return worldClass;
}

// Validation schemas
const WorldCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
  turnLimit: z.number().min(1).optional(),
  chatLLMProvider: z.enum(['openai', 'anthropic', 'azure', 'google', 'xai', 'openai-compatible', 'ollama']).nullable().optional(),
  chatLLMModel: z.string().nullable().optional()
});

const WorldUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  turnLimit: z.number().min(1).optional(),
  chatLLMProvider: z.enum(['openai', 'anthropic', 'azure', 'google', 'xai', 'openai-compatible', 'ollama']).nullable().optional(),
  chatLLMModel: z.string().nullable().optional()
});

const AgentCreateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().optional().default('default'),
  provider: z.enum(['openai', 'anthropic', 'azure', 'google', 'xai', 'openai-compatible', 'ollama']).default('openai'),
  model: z.string().default('gpt-4'),
  systemPrompt: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().min(1).optional()
});

const ChatMessageSchema = z.object({
  message: z.string().min(1),
  sender: z.string().default("HUMAN"),
  stream: z.boolean().optional().default(true)
});

const AgentUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.string().optional(),
  status: z.enum(["active", "inactive", "error"]).optional(),
  provider: z.enum(['openai', 'anthropic', 'azure', 'google', 'xai', 'openai-compatible', 'ollama']).optional(),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().min(1).optional(),
  clearMemory: z.boolean().optional()
});

const router = express.Router();

// World Routes

// GET /worlds - List worlds or create default
router.get('/worlds', async (req, res) => {
  try {
    const worlds = await listWorlds();
    if (!worlds?.length) {
      const world = await createWorld({ name: DEFAULT_WORLD_NAME });
      if (world) {
        res.json([{ name: world.name, agentCount: 0 }]);
      } else {
        sendError(res, 500, 'Failed to create world', 'WORLD_CREATE_ERROR');
      }
    } else {
      res.json(worlds.map(world => ({
        name: world.name,
        agentCount: world.totalAgents || 0,
        id: world.id,
        description: world.description
      })));
    }
  } catch (error) {
    logger.error('Error listing worlds', { error: error instanceof Error ? error.message : error });
    sendError(res, 500, 'Failed to list worlds', 'WORLD_LIST_ERROR');
  }
});

// GET /worlds/:worldName - Get a specific world
router.get('/worlds/:worldName', async (req, res) => {
  try {
    const worldName = req.params.worldName;
    const worldClass = await getWorldOrError(res, worldName);
    if (!worldClass) return;

    const world = await worldClass.reload();
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }
    res.json(await serializeWorld(world));
  } catch (error) {
    console.error('Error getting world:', error);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

// POST /worlds - Create new world
router.post('/worlds', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = WorldCreateSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }
    const { name, description, turnLimit, chatLLMProvider, chatLLMModel } = validation.data;
    const worldId = toKebabCase(name);
    const world = await createWorld({
      name,
      description,
      turnLimit,
      chatLLMProvider: (chatLLMProvider || undefined) as LLMProvider | undefined,
      chatLLMModel: chatLLMModel || undefined
    });
    if (world) {
      res.status(201).json({ name: world.name, id: worldId });
    } else {
      sendError(res, 500, 'Failed to create world', 'WORLD_CREATE_ERROR');
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for duplicate world error
    if (errorMessage.includes('already exists')) {
      sendError(res, 409, 'World with this name already exists', 'WORLD_EXISTS');
      return;
    }

    logger.error('Error creating world', { error: errorMessage });
    sendError(res, 500, 'Failed to create world', 'WORLD_CREATE_ERROR');
  }
});

// PATCH /worlds/:worldName - Update world metadata
router.patch('/worlds/:worldName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;
    const validation = WorldUpdateSchema.safeParse(req.body);

    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const worldClass = await getWorldOrError(res, worldName);
    if (!worldClass) return;

    // Get current world data for validation
    const currentWorld = await worldClass.reload();
    if (!currentWorld) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    const { name, description, turnLimit, chatLLMProvider, chatLLMModel } = validation.data;

    // Update world metadata using WorldClass
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (turnLimit !== undefined) updates.turnLimit = turnLimit;
    if (chatLLMProvider !== undefined && chatLLMProvider !== null) updates.chatLLMProvider = chatLLMProvider;
    if (chatLLMModel !== undefined && chatLLMModel !== null) updates.chatLLMModel = chatLLMModel;

    // Apply updates if any
    let updatedWorld = currentWorld;
    if (Object.keys(updates).length > 0) {
      const updateResult = await worldClass.update(updates);
      if (!updateResult) {
        sendError(res, 500, 'Failed to update world', 'WORLD_UPDATE_ERROR');
        return;
      }
      updatedWorld = updateResult;
    }

    // Return complete world data including agents
    const serializedWorld = await serializeWorld(updatedWorld);
    res.json(serializedWorld);
  } catch (error) {
    logger.error('Error updating world', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to update world', 'WORLD_UPDATE_ERROR');
  }
});

// DELETE /worlds/:worldName - Delete world
router.delete('/worlds/:worldName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;

    const worldClass = await getWorldOrError(res, worldName);
    if (!worldClass) return;

    const deleted = await worldClass.delete();
    if (!deleted) {
      sendError(res, 500, 'Failed to delete world', 'WORLD_DELETE_ERROR');
      return;
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting world', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to delete world', 'WORLD_DELETE_ERROR');
  }
});

// Agent Routes

// POST /worlds/:worldName/agents - Create new agent in world
router.post('/worlds/:worldName/agents', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;
    const validation = AgentCreateSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const agentData = validation.data;
    const worldClass = await getWorldOrError(res, worldName);
    if (!worldClass) return;

    // Check if agent name is unique using WorldClass
    const isUnique = await isAgentNameUnique(worldClass, agentData.name);
    if (!isUnique) {
      sendError(res, 409, 'Agent with this name already exists', 'AGENT_EXISTS');
      return;
    }

    // Use WorldClass to create agent
    const createdAgent = await worldClass.createAgent(agentData as any);
    if (!createdAgent) {
      sendError(res, 500, 'Failed to create agent', 'AGENT_CREATE_ERROR');
      return;
    }

    res.status(201).json(serializeAgent(createdAgent));
  } catch (error) {
    logger.error('Error creating agent', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to create agent', 'AGENT_CREATE_ERROR');
  }
});

// GET /worlds/:worldName/export - Export world to markdown
router.get('/worlds/:worldName/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;

    const worldClass = new WorldClass(worldName);

    // Check if world exists first
    const worldExists = await worldClass.reload();
    if (!worldExists) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    const markdown = await worldClass.exportToMarkdown();
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${worldName}-${timestamp}.md`;

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(markdown, 'utf8'));
    res.send(markdown);
  } catch (error) {
    logger.error('Error exporting world', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to export world', 'WORLD_EXPORT_ERROR');
  }
});

// PATCH /worlds/:worldName/agents/:agentName - Update agent
router.patch('/worlds/:worldName/agents/:agentName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, agentName } = req.params;
    const validation = AgentUpdateSchema.safeParse(req.body);

    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const { clearMemory } = validation.data;
    const worldClass = await getWorldOrError(res, worldName);
    if (!worldClass) return;

    // Normalize agent name to handle case-insensitive lookups
    const normalizedAgentName = toKebabCase(agentName);
    const existingAgent = await worldClass.getAgent(normalizedAgentName);
    if (!existingAgent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    let updatedAgent = existingAgent;

    // If clearMemory is requested, clear memory first
    if (clearMemory) {
      const cleared = await worldClass.clearAgentMemory(normalizedAgentName);
      if (!cleared) {
        sendError(res, 500, 'Failed to clear agent memory', 'MEMORY_CLEAR_ERROR');
        return;
      }
      const refreshedAgent = await worldClass.getAgent(normalizedAgentName);
      if (refreshedAgent) {
        updatedAgent = refreshedAgent;
      }
    }

    // Prepare updates, exclude memory-related fields
    const updates: any = { ...validation.data };
    delete updates.clearMemory;
    if ('memory' in updates) delete updates.memory;

    // Only update if there are non-memory fields to update
    const updateKeys = Object.keys(updates).filter(k => k !== 'memory');
    if (updateKeys.length > 0) {
      const updateResult = await worldClass.updateAgent(normalizedAgentName, updates);
      if (!updateResult) {
        sendError(res, 500, 'Failed to update agent', 'AGENT_UPDATE_ERROR');
        return;
      }
      updatedAgent = updateResult;
    }

    res.json(serializeAgent(updatedAgent));
  } catch (error) {
    logger.error('Error updating agent', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, agentName: req.params.agentName });
    sendError(res, 500, 'Failed to update agent', 'AGENT_UPDATE_ERROR');
  }
});

// DELETE /worlds/:worldName/agents/:agentName - Delete agent
router.delete('/worlds/:worldName/agents/:agentName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, agentName } = req.params;

    const worldClass = await getWorldOrError(res, worldName);
    if (!worldClass) return;

    // Normalize agent name to handle case-insensitive lookups
    const normalizedAgentName = toKebabCase(agentName);
    const existingAgent = await worldClass.getAgent(normalizedAgentName);
    if (!existingAgent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    const deleted = await worldClass.deleteAgent(normalizedAgentName);
    if (!deleted) {
      sendError(res, 500, 'Failed to delete agent', 'AGENT_DELETE_ERROR');
      return;
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Error deleting agent', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, agentName: req.params.agentName });
    sendError(res, 500, 'Failed to delete agent', 'AGENT_DELETE_ERROR');
  }
});

// DELETE /worlds/:worldName/agents/:agentName/memory - Clear agent memory
router.delete('/worlds/:worldName/agents/:agentName/memory', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, agentName } = req.params;

    const worldClass = await getWorldOrError(res, worldName);
    if (!worldClass) return;

    // Normalize agent name to handle case-insensitive lookups
    const normalizedAgentName = toKebabCase(agentName);
    const agent = await worldClass.getAgent(normalizedAgentName);
    if (!agent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    const clearedAgent = await worldClass.clearAgentMemory(normalizedAgentName);
    if (!clearedAgent) {
      sendError(res, 500, 'Failed to clear agent memory', 'MEMORY_CLEAR_ERROR');
      return;
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Error clearing agent memory', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, agentName: req.params.agentName });
    sendError(res, 500, 'Failed to clear agent memory', 'MEMORY_CLEAR_ERROR');
  }
});

// Chat Helper Functions

// Non-streaming chat response (aligned with CLI pipeline mode)
async function handleNonStreamingChat(res: Response, worldName: string, message: string, sender: string): Promise<void> {
  disableStreaming();

  try {
    let responseContent = '';
    let isComplete = false;
    let hasError = false;
    let errorMessage = '';

    const responsePromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!isComplete) {
          hasError = true;
          errorMessage = 'Request timeout - no response received within 15 seconds';
          reject(new Error(errorMessage));
        }
      }, 15000);

      const client: ClientConnection = {
        isOpen: true,
        onWorldEvent: (eventType: string, eventData: any) => {
          responseContent = JSON.stringify({ type: eventType, data: eventData });
          clearTimeout(timer);
          isComplete = true;
          resolve();
        }
      };

      subscribeWorld(worldName, client).then(subscription => {
        if (!subscription) {
          hasError = true;
          errorMessage = 'Failed to subscribe to world';
          reject(new Error(errorMessage));
          return;
        }
        publishMessage(subscription.world, message, sender);
      }).catch(error => {
        hasError = true;
        errorMessage = `Failed to connect to world: ${error instanceof Error ? error.message : error}`;
        reject(new Error(errorMessage));
      });
    });

    await responsePromise;

    if (hasError) {
      sendError(res, 500, errorMessage, 'CHAT_ERROR');
      return;
    }

    res.json({
      success: true,
      message: 'Message processed successfully',
      data: {
        content: responseContent || 'No response received',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    sendError(res, 500, error instanceof Error ? error.message : 'Unknown error', 'CHAT_ERROR');
  } finally {
    enableStreaming();
  }
}

// Streaming chat response
async function handleStreamingChat(req: Request, res: Response, worldName: string, message: string, sender: string): Promise<void> {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  const streaming = {
    isActive: false,
    wait: undefined as ((delay: number) => void) | undefined,
    stopWait: undefined as (() => void) | undefined
  };

  let timer: ReturnType<typeof setTimeout> | undefined;

  const setupTimer = (callback: () => void, delay: number = 5000): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(callback, delay);
  };

  streaming.wait = (delay: number) => {
    setupTimer(() => {
      if (streaming.isActive) {
        logger.debug('Streaming appears stalled - timing out...');
      }
      res.end();
    }, delay);
  };

  streaming.stopWait = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const sendSSE = (data: string) => {
    res.write(`data: ${data}\n\n`);
  };

  const client: ClientConnection = {
    isOpen: true,
    onWorldEvent: (eventType: string, eventData: any) => {
      sendSSE(JSON.stringify({ type: eventType, data: eventData }));
    },
    onError: (error: string) => {
      logger.error(`World error: ${error}`);
      sendSSE(JSON.stringify({ type: 'error', message: error }));
      res.end();
    }
  };

  const subscription = await subscribeWorld(worldName, client);
  if (!subscription) {
    logger.error('Unexpected: subscription is null after world existence check');
    sendSSE(JSON.stringify({ type: 'error', message: 'Failed to subscribe to world' }));
    res.end();
    return;
  }

  try {
    publishMessage(subscription.world, message, sender);
    if (streaming.wait) {
      streaming.wait(15000); // 15 second timeout for initial response
    }
  } catch (error) {
    sendSSE(JSON.stringify({
      type: 'error',
      message: 'Failed to send message',
      data: { error: error instanceof Error ? error.message : String(error) }
    }));
    res.end();
  }

  req.on('close', () => {
    logger.debug('Chat client disconnected, cleaning up');
    streaming.stopWait?.();
    subscription?.unsubscribe();
  });
}

// Chat Routes

// POST /worlds/:worldName/chat - Send message with optional streaming
router.post('/worlds/:worldName/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;
    const validation = ChatMessageSchema.safeParse(req.body);

    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const { message, sender, stream } = validation.data;

    // Route to appropriate handler based on stream flag
    if (stream === false) {
      await handleNonStreamingChat(res, worldName, message, sender);
    } else {
      await handleStreamingChat(req, res, worldName, message, sender);
    }

  } catch (error) {
    logger.error('Error in chat endpoint', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    if (!res.headersSent) {
      sendError(res, 500, 'Failed to process chat request', 'CHAT_ERROR');
    }
  }
});

// DELETE /worlds/:worldName/chats/:chatId - Delete chat
router.delete('/worlds/:worldName/chats/:chatId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, chatId } = req.params;
    const worldClass = await getWorldOrError(res, worldName);
    if (!worldClass) return;

    const deleted = await worldClass.deleteChat(chatId);
    if (!deleted) {
      sendError(res, 404, 'Chat not found', 'CHAT_NOT_FOUND');
      return;
    }

    res.json({ message: 'Chat deleted successfully' });

  } catch (error) {
    logger.error('Error deleting chat', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, chatId: req.params.chatId });
    if (!res.headersSent) {
      sendError(res, 500, 'Failed to delete chat', 'DELETE_CHAT_ERROR');
    }
  }
});

// POST /worlds/:worldName/new-chat - Create new chat and set as current
router.post('/worlds/:worldName/new-chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const worldName = req.params.worldName;

    const worldClass = new WorldClass(worldName);

    // Check if world exists first
    const currentWorld = await worldClass.reload();
    if (!currentWorld) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    const updatedWorld = await worldClass.newChat(true);
    if (!updatedWorld) {
      sendError(res, 500, 'Failed to create new chat', 'NEW_CHAT_ERROR');
      return;
    }

    const serializedWorld = await serializeWorld(updatedWorld);

    res.json({
      world: serializedWorld,
      chatId: updatedWorld.currentChatId,
      success: true
    });

  } catch (error) {
    logger.error('Error creating new chat', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to create new chat', 'NEW_CHAT_ERROR');
  }
});

// POST /worlds/:worldName/load-chat/:chatId - Load specific chat and set as current
router.post('/worlds/:worldName/load-chat/:chatId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, chatId } = req.params;

    const worldClass = new WorldClass(worldName);

    // Check if world exists first
    const currentWorld = await worldClass.reload();
    if (!currentWorld) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    const updatedWorld = await worldClass.restoreChat(chatId, true);
    if (!updatedWorld) {
      sendError(res, 404, 'Chat not found or failed to load', 'LOAD_CHAT_ERROR');
      return;
    }

    const serializedWorld = await serializeWorld(updatedWorld);

    res.json({
      world: serializedWorld,
      chatId: updatedWorld.currentChatId,
      success: true
    });

  } catch (error) {
    logger.error('Error loading chat', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, chatId: req.params.chatId });
    if (!res.headersSent) {
      sendError(res, 500, 'Failed to load chat', 'LOAD_CHAT_ERROR');
    }
  }
});

export default router;
