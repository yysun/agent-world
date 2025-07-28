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
 */
import path from 'path';
import express, { Request, Response } from 'express';
import { z } from 'zod';
import { createWorld, listWorlds, createCategoryLogger, getWorldConfig, publishMessage, getWorld, enableStreaming, disableStreaming } from '../core/index.js';
import { subscribeWorld, ClientConnection } from '../core/subscription.js';
import { LLMProvider } from '../core/types.js';
const logger = createCategoryLogger('api');

const DEFAULT_WORLD_NAME = 'Default World';
const AGENT_WORLD_DATA_PATH = process.env.AGENT_WORLD_DATA_PATH ||'./data/worlds';
const ROOT_PATH = path.join(process.cwd(), AGENT_WORLD_DATA_PATH);

// console.log('🌐 API initialized with root path:', ROOT_PATH);

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
  description: z.string().optional()
});

const WorldUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional()
});

const AgentCreateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().optional().default('default'),
  provider: z.enum(['openai', 'anthropic', 'azure', 'google', 'xai', 'openai-compatible', 'ollama']).default('openai'),
  model: z.string().default('gpt-4'),
  systemPrompt: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).optional()
});

const ChatMessageSchema = z.object({
  message: z.string().min(1),
  sender: z.string().default("HUMAN"),
  stream: z.boolean().optional().default(true)
});

const AgentUpdateSchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  config: z.object({}).optional(),
  systemPrompt: z.string().optional(),
  clearMemory: z.boolean().optional()
});

const MemoryAppendSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1),
    sender: z.string().optional()
  })).min(1)
});

const router = express.Router();

// GET /worlds/:worldName - Get specific world with agents
router.get('/worlds/:worldName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;
    const world = await getWorld(ROOT_PATH, worldName);
    if (!world) return;

    // Convert Map to array for JSON serialization
    const agents = Array.from(world.agents.values());

    res.json({
      name: world.name,
      description: world.description,
      id: world.id,
      agents: agents,
      turnLimit: world.turnLimit,
    });
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

    const { name, description } = validation.data;

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

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      // Update world properties directly
      if (updates.name) world.name = updates.name;
      if (updates.description !== undefined) world.description = updates.description;

      // Save the world
      await world.save();
      res.json({ name: world.name, description: world.description });
    } else {
      res.json({ name: world.name, description: world.description });
    }
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

// GET /worlds/:worldName/agents - List agents in world
router.get('/worlds/:worldName/agents', async (req: Request, res: Response): Promise<void> => {
  try {
    const worldName = req.params.worldName;
    const world = await getWorldOrError(res, worldName);
    if (!world) return;

    const agents = await world.listAgents();
    res.json(agents);
  } catch (error) {
    logger.error('Error listing agents', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to list agents', 'AGENT_LIST_ERROR');
  }
});

// GET /worlds/:worldName/agents/:agentName - Get agent details
router.get('/worlds/:worldName/agents/:agentName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, agentName } = req.params;
    const world = await getWorldOrError(res, worldName);
    if (!world) return;

    const agent = await world.getAgent(agentName);
    if (!agent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    res.json(agent);
  } catch (error) {
    logger.error('Error getting agent', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, agentName: req.params.agentName });
    sendError(res, 500, 'Failed to get agent details', 'AGENT_GET_ERROR');
  }
});

// POST /worlds/:worldName/agents - Create agent
router.post('/worlds/:worldName/agents', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;
    console.log('🔧 Creating agent in world:', worldName, 'with body:', req.body);
    const validation = AgentCreateSchema.safeParse(req.body);

    if (!validation.success) {
      console.log('❌ Validation failed:', validation.error.issues);
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const { name, type, provider, model, systemPrompt, apiKey, baseUrl, temperature, maxTokens } = validation.data;
    const agentId = toKebabCase(name);

    const world = await getWorldOrError(res, worldName);
    if (!world) return;

    // Check if agent name is unique
    const isUnique = await isAgentNameUnique(world, agentId);
    if (!isUnique) {
      sendError(res, 409, 'Agent with this name already exists', 'AGENT_EXISTS');
      return;
    }

    // Create the agent
    const agentData = {
      name,
      type,
      provider: provider as LLMProvider,
      model,
      systemPrompt,
      apiKey,
      baseUrl,
      temperature,
      maxTokens
    };

    const agent = await world.createAgent(agentData);
    console.log('✅ Agent created successfully:', agent.name);
    res.status(201).json({ name: agent.name, id: agentId, type: agent.type });
  } catch (error) {
    console.log('❌ Error creating agent:', error);
    logger.error('Error creating agent', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    sendError(res, 500, 'Failed to create agent', 'AGENT_CREATE_ERROR');
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

    const { status, config, systemPrompt, clearMemory } = validation.data;
    const world = await getWorldOrError(res, worldName);
    if (!world) return;

    const existingAgent = await world.getAgent(agentName);
    if (!existingAgent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    // Clear memory if requested
    if (clearMemory && !(await world.clearAgentMemory(agentName))) {
      sendError(res, 500, 'Failed to clear agent memory', 'MEMORY_CLEAR_ERROR');
      return;
    }

    // Prepare and apply updates
    const updates: any = {};
    if (status !== undefined) updates.status = status;
    if (config !== undefined) {
      // Spread config properties directly since Agent interface is flattened
      Object.assign(updates, config);
    }
    if (systemPrompt !== undefined) {
      updates.systemPrompt = systemPrompt;
    }

    let updatedAgent = existingAgent;
    if (Object.keys(updates).length > 0) {
      const updateResult = await world.updateAgent(agentName, updates);
      if (!updateResult) {
        sendError(res, 500, 'Failed to update agent', 'AGENT_UPDATE_ERROR');
        return;
      }
      updatedAgent = updateResult;
    }

    res.json(updatedAgent);
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

// GET /worlds/:worldName/agents/:agentName/memory - Get agent memory
router.get('/worlds/:worldName/agents/:agentName/memory', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, agentName } = req.params;

    const world = await getWorldOrError(res, worldName);
    if (!world) return;

    const agent = await world.getAgent(agentName);
    if (!agent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    // Ensure memory is in array format
    const memory = validateMemoryFormat(agent.memory) ? agent.memory : [];
    res.json({ memory });
  } catch (error) {
    logger.error('Error getting agent memory', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, agentName: req.params.agentName });
    sendError(res, 500, 'Failed to get agent memory', 'MEMORY_GET_ERROR');
  }
});

// POST /worlds/:worldName/agents/:agentName/memory - Append to agent memory
router.post('/worlds/:worldName/agents/:agentName/memory', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, agentName } = req.params;
    const validation = MemoryAppendSchema.safeParse(req.body);

    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const { messages } = validation.data;

    const world = await getWorldOrError(res, worldName);
    if (!world) return;

    const agent = await world.getAgent(agentName);
    if (!agent) {
      sendError(res, 404, 'Agent not found', 'AGENT_NOT_FOUND');
      return;
    }

    // Ensure existing memory is in array format
    let currentMemory = validateMemoryFormat(agent.memory) ? agent.memory : [];

    // Convert non-array memory to array format if needed
    if (!Array.isArray(currentMemory)) {
      currentMemory = [];
    }

    // Convert messages to AgentMessage format with timestamps
    const newMessages = messages.map(msg => ({
      ...msg,
      createdAt: new Date()
    }));

    // Append new messages
    const newMemory = [...currentMemory, ...newMessages];

    // Update agent memory
    const updatedAgent = await world.updateAgentMemory(agentName, newMemory);
    if (!updatedAgent) {
      sendError(res, 500, 'Failed to append to agent memory', 'MEMORY_APPEND_ERROR');
      return;
    }

    res.json({ memory: newMemory, appended: messages.length });
  } catch (error) {
    logger.error('Error appending to agent memory', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName, agentName: req.params.agentName });
    sendError(res, 500, 'Failed to append to agent memory', 'MEMORY_APPEND_ERROR');
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

      // Send error event (for SSE clients)
      sendSSE(JSON.stringify({
        type: 'sse',
        data: {
          type: 'error',
          error: eventData.error || eventData.message,
          sender: streaming.sender,
          messageId: streaming.messageId
        }
      }));

      // ALSO send as a chat message so frontend displays it
      sendSSE(JSON.stringify({
        type: 'message',
        data: {
          content: `[Error] ${eventData.error || eventData.message}`,
          sender: streaming.sender || 'system',
          timestamp: new Date().toISOString(),
          error: true,
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

export default router;
