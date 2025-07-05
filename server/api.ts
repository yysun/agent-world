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
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';
import { createWorld, listWorlds, createCategoryLogger, getFullWorld, publishMessage } from '../core/index.js';
import { subscribeWorld, ClientConnection } from '../core/subscription.js';
import { LLMProvider } from '../core/types.js';

const logger = createCategoryLogger('api');

const DEFAULT_WORLD_NAME = 'Default World';
const ROOT_PATH = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

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
  sender: z.string().default("HUMAN")
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
    const existingWorld = await getFullWorld(ROOT_PATH, worldId);
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

    const world = await getFullWorld(ROOT_PATH, worldName);
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    const { name, description } = validation.data;

    // If name is being changed, check for duplicates
    if (name && name !== world.name) {
      const newWorldId = toKebabCase(name);
      const existingWorld = await getFullWorld(ROOT_PATH, newWorldId);
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

    const world = await getFullWorld(ROOT_PATH, worldName);
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

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
    const world = await getFullWorld(ROOT_PATH, worldName);

    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

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
    const world = await getFullWorld(ROOT_PATH, worldName);

    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

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
    const validation = AgentCreateSchema.safeParse(req.body);

    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const { name, type, provider, model, systemPrompt, apiKey, baseUrl, temperature, maxTokens } = validation.data;
    const agentId = toKebabCase(name);

    const world = await getFullWorld(ROOT_PATH, worldName);
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

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
    res.status(201).json({ name: agent.name, id: agentId, type: agent.type });
  } catch (error) {
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
    const world = await getFullWorld(ROOT_PATH, worldName);

    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

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

    const world = await getFullWorld(ROOT_PATH, worldName);
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

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

    const world = await getFullWorld(ROOT_PATH, worldName);
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

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

    const world = await getFullWorld(ROOT_PATH, worldName);
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

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

    const world = await getFullWorld(ROOT_PATH, worldName);
    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

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

// POST /worlds/:worldName/chat - Send message with SSE streaming
router.post('/worlds/:worldName/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;
    const validation = ChatMessageSchema.safeParse(req.body);

    if (!validation.success) {
      sendError(res, 400, 'Invalid request body', 'VALIDATION_ERROR', validation.error.issues);
      return;
    }

    const { message, sender } = validation.data;

    // Check if world exists before setting up SSE stream
    const world = await getFullWorld(ROOT_PATH, worldName);
    if (!world) {
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

    const setupTimer = (callback: () => void, delay: number = 2000): void => {
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
      setupTimer(() => {
        if (streaming.isActive) {
          logger.debug('Streaming appears stalled - timing out...');
          resetStreamingState();
          handleStreamingComplete();
        } else {
          handleStreamingComplete();
        }
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
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        message: 'Operation completed'
      })}\n\n`);
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
          res.write(`data: ${JSON.stringify({
            type: 'sse',
            data: {
              type: 'start',
              sender: streaming.sender,
              messageId: streaming.messageId
            }
          })}\n\n`);

          if (streaming.stopWait) {
            streaming.stopWait();
          }
        }

        if (streaming.messageId === eventData.messageId) {
          streaming.content += eventData.content;

          // Send chunk event
          res.write(`data: ${JSON.stringify({
            type: 'sse',
            data: {
              type: 'chunk',
              content: eventData.content,
              sender: streaming.sender,
              messageId: streaming.messageId
            }
          })}\n\n`);

          // Reset stall timer with each chunk
          if (streaming.wait) {
            streaming.wait(500);
          }
        }
        return true;
      }

      // Handle end events
      if (eventData.type === 'end' &&
        streaming.isActive &&
        streaming.messageId === eventData.messageId) {

        // Send end event
        res.write(`data: ${JSON.stringify({
          type: 'sse',
          data: {
            type: 'end',
            sender: streaming.sender,
            messageId: streaming.messageId,
            content: streaming.content
          }
        })}\n\n`);

        resetStreamingState();

        // Set completion timer
        if (streaming.wait) {
          streaming.wait(2000);
        }
        return true;
      }

      // Handle error events
      if (eventData.type === 'error' &&
        streaming.isActive &&
        streaming.messageId === eventData.messageId) {

        // Send error event
        res.write(`data: ${JSON.stringify({
          type: 'sse',
          data: {
            type: 'error',
            error: eventData.error || eventData.message,
            sender: streaming.sender,
            messageId: streaming.messageId
          }
        })}\n\n`);

        resetStreamingState();

        // Set completion timer
        if (streaming.wait) {
          streaming.wait(2000);
        }
        return true;
      }

      return false;
    };

    // Create client connection
    const client: ClientConnection = {
      send: (data: string) => {
        // Send data via SSE
        res.write(`data: ${data}\n\n`);
      },
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
          res.write(`data: ${JSON.stringify({
            type: eventType,
            data: {
              message: eventData.message,
              sender: 'system'
            }
          })}\n\n`);
        }

        // Handle regular messages
        if (eventType === 'message' && eventData.content) {
          res.write(`data: ${JSON.stringify({
            type: 'message',
            data: {
              content: eventData.content,
              sender: eventData.sender || 'agent',
              timestamp: eventData.timestamp
            }
          })}\n\n`);

          // Setup completion timer for non-streaming messages
          if (streaming.wait) {
            streaming.wait(3000);
          }
        }
      },
      onError: (error: string) => {
        logger.error(`World error: ${error}`);
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: error
        })}\n\n`);
        res.end();
      }
    };

    // Subscribe to world
    const subscription = await subscribeWorld(worldName, ROOT_PATH, client);
    // World existence already checked above, so subscription should not be null
    if (!subscription) {
      logger.error('Unexpected: subscription is null after world existence check');
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: 'Failed to subscribe to world'
      })}\n\n`);
      res.end();
      return;
    }

    // Send initial connection event
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      payload: { worldName }
    })}\n\n`);

    // Send message to world
    try {
      publishMessage(subscription.world, message, sender);

      // Send success response
      res.write(`data: ${JSON.stringify({
        type: 'response',
        success: true,
        message: 'Message sent to world',
        data: { sender }
      })}\n\n`);

      // Set timeout for long operations
      setTimeout(() => {
        handleStreamingComplete();
      }, 8000); // 8 second timeout for long operations

    } catch (error) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: 'Failed to send message',
        data: { error: error instanceof Error ? error.message : String(error) }
      })}\n\n`);
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

  } catch (error) {
    logger.error('Error in chat endpoint', { error: error instanceof Error ? error.message : error, worldName: req.params.worldName });
    if (!res.headersSent) {
      sendError(res, 500, 'Failed to process chat request', 'CHAT_ERROR');
    }
  }
});

export default router;
