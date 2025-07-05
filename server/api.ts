/**
 * API Routes for Agent World
 *
 * Features:
 * - REST API endpoints for world and agent management
 * - Server-Sent Events (SSE) for real-time chat streaming
 * - Zod validation for all endpoints
 * - Core module integration (world-manager, agent-manager, world-events)
 * - SSE chunk streaming support for grouped message blocks
 *
 * Endpoints:
 * - GET /worlds - List/create default world
 * - GET /worlds/:worldName/agents - List agents in world
 * - GET /worlds/:worldName/agents/:agentName - Get agent details
 * - POST /worlds/:worldName/agents - Create agent (placeholder)
 * - PATCH /worlds/:worldName/agents/:agentName - Update agent with memory clearing
 * - POST /worlds/:worldName/chat - Chat with SSE streaming
 *
 * Implementation:
 * - Uses World object methods for operations
 * - World name handling delegated to core functions
 * - Event handling via publishMessage/subscribeToMessages and subscribeToSSE
 * - Streams both message events and SSE chunk events to client
 *
 * Changes:
 * - Added subscribeToSSE for streaming chunk support
 * - Enhanced SSE streaming to handle chunked responses properly
 * - Fixed server-side SSE event forwarding to client
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';
import { createWorld, getWorld, getFullWorld, listWorlds, publishMessage, subscribeToMessages, subscribeToSSE } from '../core/index.js';
import { createCategoryLogger } from '../core/logger.js';
import { LLMProvider } from '../core/types.js';

const logger = createCategoryLogger('api');

const DEFAULT_WORLD_NAME = 'Default World';
const ROOT_PATH = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

// Error response helper
function sendError(res: Response, status: number, message: string, code?: string, details?: any) {
  const error: { error: string; code?: string; details?: any } = { error: message };
  if (code) error.code = code;
  if (details) error.details = details;
  res.status(status).json(error);
}

// Validation utilities
function toKebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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
    const world = await getFullWorld(ROOT_PATH, worldName);

    if (!world) {
      sendError(res, 404, 'World not found', 'WORLD_NOT_FOUND');
      return;
    }

    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // CLI Pipeline Timer Pattern - completion timer management
    let completionTimer: NodeJS.Timeout | null = null;

    const setupCompletionTimer = (delay: number) => {
      if (completionTimer) clearTimeout(completionTimer);
      completionTimer = setTimeout(() => {
        // Send completion event and end SSE connection
        try {
          res.write('data: ' + JSON.stringify({
            type: 'complete',
            payload: { reason: 'timeout', delay }
          }) + '\n\n');
          unsubscribeMessages();
          unsubscribeSSE();
          res.end();
        } catch (error) {
          logger.error('Error during completion timeout', { error: error instanceof Error ? error.message : error, worldName });
        }
      }, delay);
    };

    // Subscribe to world events for streaming
    const unsubscribeMessages = subscribeToMessages(world, (event) => {
      try {
        const eventData = { type: 'message', payload: event };
        res.write(`data: ${JSON.stringify(eventData)}\n\n`);

        // Reset completion timer for message events (3000ms delay)
        setupCompletionTimer(3000);
      } catch (error) {
        logger.error('Error sending message event', { error: error instanceof Error ? error.message : error, worldName });
      }
    });

    // Subscribe to SSE events for streaming chunks
    const unsubscribeSSE = subscribeToSSE(world, (event) => {
      try {
        const eventData = { type: 'sse', payload: event };
        res.write(`data: ${JSON.stringify(eventData)}\n\n`);

        // Reset timer based on SSE event type (CLI pattern)
        if (event.type === 'chunk') {
          setupCompletionTimer(500);   // Short delay - more chunks expected
        } else if (event.type === 'end' || event.type === 'error') {
          setupCompletionTimer(2000);  // Longer delay - conversation segment done
        } else {
          setupCompletionTimer(1000);  // Default delay for other events
        }
      } catch (error) {
        logger.error('Error sending SSE event', { error: error instanceof Error ? error.message : error, worldName });
      }
    });

    // Send connection confirmation and message
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      payload: { worldName, timestamp: new Date().toISOString() }
    })}\n\n`);

    publishMessage(world, message, sender);

    // Start initial completion timer (message sent - wait for responses)
    setupCompletionTimer(3000);

    // Handle client disconnection
    req.on('close', () => {
      if (completionTimer) clearTimeout(completionTimer);
      unsubscribeMessages();
      unsubscribeSSE();
      logger.info('SSE connection closed', { worldName });
    });

    req.on('error', (error) => {
      if (completionTimer) clearTimeout(completionTimer);
      logger.error('SSE connection error', { error: error instanceof Error ? error.message : error, worldName });
      unsubscribeMessages();
      unsubscribeSSE();
    });

  } catch (error) {
    logger.error('Error in chat endpoint', { error: error instanceof Error ? error.message : error });
    if (!res.headersSent) {
      sendError(res, 500, 'Failed to process chat message', 'CHAT_ERROR');
    }
  }
});

export default router;
