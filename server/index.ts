/**
 * Web Server for Agent World
 * 
 * Features:
 * - Express.js server with REST API endpoints using core modules
 * - WebSocket server for real-time communication
 * - Static file serving from public directory
 * - CORS support for cross-origin requests
 * - Modular architecture with separate API and WebSocket modules
 * - Proper data path configuration for core modules
 * 
 * Main Endpoints:
 * - GET /health - Server health check
 * - API routes handled by ./api.ts
 * - WebSocket communication handled by ./ws.ts
 * 
 * Data Path Configuration:
 * - Sets AGENT_WORLD_DATA_PATH environment variable for core modules
 * - Ensures consistent data storage location with CLI
 */

// Set the data path for core modules (same as CLI)
if (!process.env.AGENT_WORLD_DATA_PATH) {
  process.env.AGENT_WORLD_DATA_PATH = './data/worlds';
}

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'http';

// Import modular components
import apiRouter from './api';
import { createWebSocketServer, getWebSocketStats } from './ws';


// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Use API routes
app.use('/', apiRouter);

// GET /health - Server health check
app.get('/health', (req, res) => {
  try {
    const wsStats = getWebSocketStats();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        express: 'running',
        websocket: 'running'
      },
      websocket: wsStats
    });
  } catch (error) {
    console.error('Error getting server health:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Failed to get server health'
    });
  }
});

// Global error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
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

// Start server function for CLI integration
export function startWebServer(port = PORT, host = HOST): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      console.log(`🌐 Web server running at http://${host}:${port}`);
      console.log(`📁 Serving static files from: ${path.join(__dirname, '../public')}`);
      console.log(`🔗 API endpoints available:`);
      console.log(`   GET  /health`);
      console.log(`   GET  /worlds`);
      console.log(`   GET  /worlds/:worldName/agents`);
      console.log(`   GET  /worlds/:worldName/agents/:agentName`);
      console.log(`   POST /worlds/:worldName/agents (coming soon)`);
      console.log(`   PATCH /worlds/:worldName/agents/:agentName`);
      console.log(`   POST /worlds/:worldName/chat (SSE streaming)`);

      // Create WebSocket server
      const wss = createWebSocketServer(server);
      console.log(`🔌 WebSocket server running at ws://${host}:${port}/ws`);
      console.log(`📡 WebSocket events: subscribe, unsubscribe, chat`);
      console.log(`🚀 Both HTTP and WebSocket servers running`);

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
