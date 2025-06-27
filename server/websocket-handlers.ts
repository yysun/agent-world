/**
 * WebSocket Message Handlers - Business Logic for WebSocket Messages
 *
 * Features:
 * - Handle all client WebSocket message types
 * - Integrate with user manager and world system
 * - Provide error handling and validation
 * - Support real-time event streaming
 * - Handle world selection and cloning
 *
 * Message Flow:
 * 1. Client sends message -> Handler validates and processes
 * 2. Handler interacts with user-manager and world system
 * 3. Handler sends response back to client
 * 4. Handler may broadcast events to other clients
 *
 * Handlers:
 * - handleWorldSelect: Select/clone world for user
 * - handleChatSend: Send chat message to world
 * - handleAgentUpdate: Update agent configuration
 * - handleWorldReload: Reload world state
 * - handleEventSubscribe: Subscribe to world events
 * - handlePing: Handle connection health checks
 *
 * Implementation:
 * - Uses existing world API through user-manager
 * - Validates all message payloads
 * - Provides comprehensive error handling
 * - Supports real-time event broadcasting
 * - Integrates with WebSocket connection manager
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ClientMessageType,
  ServerMessageType,
  WorldSelectPayload,
  ChatSendPayload,
  AgentUpdatePayload,
  WorldReloadPayload,
  EventSubscribePayload,
  WorldSelectedPayload,
  ChatResponsePayload,
  AgentUpdatedPayload,
  WorldReloadedPayload,
  EventStreamPayload,
  ErrorPayload,
  StatusPayload,
  WebSocketMessage,
  WebSocketError,
  WebSocketErrorCode
} from './websocket-types';
import {
  createUserSession,
  getUserSession,
  getUserSessionById,
  saveUserWorld,
  cloneWorldForUser
} from '../src/user-manager';
import {
  getConnection,
  updateConnectionWorld,
  sendToConnection,
  addSubscription,
  broadcastToWorld,
  incrementMessageCount,
  getWorldConnections
} from './websocket-manager';
import { subscribeToWorld } from '../src/event-bus';
import { loadUserWorld } from '../src/world-cloning';
import { getAvailableTemplates } from '../src/world-cloning';
import {
  broadcastMessage,
  getAgent,
  updateAgent,
  getAgents,
  listWorlds,
  loadWorld
} from '../src/world';

/**
 * Handle world selection message
 */
export async function handleWorldSelect(clientId: string, payload: WorldSelectPayload): Promise<void> {
  try {
    incrementMessageCount();

    const connection = getConnection(clientId);
    if (!connection) {
      throw new WebSocketError('Connection not found', WebSocketErrorCode.SERVER_ERROR);
    }

    const { templateName, worldName, persistent = false } = payload;

    // Validate template exists
    const availableTemplates = await getAvailableTemplates();
    if (!availableTemplates.includes(templateName)) {
      throw new WebSocketError(
        `Template '${templateName}' not found`,
        WebSocketErrorCode.TEMPLATE_NOT_FOUND
      );
    }

    // Check if user already has this world
    let session = await getUserSession(connection.userId, worldName);

    if (!session) {
      // Create new session with world cloning
      session = await createUserSession(
        connection.userId,
        templateName,
        worldName,
        { persistent }
      );
    }

    // Load user world state
    const worldState = await loadUserWorld(connection.userId, worldName);

    // Update connection with world information
    updateConnectionWorld(clientId, worldName, templateName, persistent);

    // Prepare response
    const agents = Array.from(worldState.agents.values());
    const response: WorldSelectedPayload = {
      worldName,
      templateName,
      worldState: {
        name: worldState.name,
        turnLimit: worldState.turnLimit
      },
      agents,
      success: true,
      message: `Successfully selected world '${worldName}'`
    };

    // Send response
    sendResponse(clientId, ServerMessageType.WORLD_SELECTED, response);

    // Send status update
    sendStatus(clientId, 'world_changed', `World '${worldName}' selected`, {
      worldName,
      templateName,
      agentCount: agents.length
    });

  } catch (error) {
    console.error('Error handling world select:', error);

    if (error instanceof WebSocketError) {
      sendError(clientId, error.code, error.message, error.details);
    } else {
      sendError(clientId, WebSocketErrorCode.WORLD_NOT_FOUND, 'Failed to select world');
    }
  }
}

/**
 * Handle chat message
 */
export async function handleChatSend(clientId: string, payload: ChatSendPayload): Promise<void> {
  try {
    incrementMessageCount();

    const connection = getConnection(clientId);
    if (!connection || !connection.worldName) {
      throw new WebSocketError('No world selected', WebSocketErrorCode.WORLD_NOT_FOUND);
    }

    const { content, sender = 'HUMAN', targetAgent } = payload;
    const { worldName } = connection;

    // Subscribe to world events for this connection if not already subscribed
    const unsubscribe = subscribeToWorld((event) => {
      try {
        // Filter events for this world
        // Note: The current event system doesn't have worldName directly
        // We'll send all events and let the client filter if needed
        const eventMessage: EventStreamPayload = {
          worldName,
          event,
          eventType: event.type || 'unknown'
        };

        sendResponse(clientId, ServerMessageType.EVENT_STREAM, eventMessage);
      } catch (error) {
        console.error('Error sending event stream:', error);
      }
    });

    // Add subscription to connection for cleanup
    addSubscription(clientId, unsubscribe);

    // Load world if not already loaded in memory
    if (!listWorlds().includes(worldName)) {
      // This is a user world, we need to load it from user directory
      const session = await getUserSessionById(connection.sessionId);
      if (session) {
        const userWorldState = await loadUserWorld(connection.userId, worldName);
        // Note: We might need to adapt the existing loadWorld function to work with user worlds
        // For now, we'll use the existing world system
        try {
          await loadWorld(worldName);
        } catch (error) {
          console.warn(`Could not load world ${worldName} in memory:`, error);
        }
      }
    }

    // Send the message to the world
    await broadcastMessage(worldName, content, sender);

    // Send confirmation that message was sent
    sendStatus(clientId, 'connected', 'Message sent successfully', {
      worldName,
      messageLength: content.length,
      sender
    });

  } catch (error) {
    console.error('Error handling chat send:', error);

    if (error instanceof WebSocketError) {
      sendError(clientId, error.code, error.message);
    } else {
      sendError(clientId, WebSocketErrorCode.SERVER_ERROR, 'Failed to send chat message');
    }
  }
}

/**
 * Handle agent update message
 */
export async function handleAgentUpdate(clientId: string, payload: AgentUpdatePayload): Promise<void> {
  try {
    incrementMessageCount();

    const connection = getConnection(clientId);
    if (!connection || !connection.worldName) {
      throw new WebSocketError('No world selected', WebSocketErrorCode.WORLD_NOT_FOUND);
    }

    const { agentName, config } = payload;
    const { worldName } = connection;

    // Check if agent exists
    const existingAgent = getAgent(worldName, agentName);
    if (!existingAgent) {
      throw new WebSocketError(
        `Agent '${agentName}' not found in world '${worldName}'`,
        WebSocketErrorCode.AGENT_ERROR
      );
    }

    // Update agent
    const updatedAgent = await updateAgent(worldName, agentName, config);
    if (!updatedAgent) {
      throw new WebSocketError('Failed to update agent', WebSocketErrorCode.AGENT_ERROR);
    }

    // Save user world state
    const session = await getUserSessionById(connection.sessionId);
    if (session) {
      const worldState = await loadUserWorld(connection.userId, worldName);
      await saveUserWorld(connection.userId, worldName, worldState);
    }

    // Prepare response
    const response: AgentUpdatedPayload = {
      worldName,
      agentName,
      config: updatedAgent.config,
      success: true,
      message: `Agent '${agentName}' updated successfully`
    };

    // Send response to requesting client
    sendResponse(clientId, ServerMessageType.AGENT_UPDATED, response);

    // Broadcast update to other clients in the world
    const worldConnections = getWorldConnections(worldName);
    for (const conn of worldConnections) {
      if (conn.clientId !== clientId) {
        sendResponse(conn.clientId, ServerMessageType.AGENT_UPDATED, response);
      }
    }

  } catch (error) {
    console.error('Error handling agent update:', error);

    if (error instanceof WebSocketError) {
      sendError(clientId, error.code, error.message);
    } else {
      sendError(clientId, WebSocketErrorCode.AGENT_ERROR, 'Failed to update agent');
    }
  }
}

/**
 * Handle world reload message
 */
export async function handleWorldReload(clientId: string, payload: WorldReloadPayload): Promise<void> {
  try {
    incrementMessageCount();

    const connection = getConnection(clientId);
    if (!connection || !connection.worldName) {
      throw new WebSocketError('No world selected', WebSocketErrorCode.WORLD_NOT_FOUND);
    }

    const { worldName } = payload;

    // Validate world name matches connection
    if (worldName !== connection.worldName) {
      throw new WebSocketError('World name mismatch', WebSocketErrorCode.PERMISSION_DENIED);
    }

    // Reload user world state
    const worldState = await loadUserWorld(connection.userId, worldName);
    const agents = Array.from(worldState.agents.values());

    // Prepare response
    const response: WorldReloadedPayload = {
      worldName,
      worldState: {
        name: worldState.name,
        turnLimit: worldState.turnLimit
      },
      agents,
      success: true,
      message: `World '${worldName}' reloaded successfully`
    };

    // Send response
    sendResponse(clientId, ServerMessageType.WORLD_RELOADED, response);

  } catch (error) {
    console.error('Error handling world reload:', error);

    if (error instanceof WebSocketError) {
      sendError(clientId, error.code, error.message);
    } else {
      sendError(clientId, WebSocketErrorCode.WORLD_NOT_FOUND, 'Failed to reload world');
    }
  }
}

/**
 * Handle event subscription message
 */
export async function handleEventSubscribe(clientId: string, payload: EventSubscribePayload): Promise<void> {
  try {
    incrementMessageCount();

    const connection = getConnection(clientId);
    if (!connection) {
      throw new WebSocketError('Connection not found', WebSocketErrorCode.SERVER_ERROR);
    }

    const { worldName, eventTypes, agentFilter } = payload;

    // Subscribe to world events
    const unsubscribe = subscribeToWorld((event) => {
      try {
        // Note: The current event system doesn't have worldName directly
        // We'll extract agent info from the payload if available
        let shouldSend = true;

        // Filter by event types if specified
        if (eventTypes && eventTypes.length > 0 && !eventTypes.includes(event.type)) {
          shouldSend = false;
        }

        // Filter by agent if specified and agent info is available in payload
        if (shouldSend && agentFilter) {
          const payload = event.payload as any;
          if (payload.agentName && payload.agentName !== agentFilter) {
            shouldSend = false;
          }
        }

        if (shouldSend) {
          // Send event to client
          const eventMessage: EventStreamPayload = {
            worldName,
            event,
            eventType: event.type || 'unknown'
          };

          sendResponse(clientId, ServerMessageType.EVENT_STREAM, eventMessage);
        }
      } catch (error) {
        console.error('Error sending event stream:', error);
      }
    });

    // Add subscription to connection for cleanup
    addSubscription(clientId, unsubscribe);

    // Send confirmation
    sendStatus(clientId, 'connected', `Subscribed to events for world '${worldName}'`, {
      worldName,
      eventTypes: eventTypes || ['all'],
      agentFilter
    });

  } catch (error) {
    console.error('Error handling event subscribe:', error);

    if (error instanceof WebSocketError) {
      sendError(clientId, error.code, error.message);
    } else {
      sendError(clientId, WebSocketErrorCode.EVENT_ERROR, 'Failed to subscribe to events');
    }
  }
}

/**
 * Handle ping message
 */
export async function handlePing(clientId: string): Promise<void> {
  try {
    incrementMessageCount();

    const connection = getConnection(clientId);
    if (!connection) {
      return; // Connection not found, ignore ping
    }

    // Send pong response
    sendResponse(clientId, ServerMessageType.PONG, {
      timestamp: new Date().toISOString(),
      clientId
    });

  } catch (error) {
    console.error('Error handling ping:', error);
  }
}

/**
 * Send response message to client
 */
function sendResponse(clientId: string, type: ServerMessageType, payload: any): void {
  const message: WebSocketMessage = {
    id: uuidv4(),
    type,
    timestamp: new Date().toISOString(),
    payload
  };

  sendToConnection(clientId, message);
}

/**
 * Send error message to client
 */
function sendError(
  clientId: string,
  code: WebSocketErrorCode,
  message: string,
  details?: any
): void {
  const errorPayload: ErrorPayload = {
    code,
    message,
    details
  };

  sendResponse(clientId, ServerMessageType.ERROR, errorPayload);
}

/**
 * Send status message to client
 */
function sendStatus(
  clientId: string,
  type: StatusPayload['type'],
  message: string,
  data?: any
): void {
  const statusPayload: StatusPayload = {
    type,
    message,
    data
  };

  sendResponse(clientId, ServerMessageType.STATUS, statusPayload);
}

/**
 * Route message to appropriate handler
 */
export async function routeMessage(clientId: string, message: WebSocketMessage): Promise<void> {
  try {
    switch (message.type) {
      case ClientMessageType.WORLD_SELECT:
        await handleWorldSelect(clientId, message.payload);
        break;

      case ClientMessageType.CHAT_SEND:
        await handleChatSend(clientId, message.payload);
        break;

      case ClientMessageType.AGENT_UPDATE:
        await handleAgentUpdate(clientId, message.payload);
        break;

      case ClientMessageType.WORLD_RELOAD:
        await handleWorldReload(clientId, message.payload);
        break;

      case ClientMessageType.EVENT_SUBSCRIBE:
        await handleEventSubscribe(clientId, message.payload);
        break;

      case ClientMessageType.PING:
        await handlePing(clientId);
        break;

      default:
        throw new WebSocketError(
          `Unknown message type: ${message.type}`,
          WebSocketErrorCode.INVALID_MESSAGE
        );
    }
  } catch (error) {
    console.error(`Error routing message ${message.type}:`, error);

    if (error instanceof WebSocketError) {
      sendError(clientId, error.code, error.message, error.details);
    } else {
      sendError(clientId, WebSocketErrorCode.SERVER_ERROR, 'Internal server error');
    }
  }
}
