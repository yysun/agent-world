/**
 * Renderer App Constants
 * Purpose:
 * - Centralize renderer constants used by App orchestration and utility modules.
 *
 * Key Features:
 * - Exposes UI limits, defaults, provider options, and drag-region styles.
 * - Provides shared defaults for world, agent, and system settings.
 *
 * Implementation Notes:
 * - Keep values behavior-compatible with legacy inline definitions from App.jsx.
 * - Prefer importing from this module over redefining constants in feature files.
 *
 * Recent Changes:
 * - 2026-02-16: Extracted App.jsx constants into a reusable constants module.
 */

export const THEME_STORAGE_KEY = 'agent-world-desktop-theme';
export const COMPOSER_MAX_ROWS = 5;
export const DEFAULT_TURN_LIMIT = 5;
export const MIN_TURN_LIMIT = 1;
export const MAX_HEADER_AGENT_AVATARS = 8;
export const DEFAULT_WORLD_CHAT_LLM_PROVIDER = 'ollama';
export const DEFAULT_WORLD_CHAT_LLM_MODEL = 'llama3.2:3b';
export const MAX_STATUS_AGENT_ITEMS = 6;

export const DEFAULT_AGENT_FORM = {
  id: '',
  name: '',
  autoReply: true,
  provider: 'ollama',
  model: 'llama3.1:8b',
  systemPrompt: '',
  temperature: '',
  maxTokens: ''
};

export const AGENT_PROVIDER_OPTIONS = ['openai', 'anthropic', 'google', 'xai', 'azure', 'openai-compatible', 'ollama'];

export const WORLD_PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'azure', label: 'Azure' },
  { value: 'ollama', label: 'Ollama' }
];

export const DRAG_REGION_STYLE = { WebkitAppRegion: 'drag' };
export const NO_DRAG_REGION_STYLE = { WebkitAppRegion: 'no-drag' };
export const HUMAN_SENDER_VALUES = new Set(['human', 'user', 'you']);

export const DEFAULT_SYSTEM_SETTINGS = {
  storageType: '',
  dataPath: '',
  sqliteDatabase: '',
  enableGlobalSkills: true,
  enableProjectSkills: true,
  disabledGlobalSkillIds: [],
  disabledProjectSkillIds: [],
};
