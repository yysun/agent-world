/**
 * API Routes for Agent World
 * 
 * Features:
 * - REST API endpoints for world and agent management
 * - Server-Sent Events (SSE) for real-time chat
 * - Zod validation for all endpoints
 * - Integration with existing world and agent management
 * 
 * Endpoints:
 * - GET /worlds - List all worlds
 * - GET /worlds/:worldName/agents - List agents in world
 * - GET /worlds/:worldName/agents/:agentName - Get agent details
 * - POST /worlds/:worldName/agents - Create agent (placeholder)
 * - PATCH /worlds/:worldName/agents/:agentName - Update agent
 * - POST /worlds/:worldName/chat - Chat with SSE streaming
 */

import express, { Request, Response } from 'express';
import { z } from 'zod';
import {
  listWorlds,
  getAgents,
  getAgent,
  updateAgent,
  clearAgentMemory,
  broadcastMessage,
  loadWorld,
  createWorld,
  DEFAULT_WORLD_NAME
} from '../src/world.js';
import { listWorldsFromDisk } from '../src/world-persistence.js';
import { subscribeToWorld } from '../src/event-bus.js';

// Zod validation schemas
const ChatMessageSchema = z.object({
  message: z.string().min(1),
  sender: z.string().optional().default("HUMAN")
});

const AgentUpdateSchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  config: z.object({}).optional(),
  systemPrompt: z.string().optional(),
  clearMemory: z.boolean().optional()
});

const router = express.Router();

// GET /worlds - List all available worlds
router.get('/worlds', async (req, res) => {
  try {
    const worlds = await listWorldsFromDisk();
    if (!worlds || worlds.length === 0) {
      // No worlds found - create default world
      const worldName = await createWorld({ name: DEFAULT_WORLD_NAME });
      res.json([{ name: worldName }]);
    } else {
      res.json(worlds.map(worldName => ({ name: worldName })));
    }
  } catch (error) {
    console.error('Error listing worlds:', error);
    res.status(500).json({
      error: 'Failed to list worlds',
      code: 'WORLD_LIST_ERROR'
    });
  }
});

// GET /worlds/:worldName/agents - List all agents in a specific world
router.get('/worlds/:worldName/agents', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;

    const availableWorlds = await listWorldsFromDisk();
    if (!availableWorlds.includes(worldName)) {
      res.status(404).json({
        error: 'World not found',
        code: 'WORLD_NOT_FOUND'
      });
      return;
    }

    // Check if world is loaded in memory, if not load it
    if (!listWorlds().includes(worldName)) {
      try {
        await loadWorld(worldName);
      } catch (error) {
        console.error(`Failed to load world ${worldName}:`, error);
        res.status(500).json({
          error: 'Failed to load world',
          code: 'WORLD_LOAD_ERROR'
        });
        return;
      }
    }

    const agents = getAgents(worldName);
    res.json(agents);
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({
      error: 'Failed to list agents',
      code: 'AGENT_LIST_ERROR'
    });
  }
});

// GET /worlds/:worldName/agents/:agentName - Get details of a specific agent
router.get('/worlds/:worldName/agents/:agentName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, agentName } = req.params;

    const availableWorlds = await listWorldsFromDisk();
    if (!availableWorlds.includes(worldName)) {
      res.status(404).json({
        error: 'World not found',
        code: 'WORLD_NOT_FOUND'
      });
      return;
    }

    // Check if world is loaded in memory, if not load it
    if (!listWorlds().includes(worldName)) {
      try {
        await loadWorld(worldName);
      } catch (error) {
        console.error(`Failed to load world ${worldName}:`, error);
        res.status(500).json({
          error: 'Failed to load world',
          code: 'WORLD_LOAD_ERROR'
        });
        return;
      }
    }

    const agent = getAgent(worldName, agentName);
    if (!agent) {
      res.status(404).json({
        error: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
      return;
    }

    res.json(agent);
  } catch (error) {
    console.error('Error getting agent:', error);
    res.status(500).json({
      error: 'Failed to get agent details',
      code: 'AGENT_GET_ERROR'
    });
  }
});

// POST /worlds/:worldName/agents - Create a new agent (placeholder)
router.post('/worlds/:worldName/agents', (req, res) => {
  res.status(501).json({
    error: 'Coming soon',
    code: 'NOT_IMPLEMENTED'
  });
});

// PATCH /worlds/:worldName/agents/:agentName - Update agent
router.patch('/worlds/:worldName/agents/:agentName', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName, agentName } = req.params;

    // Validate request body
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

    const availableWorlds = await listWorldsFromDisk();
    if (!availableWorlds.includes(worldName)) {
      res.status(404).json({
        error: 'World not found',
        code: 'WORLD_NOT_FOUND'
      });
      return;
    }

    // Check if world is loaded in memory, if not load it
    if (!listWorlds().includes(worldName)) {
      try {
        await loadWorld(worldName);
      } catch (error) {
        console.error(`Failed to load world ${worldName}:`, error);
        res.status(500).json({
          error: 'Failed to load world',
          code: 'WORLD_LOAD_ERROR'
        });
        return;
      }
    }

    const existingAgent = getAgent(worldName, agentName);
    if (!existingAgent) {
      res.status(404).json({
        error: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
      return;
    }

    // Handle memory clearing
    if (clearMemory) {
      const cleared = await clearAgentMemory(worldName, agentName);
      if (!cleared) {
        res.status(500).json({
          error: 'Failed to clear agent memory',
          code: 'MEMORY_CLEAR_ERROR'
        });
        return;
      }
    }

    // Prepare updates
    const updates: any = {};
    if (status !== undefined) updates.status = status;
    if (config !== undefined) updates.config = { ...existingAgent.config, ...config };
    if (systemPrompt !== undefined) {
      updates.config = { ...existingAgent.config, systemPrompt };
    }

    // Update agent if there are changes
    let updatedAgent = existingAgent;
    if (Object.keys(updates).length > 0) {
      const updateResult = await updateAgent(worldName, agentName, updates);
      if (!updateResult) {
        res.status(500).json({
          error: 'Failed to update agent',
          code: 'AGENT_UPDATE_ERROR'
        });
        return;
      }
      updatedAgent = updateResult;
    }

    res.json(updatedAgent);
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({
      error: 'Failed to update agent',
      code: 'AGENT_UPDATE_ERROR'
    });
  }
});

// POST /worlds/:worldName/chat - Send message and stream events
router.post('/worlds/:worldName/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { worldName } = req.params;

    // Validate request body
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

    const availableWorlds = await listWorldsFromDisk();
    if (!availableWorlds.includes(worldName)) {
      res.status(404).json({
        error: 'World not found',
        code: 'WORLD_NOT_FOUND'
      });
      return;
    }

    // Check if world is loaded in memory, if not load it
    if (!listWorlds().includes(worldName)) {
      try {
        await loadWorld(worldName);
      } catch (error) {
        console.error(`Failed to load world ${worldName}:`, error);
        res.status(500).json({
          error: 'Failed to load world',
          code: 'WORLD_LOAD_ERROR'
        });
        return;
      }
    }

    // Set up Server-Sent Events (SSE) response headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Subscribe to world events for SSE streaming
    const unsubscribe = subscribeToWorld((event) => {
      try {
        const eventData = {
          type: event.type || 'event',
          payload: event
        };

        // Send to SSE client
        const sseData = JSON.stringify(eventData);
        res.write(`data: ${sseData}\n\n`);

      } catch (error) {
        console.error('Error sending event:', error);
      }
    });

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      payload: { worldName, timestamp: new Date().toISOString() }
    })}\n\n`);

    // Send the message to the world
    await broadcastMessage(worldName, message, sender);

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
      res.status(500).json({
        error: 'Failed to process chat message',
        code: 'CHAT_ERROR'
      });
    }
  }
});

export default router;
