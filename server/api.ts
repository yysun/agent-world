/**
 * API Routes for Agent World
 *
 * Features: REST API + SSE streaming with Zod validation
 * Endpoints: World/agent management, real-time chat with SSE
 * Implementation: Core module integration with event handling
 * 
 * Recent Changes:
 * - Enhanced SSE streaming for chunked responses
 * - Fixed duplicate message prevention with case-insensitive filtering
 * - Consolidated redundant code and comments
 * - Improved timer management to prevent premature stream termination:
 *   - Initial response timer: 15s
 *   - Streaming stall timer: 5s between chunks
 *   - Completion timer: 3s after stream ends
 *   - Error completion timer: 2s
 *   - Regular message timer: 5s
 * - Fixed streaming timeout logic to prevent ending during active LLM responses
 * - Optimized world existence checks to use getWorldConfig instead of deprecated getWorld for performance
 * - Extracted world retrieval and error handling into reusable getWorldOrError utility function
 * - Fixed PATCH /worlds/:worldName to return complete world data including agents after update
 *   - Added turnLimit support to WorldUpdateSchema and update logic
 *   - Response format now consistent with GET /worlds/:worldName endpoint
 *   - Ensures agents are preserved and included in response to prevent client-side confusion
 * - Added consistent serialization functions for API responses:
 *   - serializeWorld(): Converts World objects to JSON with chats array and agent serialization
 *   - serializeAgent(): Converts Agent objects to JSON with UI-specific properties (spriteIndex, messageCount)
 *   - Updated all endpoints to use consistent serialization format
 * - Simplified API by removing redundant endpoints since serialized World contains agents[] and chats[]:
 *   - Removed: GET /worlds/:worldName/agents (use world.agents instead)
 *   - Removed: GET /worlds/:worldName/agents/:agentName (use world.agents instead)
 *   - Removed: GET /worlds/:worldName/agents/:agentName/memory (use world.agents[].memory instead)
 *   - Kept: Action endpoints (POST, PATCH, DELETE) for agent management
 *   - Kept: DELETE /worlds/:worldName/agents/:agentName/memory for clearing agent memory
 */
import path from 'path';
import express, { Request, Response } from 'express';
import { z } from 'zod';
import { createWorld, listWorlds, createCategoryLogger, getWorldConfig, publishMessage, getWorld, enableStreaming, disableStreaming, exportWorldToMarkdown, restoreWorldChat } from '../core/index.js';
import { subscribeWorld, ClientConnection } from '../core/subscription.js';
import { LLMProvider, World } from '../core/types.js';
import { getDefaultRootPath } from '../core/storage-factory.js';
const logger = createCategoryLogger('api');

const DEFAULT_WORLD_NAME = 'Default World';

// Get default root path from storage-factory (no local defaults)
const ROOT_PATH = getDefaultRootPath();

/**
 * Serialize World object for API responses
 * Converts runtime World object to plain data object suitable for JSON serialization
 * Includes chats array from world.listChats() for complete frontend state
 */
async function serializeWorld(world: World): Promise<{
  id: string;
  name: string;
  description?: string;
  turnLimit: number;
  chatLLMProvider?: string;
  chatLLMModel?: string;
  currentChatId: string | null;
  agents: any[];
  chats: any[];
}> {
  // Convert agents Map to Array for response using serializeAgent
  const agentsArray = Array.from(world.agents.values()).map(agent => serializeAgent(agent));

  // Get chats using the unified listChats() method
  const chats = await world.listChats();

  return {
    id: world.id,
    name: world.name,
    description: world.description,
    turnLimit: world.turnLimit,
    chatLLMProvider: world.chatLLMProvider,
    chatLLMModel: world.chatLLMModel,
    currentChatId: world.currentChatId,
    agents: agentsArray,
    chats: chats
  };
}

/**
 * Serialize Agent object for API responses
 * Converts runtime Agent object to plain data object suitable for JSON serialization
 * Includes UI-specific properties for frontend compatibility
 */
function serializeAgent(agent: any): {
  id: string;
  name: string;
  type: string;
  status?: string;
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  llmCallCount: number;
  lastLLMCall?: Date;
  memory: any[];
  createdAt?: Date;
  lastActive?: Date;
  description?: string;
  spriteIndex: number;
  messageCount: number;
} {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    status: agent.status,
    provider: agent.provider,
    model: agent.model,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    systemPrompt: agent.systemPrompt,
    llmCallCount: agent.llmCallCount,
    lastLLMCall: agent.lastLLMCall,
    memory: agent.memory || [],
    createdAt: agent.createdAt,
    lastActive: agent.lastActive,
    description: agent.description,
    // UI-specific properties with defaults
    spriteIndex: agent.spriteIndex || Math.floor(Math.random() * 9), // Default to random sprite (0-8)
    messageCount: Array.isArray(agent.memory) ? agent.memory.length : 0
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

function validateMemoryFormat(memory: any): memory is Array<any> {
  return Array.isArray(memory);
}

async function isAgentNameUnique(world: any, agentName: string, excludeAgent?: string): Promise<boolean> {
  if (excludeAgent && agentName === excludeAgent) return true;
  const existingAgent = await world.getAgent(agentName);
  return !existingAgent;
}

async function getWorldOrError(res: Response, worldName: string): Promise<any | null> {
  const world = await getWorld(ROOT_PATH, worldName);

  if (!world) {
    sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
    return null;
  }

  return world;
}

// Validation schemas
const WorldCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  turnLimit: z.number().min(1).optional()
});

const WorldUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  turnLimit: z.number().min(1).optional()
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
  // Note: createdAt, lastActive, lastLLMCall are automatically managed by the core and cannot be set by clients
});

const router = express.Router();


// GET /worlds/:worldName - Get specific world with agents
router.get('/worlds/:worldName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;
    const world = await getWorld(ROOT_PATH, worldName);
    if (!world) return;

    // Use consistent serialization format
    const serializedWorld = await serializeWorld(world);
    res.json(serializedWorld);
  } catch (error) {
    logger.error('Error getting world', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to get world', 'WORLD_GET_ERROR');
  }
});

// GET /worlds - List worlds or create default
router.get('/worlds', async (req, res) => {
  try {
    const worlds = await listWorlds(ROOT_PATH);
    if (!worlds?.length) {
      const world = await createWorld(ROOT_PATH, { name: DEFAULT_WORLD_NAME });
      res.json([{ name: world.name, agentCount: 0 }]);
    } else {
      res.json(worlds.map(world => ({
        name: world.name,
        agentCount: world.agentCount || 0,
        id: world.id,
        description: world.description
      })));
    }
  } catch (error) {
    logger.error('Error listing worlds', { error: error instanceof Error ? error.message : error });
    sendError(res, 500, 'Failed to list worlds', 'WORLD_LIST_ERROR');
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

    const { name, description } = validation.data;
    const worldId = toKebabCase(name);

    // Check if world already exists
    const existingWorld = await getWorldConfig(ROOT_PATH, worldId);
    if (existingWorld) {
      sendError(res, 409, 'World with this name already exists', 'WORLD_EXISTS');
      return;
    }

    // Create the world
    const worldData = { name, description };
    const world = await createWorld(ROOT_PATH, worldData);

    res.status(201).json({ name: world.name, id: worldId });
  } catch (error) {
    logger.error('Error creating world', { error: error instanceof Error ? error.message : error });
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

    const world = await getWorldOrError(res, worldName);
    if (!world) return;

    const { name, description, turnLimit } = validation.data;

    // If name is being changed, check for duplicates
    if (name && name !== world.name) {
      const newWorldId = toKebabCase(name);
      const existingWorld = await getWorldConfig(ROOT_PATH, newWorldId);
      if (existingWorld) {
        sendError(res, 409, 'World with this name already exists', 'WORLD_EXISTS');
        return;
      }
    }

    // Update world metadata
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (turnLimit !== undefined) updates.turnLimit = turnLimit;

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      // Update world properties directly
      if (updates.name) world.name = updates.name;
      if (updates.description !== undefined) world.description = updates.description;
      if (updates.turnLimit !== undefined) world.turnLimit = updates.turnLimit;

      // Save the world
      await world.save();
    }

    // Return complete world data including agents (consistent with GET endpoint)
    const serializedWorld = await serializeWorld(world);
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

    const world = await getWorldOrError(res, worldName);
    if (!world) return;

    // Delete the world
    const deleted = await world.delete();
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
    const world = await getWorldOrError(res, worldName);
    if (!world) return;
    // Check for duplicate agent name
    const isUnique = await isAgentNameUnique(world, agentData.name);
    if (!isUnique) {
      sendError(res, 409, 'Agent with this name already exists', 'AGENT_EXISTS');
      return;
    }
    // Create agent in world
    const createdAgent = await world.createAgent(agentData);
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

    // Check if world exists
    const worldExists = await getWorldConfig(ROOT_PATH, worldName);
    if (!worldExists) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    // Generate markdown using core function
    const markdown = await exportWorldToMarkdown(ROOT_PATH, worldName);

    // Generate timestamp for filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: YYYY-MM-DDTHH-MM-SS
    const filename = `${worldName}-${timestamp}.md`;

    // Set headers for file download
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(markdown, 'utf8'));

    // Send the markdown content
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
    const world = await getWorldOrError(res, worldName);
    if (!world) return;

    const existingAgent = await world.getAgent(agentName);
    if (!existingAgent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    // Only update agent config/metadata, never memory unless clearMemory is set
    let updatedAgent = existingAgent;

    // If clearMemory is requested, clear memory first
    if (clearMemory) {
      const cleared = await world.clearAgentMemory(agentName);
      if (!cleared) {
        sendError(res, 500, 'Failed to clear agent memory', 'MEMORY_CLEAR_ERROR');
        return;
      }
      // Re-fetch agent after memory clear
      updatedAgent = await world.getAgent(agentName);
    }

    // Prepare updates, but exclude memory field if present
    const updates: any = { ...validation.data };
    delete updates.clearMemory;
    if ('memory' in updates) delete updates.memory;

    // Only update if there are non-memory fields to update
    const updateKeys = Object.keys(updates).filter(k => k !== 'memory');
    if (updateKeys.length > 0) {
      const updateResult = await world.updateAgent(agentName, updates);
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

    const world = await getWorldOrError(res, worldName);
    if (!world) return;

    // Check if agent exists
    const existingAgent = await world.getAgent(agentName);
    if (!existingAgent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    // Delete the agent
    const deleted = await world.deleteAgent(agentName);
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

    const world = await getWorld(ROOT_PATH, worldName);
    if (!world) return;

    const agent = await world.getAgent(agentName);
    if (!agent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    // Clear agent memory
    const clearedAgent = await world.clearAgentMemory(agentName);
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

// Helper function to handle non-streaming chat response (aligned with CLI pipeline mode)
async function handleNonStreamingChat(res: Response, worldName: string, message: string, sender: string): Promise<void> {
  // Check if world exists
  const worldExists = await getWorldConfig(ROOT_PATH, worldName);
  if (!worldExists) {
    sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
    return;
  }

  // Disable streaming to match CLI pipeline mode behavior
  disableStreaming();

  try {
    // Collect response data
    let responseContent = '';
    let responseSender = '';
    let isComplete = false;
    let hasError = false;
    let errorMessage = '';

    // Set up response collection with timeout
    const responsePromise = new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;

      const completeResponse = () => {
        clearTimeout(timer);
        isComplete = true;
        resolve();
      };

      const handleError = (error: string) => {
        clearTimeout(timer);
        hasError = true;
        errorMessage = error;
        reject(new Error(error));
      };

      // Create client connection using CLI pipeline pattern
      const client: ClientConnection = {
        isOpen: true,
        onWorldEvent: (eventType: string, eventData: any) => {
          // Skip system success messages (following CLI pattern)
          if (eventData.content && eventData.content.includes('Success message sent')) return;

          // Handle system/world events
          if ((eventType === 'system' || eventType === 'world') && eventData.message) {
            if (eventData.message.toLowerCase().includes('error')) {
              handleError(eventData.message);
            }
          }

          // Handle message events (main response from agents)
          if (eventType === 'message' && eventData.content) {
            // Skip user messages to prevent echo
            if (eventData.sender && ['human'].includes(eventData.sender.toLowerCase())) {
              return;
            }

            responseContent = eventData.content;
            responseSender = eventData.sender || 'agent';
            completeResponse();
          }
        },
        onError: (error: string) => {
          handleError(error);
        }
      };

      // Set timeout for response
      timer = setTimeout(() => {
        if (!isComplete) {
          handleError('Request timeout - no response received within 15 seconds');
        }
      }, 15000);

      // Subscribe to world and send message
      subscribeWorld(worldName, ROOT_PATH, client).then(subscription => {
        if (!subscription) {
          handleError('Failed to subscribe to world');
          return;
        }

        // Send the message
        publishMessage(subscription.world, message, sender);
      }).catch(error => {
        handleError(`Failed to connect to world: ${error instanceof Error ? error.message : error}`);
      });
    });

    // Wait for response to complete
    await responsePromise;

    if (hasError) {
      sendError(res, 500, errorMessage, 'CHAT_ERROR');
      return;
    }

    // Send successful response
    res.json({
      success: true,
      message: 'Message processed successfully',
      data: {
        sender: responseSender,
        content: responseContent || 'No response received',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    sendError(res, 500, error instanceof Error ? error.message : 'Unknown error', 'CHAT_ERROR');
  } finally {
    // Re-enable streaming for other requests
    enableStreaming();
  }
}

// Helper function to handle streaming chat response  
async function handleStreamingChat(req: Request, res: Response, worldName: string, message: string, sender: string): Promise<void> {
  // Check if world exists before setting up SSE stream
  const worldExists = await getWorldConfig(ROOT_PATH, worldName);
  if (!worldExists) {
    sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  // Initialize streaming state
  const streaming = {
    isActive: false,
    content: '',
    sender: undefined as string | undefined,
    messageId: undefined as string | undefined,
    wait: undefined as ((delay: number) => void) | undefined,
    stopWait: undefined as (() => void) | undefined
  };

  // Timer management
  let timer: ReturnType<typeof setTimeout> | undefined;

  const setupTimer = (callback: () => void, delay: number = 5000): void => {
    clearTimer();
    timer = setTimeout(callback, delay);
  };

  const clearTimer = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  // Setup streaming callbacks
  streaming.wait = (delay: number) => {
    // Clear any existing timer before setting up new one
    clearTimer();
    setupTimer(() => {
      // Only timeout if streaming is not active or has stalled
      if (streaming.isActive) {
        logger.debug('Streaming appears stalled - timing out...');
        resetStreamingState();
      }
      handleStreamingComplete();
    }, delay);
  };

  streaming.stopWait = () => {
    clearTimer();
  };

  const resetStreamingState = (): void => {
    streaming.isActive = false;
    streaming.content = '';
    streaming.sender = undefined;
    streaming.messageId = undefined;
  };

  const handleStreamingComplete = (): void => {
    // Send completion event
    sendSSE(JSON.stringify({
      type: 'complete',
      message: 'Operation completed'
    }));
    res.end();
  };

  // Handle streaming events
  const handleStreamingEvents = (eventType: string, eventData: any): boolean => {
    if (eventType !== 'sse') return false;

    // Handle chunk events
    if (eventData.type === 'chunk' && eventData.content) {
      if (!streaming.isActive) {
        streaming.isActive = true;
        streaming.content = '';
        streaming.sender = eventData.agentName || eventData.sender;
        streaming.messageId = eventData.messageId;

        // Send start event
        sendSSE(JSON.stringify({
          type: 'sse',
          data: {
            type: 'start',
            sender: streaming.sender,
            messageId: streaming.messageId
          }
        }));

        if (streaming.stopWait) {
          streaming.stopWait();
        }
      }

      if (streaming.messageId === eventData.messageId) {
        streaming.content += eventData.content;

        // Send chunk event
        sendSSE(JSON.stringify({
          type: 'sse',
          data: {
            type: 'chunk',
            content: eventData.content,
            sender: streaming.sender,
            messageId: streaming.messageId
          }
        }));

        // Reset stall timer with each chunk (clear previous and set new)
        if (streaming.wait) {
          streaming.wait(5000); // 5 second stall timeout between chunks
        }
      }
      return true;
    }

    // Handle end events
    if (eventData.type === 'end' &&
      streaming.isActive &&
      streaming.messageId === eventData.messageId) {

      // Send end event
      sendSSE(JSON.stringify({
        type: 'sse',
        data: {
          type: 'end',
          sender: streaming.sender,
          messageId: streaming.messageId,
          content: streaming.content
        }
      }));

      resetStreamingState();

      // Set completion timer (clear previous and set new) - shorter since streaming is complete
      if (streaming.wait) {
        streaming.wait(3000); // 3 second completion timeout
      }
      return true;
    }

    // Handle error events
    if (eventData.type === 'error' &&
      streaming.isActive &&
      streaming.messageId === eventData.messageId) {

      // Send error event
      sendSSE(JSON.stringify({
        type: 'sse',
        data: {
          type: 'error',
          error: eventData.error || eventData.message,
          sender: streaming.sender,
          messageId: streaming.messageId
        }
      }));

      resetStreamingState();

      // Set completion timer (clear previous and set new) - shorter since there's an error
      if (streaming.wait) {
        streaming.wait(2000); // 2 second completion timeout for errors
      }
      return true;
    }

    return false;
  };

  // Helper function to send SSE data
  const sendSSE = (data: string) => {
    res.write(`data: ${data}\n\n`);
  };

  // Create client connection using only onWorldEvent
  const client: ClientConnection = {
    isOpen: true,
    onWorldEvent: (eventType: string, eventData: any) => {
      // Handle streaming events first
      if (handleStreamingEvents(eventType, eventData)) {
        return;
      }

      // Skip user messages to prevent echo
      if (eventData.sender && ['human'].includes(eventData.sender.toLowerCase())) {
        return;
      }

      // Filter out success messages
      if (eventData.content && eventData.content.includes('Success message sent')) {
        return;
      }

      // Handle system messages
      if ((eventType === 'system' || eventType === 'world') && eventData.message) {
        sendSSE(JSON.stringify({
          type: eventType,
          data: {
            message: eventData.message,
            sender: 'system'
          }
        }));
      }

      // Handle regular messages
      if (eventType === 'message' && eventData.content) {
        sendSSE(JSON.stringify({
          type: 'message',
          data: {
            content: eventData.content,
            sender: eventData.sender || 'agent',
            timestamp: eventData.timestamp
          }
        }));

        // Setup completion timer for non-streaming messages (clear previous and set new)
        if (streaming.wait) {
          streaming.wait(5000); // 5 second completion timeout for regular messages
        }
      }
    },
    onError: (error: string) => {
      logger.error(`World error: ${error}`);
      sendSSE(JSON.stringify({
        type: 'error',
        message: error
      }));
      res.end();
    }
  };

  // Subscribe to world
  const subscription = await subscribeWorld(worldName, ROOT_PATH, client);
  // World existence already checked above, so subscription should not be null
  if (!subscription) {
    logger.error('Unexpected: subscription is null after world existence check');
    sendSSE(JSON.stringify({
      type: 'error',
      message: 'Failed to subscribe to world'
    }));
    res.end();
    return;
  }

  // Send initial connection event
  sendSSE(JSON.stringify({
    type: 'connected',
    payload: { worldName }
  }));

  // Send message to world
  try {
    publishMessage(subscription.world, message, sender);

    // Send success response
    sendSSE(JSON.stringify({
      type: 'response',
      success: true,
      message: 'Message sent to world',
      data: { sender }
    }));

    // Set initial wait timer to allow for LLM response
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

  // Cleanup on client disconnect
  req.on('close', () => {
    logger.debug('Chat client disconnected, cleaning up');
    clearTimer();
    if (subscription) {
      subscription.unsubscribe();
    }
  });
}

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
    // Default behavior is streaming (stream defaults to true when omitted)
    if (stream === false) {
      await handleNonStreamingChat(res, worldName, message, sender);
    } else {
      // stream === true (either explicitly set or defaulted when omitted)
      await handleStreamingChat(req, res, worldName, message, sender);
    }

  } catch (error) {
    logger.error('Error in chat endpoint', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    if (!res.headersSent) {
      sendError(res, 500, 'Failed to process chat request', 'CHAT_ERROR');
    }
  }
});

// Chat Endpoints

// DELETE /worlds/:worldName/chats/:chatId - Delete chat
router.delete('/worlds/:worldName/chats/:chatId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, chatId } = req.params;
    const world = await getWorldOrError(res, worldName);
    if (!world) return;

    const deleted = await world.deleteChatData(chatId);
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

    // Get world instance
    const world = await getWorld(ROOT_PATH, worldName);
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    // Create new chat via world method - now returns updated World object
    const updatedWorld = await world.newChat();

    // Return serialized world with new currentChatId (now includes chats array)
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

    // Get world instance
    const world = await getWorld(ROOT_PATH, worldName);
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    // Load chat via world method
    await world.loadChatById(chatId);

    // Return serialized world with loaded chat (consistent with other endpoints)
    const serializedWorld = await serializeWorld(world);
    res.json({
      world: serializedWorld,
      chatId: world.currentChatId,
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
