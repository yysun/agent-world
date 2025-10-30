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
 * - Enhanced handleStreamingChat with intelligent timeout management:
 *   - Tracks active agents and pending events to prevent premature stream closure
 *   - Implements adaptive timeout logic (12s initial, 3s check intervals, 15s max without events)
 *   - Better error handling that doesn't immediately close streams on non-critical errors
 *   - Agent activity tracking via SSE start/end events for accurate completion detection
 *   - **MCP tool execution tracking via tool-start/tool-result/tool-error events to prevent timeout during long-running tool calls**
 *   - Detailed logging for debugging streaming issues
 *   - Graceful handling of race conditions between timers and event processing
 * - 2025-10-21: Refactored message edit to frontend-driven approach (DELETE removal only)
 *   - DELETE endpoint simplified: only accepts { chatId } (no newContent)
 *   - Calls removeMessagesFrom() directly (no resubmission)
 *   - Returns RemovalResult without resubmission status
 *   - Frontend handles resubmission via POST /messages (reuses SSE streaming)
 *   - Benefits: RESTful design, simpler server logic, automatic SSE streaming for responses
 * - 2025-10-21: Fixed message event streaming to include messageId for frontend edit feature
 *   - Message events now streamed with complete data (sender, content, messageId, createdAt)
 *   - Enables frontend to track and edit user messages by server-generated messageId
 * - 2025-10-30: Refactored to use direct world.eventEmitter subscription pattern
 *   - Eliminates ClientConnection.onWorldEvent forwarding (same pattern as CLI)
 *   - Attaches listeners directly to world.eventEmitter for better performance
 *   - Proper listener cleanup in both streaming and non-streaming handlers
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
  removeMessagesFrom,
  type World,
  type Agent,
  type Chat,
  type WorldActivityEventPayload,
  LLMProvider
} from '../core/index.js';
import { subscribeWorld, ClientConnection } from '../core/index.js';
import {
  listMCPServers,
  restartMCPServer,
  getMCPSystemHealth,
  getMCPRegistryStats,
  MCPServerInstance
} from '../core/mcp-server-registry.js';

// Function-specific loggers for granular debugging control
const loggerWorld = createCategoryLogger('api.world');
const loggerAgent = createCategoryLogger('api.agent');
const loggerChat = createCategoryLogger('api.chat');
const loggerStream = createCategoryLogger('api.stream');
const loggerValidation = createCategoryLogger('api.validation');
const loggerMcp = createCategoryLogger('api.mcp');
const loggerExport = createCategoryLogger('api.export');
const DEFAULT_WORLD_NAME = 'Default World';

// Event name constants
const WORLD_EVENTS = {
  WORLD: 'world',
  MESSAGE: 'message',
  SSE: 'sse',
  SYSTEM: 'system'
} as const;

// Timeout constants for streaming
const STREAM_TIMEOUT_NO_EVENTS_MS = 15000;
const STREAM_TIMEOUT_CHECK_INTERVAL_MS = 3000;
const STREAM_TIMEOUT_INITIAL_MS = 12000;
const STREAM_TIMEOUT_ACTIVITY_MS = 8000;
const NON_STREAM_TIMEOUT_MS = 15000;

// Event payload types for API handlers
interface MessageEventPayload {
  sender: string;
  content: string;
  messageId?: string;
  replyToMessageId?: string;
  timestamp?: string;
  [key: string]: any;
}

interface SSEEventPayload {
  type: string;
  agentName?: string;
  [key: string]: any;
}

interface SystemEventPayload {
  message?: string;
  content?: string;
  [key: string]: any;
}

interface WorldActivityPayload {
  state?: string;
  type?: string;
  agentName?: string;
  toolExecution?: {
    toolCallId?: string;
    toolName?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

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
  setChat: (chatId: string) => Promise<World | null>;
  deleteChat: (chatId: string) => Promise<boolean>;
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
    setChat: (chatId: string) => restoreChat(id, chatId),
    deleteChat: (chatId: string) => deleteChatCore(id, chatId),
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
    mcpConfig: world.mcpConfig || null,
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
    messageCount: agent.memory?.length || 0
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
  chatLLMModel: z.string().nullable().optional(),
  mcpConfig: z.string().nullable().optional()
});

const WorldUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  turnLimit: z.number().min(1).optional(),
  chatLLMProvider: z.enum(['openai', 'anthropic', 'azure', 'google', 'xai', 'openai-compatible', 'ollama']).nullable().optional(),
  chatLLMModel: z.string().nullable().optional(),
  mcpConfig: z.string().nullable().optional()
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
    loggerWorld.error('Error listing worlds', { error: error instanceof Error ? error.message : error });
    sendError(res, 500, 'Failed to list worlds', 'WORLD_LIST_ERROR');
  }
});

router.get('/worlds/:worldName', validateWorld, async (req: Request, res: Response) => {
  try {
    // const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;
    const world = (req as any).world;
    res.json(serializeWorld(world));
  } catch (error) {
    loggerWorld.error('Error getting world', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
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
    const { name, description, turnLimit, chatLLMProvider, chatLLMModel, mcpConfig } = validation.data;
    const worldId = toKebabCase(name);
    const world = await createWorld({
      name,
      description,
      turnLimit,
      chatLLMProvider: (chatLLMProvider || undefined) as LLMProvider | undefined,
      chatLLMModel: chatLLMModel || undefined,
      mcpConfig: mcpConfig || null
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
    loggerWorld.error('Error creating world', { error: errorMessage });
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
    const { name, description, turnLimit, chatLLMProvider, chatLLMModel, mcpConfig } = validation.data;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (turnLimit !== undefined) updates.turnLimit = turnLimit;
    if (chatLLMProvider !== undefined && chatLLMProvider !== null) updates.chatLLMProvider = chatLLMProvider;
    if (chatLLMModel !== undefined && chatLLMModel !== null) updates.chatLLMModel = chatLLMModel;
    if (mcpConfig !== undefined) updates.mcpConfig = mcpConfig;

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
    loggerWorld.error('Error updating world', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
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
    loggerWorld.error('Error deleting world', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
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
    loggerAgent.error('Error creating agent', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
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
    loggerAgent.error('Error listing agents', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
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
    loggerAgent.error('Error getting agent', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, agentName: req.params.agentName });
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
    loggerExport.error('Error exporting world', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
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
    loggerAgent.error('Error updating agent', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, agentName: req.params.agentName });
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
    loggerAgent.error('Error deleting agent', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, agentName: req.params.agentName });
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
    loggerAgent.error('Error clearing agent memory', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, agentName: req.params.agentName });
    sendError(res, 500, 'Failed to clear agent memory', 'MEMORY_CLEAR_ERROR');
  }
});

// Chat Helper Functions

/**
 * Handles non-streaming chat requests by subscribing to world events and collecting all messages.
 * Disables streaming, subscribes to world events, publishes the message, and waits for completion
 * or timeout before returning the aggregated response.
 * 
 * @param res - Express response object
 * @param worldName - Name of the world to send message to
 * @param message - The message to send
 * @param sender - Agent name sending the message
 * @returns Promise that resolves when chat is complete
 */
async function handleNonStreamingChat(res: Response, worldName: string, message: string, sender: string): Promise<void> {
  disableStreaming();
  let subscription: any = null;
  let listeners: Map<string, (...args: any[]) => void> = new Map();

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

      // Subscribe with minimal client (no forwarding callbacks)
      subscribeWorld(worldName, { isOpen: true }).then(sub => {
        if (!sub) {
          hasError = true;
          errorMessage = 'Failed to subscribe to world';
          reject(new Error(errorMessage));
          return;
        }
        subscription = sub;
        const world = subscription.world;

        // Attach direct listener to world.eventEmitter
        const eventListener = (eventData: any) => {
          responseContent = JSON.stringify({ type: 'event', data: eventData });
          clearTimeout(timer);
          isComplete = true;
          resolve();
        };

        // Listen to all event types for non-streaming mode
        world.eventEmitter.on(WORLD_EVENTS.WORLD, eventListener);
        listeners.set(WORLD_EVENTS.WORLD, eventListener);
        world.eventEmitter.on(WORLD_EVENTS.MESSAGE, eventListener);
        listeners.set(WORLD_EVENTS.MESSAGE, eventListener);
        world.eventEmitter.on(WORLD_EVENTS.SYSTEM, eventListener);
        listeners.set(WORLD_EVENTS.SYSTEM, eventListener);

        // Publish message
        publishMessage(world, message, sender);
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
    // Cleanup listeners
    if (subscription && listeners.size > 0) {
      try {
        const world = subscription.world;
        for (const [eventType, listener] of listeners.entries()) {
          world.eventEmitter.removeListener(eventType, listener);
        }
        listeners.clear();
        await subscription.unsubscribe();
      } catch (cleanupError) {
        loggerChat.error('Error during cleanup', { error: cleanupError instanceof Error ? cleanupError.message : cleanupError });
      }
    }
    enableStreaming();
  }
}

/**
 * Handles streaming chat requests using Server-Sent Events (SSE).
 * Subscribes to world events and streams them to the client in real-time.
 * Implements intelligent timeout management based on agent activity and tool execution.
 * 
 * @param req - Express request object
 * @param res - Express response object
 * @param worldName - Name of the world to send message to
 * @param message - The message to send
 * @param sender - Agent name sending the message
 * @returns Promise that resolves when stream is complete
 */
async function handleStreamingChat(req: Request, res: Response, worldName: string, message: string, sender: string): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  let timer: ReturnType<typeof setTimeout> | undefined;
  let hasReceivedEvents = false;
  let isResponseEnded = false;
  let lastEventTime = Date.now();
  let activeAgents = new Set<string>();
  let pendingEvents = 0;
  let activeToolCalls = new Set<string>(); // Track active MCP tool executions
  let awaitingWorldIdle = false;

  const resetTimer = (delay: number = STREAM_TIMEOUT_ACTIVITY_MS): void => {
    if (timer) clearTimeout(timer);
    if (isResponseEnded) return;

    timer = setTimeout(() => {
      if (!isResponseEnded) {
        const timeSinceLastEvent = Date.now() - lastEventTime;
        const hasActiveTasks = pendingEvents > 0 || activeAgents.size > 0 || activeToolCalls.size > 0 || awaitingWorldIdle;

        loggerStream.debug(`Streaming timeout check: timeSinceLastEvent=${timeSinceLastEvent}ms, hasActiveTasks=${hasActiveTasks}, pendingEvents=${pendingEvents}, activeAgents=${activeAgents.size}, activeToolCalls=${activeToolCalls.size}`);

        // Only end if we've had events and no recent activity
        if (hasReceivedEvents && timeSinceLastEvent >= delay && !hasActiveTasks) {
          loggerStream.debug(`Ending stream: ${delay}ms of inactivity with no active tasks`);
          endResponse();
        } else if (!hasReceivedEvents && timeSinceLastEvent >= STREAM_TIMEOUT_NO_EVENTS_MS) {
          // Fallback: if no events received at all after timeout
          loggerStream.debug(`Ending stream: no events received within ${STREAM_TIMEOUT_NO_EVENTS_MS}ms`);
          endResponse();
        } else {
          // Continue waiting - reset timer for shorter interval
          resetTimer(STREAM_TIMEOUT_CHECK_INTERVAL_MS);
        }
      }
    }, delay);
  };

  const endResponse = (): void => {
    if (isResponseEnded) return;
    isResponseEnded = true;

    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }

    loggerStream.debug(`Ending SSE response. Stats: events=${hasReceivedEvents}, activeAgents=${activeAgents.size}, pendingEvents=${pendingEvents}, activeToolCalls=${activeToolCalls.size}`);

    try {
      if (!res.destroyed) {
        res.end();
      }
    } catch (error) {
      loggerStream.debug('Error ending response (likely already closed):', error);
    }
  };

  const sendSSE = (data: string) => {
    if (isResponseEnded || res.destroyed) return;

    try {
      res.write(`data: ${data}\n\n`);
      hasReceivedEvents = true;
      lastEventTime = Date.now();
      // Reset the timer on each event to allow for continued activity
      resetTimer(STREAM_TIMEOUT_ACTIVITY_MS);
    } catch (error) {
      loggerStream.debug('Error writing SSE data:', error);
      endResponse();
    }
  };

  // Subscribe with minimal client (no forwarding callbacks - we'll attach direct listeners)
  const subscription = await subscribeWorld(worldName, { isOpen: true });
  if (!subscription) {
    loggerStream.error('Unexpected: subscription is null after world existence check');
    sendSSE(JSON.stringify({ type: 'error', message: 'Failed to subscribe to world' }));
    endResponse();
    return;
  }

  const world = subscription.world;
  const listeners = new Map<string, (...args: any[]) => void>();

  // Attach direct listeners to world.eventEmitter
  const worldListener = (eventData: WorldActivityPayload) => {
    // Track agent activity and tool execution for better timeout management
    const payload = eventData;
    // Handle activity events
    if (payload?.state === 'processing') {
      awaitingWorldIdle = true;
    } else if (payload?.state === 'idle') {
      awaitingWorldIdle = false;
    }
    // Handle tool events (migrated from sse channel)
    else if (payload?.type === 'tool-start' || payload?.type === 'tool-result' || payload?.type === 'tool-error') {
      const agentName = payload.agentName;
      if (agentName) {
        if (payload.type === 'tool-start') {
          const toolKey = `${agentName}-${payload.toolExecution?.toolCallId}`;
          activeToolCalls.add(toolKey);
          pendingEvents++;
          loggerStream.debug(`Tool start: ${payload.toolExecution?.toolName} (${toolKey}). Active tools: ${activeToolCalls.size}, Pending: ${pendingEvents}`);
        } else if (payload.type === 'tool-result' || payload.type === 'tool-error') {
          const toolKey = `${agentName}-${payload.toolExecution?.toolCallId}`;
          activeToolCalls.delete(toolKey);
          pendingEvents = Math.max(0, pendingEvents - 1);
          loggerStream.debug(`Tool ${payload.type === 'tool-error' ? 'error' : 'complete'}: ${payload.toolExecution?.toolName} (${toolKey}). Active tools: ${activeToolCalls.size}, Pending: ${pendingEvents}`);
        }
      }
    }

    sendSSE(JSON.stringify({ type: WORLD_EVENTS.WORLD, data: eventData }));
  };
  world.eventEmitter.on(WORLD_EVENTS.WORLD, worldListener);
  listeners.set(WORLD_EVENTS.WORLD, worldListener);

  const messageListener = (eventData: MessageEventPayload) => {
    // Enhance message event data with structured format
    const messageData = {
      type: 'message',
      sender: eventData.sender,
      content: eventData.content,
      messageId: eventData.messageId,
      replyToMessageId: eventData.replyToMessageId,  // Include threading info for frontend
      createdAt: eventData.timestamp || new Date().toISOString()
    };
    sendSSE(JSON.stringify({ type: WORLD_EVENTS.MESSAGE, data: messageData }));
  };
  world.eventEmitter.on(WORLD_EVENTS.MESSAGE, messageListener);
  listeners.set(WORLD_EVENTS.MESSAGE, messageListener);

  const sseListener = (eventData: SSEEventPayload) => {
    const agentName = eventData.agentName;
    if (agentName) {
      if (eventData.type === 'start') {
        activeAgents.add(agentName);
        pendingEvents++;
        loggerStream.debug(`SSE start: agent ${agentName} started responding. Active: ${activeAgents.size}, Pending: ${pendingEvents}`);
      } else if (eventData.type === 'end' || eventData.type === 'error') {
        activeAgents.delete(agentName);
        pendingEvents = Math.max(0, pendingEvents - 1);
        loggerStream.debug(`SSE end/error: agent ${agentName} finished. Active: ${activeAgents.size}, Pending: ${pendingEvents}`);
      }
    }
    sendSSE(JSON.stringify({ type: WORLD_EVENTS.SSE, data: eventData }));
  };
  world.eventEmitter.on(WORLD_EVENTS.SSE, sseListener);
  listeners.set(WORLD_EVENTS.SSE, sseListener);

  const systemListener = (eventData: SystemEventPayload) => {
    sendSSE(JSON.stringify({ type: WORLD_EVENTS.SYSTEM, data: eventData }));
  };
  world.eventEmitter.on(WORLD_EVENTS.SYSTEM, systemListener);
  listeners.set(WORLD_EVENTS.SYSTEM, systemListener);

  // Cleanup function to remove all listeners
  const cleanupListeners = () => {
    for (const [eventType, listener] of listeners.entries()) {
      world.eventEmitter.removeListener(eventType, listener);
    }
    listeners.clear();
  };

  try {
    const messageEvent = publishMessage(world, message, sender);

    // Message is automatically sent via the event listener
    // No need to send explicitly - would cause duplicate

    // Start the initial timer - give more time for the first event
    resetTimer(STREAM_TIMEOUT_INITIAL_MS);
  }
  catch (error) {
    sendSSE(JSON.stringify({
      type: 'error',
      message: 'Failed to send message',
      data: { error: error instanceof Error ? error.message : String(error) }
    }));
    setTimeout(() => {
      cleanupListeners();
      endResponse();
    }, 1000);
  }

  req.on('close', () => {
    loggerStream.debug('Chat client disconnected, cleaning up');
    cleanupListeners();
    endResponse();
    subscription?.unsubscribe();
  });
}

// Chat Routes
router.post('/worlds/:worldName/messages', validateWorld, async (req: Request, res: Response): Promise<void> => {
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
    loggerChat.error('Error in chat endpoint', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    if (!res.headersSent) {
      sendError(res, 500, 'Failed to process chat request', 'CHAT_ERROR');
    }
  }
});

router.delete('/worlds/:worldName/messages/:messageId', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const { messageId } = req.params;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;
    const world = (req as any).world as World;

    // Validate request body - only chatId needed for removal
    const validation = z.object({
      chatId: z.string()
    }).safeParse(req.body);

    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const { chatId } = validation.data;

    // Check if world is processing
    if (world.isProcessing) {
      sendError(res, 423, 'World is currently processing another message', 'WORLD_LOCKED');
      return;
    }

    // Verify message exists and get its details
    const memory = await coreGetMemory(worldCtx.id, chatId);
    if (!memory) {
      sendError(res, 404, 'Chat not found', 'CHAT_NOT_FOUND');
      return;
    }

    const targetMessage = memory.find(m => m.messageId === messageId);
    if (!targetMessage) {
      sendError(res, 404, 'Message not found', 'MESSAGE_NOT_FOUND');
      return;
    }

    // Verify it's a user message (check role, not sender)
    if (targetMessage.role !== 'user') {
      sendError(res, 400, 'Can only edit user messages', 'INVALID_MESSAGE_TYPE');
      return;
    }

    // Perform removal only (frontend will handle resubmission)
    const result = await removeMessagesFrom(worldCtx.id, messageId, chatId);

    // Return removal result
    if (!result.success) {
      sendError(res, 500, 'Failed to remove messages', 'REMOVAL_ERROR', result.failedAgents);
      return;
    }

    res.json({
      ...result,
      message: `Successfully removed ${result.messagesRemovedTotal} message(s) from ${result.processedAgents.length} agent(s)`
    });
  } catch (error) {
    loggerChat.error('Error editing message', {
      error: error instanceof Error ? error.message : error,
      worldName: req.params.worldName,
      messageId: req.params.messageId
    });
    if (!res.headersSent) {
      sendError(res, 500, 'Failed to edit message', 'MESSAGE_EDIT_ERROR');
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
    loggerChat.error('Error deleting chat', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, chatId: req.params.chatId });
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
    loggerChat.error('Error listing chats', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to list chats', 'CHAT_LIST_ERROR');
  }
});

// router.get('/worlds/:worldName/chats/:chatId', validateWorld, async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { chatId } = req.params;
//     const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

//     const world = await worldCtx.load();
//     if (!world) {
//       sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
//       return;
//     }
//     const chat = world.chats.get(chatId);
//     if (!chat) {
//       sendError(res, 404, 'Chat not found', 'CHAT_NOT_FOUND');
//       return;
//     }
//     res.json(serializeChat(chat));
//   } catch (error) {
//     logger.error('Error getting chat', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, chatId: req.params.chatId });
//     sendError(res, 500, 'Failed to get chat', 'CHAT_GET_ERROR');
//   }
// });

// router.get('/worlds/:worldName/chats/:chatId/messages', validateWorld, async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { chatId } = req.params;
//     const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;

//     const messages = await worldCtx.getMemory(chatId);
//     res.json(messages || []);
//   } catch (error) {
//     logger.error('Error getting chat messages', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, chatId: req.params.chatId });
//     sendError(res, 500, 'Failed to get chat messages', 'CHAT_MESSAGES_ERROR');
//   }
// });

router.post('/worlds/:worldName/chats', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;
    const updatedWorld = await worldCtx.newChat();
    if (!updatedWorld) {
      sendError(res, 400, 'Failed to create new chat', 'CHAT_CREATION_ERROR');
      return;
    }
    res.json({
      world: serializeWorld(updatedWorld),
      chatId: updatedWorld.currentChatId,
      success: true
    });
  } catch (error) {
    loggerChat.error('Error creating new chat', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to create new chat', 'NEW_CHAT_ERROR');
  }
});

router.post('/worlds/:worldName/setChat/:chatId', validateWorld, async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId } = req.params;
    const worldCtx = (req as any).worldCtx as ReturnType<typeof createWorldContext>;
    const currentWorld = (req as any).world;
    if (!currentWorld) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    const updatedWorld = await worldCtx.setChat(chatId);
    if (!updatedWorld) {
      res.json({
        world: serializeWorld(currentWorld),
        chatId: currentWorld.currentChatId,
        success: false
      });
      return;
    }

    res.json({
      world: serializeWorld(updatedWorld),
      chatId: updatedWorld.currentChatId,
      success: true
    });
  } catch (error) {
    loggerChat.error('Error loading chat', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, chatId: req.params.chatId });
    if (!res.headersSent) {
      sendError(res, 500, 'Failed to load chat', 'LOAD_CHAT_ERROR');
    }
  }
});

// MCP Server Management Routes
router.get('/mcp/servers', async (req: Request, res: Response): Promise<void> => {
  try {
    const servers = listMCPServers();
    const serversInfo = servers.map(server => ({
      id: server.id.slice(0, 8), // Truncated ID for display
      name: server.config.name,
      transport: server.config.transport,
      status: server.status,
      referenceCount: server.referenceCount,
      startedAt: server.startedAt,
      lastHealthCheck: server.lastHealthCheck,
      associatedWorlds: Array.from(server.associatedWorlds),
      error: server.error?.message
    }));

    const stats = getMCPRegistryStats();

    res.json({
      servers: serversInfo,
      stats
    });
  } catch (error) {
    loggerMcp.error('Error listing MCP servers', { error: error instanceof Error ? error.message : error });
    sendError(res, 500, 'Failed to list MCP servers', 'MCP_LIST_ERROR');
  }
});

router.post('/mcp/servers/:serverId/restart', async (req: Request, res: Response): Promise<void> => {
  try {
    const { serverId } = req.params;

    // Find full server ID from partial ID
    const servers = listMCPServers();
    const server = servers.find(s => s.id.startsWith(serverId) || s.id === serverId);

    if (!server) {
      sendError(res, 404, 'MCP server not found', 'MCP_SERVER_NOT_FOUND');
      return;
    }

    const success = await restartMCPServer(server.id);

    if (success) {
      res.json({
        success: true,
        message: `MCP server ${server.config.name} restarted successfully`,
        serverId: server.id.slice(0, 8)
      });
    } else {
      sendError(res, 500, 'Failed to restart MCP server', 'MCP_RESTART_ERROR');
    }
  } catch (error) {
    loggerMcp.error('Error restarting MCP server', {
      error: error instanceof Error ? error.message : error,
      serverId: req.params.serverId
    });
    sendError(res, 500, 'Failed to restart MCP server', 'MCP_RESTART_ERROR');
  }
});

router.get('/mcp/health', async (req: Request, res: Response): Promise<void> => {
  try {
    const health = getMCPSystemHealth();
    const stats = getMCPRegistryStats();

    res.json({
      ...health,
      timestamp: new Date().toISOString(),
      registry: stats
    });
  } catch (error) {
    loggerMcp.error('Error getting MCP health', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Failed to get MCP system health'
    });
  }
});

export default router;
