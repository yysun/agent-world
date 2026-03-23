/**
 * Renderer App Defaults
 * Purpose:
 * - Centralize renderer domain defaults and provider option sets for worlds, agents, and persisted settings.
 *
 * Key Features:
 * - World/provider defaults and option lists.
 * - Agent creation defaults.
 * - Persisted desktop system settings defaults.
 *
 * Implementation Notes:
 * - Keep generic UI constants in `ui-constants.ts`.
 * - Keep values behavior-compatible with prior renderer defaults.
 *
 * Recent Changes:
 * - 2026-03-23: Split domain defaults out of the mixed `app-constants` module.
 */

export const DEFAULT_TURN_LIMIT = 5;
export const MIN_TURN_LIMIT = 1;
export const DEFAULT_WORLD_CHAT_LLM_PROVIDER = 'ollama';
export const DEFAULT_WORLD_CHAT_LLM_MODEL = 'llama3.2:3b';

export const WORLD_PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'azure', label: 'Azure' },
  { value: 'ollama', label: 'Ollama' }
];

export const DEFAULT_AGENT_FORM = {
  id: '',
  name: '',
  autoReply: false,
  provider: DEFAULT_WORLD_CHAT_LLM_PROVIDER,
  model: DEFAULT_WORLD_CHAT_LLM_MODEL,
  systemPrompt: `You are agent X. Your role is ...

Always respond in exactly this structure:
@<next agent>
{Your response}`,
  temperature: '',
  maxTokens: ''
};

export const AGENT_PROVIDER_OPTIONS = WORLD_PROVIDER_OPTIONS.map((provider) => provider.value);

export const HUMAN_SENDER_VALUES = new Set(['human', 'user', 'you']);

export const DEFAULT_SYSTEM_SETTINGS = {
  storageType: '',
  dataPath: '',
  sqliteDatabase: '',
  showToolMessages: true,
  allowPrereleaseUpdates: false,
  enableGlobalSkills: true,
  enableProjectSkills: true,
  disabledGlobalSkillIds: [],
  disabledProjectSkillIds: [],
};