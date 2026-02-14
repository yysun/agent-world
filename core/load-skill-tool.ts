/**
 * Load Skill Tool Module - Built-in tool for progressive skill instruction loading.
 *
 * Features:
 * - Exposes `load_skill` tool definition for model-visible tool catalogs
 * - Resolves skills by `skill_id` from core skill registry state
 * - Reads full SKILL.md content only on demand
 * - Returns structured success, not-found, and read-error payloads
 *
 * Implementation Notes:
 * - Uses registry metadata as source of truth for lookup and skill name/description
 * - Reads file content from registry-provided source path (no directory rescans)
 * - Keeps payload format deterministic for stable downstream parsing
 *
 * Recent Changes:
 * - 2026-02-14: Initial implementation of progressive `load_skill` built-in tool.
 */

import { promises as fs } from 'fs';
import {
  getSkill,
  getSkillSourcePath,
  waitForInitialSkillSync,
} from './skill-registry.js';

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildNotFoundResult(skillId: string): string {
  const escapedSkillId = escapeXmlText(skillId);
  return [
    `<skill_context id="${escapedSkillId}">`,
    '  <error>',
    `    Skill with id "${escapedSkillId}" was not found in the current registry.`,
    '  </error>',
    '</skill_context>',
  ].join('\n');
}

function buildReadErrorResult(skillId: string, message: string): string {
  const escapedSkillId = escapeXmlText(skillId);
  const escapedMessage = escapeXmlText(message);
  return [
    `<skill_context id="${escapedSkillId}">`,
    '  <error>',
    `    Failed to load SKILL.md for "${escapedSkillId}": ${escapedMessage}`,
    '  </error>',
    '</skill_context>',
  ].join('\n');
}

function buildSuccessResult(skillId: string, skillName: string, markdown: string): string {
  const escapedSkillId = escapeXmlText(skillId);
  const escapedSkillName = escapeXmlText(skillName);
  return [
    `<skill_context id="${escapedSkillId}">`,
    '  <instructions>',
    markdown,
    '  </instructions>',
    '',
    '  <execution_directive>',
    `    You are now operating under the specialized ${escapedSkillName} protocol.`,
    '    1. Prioritize the logic in <instructions> over generic behavior.',
    '    2. Use the data in <active_resources> to complete the user\'s specific request.',
    '    3. If the workflow is multi-step, explicitly state your plan before executing.',
    '  </execution_directive>',
    '</skill_context>',
  ].join('\n');
}

export function createLoadSkillToolDefinition() {
  return {
    description:
      'Load full SKILL.md instructions by skill_id from the skill registry. Use this when a request matches a listed skill.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: 'Skill ID from <available_skills>/<id> in the system prompt.',
        },
      },
      required: ['skill_id'],
      additionalProperties: false,
    },
    execute: async (args: any) => {
      await waitForInitialSkillSync();

      const requestedSkillId = typeof args?.skill_id === 'string' ? args.skill_id.trim() : '';
      if (!requestedSkillId) {
        return buildReadErrorResult('', 'Missing required parameter: skill_id');
      }

      const entry = getSkill(requestedSkillId);
      const sourcePath = getSkillSourcePath(requestedSkillId);
      if (!entry || !sourcePath) {
        return buildNotFoundResult(requestedSkillId);
      }

      try {
        const markdown = await fs.readFile(sourcePath, 'utf8');
        return buildSuccessResult(requestedSkillId, entry.skill_id, markdown);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return buildReadErrorResult(requestedSkillId, message);
      }
    },
  };
}
