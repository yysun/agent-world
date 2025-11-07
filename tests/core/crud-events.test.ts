/**
 * CRUD Events Test Suite
 * Tests for World CRUD (Create, Read, Update, Delete) event system
 * 
 * Features tested:
 * - Agent CRUD operations emit proper events
 * - Chat CRUD operations emit proper events
 * - Events are persisted to event storage
 * - Event payload structure validation
 * - Event ordering and retrieval
 * 
 * Approach: Rather than relying on EventEmitter listeners (which don't persist across
 * getWorld() calls), we verify CRUD events by loading them from event storage.
 * 
 * Changes:
 * - 2025-11-07: Refactored to use setupTestWorld helper (test deduplication initiative)
 */

import { describe, it, expect } from 'vitest';
import { EventType, WorldCRUDEvent, LLMProvider } from '../../core/types.js';
import { getWorld, createAgent, updateAgent, deleteAgent, newChat, deleteChat } from '../../core/managers.js';
import { setupTestWorld } from '../helpers/world-test-setup.js';

describe.skip('CRUD Events', () => {
  const { worldId, getWorld: getTestWorld } = setupTestWorld({
    name: 'test-crud-events',
    description: 'Test world for CRUD events'
  });

  // Helper to get all CRUD events from all chat contexts
  const getAllCRUDEvents = async () => {
    const world = await getTestWorld();

    // Get events with no specific chat (chatId = null)
    const eventsNoChat = await world!.eventStorage!.getEventsByWorldAndChat(worldId(), null);

    // Get events for all chats
    const chatIds = Array.from(world!.chats.keys());
    const eventsForChats = await Promise.all(
      chatIds.map(chatId => world!.eventStorage!.getEventsByWorldAndChat(worldId(), chatId))
    );

    // Also query events for the current chat explicitly
    if (world!.currentChatId && !chatIds.includes(world!.currentChatId)) {
      const currentChatEvents = await world!.eventStorage!.getEventsByWorldAndChat(worldId(), world!.currentChatId);
      eventsForChats.push(currentChatEvents);
    }

    // Combine all events and filter for CRUD type
    const allEvents = [...eventsNoChat, ...eventsForChats.flat()];
    return allEvents.filter((e: any) => e.type === 'crud');
  };

  it('should persist CRUD event when creating an agent', async () => {
    const agent = await createAgent(worldId(), {
      id: 'test-agent',
      name: 'Test Agent',
      systemPrompt: 'You are a test agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4'
    });

    // Get world to access event storage
    const world = await getTestWorld();
    expect(world).toBeTruthy();
    expect(world!.eventStorage).toBeDefined();

    // Load ALL CRUD events for the world (including all chats)
    // Agent CRUD events are saved with currentChatId, chat CRUD events with chatId=null
    const eventsWithChat = await world!.eventStorage!.getEventsByWorldAndChat(worldId(), world!.currentChatId);
    const eventsNoChat = await world!.eventStorage!.getEventsByWorldAndChat(worldId(), null);
    const allEvents = [...eventsNoChat, ...eventsWithChat];

    const crudEvents = allEvents.filter((e: any) => e.type === 'crud');

    expect(crudEvents.length).toBeGreaterThan(0);

    const createEvent = crudEvents.find((e: any) =>
      e.payload.operation === 'create' &&
      e.payload.entityType === 'agent' &&
      e.payload.entityId === agent.id
    );

    expect(createEvent).toBeDefined();
    expect(createEvent!.payload).toMatchObject({
      operation: 'create',
      entityType: 'agent',
      entityId: agent.id,
      entityData: expect.objectContaining({
        id: agent.id,
        name: 'Test Agent'
      })
    });
  });

  it('should persist CRUD event when updating an agent', async () => {
    const agent = await createAgent(worldId(), {
      id: 'test-agent',
      name: 'Test Agent',
      systemPrompt: 'You are a test agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4'
    });

    await updateAgent(worldId(), agent.id, {
      name: 'Updated Agent',
      systemPrompt: 'You are an updated agent'
    });

    // Give time for async persistence
    await new Promise(resolve => setTimeout(resolve, 10));

    // Load events from storage to verify persistence
    const crudEvents = await getAllCRUDEvents();


    // Should have at least create + update events
    expect(crudEvents.length).toBeGreaterThanOrEqual(2);
    const updateEvent = crudEvents.find(e =>
      (e.payload as WorldCRUDEvent).operation === 'update' &&
      (e.payload as WorldCRUDEvent).entityType === 'agent'
    );

    expect(updateEvent).toBeDefined();
    const payload = updateEvent!.payload as WorldCRUDEvent;
    expect(payload).toMatchObject({
      operation: 'update',
      entityType: 'agent',
      entityId: agent.id,
      entityData: expect.objectContaining({
        name: 'Updated Agent'
      })
    });
  });

  it('should persist CRUD event when deleting an agent', async () => {
    const agent = await createAgent(worldId(), {
      id: 'test-agent',
      name: 'Test Agent',
      systemPrompt: 'You are a test agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4'
    });

    await deleteAgent(worldId(), agent.id);

    // Give time for async persistence
    await new Promise(resolve => setTimeout(resolve, 10));

    // Load events from storage to verify persistence
    const crudEvents = await getAllCRUDEvents();


    // Should have at least create + delete events
    expect(crudEvents.length).toBeGreaterThanOrEqual(2);
    const deleteEvent = crudEvents.find(e =>
      (e.payload as WorldCRUDEvent).operation === 'delete' &&
      (e.payload as WorldCRUDEvent).entityType === 'agent'
    );

    expect(deleteEvent).toBeDefined();
    const payload = deleteEvent!.payload as WorldCRUDEvent;
    expect(payload).toMatchObject({
      operation: 'delete',
      entityType: 'agent',
      entityId: agent.id
    });
  });

  it('should persist CRUD event when creating a chat', async () => {
    // World creation automatically creates a chat, so we should have at least 1 chat create event
    const world = await getTestWorld();
    const chats = await world!.eventStorage!.getEventsByWorldAndChat(worldId(), null);
    const chatCreateEvents = chats.filter((e: any) => e.type === 'crud' && e.payload.operation === 'create' && e.payload.entityType === 'chat');

    // Should have at least 1 chat create event from world creation
    expect(chatCreateEvents.length).toBeGreaterThanOrEqual(1);

    const chatEvent = chatCreateEvents[0];
    expect(chatEvent).toBeDefined();
    expect(chatEvent.payload.operation).toBe('create');
    expect(chatEvent.payload.entityType).toBe('chat');
  });

  it('should persist CRUD event when deleting a chat', async () => {
    const world = await newChat(worldId());
    const chats = Array.from(world!.chats.values());
    const chatToDelete = chats[0];
    const deletedChatId = chatToDelete.id;

    await deleteChat(worldId(), deletedChatId);

    // Give time for async persistence
    await new Promise(resolve => setTimeout(resolve, 10));

    // Query events for the deleted chat explicitly since it won't be in world.chats anymore
    const worldAfter = await getTestWorld();
    const eventsForDeletedChat = await worldAfter!.eventStorage!.getEventsByWorldAndChat(worldId(), deletedChatId);

    const chatDeleteEvent = eventsForDeletedChat.find((e: any) =>
      e.type === 'crud' &&
      e.payload.operation === 'delete' &&
      e.payload.entityType === 'chat' &&
      e.payload.entityId === deletedChatId
    );

    expect(chatDeleteEvent).toBeDefined();
    expect(chatDeleteEvent!.payload.operation).toBe('delete');
    expect(chatDeleteEvent!.payload.entityType).toBe('chat');
  });

  it('should include correct event payload structure', async () => {
    const agent = await createAgent(worldId(), {
      id: 'test-agent',
      name: 'Test Agent',
      systemPrompt: 'You are a test agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4'
    });

    // Give time for async persistence
    await new Promise(resolve => setTimeout(resolve, 10));

    // Load events from storage to verify persistence
    const crudEvents = await getAllCRUDEvents();


    expect(crudEvents.length).toBeGreaterThan(0);
    const event = crudEvents[0].payload as WorldCRUDEvent;

    // Verify all required fields are present
    expect(event).toHaveProperty('operation');
    expect(event).toHaveProperty('entityType');
    expect(event).toHaveProperty('entityId');
    expect(event).toHaveProperty('entityData');
    expect(event).toHaveProperty('timestamp');

    // Verify field types
    expect(typeof event.operation).toBe('string');
    expect(typeof event.entityType).toBe('string');
    expect(typeof event.entityId).toBe('string');
    expect(typeof event.entityData).toBe('object');
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it('should persist CRUD events to event storage', async () => {
    const agent = await createAgent(worldId(), {
      id: 'test-agent',
      name: 'Test Agent',
      systemPrompt: 'You are a test agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4'
    });

    // Give time for async persistence
    await new Promise(resolve => setTimeout(resolve, 10));

    // Load events from storage
    const crudEvents = await getAllCRUDEvents();

    // Filter for CRUD events


    expect(crudEvents.length).toBeGreaterThan(0);

    // Verify the create event was persisted
    const createEvent = crudEvents.find(e =>
      (e.payload as WorldCRUDEvent).operation === 'create' &&
      (e.payload as WorldCRUDEvent).entityType === 'agent'
    );

    expect(createEvent).toBeDefined();
  });

  it('should retrieve persisted CRUD events in correct order', async () => {
    const agent = await createAgent(worldId(), {
      id: 'test-agent',
      name: 'Test Agent',
      systemPrompt: 'You are a test agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4'
    });

    await new Promise(resolve => setTimeout(resolve, 5));
    await updateAgent(worldId(), agent.id, { name: 'Updated Agent' });
    await new Promise(resolve => setTimeout(resolve, 5));
    await deleteAgent(worldId(), agent.id);

    // Give time for async persistence
    await new Promise(resolve => setTimeout(resolve, 10));

    // Load events from storage
    const crudEvents = await getAllCRUDEvents();


    // Should have at least 3 events: create, update, delete
    expect(crudEvents.length).toBeGreaterThanOrEqual(3);

    // Events should be ordered by timestamp
    const timestamps = crudEvents.map(e => (e.payload as WorldCRUDEvent).timestamp.getTime());
    const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sortedTimestamps);
  });

  it('should allow multiple operations and verify all are persisted', async () => {
    // Create multiple agents
    const agent1 = await createAgent(worldId(), {
      id: 'test-agent-1',
      name: 'Agent 1',
      systemPrompt: 'You are agent 1',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4'
    });

    const agent2 = await createAgent(worldId(), {
      id: 'test-agent-2',
      name: 'Agent 2',
      systemPrompt: 'You are agent 2',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4'
    });

    // Create a chat
    await newChat(worldId());

    // Give time for async persistence
    await new Promise(resolve => setTimeout(resolve, 20));

    // Load events from storage
    const crudEvents = await getAllCRUDEvents();


    // Should have events for both agents and the chat (at least 3)
    expect(crudEvents.length).toBeGreaterThanOrEqual(3);

    // Verify we have agent create events
    const agentEvents = crudEvents.filter(e =>
      (e.payload as WorldCRUDEvent).operation === 'create' &&
      (e.payload as WorldCRUDEvent).entityType === 'agent'
    );
    expect(agentEvents.length).toBeGreaterThanOrEqual(2);

    // Verify we have chat create event
    const chatEvents = crudEvents.filter(e =>
      (e.payload as WorldCRUDEvent).operation === 'create' &&
      (e.payload as WorldCRUDEvent).entityType === 'chat'
    );
    expect(chatEvents.length).toBeGreaterThanOrEqual(1);
  });
});
