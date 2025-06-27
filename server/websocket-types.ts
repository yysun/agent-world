/**
 * WebSocket Type Definitions for Real-time World Communication
 * 
 * Features:
 * - Message interfaces for all WebSocket communication types
 * - Connection management and user session types
 * - Event streaming and real-time update types
 * - Error handling and status types
 * - User folder structure and world cloning types
 * 
 * Message Flow:
 * - Client sends action messages (world selection, chat, etc.)
 * - Server responds with result messages and event streams
 * - Real-time events broadcast to relevant clients
 * - Connection management handles lifecycle
 * 
 * User Session Management:
 * - Anonymous users get temporary sessions
 * - Sessions track world instances and connections
 * - Cleanup handles abandoned sessions
 * - Persistent sessions for saved user data
 */

// Base WebSocket Message Structure
export interface WebSocketMessage {
  id: string;
  type: string;
  timestamp: string;
  payload: any;
}

// Client to Server Messages
export enum ClientMessageType {
  WORLD_SELECT = 'world_select',
  CHAT_SEND = 'chat_send',
  AGENT_UPDATE = 'agent_update',
  WORLD_RELOAD = 'world_reload',
  EVENT_SUBSCRIBE = 'event_subscribe',
  EVENT_UNSUBSCRIBE = 'event_unsubscribe',
  PING = 'ping'
}

// Server to Client Messages
export enum ServerMessageType {
  WORLD_SELECTED = 'world_selected',
  CHAT_RESPONSE = 'chat_response',
  AGENT_UPDATED = 'agent_updated',
  WORLD_RELOADED = 'world_reloaded',
  EVENT_STREAM = 'event_stream',
  ERROR = 'error',
  STATUS = 'status',
  PONG = 'pong'
}

// Client Message Payloads
export interface WorldSelectPayload {
  templateName: string;
  worldName: string;
  persistent?: boolean;
}

export interface ChatSendPayload {
  worldName: string;
  content: string;
  sender?: string;
  targetAgent?: string;
}

export interface AgentUpdatePayload {
  worldName: string;
  agentName: string;
  config: any;
}

export interface WorldReloadPayload {
  worldName: string;
}

export interface EventSubscribePayload {
  worldName: string;
  eventTypes?: string[];
  agentFilter?: string;
}

// Server Response Payloads
export interface WorldSelectedPayload {
  worldName: string;
  templateName: string;
  worldState: any;
  agents: any[];
  success: boolean;
  message?: string;
}

export interface ChatResponsePayload {
  worldName: string;
  agentName: string;
  content: string;
  messageId: string;
  complete: boolean;
}

export interface AgentUpdatedPayload {
  worldName: string;
  agentName: string;
  config: any;
  success: boolean;
  message?: string;
}

export interface WorldReloadedPayload {
  worldName: string;
  worldState: any;
  agents: any[];
  success: boolean;
  message?: string;
}

export interface EventStreamPayload {
  worldName: string;
  event: any;
  eventType: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: any;
}

export interface StatusPayload {
  type: 'connected' | 'disconnected' | 'world_changed' | 'session_created';
  message: string;
  data?: any;
}

// Connection Management Types
export interface ClientConnection {
  clientId: string;
  userId: string;
  worldName?: string;
  templateName?: string;
  sessionId: string;
  connectedAt: Date;
  lastActivity: Date;
  subscriptions: Array<() => void>;
  isPersistent: boolean;
  websocket: any; // WebSocket instance
}

// User Session Management
export interface UserSession {
  userId: string;
  sessionId: string;
  worldName: string;
  templateName: string;
  worldPath: string;
  isPersistent: boolean;
  createdAt: Date;
  lastAccessed: Date;
  connectionCount: number;
}

export interface UserSessionOptions {
  persistent?: boolean;
  worldName?: string;
  templateName?: string;
}

// World Cloning Types
export interface WorldTemplate {
  name: string;
  displayName: string;
  description: string;
  path: string;
  agentCount: number;
  isValid: boolean;
}

export interface CloneWorldOptions {
  userId: string;
  templateName: string;
  worldName: string;
  persistent?: boolean;
}

export interface CloneWorldResult {
  success: boolean;
  worldPath?: string;
  worldState?: any;
  error?: string;
}

// User Storage Types
export interface UserStorageInfo {
  userId: string;
  userPath: string;
  worldsPath: string;
  exists: boolean;
  worldCount: number;
  createdAt?: Date;
}

export interface UserWorldInfo {
  userId: string;
  worldName: string;
  templateName: string;
  worldPath: string;
  exists: boolean;
  agentCount?: number;
  lastModified?: Date;
}

// Error Types
export enum WebSocketErrorCode {
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  WORLD_NOT_FOUND = 'WORLD_NOT_FOUND',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  USER_SESSION_ERROR = 'USER_SESSION_ERROR',
  WORLD_CLONE_ERROR = 'WORLD_CLONE_ERROR',
  AGENT_ERROR = 'AGENT_ERROR',
  EVENT_ERROR = 'EVENT_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  SERVER_ERROR = 'SERVER_ERROR'
}

export interface WebSocketErrorInterface extends Error {
  code: WebSocketErrorCode;
  details?: any;
}

export class WebSocketError extends Error implements WebSocketErrorInterface {
  public code: WebSocketErrorCode;
  public details?: any;

  constructor(message: string, code: WebSocketErrorCode = WebSocketErrorCode.SERVER_ERROR, details?: any) {
    super(message);
    this.name = 'WebSocketError';
    this.code = code;
    this.details = details;
  }
}

// Connection State
export enum ConnectionState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATED = 'authenticated',
  WORLD_SELECTED = 'world_selected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error'
}

// Event Subscription Types
export interface EventSubscription {
  clientId: string;
  worldName: string;
  eventTypes: string[];
  agentFilter?: string;
  unsubscribe: () => void;
}

// Health Check Types
export interface ConnectionHealth {
  clientId: string;
  userId: string;
  state: ConnectionState;
  lastPing: Date;
  lastPong: Date;
  latency: number;
  connected: boolean;
}

// Server Statistics
export interface WebSocketServerStats {
  totalConnections: number;
  activeConnections: number;
  totalSessions: number;
  activeSessions: number;
  totalWorlds: number;
  messagesPerSecond: number;
  uptime: number;
}

// Utility Types
export type MessageHandler<T = any> = (payload: T, clientId: string) => Promise<void>;
export type EventHandler = (event: any, clientId: string) => void;

// Type Guards
export function isClientMessage(message: any): message is WebSocketMessage {
  return message &&
    typeof message.id === 'string' &&
    typeof message.type === 'string' &&
    Object.values(ClientMessageType).includes(message.type);
}

export function isServerMessage(message: any): message is WebSocketMessage {
  return message &&
    typeof message.id === 'string' &&
    typeof message.type === 'string' &&
    Object.values(ServerMessageType).includes(message.type);
}

export function isWebSocketError(error: any): error is WebSocketError {
  return error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    Object.values(WebSocketErrorCode).includes(error.code as WebSocketErrorCode);
}
