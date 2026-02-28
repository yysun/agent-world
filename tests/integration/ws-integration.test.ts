/**
 * API Integration Test - CRUD and Export Operations
 *
 * Purpose:
 * - Validate end-to-end API behavior using an in-process server instance.
 *
 * Key features:
 * - Starts/stops the real Express server in test lifecycle (no manual pre-start required)
 * - Exercises world, chat, and agent CRUD endpoints
 * - Verifies markdown export contract
 * - Uses memory storage backend for deterministic integration runs
 *
 * Implementation notes:
 * - Uses fetch against localhost ephemeral port
 * - Avoids message-generation/LLM flows to keep integration deterministic
 *
 * Recent changes:
 * - 2026-02-27: Replaced legacy manual WebSocket integration flow with in-process API integration tests.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'http';

interface JsonResponse<T = unknown> {
  status: number;
  body: T;
}

type CreatedWorld = {
  id: string;
  name: string;
};

type ChatSummary = {
  id: string;
  name: string;
  messageCount: number;
};

type AgentSummary = {
  id: string;
  name: string;
  provider?: string;
  model?: string;
};

const HOST = '127.0.0.1';
const TEST_TIMEOUT_MS = 15000;
const testWorldName = `Integration World ${Date.now()}`;
let testWorldId = '';
let baseUrl = '';
let server: Server;

async function requestJson<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<JsonResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await response.json()) as T)
    : ((await response.text()) as unknown as T);

  return {
    status: response.status,
    body,
  };
}

describe('API integration: CRUD and export', () => {
  beforeAll(async () => {
    process.env.AGENT_WORLD_STORAGE_TYPE = 'memory';

    const { startWebServer } = await import('../../server/index.js');
    server = await startWebServer(0, HOST, {
      openBrowser: false,
      registerProcessHandlers: false,
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to resolve test server address');
    }

    baseUrl = `http://${HOST}:${address.port}/api`;
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    delete process.env.AGENT_WORLD_STORAGE_TYPE;
  });

  it('creates and reads a world via API', async () => {
    const createRes = await requestJson<CreatedWorld>('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        name: testWorldName,
        description: 'Integration test world',
        turnLimit: 5,
      }),
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeTruthy();
    testWorldId = createRes.body.id;

    const listRes = await requestJson<Array<{ id: string; name: string }>>('/worlds');
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((world) => world.id === testWorldId)).toBe(true);

    const getRes = await requestJson<{ id: string; name: string }>(`/worlds/${testWorldId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(testWorldId);
    expect(getRes.body.name).toBe(testWorldName);
  });

  it('performs chat lifecycle operations', async () => {
    const listChatsRes = await requestJson<ChatSummary[]>(`/worlds/${testWorldId}/chats`);
    expect(listChatsRes.status).toBe(200);
    expect(listChatsRes.body.length).toBeGreaterThan(0);

    const createChatRes = await requestJson<{ chatId: string; success: boolean }>(
      `/worlds/${testWorldId}/chats`,
      { method: 'POST' },
    );
    expect(createChatRes.status).toBe(200);
    expect(createChatRes.body.success).toBe(true);
    const createdChatId = createChatRes.body.chatId;
    expect(createdChatId).toBeTruthy();

    const deleteChatRes = await requestJson<{ message: string }>(
      `/worlds/${testWorldId}/chats/${createdChatId}`,
      { method: 'DELETE' },
    );
    expect(deleteChatRes.status).toBe(200);
    expect(deleteChatRes.body.message).toContain('deleted');
  });

  it('performs agent lifecycle operations', async () => {
    const createAlice = await requestJson<AgentSummary>(`/worlds/${testWorldId}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        id: 'alice',
        name: 'Alice',
        type: 'assistant',
        provider: 'ollama',
        model: 'llama3.2:3b',
        systemPrompt: 'You are Alice.',
        temperature: 0.7,
        maxTokens: 100,
      }),
    });

    expect(createAlice.status).toBe(201);
    expect(createAlice.body.id).toBe('alice');

    const listAgentsRes = await requestJson<AgentSummary[]>(`/worlds/${testWorldId}/agents`);
    expect(listAgentsRes.status).toBe(200);
    expect(listAgentsRes.body.some((agent) => agent.id === 'alice')).toBe(true);

    const getAlice = await requestJson<AgentSummary>(`/worlds/${testWorldId}/agents/alice`);
    expect(getAlice.status).toBe(200);
    expect(getAlice.body.id).toBe('alice');

    const deleteAlice = await requestJson<{ message: string }>(
      `/worlds/${testWorldId}/agents/alice`,
      { method: 'DELETE' },
    );
    expect(deleteAlice.status).toBe(204);
  });

  it('exports world markdown and cleans up world', async () => {
    const exportRes = await fetch(`${baseUrl}/worlds/${testWorldId}/export`);
    expect(exportRes.status).toBe(200);

    const markdown = await exportRes.text();
    expect(markdown).toContain(testWorldName);
    expect(markdown.length).toBeGreaterThan(0);

    const deleteWorldRes = await fetch(`${baseUrl}/worlds/${testWorldId}`, {
      method: 'DELETE',
    });
    expect(deleteWorldRes.status).toBe(204);
  });
});
