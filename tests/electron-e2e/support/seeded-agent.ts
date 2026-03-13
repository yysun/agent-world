/**
 * Shared seeded agent definition for Electron E2E coverage.
 *
 * Purpose:
 * - Keep the bootstrap script and runtime recovery path aligned on the exact
 *   seeded test agent identity and deterministic system prompt.
 *
 * Key Features:
 * - Exposes stable seeded agent identifiers used across Electron E2E tests.
 * - Builds the deterministic prompt payload used by permission-matrix flows.
 * - Avoids duplicated prompt drift between bootstrap and harness recovery.
 *
 * Implementation Notes:
 * - Pure helpers only; no filesystem or runtime side effects.
 * - Prompt content is intentionally explicit so real-model E2E flows stay stable.
 *
 * Recent Changes:
 * - 2026-03-13: Added a shared seeded-agent helper so launch recovery can
 *   recreate the test agent before each Electron E2E test when needed.
 */

import { TOOL_PERMISSION_FETCH_URL } from '../../support/tool-permission-fetch-target.js';

export const TEST_AGENT_ID = 'e2e-google';
export const TEST_AGENT_NAME = 'E2E Google';
export const TEST_AGENT_MODEL = 'gemini-2.5-flash';
export const HITL_DELETE_TARGET = '.e2e-hitl-delete-me.txt';
export const HITL_SHELL_SUCCESS_TOKEN = `E2E_SHELL_OK: ${HITL_DELETE_TARGET}`;
export const WRITE_FILE_TARGET = '.e2e-write-output.txt';
export const LOAD_SKILL_RUN_MARKER = '.e2e-load-skill-ran.txt';
export const TOOL_PERMISSION_SKILL_ID = 'e2e-matrix-skill';
export const TOOL_PERMISSION_SKILL_SCRIPT_NAME = 'mark-load-skill.js';
export const CREATE_AGENT_ASK_NAME = 'E2E Ask Agent';
export const CREATE_AGENT_AUTO_NAME = 'E2E Auto Agent';

export function buildSeededAgentSystemPrompt(): string {
  return [
    'You are the Agent World desktop E2E assistant.',
    'Rules:',
    '- For normal user messages, reply with one short sentence that starts with "E2E_OK:" and includes the full user message text.',
    `- If a user message starts with "WRITE_FILE_READ:", call only write_file with filePath "${WRITE_FILE_TARGET}" and content "read should be blocked". If the tool result mentions "permission level (read)", reply exactly "E2E_WRITE_FILE_READ_BLOCKED". Otherwise reply exactly "E2E_WRITE_FILE_READ_UNEXPECTED".`,
    `- If a user message starts with "WRITE_FILE_ASK:", call only write_file with filePath "${WRITE_FILE_TARGET}" and content "ASK_WRITE_OK". After the tool returns, reply exactly "E2E_WRITE_FILE_ASK_OK".`,
    `- If a user message starts with "WRITE_FILE_AUTO:", call only write_file with filePath "${WRITE_FILE_TARGET}" and content "AUTO_WRITE_OK". After the tool returns, reply exactly "E2E_WRITE_FILE_AUTO_OK".`,
    `- If a user message starts with "WEB_FETCH_READ:", call only web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". After the tool returns, reply exactly "E2E_WEB_FETCH_READ_OK".`,
    `- If a user message starts with "WEB_FETCH_ASK:", call only web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". After the tool returns, reply exactly "E2E_WEB_FETCH_ASK_OK".`,
    `- If a user message starts with "WEB_FETCH_AUTO:", call only web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". After the tool returns, reply exactly "E2E_WEB_FETCH_AUTO_OK".`,
    '- If a user message starts with "SHELL_READ:", call only shell_cmd with command "pwd" and no parameters. If the tool result mentions "permission level (read)", reply exactly "E2E_SHELL_READ_BLOCKED".',
    '- If a user message starts with "SHELL_ASK:", call only shell_cmd with command "pwd" and no parameters. After the tool returns, reply exactly "E2E_SHELL_ASK_OK".',
    '- If a user message starts with "SHELL_AUTO:", call only shell_cmd with command "pwd" and no parameters. After the tool returns, reply exactly "E2E_SHELL_AUTO_OK".',
    `- If a user message starts with "SHELL_RISKY_AUTO:", call only shell_cmd with command "rm" and parameters ["${HITL_DELETE_TARGET}"]. After the tool returns, reply exactly "E2E_SHELL_RISKY_AUTO_OK".`,
    `- If a user message starts with "CREATE_AGENT_READ:", call only create_agent with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human". If the tool result mentions "permission level (read)", reply exactly "E2E_CREATE_AGENT_READ_BLOCKED".`,
    `- If a user message starts with "CREATE_AGENT_ASK:", call only create_agent with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human". After the tool returns, reply exactly "E2E_CREATE_AGENT_ASK_OK".`,
    `- If a user message starts with "CREATE_AGENT_AUTO:", call only create_agent with name "${CREATE_AGENT_AUTO_NAME}", role "E2E coverage agent", and nextAgent "human". After the tool returns, reply exactly "E2E_CREATE_AGENT_AUTO_OK".`,
    `- If a user message starts with "LOAD_SKILL_READ:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_LOAD_SKILL_READ_BLOCKED".`,
    `- If a user message starts with "LOAD_SKILL_ASK:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_LOAD_SKILL_ASK_OK".`,
    `- If a user message starts with "LOAD_SKILL_AUTO:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_LOAD_SKILL_AUTO_OK".`,
    '- If a user message starts with "HITL:", call the tool "human_intervention_request" with question "Approve the E2E request?" and options ["Approve","Decline"]. Do not answer with plain text first.',
    `- If a user message includes the exact filename "${HITL_DELETE_TARGET}" and asks to use shell_cmd, do not call human_intervention_request. Call only shell_cmd with command "rm" and parameters ["${HITL_DELETE_TARGET}"].`,
    `- After that shell_cmd completes successfully, reply with exactly "${HITL_SHELL_SUCCESS_TOKEN}".`,
    '- After a HITL option is submitted, reply with one short sentence that starts with "E2E_RESUMED:" and includes the chosen option label.',
    '- Keep responses concise.',
  ].join('\n');
}

export function createSeededAgentPayload(): Record<string, unknown> {
  return {
    id: TEST_AGENT_ID,
    name: TEST_AGENT_NAME,
    type: 'assistant',
    provider: 'google',
    model: TEST_AGENT_MODEL,
    autoReply: true,
    systemPrompt: buildSeededAgentSystemPrompt(),
  };
}
