/**
 * Unit tests for the web E2E seeded-agent prompt helper.
 *
 * Purpose:
 * - Lock in the deterministic prompt wording used by the live web E2E assistant.
 *
 * Key Features:
 * - Verifies flaky ask-mode permission branches instruct the agent to call tools immediately.
 * - Verifies the prompt forbids plain-text hesitation before the tool call.
 * - Verifies narrow per-tool prompt builders stay isolated from unrelated tool families.
 *
 * Implementation Notes:
 * - Pure string assertions only; no browser or server runtime is launched.
 *
 * Recent Changes:
 * - 2026-03-24: Added shell-cmd and create-agent prompt-builder regressions for the remaining
 *   permission-matrix branches that were still drifting in full-suite runs.
 * - 2026-03-24: Added regression coverage for write_file, web_fetch, and load_skill prompt wording
 *   after full-suite flakes showed plain-text hesitation and cross-branch drift.
 */

import { describe, expect, it } from 'vitest';

import {
  CREATE_AGENT_ASK_NAME,
  CREATE_AGENT_AUTO_NAME,
  HITL_DELETE_TARGET,
  TOOL_PERMISSION_SKILL_ID,
  WRITE_FILE_TARGET,
  buildAgentSystemPrompt,
  buildCreateAgentPermissionPrompt,
  buildLoadSkillPermissionPrompt,
  buildShellPermissionPrompt,
  buildWriteFilePermissionPrompt,
} from '../web-e2e/support/web-harness.js';

describe('web harness seeded-agent prompt helper', () => {
  it('locks branch dispatch to the exact user-message prefix', () => {
    const prompt = buildAgentSystemPrompt();

    expect(prompt).toContain('A user message may optionally begin with "@e2e-google "');
    expect(prompt).toContain(
      'Match tool-permission branches using only the exact prefix before the first colon in the user message.',
    );
    expect(prompt).toContain(
      'Treat every WRITE_FILE_*, WEB_FETCH_*, SHELL_*, CREATE_AGENT_*, and LOAD_SKILL_* prefix as a separate exact branch.',
    );
  });

  it('forces the flaky ask-mode branches to call tools immediately', () => {
    const prompt = buildAgentSystemPrompt();

    expect(prompt).toContain(
      `WRITE_FILE_ASK:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}"`,
    );
    expect(prompt).toContain(
      'WEB_FETCH_ASK:", immediately call exactly one tool: web_fetch with url "https://example.com/"',
    );
    expect(prompt).toContain(
      `LOAD_SKILL_ASK:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}"`,
    );
  });

  it('forbids plain-text hesitation before approval-capable tool calls', () => {
    const prompt = buildAgentSystemPrompt();

    expect(prompt).toContain(
      'Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed.',
    );
    expect(prompt).toContain('Do not answer with plain text before the tool call.');
    expect(prompt).toContain('E2E_LOAD_SKILL_ASK_OK');
  });

  it('can build narrow prompts for a single flaky tool family', () => {
    const writeFilePrompt = buildWriteFilePermissionPrompt();
    const shellPrompt = buildShellPermissionPrompt();
    const createAgentPrompt = buildCreateAgentPermissionPrompt();
    const loadSkillPrompt = buildLoadSkillPermissionPrompt();

    expect(writeFilePrompt).toContain(`filePath "${WRITE_FILE_TARGET}"`);
    expect(writeFilePrompt).not.toContain('WEB_FETCH_READ:');
    expect(shellPrompt).toContain(`parameters ["${HITL_DELETE_TARGET}"]`);
    expect(shellPrompt).toContain('Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed.');
    expect(shellPrompt).not.toContain('CREATE_AGENT_READ:');
    expect(createAgentPrompt).toContain(`name "${CREATE_AGENT_ASK_NAME}"`);
    expect(createAgentPrompt).toContain(`Do not create "${CREATE_AGENT_AUTO_NAME}" in this branch.`);
    expect(createAgentPrompt).toContain('Never call write_file, web_fetch, shell_cmd, load_skill, or ask_user_input before create_agent');
    expect(createAgentPrompt).not.toContain('LOAD_SKILL_READ:');
    expect(loadSkillPrompt).toContain(`skill_id "${TOOL_PERMISSION_SKILL_ID}"`);
    expect(loadSkillPrompt).toContain('Never call write_file, web_fetch, shell_cmd, create_agent, or ask_user_input before load_skill');
    expect(loadSkillPrompt).toContain('Do not reply with "E2E_LOAD_SKILL_AUTO_OK" in this branch.');
    expect(loadSkillPrompt).not.toContain('WRITE_FILE_READ:');
  });
});
