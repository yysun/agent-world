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
 * - 2026-03-24: Added regression coverage for exact permission-branch dispatch and write_file
 *   ask-mode no-hesitation wording after Electron HITL runs stalled in the full suite.
 * - 2026-03-13: Added regression coverage for shared seeded-agent creation data.
 */

import { describe, expect, it } from 'vitest';

import {
  CREATE_AGENT_ASK_NAME,
  CREATE_AGENT_AUTO_NAME,
  HITL_DELETE_TARGET,
  TEST_AGENT_ID,
  TEST_AGENT_MODEL,
  TEST_AGENT_NAME,
  TOOL_PERMISSION_SKILL_ID,
  WRITE_FILE_TARGET,
  buildCreateAgentPermissionPrompt,
  buildLoadSkillPermissionPrompt,
  buildShellPermissionPrompt,
  buildSeededAgentSystemPrompt,
  buildWebFetchPermissionPrompt,
  buildWriteFilePermissionPrompt,
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

  it('locks permission branches to exact prefixes and immediate write-file ask calls', () => {
    const prompt = buildSeededAgentSystemPrompt();

    expect(prompt).toContain(
      'Match tool-permission branches using only the exact prefix before the first colon in the user message.',
    );
    expect(prompt).toContain(
      'Treat every WRITE_FILE_*, WEB_FETCH_*, SHELL_*, CREATE_AGENT_*, and LOAD_SKILL_* prefix as a separate exact branch.',
    );
    expect(prompt).toContain(
      `WRITE_FILE_ASK:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}"`,
    );
    expect(prompt).toContain(
      'Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed.',
    );
    expect(prompt).toContain(
      'Never ask the user for a file path, file content, or confirmation.',
    );
    expect(prompt).toContain('Never reply with text like "I need the file path and content."');
    expect(prompt).toContain(
      `If a user message includes the exact filename "${HITL_DELETE_TARGET}" and asks to use shell_cmd, never call ask_user_input`,
    );
  });

  it('can build narrow prompts for isolated Electron tool families', () => {
    const writeFilePrompt = buildWriteFilePermissionPrompt();
    const webFetchPrompt = buildWebFetchPermissionPrompt();
    const shellPrompt = buildShellPermissionPrompt();
    const createAgentPrompt = buildCreateAgentPermissionPrompt();
    const loadSkillPrompt = buildLoadSkillPermissionPrompt();

    expect(writeFilePrompt).toContain(`filePath "${WRITE_FILE_TARGET}"`);
    expect(writeFilePrompt).not.toContain('WEB_FETCH_READ:');
    expect(webFetchPrompt).toContain('Never ask the user for a URL');
    expect(webFetchPrompt).toContain('Never reply with text like "Please provide the URL you would like me to fetch."');
    expect(webFetchPrompt).not.toContain('WRITE_FILE_READ:');
    expect(shellPrompt).toContain('Never ask the user what shell command to run or for shell arguments.');
    expect(shellPrompt).toContain('Never reply with text like "What preconfigured command would you like me to run?".');
    expect(shellPrompt).toContain(`parameters ["${HITL_DELETE_TARGET}"]`);
    expect(shellPrompt).not.toContain('CREATE_AGENT_READ:');
    expect(createAgentPrompt).toContain(
      'Never ask the user to name the agent, describe its role, choose nextAgent, or confirm creation.',
    );
    expect(createAgentPrompt).toContain('Never reply with text like "What would you like to name the agent?".');
    expect(createAgentPrompt).toContain(`name "${CREATE_AGENT_ASK_NAME}"`);
    expect(createAgentPrompt).toContain(`Do not create "${CREATE_AGENT_AUTO_NAME}" in this branch.`);
    expect(createAgentPrompt).not.toContain('LOAD_SKILL_READ:');
    expect(loadSkillPrompt).toContain(`skill_id "${TOOL_PERMISSION_SKILL_ID}"`);
    expect(loadSkillPrompt).toContain('Never ask the user for a skill_id or confirmation.');
    expect(loadSkillPrompt).toContain('Never reply with text like "I need a skill_id".');
    expect(loadSkillPrompt).toContain('Do not reply with "E2E_LOAD_SKILL_AUTO_OK" in this branch.');
    expect(loadSkillPrompt).not.toContain('WRITE_FILE_READ:');
  });
});
