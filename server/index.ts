/**
 * Web Server for Agent World
 * 
 * Features:
 * - Express.js server with REST API endpoints and SSE c// Start server function for CLI integration
export function startWebServer(port = PORT, host = HOST): Promise<Server> {
  return new Promise((resolve, reject) => {
    serverLogger.debug('Starting web server', { port, host });
    
    const server = app.listen(port, host, () => {
      serverLogger.debug('Web server listening callback executed');
      console.log(`🌐 Web server running at http://${host}:${port}`);
      console.log(`📁 Serving static files from: ${path.join(__dirname, '../public')}`);
      console.log(`🚀 HTTP server running with REST API and SSE chat`);
      resolve(server);
    });

    server.on('error', (error) => {
      console.error('Server startup error:', error);
      reject(error);
    });
  });
}
 * - Static file serving from public directory
 * - CORS support for cross-origin requests
 * - Modular architecture with separate API module
 * - Proper data path configuration for core modules
 * - Centralized debug logging with category-based control
 * 
 * Configuration:
 * - Sets AGENT_WORLD_DATA_PATH environment variable for core modules
 * - Configures global log level from LOG_LEVEL environment variable
 * - Default log level is 'error' if not specified
 * 
 * Main Endpoints:
 * - GET /health - Server health check
 * - API routes handled by ./api.ts (includes SSE chat functionality)
 * 
 * Implementation:
 * - Uses category logger ('server') for structured debug logging
 * - Proper error handling with global middleware
 * - Clean separation between server setup and API logic
 */

// Set the data path for core modules (same as CLI)
if (!process.env.AGENT_WORLD_DATA_PATH) {
  process.env.AGENT_WORLD_DATA_PATH = './data/worlds';
}

// Configure centralized logger from environment variable
import { setLogLevel, createCategoryLogger } from '../core/index.js';
const logLevel = (process.env.LOG_LEVEL || 'error') as 'trace' | 'debug' | 'info' | 'warn' | 'error';
setLogLevel(logLevel);

// Create server logger for debugging
const serverLogger = createCategoryLogger('server');
serverLogger.debug('Server starting with log level', { logLevel });

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'http';
import apiRouter from './api';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server configuration
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || 'localhost';

// Create Express app with middleware
const app = express();
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Serve static files and API routes
app.use(express.static(path.join(__dirname, '../public')));
app.use('/', apiRouter);

// GET /health - Server health check
app.get('/health', (req, res) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        express: 'running'
      }
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
      console.log(`� HTTP server running with REST API and SSE chat`);

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
  serverLogger.debug('Direct server execution detected');
  startWebServer()
    .then(() => {
      serverLogger.debug('Server started successfully');
      console.log('Server started successfully');
    })
    .catch((error) => {
      serverLogger.error('Failed to start server', error);
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}
