/**
 * Unit Tests for WebSocket-Only Server
 * 
 * Features tested:
 * - Server startup and shutdown
 * - WebSocket server creation
 * - Health endpoint functionality
 * - Static file serving
 * - WebSocket-only architecture (no REST API)
 */

import { jest } from '@jest/globals';
import { Server } from 'http';

// Mock the WebSocket server
const mockCreateWebSocketServer = jest.fn();
const mockGetWebSocketStats = jest.fn(() => ({
  connectedClients: 0,
  isRunning: true
}));

// Mock the ws module
jest.unstable_mockModule('../../server/ws.js', () => ({
  createWebSocketServer: mockCreateWebSocketServer,
  getWebSocketStats: mockGetWebSocketStats
}));

describe('WebSocket-Only Server', () => {
  let startWebServer: any;
  let server: Server;

  beforeAll(async () => {
    // Import after mocking
    const serverModule = await import('../../server/index.js');
    startWebServer = serverModule.startWebServer;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    jest.clearAllMocks();
  });

  it('should start WebSocket-only server successfully', async () => {
    const port = 3001;
    const host = 'localhost';

    server = await startWebServer(port, host);

    expect(server).toBeDefined();
    expect(server.listening).toBe(true);
    expect(mockCreateWebSocketServer).toHaveBeenCalledWith(server);
  });

  it('should serve health endpoint', async () => {
    const port = 3002;
    server = await startWebServer(port, 'localhost');

    const response = await fetch(`http://localhost:${port}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.services.express).toBe('running');
    expect(data.services.websocket).toBe('running');
    expect(data.websocket).toEqual({
      connectedClients: 0,
      isRunning: true
    });
  });

  it('should return 404 for non-existent routes', async () => {
    const port = 3003;
    server = await startWebServer(port, 'localhost');

    const response = await fetch(`http://localhost:${port}/nonexistent`);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Endpoint not found');
    expect(data.code).toBe('NOT_FOUND');
  });

  it('should not have REST API endpoints', async () => {
    const port = 3004;
    server = await startWebServer(port, 'localhost');

    // Test that old REST endpoints are no longer available
    const worldsResponse = await fetch(`http://localhost:${port}/worlds`);
    expect(worldsResponse.status).toBe(404);

    const agentsResponse = await fetch(`http://localhost:${port}/worlds/test/agents`);
    expect(agentsResponse.status).toBe(404);

    const chatResponse = await fetch(`http://localhost:${port}/worlds/test/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'test' })
    });
    expect(chatResponse.status).toBe(404);
  });

  it('should handle server startup errors', async () => {
    const invalidPort = -1;

    await expect(startWebServer(invalidPort, 'localhost')).rejects.toThrow();
  });
});
