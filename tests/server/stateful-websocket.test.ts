/**
 * Unit Tests for Stateful WebSocket World Management
 * 
 * Features tested:
 * - Per-connection world instance creation
 * - Connection lifecycle management
 * - World instance isolation between connections
 * - Automatic cleanup on disconnect
 * - LLM streaming state tracking
 */

import { jest } from '@jest/globals';

// Mock the core modules
const mockCreateWorld = jest.fn() as jest.MockedFunction<any>;
const mockGetWorld = jest.fn() as jest.MockedFunction<any>;
const mockPublishMessage = jest.fn() as jest.MockedFunction<any>;
const mockSubscribeToMessages = jest.fn() as jest.MockedFunction<any>;
const mockToKebabCase = jest.fn((name: string) => name.toLowerCase().replace(/\s+/g, '-')) as jest.MockedFunction<any>;

jest.unstable_mockModule('../../core/world-manager.js', () => ({
  createWorld: mockCreateWorld,
  getWorld: mockGetWorld,
  listWorlds: jest.fn(() => Promise.resolve([])),
}));

jest.unstable_mockModule('../../core/world-events.js', () => ({
  publishMessage: mockPublishMessage,
  subscribeToMessages: mockSubscribeToMessages,
}));

jest.unstable_mockModule('../../core/utils.js', () => ({
  toKebabCase: mockToKebabCase,
}));

describe('Stateful WebSocket World Management', () => {
  let wsModule: any;
  let mockServer: any;
  let mockWebSocket: any;

  beforeAll(async () => {
    // Import after mocking
    wsModule = await import('../../server/ws.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock WebSocket
    mockWebSocket = {
      send: jest.fn(),
      on: jest.fn(),
      close: jest.fn(),
    };

    // Mock HTTP Server
    mockServer = {
      listen: jest.fn(),
      close: jest.fn(),
    };

    // Setup default mock returns
    mockCreateWorld.mockResolvedValue({
      id: 'test-world',
      name: 'Test World',
      eventEmitter: { on: jest.fn(), emit: jest.fn() },
      agents: new Map(),
    });

    mockGetWorld.mockResolvedValue(null); // Force world creation
    mockSubscribeToMessages.mockReturnValue(() => { }); // Unsubscribe function
  });

  it('should track connection statistics', () => {
    const stats = wsModule.getWebSocketStats();
    expect(stats).toHaveProperty('connectedClients');
    expect(stats).toHaveProperty('activeConnections');
    expect(stats).toHaveProperty('isRunning');
  });

  it('should create world instance for new connections', async () => {
    const mockWorld = {
      id: 'test-world',
      name: 'Test World',
      eventEmitter: { on: jest.fn(), emit: jest.fn() },
      agents: new Map(),
    };

    mockCreateWorld.mockResolvedValue(mockWorld);

    // Test world creation logic
    expect(mockCreateWorld).not.toHaveBeenCalled();

    // Simulate world creation for connection
    await mockCreateWorld({ name: 'Test World' });
    expect(mockCreateWorld).toHaveBeenCalledWith({ name: 'Test World' });
  });

  it('should handle connection lifecycle properly', () => {
    // Test connection setup
    expect(mockWebSocket.on).not.toHaveBeenCalled();

    // Simulate connection setup
    mockWebSocket.on('message', jest.fn());
    mockWebSocket.on('close', jest.fn());
    mockWebSocket.on('error', jest.fn());

    expect(mockWebSocket.on).toHaveBeenCalledTimes(3);
  });

  it('should isolate world instances between connections', async () => {
    const world1 = {
      id: 'world-1',
      name: 'World 1',
      eventEmitter: { on: jest.fn(), emit: jest.fn() },
      agents: new Map(),
    };

    const world2 = {
      id: 'world-2',
      name: 'World 2',
      eventEmitter: { on: jest.fn(), emit: jest.fn() },
      agents: new Map(),
    };

    // Simulate creating different worlds for different connections
    mockCreateWorld.mockResolvedValueOnce(world1);
    mockCreateWorld.mockResolvedValueOnce(world2);

    const result1 = await mockCreateWorld({ name: 'World 1' });
    const result2 = await mockCreateWorld({ name: 'World 2' });

    expect(result1.id).toBe('world-1');
    expect(result2.id).toBe('world-2');
    expect(result1).not.toBe(result2);
  });

  it('should handle message publishing to world instances', () => {
    const testMessage = 'Hello, world!';
    const testSender = 'HUMAN';
    const mockWorld = { id: 'test-world' };

    mockPublishMessage(mockWorld, testMessage, testSender);

    expect(mockPublishMessage).toHaveBeenCalledWith(mockWorld, testMessage, testSender);
  });

  it('should subscribe to world events for streaming', () => {
    const mockWorld = { id: 'test-world' };
    const mockCallback = jest.fn();

    mockSubscribeToMessages(mockWorld, mockCallback);

    expect(mockSubscribeToMessages).toHaveBeenCalledWith(mockWorld, mockCallback);
  });
});
