/**
 * Web Server for Agent World
 * 
 * Features:
 * - Express.js server with REST API endpoints
 * - Static file serving from public directory
 * - Server-Sent Events (SSE) for real-time chat
 * - Zod validation for all endpoints
 * - Integration with existing world and agent management
 * - CORS support for cross-origin requests
 * 
 * Endpoints:
 * - GET /worlds - List all worlds
 * - GET /worlds/:worldName/agents - List agents in world
 * - GET /worlds/:worldName/agents/:agentName - Get agent details
 * - POST /worlds/:worldName/agents - Create agent (placeholder)
 * - PATCH /worlds/:worldName/agents/:agentName - Update agent
 * - POST /worlds/:worldName/chat - Chat with SSE streaming
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// Import existing world and agent management functions
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

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Server configuration
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || 'localhost';

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// GET /worlds - List all available worlds
app.get('/worlds', async (req, res) => {
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
app.get('/worlds/:worldName/agents', async (req, res) => {
  try {
    const { worldName } = req.params;

    const availableWorlds = await listWorldsFromDisk();
    if (!availableWorlds.includes(worldName)) {
      return res.status(404).json({
        error: 'World not found',
        code: 'WORLD_NOT_FOUND'
      });
    }

    // Check if world is loaded in memory, if not load it
    if (!listWorlds().includes(worldName)) {
      try {
        await loadWorld(worldName);
      } catch (error) {
        console.error(`Failed to load world ${worldName}:`, error);
        return res.status(500).json({
          error: 'Failed to load world',
          code: 'WORLD_LOAD_ERROR'
        });
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
app.get('/worlds/:worldName/agents/:agentName', async (req, res) => {
  try {
    const { worldName, agentName } = req.params;

    const availableWorlds = await listWorldsFromDisk();
    if (!availableWorlds.includes(worldName)) {
      return res.status(404).json({
        error: 'World not found',
        code: 'WORLD_NOT_FOUND'
      });
    }

    // Check if world is loaded in memory, if not load it
    if (!listWorlds().includes(worldName)) {
      try {
        await loadWorld(worldName);
      } catch (error) {
        console.error(`Failed to load world ${worldName}:`, error);
        return res.status(500).json({
          error: 'Failed to load world',
          code: 'WORLD_LOAD_ERROR'
        });
      }
    }

    const agent = getAgent(worldName, agentName);
    if (!agent) {
      return res.status(404).json({
        error: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
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
app.post('/worlds/:worldName/agents', (req, res) => {
  res.status(501).json({
    error: 'Coming soon',
    code: 'NOT_IMPLEMENTED'
  });
});

// PATCH /worlds/:worldName/agents/:agentName - Update agent
app.patch('/worlds/:worldName/agents/:agentName', async (req, res) => {
  try {
    const { worldName, agentName } = req.params;

    // Validate request body
    const validation = AgentUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: validation.error.issues
      });
    }

    const { status, config, systemPrompt, clearMemory } = validation.data;

    const availableWorlds = await listWorldsFromDisk();
    if (!availableWorlds.includes(worldName)) {
      return res.status(404).json({
        error: 'World not found',
        code: 'WORLD_NOT_FOUND'
      });
    }

    // Check if world is loaded in memory, if not load it
    if (!listWorlds().includes(worldName)) {
      try {
        await loadWorld(worldName);
      } catch (error) {
        console.error(`Failed to load world ${worldName}:`, error);
        return res.status(500).json({
          error: 'Failed to load world',
          code: 'WORLD_LOAD_ERROR'
        });
      }
    }

    const existingAgent = getAgent(worldName, agentName);
    if (!existingAgent) {
      return res.status(404).json({
        error: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Handle memory clearing
    if (clearMemory) {
      const cleared = await clearAgentMemory(worldName, agentName);
      if (!cleared) {
        return res.status(500).json({
          error: 'Failed to clear agent memory',
          code: 'MEMORY_CLEAR_ERROR'
        });
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
        return res.status(500).json({
          error: 'Failed to update agent',
          code: 'AGENT_UPDATE_ERROR'
        });
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
app.post('/worlds/:worldName/chat', async (req, res) => {
  try {
    const { worldName } = req.params;

    // Validate request body
    const validation = ChatMessageSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        code: 'VALIDATION_ERROR',
        details: validation.error.issues
      });
    }

    const { message, sender } = validation.data;

    const availableWorlds = await listWorldsFromDisk();
    if (!availableWorlds.includes(worldName)) {
      return res.status(404).json({
        error: 'World not found',
        code: 'WORLD_NOT_FOUND'
      });
    }

    // Check if world is loaded in memory, if not load it
    if (!listWorlds().includes(worldName)) {
      try {
        await loadWorld(worldName);
      } catch (error) {
        console.error(`Failed to load world ${worldName}:`, error);
        return res.status(500).json({
          error: 'Failed to load world',
          code: 'WORLD_LOAD_ERROR'
        });
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
        const sseData = JSON.stringify({
          type: event.type || 'event',
          payload: event
        });
        res.write(`data: ${sseData}\n\n`);
      } catch (error) {
        console.error('Error sending SSE event:', error);
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

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND'
  });
});

// Export server creation function for CLI integration
export function createServer() {
  return app;
}

// Start server function for CLI integration
export function startWebServer(port = PORT, host = HOST) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      console.log(`🌐 Web server running at http://${host}:${port}`);
      console.log(`📁 Serving static files from: ${path.join(__dirname, 'public')}`);
      console.log(`🔗 API endpoints available:`);
      console.log(`   GET  /worlds`);
      console.log(`   GET  /worlds/:worldName/agents`);
      console.log(`   GET  /worlds/:worldName/agents/:agentName`);
      console.log(`   POST /worlds/:worldName/agents (coming soon)`);
      console.log(`   PATCH /worlds/:worldName/agents/:agentName`);
      console.log(`   POST /worlds/:worldName/chat (SSE streaming)`);
      resolve(server);
    });

    server.on('error', (error) => {
      console.error('Server startup error:', error);
      reject(error);
    });
  });
}

// For direct server execution
if (import.meta.url === `file://${process.argv[1]}`) {
  startWebServer()
    .then(() => {
      console.log('Server started successfully');
    })
    .catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}
