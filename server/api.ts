/**
 * API Routes for Agent World
 * 
 * Features:
 * - REST API endpoints for world and agent management
 * - Server-Sent Events (SSE) for real-time chat streaming
 * - Zod validation for all endpoints
 * - Core module integration (world-manager, agent-manager, world-events)
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
 * - Converts worldName to worldId using toKebabCase
 * - Event handling via publishMessage/subscribeToMessages
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';
import { createWorld, getWorld, listWorlds } from '../core/world-manager.js';
import { toKebabCase } from '../core/utils.js';
import { publishMessage, subscribeToMessages } from '../core/world-events.js';

const DEFAULT_WORLD_NAME = 'Default World';

// Validation schemas
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

const router = express.Router();

// GET /worlds - List worlds or create default
router.get('/worlds', async (req, res) => {
  try {
    const worlds = await listWorlds();
    if (!worlds?.length) {
      const world = await createWorld({ name: DEFAULT_WORLD_NAME });
      res.json([{ name: world.config.name }]);
    } else {
      res.json(worlds.map(world => ({ name: world.name })));
    }
  } catch (error) {
    console.error('Error listing worlds:', error);
    res.status(500).json({ error: 'Failed to list worlds', code: 'WORLD_LIST_ERROR' });
  }
});

// GET /worlds/:worldName/agents - List agents in world
router.get('/worlds/:worldName/agents', async (req: Request, res: Response): Promise<void> => {
  try {
    const worldId = toKebabCase(req.params.worldName);
    const world = await getWorld(worldId);

    if (!world) {
      res.status(404).json({ error: 'World not found', code: 'WORLD_NOT_FOUND' });
      return;
    }

    const agents = await world.listAgents();
    res.json(agents);
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({ error: 'Failed to list agents', code: 'AGENT_LIST_ERROR' });
  }
});

// GET /worlds/:worldName/agents/:agentName - Get agent details
router.get('/worlds/:worldName/agents/:agentName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, agentName } = req.params;
    const worldId = toKebabCase(worldName);
    const world = await getWorld(worldId);

    if (!world) {
      res.status(404).json({ error: 'World not found', code: 'WORLD_NOT_FOUND' });
      return;
    }

    const agent = await world.getAgent(agentName);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' });
      return;
    }

    res.json(agent);
  } catch (error) {
    console.error('Error getting agent:', error);
    res.status(500).json({ error: 'Failed to get agent details', code: 'AGENT_GET_ERROR' });
  }
});

// POST /worlds/:worldName/agents - Create agent (placeholder)
router.post('/worlds/:worldName/agents', (req, res) => {
  res.status(501).json({ error: 'Coming soon', code: 'NOT_IMPLEMENTED' });
});

// PATCH /worlds/:worldName/agents/:agentName - Update agent
router.patch('/worlds/:worldName/agents/:agentName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, agentName } = req.params;
    const validation = AgentUpdateSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: validation.error.issues
      });
      return;
    }

    const { status, config, systemPrompt, clearMemory } = validation.data;
    const worldId = toKebabCase(worldName);
    const world = await getWorld(worldId);

    if (!world) {
      res.status(404).json({ error: 'World not found', code: 'WORLD_NOT_FOUND' });
      return;
    }

    const existingAgent = await world.getAgent(agentName);
    if (!existingAgent) {
      res.status(404).json({ error: 'Agent not found', code: 'AGENT_NOT_FOUND' });
      return;
    }

    // Clear memory if requested
    if (clearMemory && !(await world.clearAgentMemory(agentName))) {
      res.status(500).json({ error: 'Failed to clear agent memory', code: 'MEMORY_CLEAR_ERROR' });
      return;
    }

    // Prepare and apply updates
    const updates: any = {};
    if (status !== undefined) updates.status = status;
    if (config !== undefined) updates.config = { ...existingAgent.config, ...config };
    if (systemPrompt !== undefined) {
      updates.config = { ...existingAgent.config, systemPrompt };
    }

    let updatedAgent = existingAgent;
    if (Object.keys(updates).length > 0) {
      const updateResult = await world.updateAgent(agentName, updates);
      if (!updateResult) {
        res.status(500).json({ error: 'Failed to update agent', code: 'AGENT_UPDATE_ERROR' });
        return;
      }
      updatedAgent = updateResult;
    }

    res.json(updatedAgent);
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ error: 'Failed to update agent', code: 'AGENT_UPDATE_ERROR' });
  }
});

// POST /worlds/:worldName/chat - Send message with SSE streaming
router.post('/worlds/:worldName/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;
    const validation = ChatMessageSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: validation.error.issues
      });
      return;
    }

    const { message, sender } = validation.data;
    const worldId = toKebabCase(worldName);
    const world = await getWorld(worldId);

    if (!world) {
      res.status(404).json({ error: 'World not found', code: 'WORLD_NOT_FOUND' });
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

    // Subscribe to world events for streaming
    const unsubscribe = subscribeToMessages(world, (event) => {
      try {
        const eventData = { type: 'message', payload: event };
        res.write(`data: ${JSON.stringify(eventData)}\n\n`);
      } catch (error) {
        console.error('Error sending event:', error);
      }
    });

    // Send connection confirmation and message
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      payload: { worldName, timestamp: new Date().toISOString() }
    })}\n\n`);

    publishMessage(world, message, sender);

    // Handle client disconnection
    req.on('close', () => {
      unsubscribe();
      console.log(`SSE connection closed for world: ${worldName}`);
    });

    req.on('error', (error) => {
      console.error('SSE connection error:', error);
      unsubscribe();
    });

  } catch (error) {
    console.error('Error in chat endpoint:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process chat message', code: 'CHAT_ERROR' });
    }
  }
});

export default router;
