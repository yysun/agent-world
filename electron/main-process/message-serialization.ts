/**
 * Electron Main Message and Event Serialization
 *
 * Features:
 * - Serializes world/chat/agent summaries for IPC payloads.
 * - Normalizes persisted chat memory into canonical renderer message shapes.
 * - Serializes realtime message, SSE, tool, system, CRUD, activity, and log events.
 *
 * Implementation Notes:
 * - Canonical message identity is based on `messageId`.
 * - Session-message normalization removes duplicates and invalid entries.
 * - Runtime validation remains in higher-level handlers.
 *
 * Recent Changes:
 * - 2026-02-19: Added realtime CRUD-event serialization so renderer can refresh world/agent state after background updates.
 * - 2026-02-13: Added realtime system-event serialization so renderer can react to chat title updates.
 * - 2026-02-12: Extracted world/chat/message/event serialization helpers from `electron/main.ts`.
 */

type GetMemory = (worldId: string, chatId: string | null) => Promise<any>;

export function serializeAgentSummary(agent: any, fallbackIndex = 0): Record<string, unknown> {
  const rawId = typeof agent?.id === 'string' ? agent.id.trim() : '';
  const rawName = typeof agent?.name === 'string' ? agent.name.trim() : '';
  const id = rawId || `agent-${fallbackIndex + 1}`;
  const rawMessageCount = Array.isArray(agent?.memory) ? agent.memory.length : 0;
  return {
    id,
    name: rawName || id,
    type: typeof agent?.type === 'string' ? agent.type : 'assistant',
    status: typeof agent?.status === 'string' ? agent.status : 'inactive',
    provider: typeof agent?.provider === 'string' ? agent.provider : 'openai',
    model: typeof agent?.model === 'string' ? agent.model : 'gpt-4o-mini',
    systemPrompt: typeof agent?.systemPrompt === 'string' ? agent.systemPrompt : '',
    autoReply: agent?.autoReply === false ? false : true,
    temperature: Number.isFinite(Number(agent?.temperature)) ? Number(agent.temperature) : null,
    maxTokens: Number.isFinite(Number(agent?.maxTokens)) ? Number(agent.maxTokens) : null,
    llmCallCount: Number.isFinite(Number(agent?.llmCallCount)) ? Number(agent.llmCallCount) : 0,
    messageCount: Number.isFinite(Number(rawMessageCount)) ? Number(rawMessageCount) : 0
  };
}

function serializeWorldAgents(world: any): Record<string, unknown>[] {
  const worldAgents = world?.agents instanceof Map
    ? Array.from(world.agents.values())
    : Array.isArray(world?.agents)
      ? world.agents
      : [];

  return worldAgents.map((agent: any, index: number) => serializeAgentSummary(agent, index));
}

function isHumanSender(sender: string | null | undefined): boolean {
  const normalized = String(sender || '').trim().toLowerCase();
  return normalized === 'human' || normalized === 'user';
}

function deriveEventRole(event: any): string {
  if (typeof event?.role === 'string' && event.role.length > 0) {
    return event.role;
  }
  const sender = typeof event?.sender === 'string' ? event.sender.toLowerCase() : '';
  if (sender === 'human' || sender.startsWith('user')) return 'user';
  return 'assistant';
}

export function toIsoTimestamp(value: Date | string | unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 0) return value;
  return new Date().toISOString();
}

export function serializeWorldInfo(world: any): Record<string, unknown> {
  return {
    id: world.id,
    name: world.name,
    description: world.description || '',
    turnLimit: world.turnLimit,
    mainAgent: world.mainAgent == null ? null : String(world.mainAgent),
    chatLLMProvider: world.chatLLMProvider || null,
    chatLLMModel: world.chatLLMModel || null,
    mcpConfig: world.mcpConfig || null,
    variables: typeof world.variables === 'string' ? world.variables : '',
    totalAgents: world.totalAgents,
    totalMessages: world.totalMessages,
    agents: serializeWorldAgents(world)
  };
}

export function serializeChat(chat: any): Record<string, unknown> {
  const rawMessageCount = Number(chat?.messageCount);
  return {
    id: chat.id,
    worldId: chat.worldId,
    name: chat.name,
    description: chat.description || '',
    createdAt: chat.createdAt instanceof Date ? chat.createdAt.toISOString() : String(chat.createdAt),
    updatedAt: chat.updatedAt instanceof Date ? chat.updatedAt.toISOString() : String(chat.updatedAt),
    messageCount: Number.isFinite(rawMessageCount) ? Math.max(0, Math.floor(rawMessageCount)) : 0
  };
}

export async function serializeChatsWithMessageCounts(
  worldId: string,
  chats: any[],
  getMemory: GetMemory
): Promise<Record<string, unknown>[]> {
  const worldKey = String(worldId || '');
  if (!worldKey) {
    return [];
  }

  const chatList = Array.isArray(chats) ? chats : [];
  const messageCounts = new Map<string, number>();

  await Promise.all(chatList.map(async (chat) => {
    const chatId = String(chat?.id || '');
    if (!chatId) return;

    try {
      const messages = await getMemory(worldKey, chatId);
      const count = Array.isArray(messages) ? messages.length : 0;
      messageCounts.set(chatId, count);
    } catch {
      const fallbackCount = Number(chat?.messageCount);
      messageCounts.set(chatId, Number.isFinite(fallbackCount) ? fallbackCount : 0);
    }
  }));

  return chatList.map((chat) => {
    const chatId = String(chat?.id || '');
    const derivedCount = messageCounts.get(chatId);
    return serializeChat({
      ...chat,
      messageCount: Number.isFinite(Number(derivedCount)) ? Number(derivedCount) : chat?.messageCount
    });
  });
}

export function serializeMessage(message: any): Record<string, unknown> | null {
  const messageId = String(message?.messageId || '').trim();
  if (!messageId) {
    return null;
  }

  const timestamp = message.createdAt instanceof Date
    ? message.createdAt.toISOString()
    : message.createdAt
      ? String(message.createdAt)
      : new Date().toISOString();

  return {
    id: messageId,
    role: message.role,
    sender: message.sender || message.agentId || 'unknown',
    content: message.content || '',
    createdAt: timestamp,
    chatId: message.chatId || null,
    messageId,
    replyToMessageId: message.replyToMessageId || null,
    fromAgentId: message.agentId || null
  };
}

export function normalizeSessionMessages(messages: any[]): any[] {
  const source = Array.isArray(messages) ? messages : [];
  const seenMessageIds = new Set<string>();
  const deduplicated: any[] = [];

  for (const rawMessage of source) {
    if (!rawMessage) continue;

    const messageId = String(rawMessage?.messageId || '').trim();
    if (!messageId) continue;

    const message = {
      ...rawMessage,
      id: messageId,
      messageId
    };

    const role = String(message.role || '').trim().toLowerCase();
    const normalizedSender = String(message?.sender || '').trim();
    const isUserMessage = isHumanSender(normalizedSender) || (role === 'user' && !normalizedSender);

    if (isUserMessage && seenMessageIds.has(messageId)) {
      continue;
    }
    if (seenMessageIds.has(messageId)) continue;
    seenMessageIds.add(messageId);

    deduplicated.push(message);
  }

  return deduplicated;
}

export function serializeRealtimeMessageEvent(worldId: string, event: any): Record<string, unknown> | null {
  const messageId = String(event?.messageId || '').trim();
  if (!messageId) {
    return null;
  }

  const createdAt = toIsoTimestamp(event?.timestamp);
  return {
    type: 'message',
    worldId,
    chatId: event?.chatId || null,
    message: {
      id: messageId,
      role: deriveEventRole(event),
      sender: event?.sender || 'unknown',
      content: event?.content || '',
      createdAt,
      chatId: event?.chatId || null,
      messageId,
      replyToMessageId: event?.replyToMessageId || null
    }
  };
}

export function serializeRealtimeSSEEvent(
  worldId: string,
  chatId: string | null,
  event: any
): Record<string, unknown> {
  const messageId = typeof event?.messageId === 'string' ? event.messageId : null;
  return {
    type: 'sse',
    worldId,
    chatId: chatId || null,
    sse: {
      eventType: event?.type || 'chunk',
      messageId,
      agentName: event?.agentName || 'assistant',
      content: event?.content || '',
      error: event?.error || null,
      createdAt: new Date().toISOString(),
      chatId: chatId || null
    }
  };
}

export function serializeRealtimeToolEvent(
  worldId: string,
  chatId: string | null,
  event: any
): Record<string, unknown> {
  const eventType = event?.type || 'tool-progress';
  const toolExecution = event?.toolExecution || null;
  const toolUseId = String(
    event?.toolUseId ||
    toolExecution?.toolCallId ||
    `tool-${Date.now()}`
  );

  return {
    type: 'tool',
    worldId,
    chatId: chatId || null,
    tool: {
      eventType,
      toolUseId,
      toolName: event?.toolName || toolExecution?.toolName || 'unknown',
      toolInput: event?.toolInput || toolExecution?.input || null,
      result: event?.result || toolExecution?.result || null,
      error: event?.error || toolExecution?.error || null,
      progress: event?.progress || null,
      agentId: event?.agentId || null,
      createdAt: new Date().toISOString()
    }
  };
}

export function serializeRealtimeSystemEvent(
  worldId: string,
  chatId: string | null,
  event: any
): Record<string, unknown> {
  const content = event?.content;
  const normalizedEventType = typeof content === 'string'
    ? content
    : typeof content?.eventType === 'string'
      ? content.eventType
      : typeof content?.type === 'string'
        ? content.type
        : 'system';

  return {
    type: 'system',
    worldId,
    chatId: chatId || null,
    system: {
      eventType: normalizedEventType,
      content,
      messageId: typeof event?.messageId === 'string' ? event.messageId : null,
      createdAt: toIsoTimestamp(event?.timestamp),
      chatId: chatId || null
    }
  };
}

export function serializeRealtimeCrudEvent(
  worldId: string,
  chatId: string | null,
  event: any
): Record<string, unknown> {
  const operation = typeof event?.operation === 'string' ? event.operation : 'update';
  const entityType = typeof event?.entityType === 'string' ? event.entityType : 'world';
  const entityId = typeof event?.entityId === 'string' ? event.entityId : '';

  return {
    type: 'crud',
    worldId,
    chatId: chatId || null,
    crud: {
      operation,
      entityType,
      entityId,
      entityData: event?.entityData ?? null,
      chatId: event?.chatId ?? chatId ?? null,
      createdAt: toIsoTimestamp(event?.timestamp)
    }
  };
}

export function serializeRealtimeActivityEvent(
  worldId: string,
  chatId: string | null,
  event: any
): Record<string, unknown> {
  const activeSources = Array.isArray(event?.activeSources)
    ? event.activeSources
      .map((source: unknown) => String(source || '').trim())
      .filter(Boolean)
    : [];

  return {
    type: 'activity',
    worldId,
    chatId: chatId || null,
    activity: {
      eventType: event?.type || 'response-end',
      pendingOperations: Number(event?.pendingOperations) || 0,
      activityId: Number(event?.activityId) || 0,
      source: event?.source ? String(event.source) : null,
      activeSources,
      queue: event?.queue || null,
      createdAt: new Date().toISOString()
    }
  };
}

export function serializeRealtimeLogEvent(logEvent: any): Record<string, unknown> {
  return {
    type: 'log',
    logEvent: {
      level: logEvent?.level || 'info',
      category: logEvent?.category || 'unknown',
      message: logEvent?.message || '',
      timestamp: logEvent?.timestamp || new Date().toISOString(),
      data: logEvent?.data || null,
      messageId: logEvent?.messageId || `log-${Date.now()}`
    }
  };
}
