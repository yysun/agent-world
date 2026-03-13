/**
 * Unit Tests for Electron E2E seeded agent helpers.
 *
 * Purpose:
 * - Verify the shared seeded-agent payload stays deterministic for bootstrap and
 *   runtime recovery before each Electron E2E test.
 *
 * Key Features:
 * - Confirms the seeded agent identity remains stable.
 * - Confirms the prompt still contains the permission-matrix load_skill flow.
 *
 * Implementation Notes:
 * - Tests the pure seeded-agent helper only; no Electron runtime is launched.
 *
 * Recent Changes:
 * - 2026-03-13: Added regression coverage for shared seeded-agent creation data.
 */

import { describe, expect, it } from 'vitest';

import {
  TEST_AGENT_ID,
  TEST_AGENT_MODEL,
  TEST_AGENT_NAME,
  TOOL_PERMISSION_SKILL_ID,
  createSeededAgentPayload,
} from '../../electron-e2e/support/seeded-agent';

describe('electron harness seeded agent helper', () => {
  it('builds a stable seeded agent payload for runtime recovery', () => {
    const payload = createSeededAgentPayload();

    expect(payload).toMatchObject({
      id: TEST_AGENT_ID,
      name: TEST_AGENT_NAME,
      type: 'assistant',
      provider: 'google',
      model: TEST_AGENT_MODEL,
      autoReply: true,
    });
  });

  it('includes deterministic load_skill ask instructions in the seeded prompt', () => {
    const payload = createSeededAgentPayload();
    const prompt = String(payload.systemPrompt || '');

    expect(prompt).toContain(`LOAD_SKILL_ASK:`);
    expect(prompt).toContain(`skill_id "${TOOL_PERMISSION_SKILL_ID}"`);
    expect(prompt).toContain('immediately call exactly one tool: load_skill');
    expect(prompt).toContain('do not wait for the user; the tool itself will request approval if needed');
    expect(prompt).toContain('E2E_LOAD_SKILL_ASK_OK');
  });
});
