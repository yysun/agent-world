/**
 * Agent World API Routes
 *
 * REST API with Zod validation, SSE streaming for chat, and function-based world context.
 * Supports world/agent/chat management with optimized serialization and error handling.
 *
 * Changes:
 * - Standardized world-scoped routes to use validateWorld middleware to load and attach worldCtx/world
 * - Removed ad-hoc world loading and undefined getWorldOrError usage; handlers now use (req as any).worldCtx and (req as any).world
 * - Chat endpoints now pass the normalized world id (worldCtx.id) to streaming/non-streaming handlers
 */
import express, { Request, Response } from 'express';
import { z } from 'zod';
import {
  createWorld,
  listWorlds,
  createCategoryLogger,
  publishMessage,
  enableStreaming,
  disableStreaming,
  // core managers (function-based)
  getWorld,
  updateWorld,
  deleteWorld,
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  listChats,
  newChat,
  restoreChat,
  deleteChat as deleteChatCore,
  clearAgentMemory,
  listAgents as listAgentsCore,
  getMemory as coreGetMemory,
  exportWorldToMarkdown,
  type World,
  type Agent,
  type Chat,
  LLMProvider
} from '../core/index.js';
import { subscribeWorld, ClientConnection } from '../core/index.js';

const logger = createCategoryLogger('api');
const DEFAULT_WORLD_NAME = 'Default World';
type WorldContext = {
  id: string;
  load: () => Promise<World | null>;
  update: (updates: any) => Promise<World | null>;
  delete: () => Promise<boolean>;
  createAgent: (params: any) => Promise<Agent | null>;
  getAgent: (agentName: string) => Promise<Agent | null>;
  updateAgent: (agentName: string, updates: any) => Promise<Agent | null>;
  deleteAgent: (agentName: string) => Promise<boolean>;
  listAgents: () => Promise<Agent[]>;
  clearAgentMemory: (agentName: string) => Promise<Agent | null>;
  listChats: () => Promise<Chat[]>;
  newChat: () => Promise<World | null>;
  restoreChat: (chatId: string) => Promise<World | null>;
  deleteChat: (chatId: string) => Promise<boolean>;
  getMemory: (chatId?: string | null) => Promise<any>;
};

// World context factory - eliminates repetitive worldId passing
function createWorldContext(worldId: string) {
  const id = toKebabCase(worldId);
  const worldContext: WorldContext = {
    id,
    load: () => getWorld(id),
    update: (updates: any) => updateWorld(id, updates),
    delete: () => deleteWorld(id),
    createAgent: (params: any) => createAgent(id, params),
    getAgent: (agentName: string) => getAgent(id, toKebabCase(agentName)),
    updateAgent: (agentName: string, updates: any) => updateAgent(id, toKebabCase(agentName), updates),
    deleteAgent: (agentName: string) => deleteAgent(id, toKebabCase(agentName)),
    listAgents: () => listAgentsCore(id),
    clearAgentMemory: (agentName: string) => clearAgentMemory(id, toKebabCase(agentName)),
    listChats: () => listChats(id),
    newChat: () => newChat(id),
    restoreChat: (chatId: string) => restoreChat(id, chatId),
    deleteChat: (chatId: string) => deleteChatCore(id, chatId),
    getMemory: (chatId?: string | null) => coreGetMemory(id, chatId),
  };
  return worldContext;
}

// Serialization functions
function serializeWorld(world: World) {
  return {
    id: world.id,
    name: world.name,
    description: world.description,
    turnLimit: world.turnLimit,
    chatLLMProvider: world.chatLLMProvider,
    chatLLMModel: world.chatLLMModel,
    currentChatId: world.currentChatId || null,
    agents: Array.from(world.agents.values()).map(serializeAgent),
    chats: Array.from(world.chats.values()).map(serializeChat)
  };
}

function serializeAgent(agent: Agent) {
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

function serializeChat(chat: Chat) {
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

async function isAgentNameUnique(worldCtx: ReturnType<typeof createWorldContext>, agentName: string, excludeAgent?: string): Promise<boolean> {
  const normalizedAgentName = toKebabCase(agentName);
  const normalizedExcludeAgent = excludeAgent ? toKebabCase(excludeAgent) : undefined;
  if (normalizedExcludeAgent && normalizedAgentName === normalizedExcludeAgent) return true;
  const existingAgent = await worldCtx.getAgent(normalizedAgentName);
  return !existingAgent;
}

// Validation middleware for world existence
function validateWorld(req: Request, res: Response, next: Function) {
  const worldName = req.params.worldName;
  const worldCtx = createWorldContext(worldName);
  worldCtx.load().then(world => {
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }
    // Attach worldCtx to request for downstream handlers
    (req as any).worldCtx = worldCtx;
    (req as any).world = world;
    next();
  }).catch(error => {
    sendError(res, 500, 'Failed to validate world', 'WORLD_VALIDATE_ERROR', error);
  });
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

router.get('/worlds/:worldName', validateWorld, async (req: Request, res: Response) => {
  try {
    // const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;
    const world = (req as any).world;
    res.json(serializeWorld(world));
  } catch (error) {
    logger.error('Error getting world', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

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
    if (errorMessage.includes('already exists')) {
      sendError(res, 409, 'World with this name already exists', 'WORLD_EXISTS');
      return;
    }
    logger.error('Error creating world', { error: errorMessage });
    sendError(res, 500, 'Failed to create world', 'WORLD_CREATE_ERROR');
  }
});

router.patch('/worlds/:worldName', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = WorldUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;
    const currentWorld = (req as any).world;
    const { name, description, turnLimit, chatLLMProvider, chatLLMModel } = validation.data;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (turnLimit !== undefined) updates.turnLimit = turnLimit;
    if (chatLLMProvider !== undefined && chatLLMProvider !== null) updates.chatLLMProvider = chatLLMProvider;
    if (chatLLMModel !== undefined && chatLLMModel !== null) updates.chatLLMModel = chatLLMModel;

    let updatedWorld = currentWorld;
    if (Object.keys(updates).length > 0) {
      const updateResult = await worldCtx.update(updates);
      if (!updateResult) {
        sendError(res, 500, 'Failed to update world', 'WORLD_UPDATE_ERROR');
        return;
      }
      updatedWorld = updateResult;
    }

    res.json(serializeWorld(updatedWorld));
  } catch (error) {
    logger.error('Error updating world', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to update world', 'WORLD_UPDATE_ERROR');
  }
});

router.delete('/worlds/:worldName', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext> | undefined;
    if (!worldCtx) {
      // Fallback if middleware not used (should not happen once standardized)
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    const deleted = await worldCtx.delete();
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
router.post('/worlds/:worldName/agents', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = AgentCreateSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const agentData = validation.data;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const isUnique = await isAgentNameUnique(worldCtx, agentData.name);
    if (!isUnique) {
      sendError(res, 409, 'Agent with this name already exists', 'AGENT_EXISTS');
      return;
    }

    const createdAgent = await worldCtx.createAgent(agentData);
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

router.get('/worlds/:worldName/agents', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const world = await worldCtx.load();
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }
    res.json(Array.from(world.agents.values()).map(serializeAgent));
  } catch (error) {
    logger.error('Error listing agents', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to list agents', 'AGENT_LIST_ERROR');
  }
});

router.get('/worlds/:worldName/agents/:agentName', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentName } = req.params;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const agent = await worldCtx.getAgent(agentName);
    if (!agent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }
    res.json(serializeAgent(agent));
  } catch (error) {
    logger.error('Error getting agent', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, agentName: req.params.agentName });
    sendError(res, 500, 'Failed to get agent', 'AGENT_GET_ERROR');
  }
});

router.get('/worlds/:worldName/export', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const markdown = await exportWorldToMarkdown(worldCtx.id);
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

router.patch('/worlds/:worldName/agents/:agentName', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentName } = req.params;
    const validation = AgentUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const { clearMemory } = validation.data;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const normalizedAgentName = toKebabCase(agentName);
    const existingAgent = await worldCtx.getAgent(normalizedAgentName);
    if (!existingAgent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    let updatedAgent = existingAgent;

    if (clearMemory) {
      const cleared = await worldCtx.clearAgentMemory(normalizedAgentName);
      if (!cleared) {
        sendError(res, 500, 'Failed to clear agent memory', 'MEMORY_CLEAR_ERROR');
        return;
      }
      const refreshedAgent = await worldCtx.getAgent(normalizedAgentName);
      if (refreshedAgent) {
        updatedAgent = refreshedAgent;
      }
    }

    const updates: any = { ...validation.data };
    delete updates.clearMemory;
    if ('memory' in updates) delete updates.memory;

    const updateKeys = Object.keys(updates).filter(k => k !== 'memory');
    if (updateKeys.length > 0) {
      const updateResult = await worldCtx.updateAgent(normalizedAgentName, updates);
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

router.delete('/worlds/:worldName/agents/:agentName', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentName } = req.params;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const normalizedAgentName = toKebabCase(agentName);
    const existingAgent = await worldCtx.getAgent(normalizedAgentName);
    if (!existingAgent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    const deleted = await worldCtx.deleteAgent(normalizedAgentName);
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

router.delete('/worlds/:worldName/agents/:agentName/memory', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentName } = req.params;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const normalizedAgentName = toKebabCase(agentName);
    const agent = await worldCtx.getAgent(normalizedAgentName);
    if (!agent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    const clearedAgent = await worldCtx.clearAgentMemory(normalizedAgentName);
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

async function handleStreamingChat(req: Request, res: Response, worldName: string, message: string, sender: string): Promise<void> {
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
      streaming.wait(15000);
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
router.post('/worlds/:worldName/chat', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;
    const validation = ChatMessageSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const { message, sender, stream } = validation.data;
    if (stream === false) {
      await handleNonStreamingChat(res, worldCtx.id, message, sender);
    } else {
      await handleStreamingChat(req, res, worldCtx.id, message, sender);
    }
  } catch (error) {
    logger.error('Error in chat endpoint', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    if (!res.headersSent) {
      sendError(res, 500, 'Failed to process chat request', 'CHAT_ERROR');
    }
  }
});

router.delete('/worlds/:worldName/chats/:chatId', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const deleted = await worldCtx.deleteChat(chatId);
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

router.get('/worlds/:worldName/chats', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const chats = await worldCtx.listChats();
    res.json(chats.map(serializeChat));
  } catch (error) {
    logger.error('Error listing chats', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to list chats', 'CHAT_LIST_ERROR');
  }
});

router.get('/worlds/:worldName/chats/:chatId', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const world = await worldCtx.load();
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }
    const chat = world.chats.get(chatId);
    if (!chat) {
      sendError(res, 404, 'Chat not found', 'CHAT_NOT_FOUND');
      return;
    }
    res.json(serializeChat(chat));
  } catch (error) {
    logger.error('Error getting chat', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, chatId: req.params.chatId });
    sendError(res, 500, 'Failed to get chat', 'CHAT_GET_ERROR');
  }
});

router.get('/worlds/:worldName/chats/:chatId/messages', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const messages = await worldCtx.getMemory(chatId);
    res.json(messages || []);
  } catch (error) {
    logger.error('Error getting chat messages', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, chatId: req.params.chatId });
    sendError(res, 500, 'Failed to get chat messages', 'CHAT_MESSAGES_ERROR');
  }
});

router.post('/worlds/:worldName/message', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const currentWorld = await worldCtx.load();
    if (!currentWorld) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    const updatedWorld = await worldCtx.newChat();
    if (!updatedWorld) {
      sendError(res, 500, 'Failed to create new chat', 'NEW_CHAT_ERROR');
      return;
    }

    res.json({
      world: serializeWorld(updatedWorld),
      chatId: updatedWorld.currentChatId,
      success: true
    });
  } catch (error) {
    logger.error('Error creating new chat', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to create new chat', 'NEW_CHAT_ERROR');
  }
});

router.post('/worlds/:worldName/load-chat/:chatId', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

    const currentWorld = await worldCtx.load();
    if (!currentWorld) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    const updatedWorld = await worldCtx.restoreChat(chatId);
    if (!updatedWorld) {
      sendError(res, 404, 'Chat not found or failed to load', 'LOAD_CHAT_ERROR');
      return;
    }

    res.json({
      world: serializeWorld(updatedWorld),
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
