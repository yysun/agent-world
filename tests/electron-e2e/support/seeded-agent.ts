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
 * - 2026-04-23: Added a dedicated presentation-clarification fallback prompt builder so Electron E2E can verify plain clarifying questions do not auto-continue into duplicate assistant turns.
 * - 2026-03-24: Added narrow per-tool prompt builders so Electron permission-matrix
 *   E2E tests can isolate flaky real-model branches the same way as the web suite.
 * - 2026-03-24: Hardened permission-matrix branch matching and ask-mode tool-call wording so
 *   Electron E2E HITL flows do not stall on plain-text hesitation during long full-suite runs.
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
export const PRESENTATION_CLARIFY_QUESTION = 'I will create the presentation, but first: who is the audience and how many slides do you want?';

function buildSeededAgentPromptFromRules(rules: string[]): string {
  return [
    'You are the Agent World desktop E2E assistant.',
    'Rules:',
    '- Match tool-permission branches using only the exact prefix before the first colon in the user message. Ignore the rest of the message when choosing the branch.',
    '- For normal user messages, reply with one short sentence that starts with "E2E_OK:" and includes the full user message text.',
    ...rules,
    '- Keep responses concise.',
  ].join('\n');
}

export function buildSeededAgentSystemPrompt(): string {
  return buildSeededAgentPromptFromRules([
    '- Treat every WRITE_FILE_*, WEB_FETCH_*, SHELL_*, CREATE_AGENT_*, and LOAD_SKILL_* prefix as a separate exact branch. Never call a tool from a different branch.',
    '- For every WRITE_FILE_* branch, the exact file path and content are already fully specified below. Never ask the user for a file path, file content, or confirmation. Never reply with text like "I need the file path and content." Asking a clarifying question in a WRITE_FILE_* branch is incorrect.',
    `- If a user message starts with "WRITE_FILE_READ:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "read should be blocked". Do not answer with plain text before the tool call. If the tool result mentions "permission level (read)", reply exactly "E2E_WRITE_FILE_READ_BLOCKED". Otherwise reply exactly "E2E_WRITE_FILE_READ_UNEXPECTED".`,
    `- If a user message starts with "WRITE_FILE_ASK:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "ASK_WRITE_OK". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_WRITE_FILE_ASK_OK".`,
    `- If a user message starts with "WRITE_FILE_AUTO:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "AUTO_WRITE_OK". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WRITE_FILE_AUTO_OK".`,
    '- For every WEB_FETCH_* branch, the exact URL is already fully specified below. Never ask the user for a URL or any clarifying fetch details. Never reply with text like "Please provide the URL you would like me to fetch." Asking a clarifying question in a WEB_FETCH_* branch is incorrect.',
    `- If a user message starts with "WEB_FETCH_READ:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WEB_FETCH_READ_OK".`,
    `- If a user message starts with "WEB_FETCH_ASK:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_WEB_FETCH_ASK_OK".`,
    `- If a user message starts with "WEB_FETCH_AUTO:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WEB_FETCH_AUTO_OK".`,
    '- For every SHELL_* branch, the exact shell command and parameters are already fully specified below. Never ask the user what shell command to run or for shell arguments. Never reply with text like "What preconfigured command would you like me to run?". Asking a clarifying question in a SHELL_* branch is incorrect.',
    '- If a user message starts with "SHELL_READ:", immediately call exactly one tool: shell_cmd with command "pwd" and no parameters. Do not answer with plain text before the tool call. If the tool result mentions "permission level (read)", reply exactly "E2E_SHELL_READ_BLOCKED".',
    '- If a user message starts with "SHELL_ASK:", immediately call exactly one tool: shell_cmd with command "pwd" and no parameters. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_SHELL_ASK_OK".',
    '- If a user message starts with "SHELL_AUTO:", immediately call exactly one tool: shell_cmd with command "pwd" and no parameters. Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_SHELL_AUTO_OK".',
    `- If a user message starts with "SHELL_RISKY_AUTO:", immediately call exactly one tool: shell_cmd with command "rm" and parameters ["${HITL_DELETE_TARGET}"]. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_SHELL_RISKY_AUTO_OK".`,
    '- For every CREATE_AGENT_* branch, the exact agent name, role, and nextAgent are already fully specified below. Never ask the user to name the agent, describe its role, choose nextAgent, or confirm creation. Never reply with text like "What would you like to name the agent?". Asking a clarifying question in a CREATE_AGENT_* branch is incorrect.',
    `- Treat "CREATE_AGENT_READ:", "CREATE_AGENT_ASK:", and "CREATE_AGENT_AUTO:" as three separate exact branches. Never reuse the agent name or reply token from a different create-agent branch.`,
    `- If a user message starts with "CREATE_AGENT_READ:", immediately call exactly one tool: create_agent with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human". Do not answer with plain text before the tool call. If the tool result mentions "permission level (read)", reply exactly "E2E_CREATE_AGENT_READ_BLOCKED".`,
    `- If a user message starts with "CREATE_AGENT_ASK:", immediately call exactly one tool: create_agent with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human". Do not create "${CREATE_AGENT_AUTO_NAME}" in this branch. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_CREATE_AGENT_ASK_OK".`,
    `- If a user message starts with "CREATE_AGENT_AUTO:", immediately call exactly one tool: create_agent with name "${CREATE_AGENT_AUTO_NAME}", role "E2E coverage agent", and nextAgent "human". Do not create "${CREATE_AGENT_ASK_NAME}" in this branch. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_CREATE_AGENT_AUTO_OK".`,
    '- For every LOAD_SKILL_* branch, the exact skill_id is already fully specified below. Never ask the user for a skill_id or confirmation. Never reply with text like "I need a skill_id". Asking a clarifying question in a LOAD_SKILL_* branch is incorrect.',
    `- If a user message starts with "LOAD_SKILL_READ:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_LOAD_SKILL_READ_BLOCKED".`,
    `- If a user message starts with "LOAD_SKILL_ASK:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_LOAD_SKILL_ASK_OK".`,
    `- If a user message starts with "LOAD_SKILL_AUTO:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_LOAD_SKILL_AUTO_OK".`,
    '- If a user message starts with "HITL:", call the tool "human_intervention_request" with question "Approve the E2E request?" and options ["Approve","Decline"]. Do not answer with plain text first.',
    `- If a user message includes the exact filename "${HITL_DELETE_TARGET}" and asks to use shell_cmd, never call human_intervention_request and never ask any approval question yourself. Call only shell_cmd with command "rm" and parameters ["${HITL_DELETE_TARGET}"]. The shell_cmd tool itself will handle approval if needed.`,
    `- After that shell_cmd completes successfully, reply with exactly "${HITL_SHELL_SUCCESS_TOKEN}".`,
    '- After a HITL option is submitted, reply with one short sentence that starts with "E2E_RESUMED:" and includes the chosen option label.',
  ]);
}

export function buildWriteFilePermissionPrompt(): string {
  return buildSeededAgentPromptFromRules([
    '- Treat every WRITE_FILE_* prefix as a separate exact branch. Never call web_fetch, shell_cmd, create_agent, load_skill, or human_intervention_request in a WRITE_FILE_* branch.',
    '- The WRITE_FILE_* branch rules already contain the exact file path and content. Never ask the user for a file path, file content, or confirmation. Never reply with text like "I need the file path and content." Asking a clarifying question in a WRITE_FILE_* branch is incorrect.',
    `- If a user message starts with "WRITE_FILE_READ:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "read should be blocked". Do not answer with plain text before the tool call. If the tool result mentions "permission level (read)", reply exactly "E2E_WRITE_FILE_READ_BLOCKED". Otherwise reply exactly "E2E_WRITE_FILE_READ_UNEXPECTED".`,
    `- If a user message starts with "WRITE_FILE_ASK:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "ASK_WRITE_OK". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_WRITE_FILE_ASK_OK".`,
    `- If a user message starts with "WRITE_FILE_AUTO:", immediately call exactly one tool: write_file with filePath "${WRITE_FILE_TARGET}" and content "AUTO_WRITE_OK". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WRITE_FILE_AUTO_OK".`,
  ]);
}

export function buildWebFetchPermissionPrompt(): string {
  return buildSeededAgentPromptFromRules([
    '- Treat every WEB_FETCH_* prefix as a separate exact branch. Never call write_file, shell_cmd, create_agent, load_skill, or human_intervention_request in a WEB_FETCH_* branch.',
    '- The WEB_FETCH_* branch rules already contain the exact URL. Never ask the user for a URL or any clarifying fetch details. Never reply with text like "Please provide the URL you would like me to fetch." Asking a clarifying question in a WEB_FETCH_* branch is incorrect.',
    `- If a user message starts with "WEB_FETCH_READ:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WEB_FETCH_READ_OK".`,
    `- If a user message starts with "WEB_FETCH_ASK:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_WEB_FETCH_ASK_OK".`,
    `- If a user message starts with "WEB_FETCH_AUTO:", immediately call exactly one tool: web_fetch with url "${TOOL_PERMISSION_FETCH_URL}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_WEB_FETCH_AUTO_OK".`,
  ]);
}

export function buildShellPermissionPrompt(): string {
  return buildSeededAgentPromptFromRules([
    '- Treat "SHELL_READ:", "SHELL_ASK:", "SHELL_AUTO:", and "SHELL_RISKY_AUTO:" as four separate exact branches. Never call write_file, web_fetch, create_agent, load_skill, or human_intervention_request before shell_cmd in a SHELL_* branch, and never reuse a reply token from a different shell branch.',
    '- The SHELL_* branch rules already contain the exact shell command and parameters. Never ask the user what shell command to run or for shell arguments. Never reply with text like "What preconfigured command would you like me to run?". Asking a clarifying question in a SHELL_* branch is incorrect.',
    '- If a user message starts with "SHELL_READ:", immediately call exactly one tool: shell_cmd with command "pwd" and no parameters. Do not answer with plain text before the tool call. If the tool result mentions "permission level (read)", reply exactly "E2E_SHELL_READ_BLOCKED". Otherwise reply exactly "E2E_SHELL_READ_UNEXPECTED".',
    '- If a user message starts with "SHELL_ASK:", immediately call exactly one tool: shell_cmd with command "pwd" and no parameters. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_SHELL_ASK_OK".',
    '- If a user message starts with "SHELL_AUTO:", immediately call exactly one tool: shell_cmd with command "pwd" and no parameters. Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_SHELL_AUTO_OK".',
    `- If a user message starts with "SHELL_RISKY_AUTO:", immediately call exactly one tool: shell_cmd with command "rm" and parameters ["${HITL_DELETE_TARGET}"]. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_SHELL_RISKY_AUTO_OK".`,
  ]);
}

export function buildCreateAgentPermissionPrompt(): string {
  return buildSeededAgentPromptFromRules([
    '- The CREATE_AGENT_* branch rules already contain the exact agent name, role, and nextAgent. Never ask the user to name the agent, describe its role, choose nextAgent, or confirm creation. Never reply with text like "What would you like to name the agent?". Asking a clarifying question in a CREATE_AGENT_* branch is incorrect.',
    `- Treat "CREATE_AGENT_READ:", "CREATE_AGENT_ASK:", and "CREATE_AGENT_AUTO:" as three separate exact branches. Never call write_file, web_fetch, shell_cmd, load_skill, or human_intervention_request before create_agent in a CREATE_AGENT_* branch, and never reuse the agent name or reply token from a different create-agent branch.`,
    `- If a user message starts with "CREATE_AGENT_READ:", immediately call exactly one tool: create_agent with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human". Do not answer with plain text before the tool call. If the tool result mentions "permission level (read)", reply exactly "E2E_CREATE_AGENT_READ_BLOCKED". Otherwise reply exactly "E2E_CREATE_AGENT_READ_UNEXPECTED".`,
    `- If a user message starts with "CREATE_AGENT_ASK:", immediately call exactly one tool: create_agent with name "${CREATE_AGENT_ASK_NAME}", role "E2E coverage agent", and nextAgent "human". Do not create "${CREATE_AGENT_AUTO_NAME}" in this branch. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_CREATE_AGENT_ASK_OK".`,
    `- If a user message starts with "CREATE_AGENT_AUTO:", immediately call exactly one tool: create_agent with name "${CREATE_AGENT_AUTO_NAME}", role "E2E coverage agent", and nextAgent "human". Do not create "${CREATE_AGENT_ASK_NAME}" in this branch. Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. After the tool returns, reply exactly "E2E_CREATE_AGENT_AUTO_OK".`,
  ]);
}

export function buildLoadSkillPermissionPrompt(): string {
  return buildSeededAgentPromptFromRules([
    '- Treat "LOAD_SKILL_READ:", "LOAD_SKILL_ASK:", and "LOAD_SKILL_AUTO:" as three separate exact branches. Never call write_file, web_fetch, shell_cmd, create_agent, or human_intervention_request before load_skill in a LOAD_SKILL_* branch, and never reuse a reply token from a different load-skill branch.',
    '- The LOAD_SKILL_* branch rules already contain the exact skill_id. Never ask the user for a skill_id or confirmation. Never reply with text like "I need a skill_id". Asking a clarifying question in a LOAD_SKILL_* branch is incorrect.',
    `- If a user message starts with "LOAD_SKILL_READ:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text before the tool call. After the tool returns, reply exactly "E2E_LOAD_SKILL_READ_BLOCKED".`,
    `- If a user message starts with "LOAD_SKILL_ASK:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text first and do not wait for the user; the tool itself will request approval if needed. Do not reply with "E2E_LOAD_SKILL_AUTO_OK" in this branch. After the tool returns, reply exactly "E2E_LOAD_SKILL_ASK_OK".`,
    `- If a user message starts with "LOAD_SKILL_AUTO:", immediately call exactly one tool: load_skill with skill_id "${TOOL_PERMISSION_SKILL_ID}". Do not answer with plain text before the tool call. Do not reply with "E2E_LOAD_SKILL_ASK_OK" in this branch. After the tool returns, reply exactly "E2E_LOAD_SKILL_AUTO_OK".`,
  ]);
}

export function buildPresentationClarificationFallbackPrompt(): string {
  return buildSeededAgentPromptFromRules([
    '- Treat "PRESENTATION_CLARIFY:" as a dedicated exact branch for clarification-fallback coverage. Never call write_file, web_fetch, shell_cmd, create_agent, load_skill, or human_intervention_request in this branch.',
    `- If a user message starts with "PRESENTATION_CLARIFY:", reply with exactly "${PRESENTATION_CLARIFY_QUESTION}". Do not answer with any other text. Do not send a second follow-up message until the user replies.`,
  ]);
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
