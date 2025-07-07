/**
 * Canonical Agent Data Interface Documentation
 * 
 * This defines the standardized agent structure that should be used across all components.
 * Eliminates the need for property fallbacks and ensures consistent data handling.
 */

/**
 * @typedef {Object} CanonicalAgent
 * @property {string} id - kebab-case identifier
 * @property {string} name - display name
 * @property {string} type - agent type (default: 'assistant')
 * @property {string} provider - LLM provider
 * @property {string} model - model name
 * @property {string} systemPrompt - STANDARDIZED - single source of truth
 * @property {number} [temperature] - model temperature
 * @property {number} [maxTokens] - max tokens per call
 * @property {'active'|'inactive'|'error'} [status] - agent status
 * @property {Date} [createdAt] - creation timestamp
 * @property {Date} [lastActive] - last active timestamp
 * @property {number} llmCallCount - number of LLM calls made
 * @property {Date} [lastLLMCall] - last LLM call timestamp
 * @property {AgentMessage[]} memory - full memory array
 * @property {number} memorySize - computed size for display
 */

/**
 * @typedef {Object} AgentCreateRequest
 * @property {string} name - agent name
 * @property {string} [systemPrompt] - optional system prompt
 * @property {string} [description] - used if systemPrompt not provided
 * @property {string} [type] - defaults to 'assistant'
 * @property {string} [provider] - defaults to configured provider
 * @property {string} [model] - defaults to configured model
 * @property {number} [temperature] - model temperature
 * @property {number} [maxTokens] - max tokens per call
 */

/**
 * @typedef {Object} AgentUpdateRequest
 * @property {string} [systemPrompt] - system prompt update
 * @property {'active'|'inactive'|'error'} [status] - agent status
 * @property {number} [temperature] - model temperature
 * @property {number} [maxTokens] - max tokens per call
 */

/**
 * @typedef {Object} AgentModalState
 * @property {boolean} isOpen - modal open state
 * @property {'create'|'edit'} mode - modal mode
 * @property {CanonicalAgent|null} agent - agent being edited
 * @property {boolean} isLoading - loading state
 * @property {string|null} error - error message
 * @property {string[]} validationErrors - validation error messages
 */

/**
 * @typedef {Object} AgentFormValidation
 * @property {boolean} isValid - overall validation state
 * @property {Object} errors - validation errors
 * @property {string} [errors.name] - name validation error
 * @property {string} [errors.systemPrompt] - system prompt validation error
 * @property {string} [errors.model] - model validation error
 */

/**
 * @typedef {Object} AgentMessage
 * @property {'system'|'user'|'assistant'} role - message role
 * @property {string} content - message content
 * @property {Date} [createdAt] - creation timestamp
 * @property {string} [sender] - message sender
 */

// LLM Provider constants
export const LLM_PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  AZURE: 'azure',
  GOOGLE: 'google',
  XAI: 'xai',
  OPENAI_COMPATIBLE: 'openai-compatible',
  OLLAMA: 'ollama'
};

/**
 * Agent validation functions
 */
export const AgentValidation = {
  /**
   * Validates agent data
   * @param {CanonicalAgent} agent - agent to validate
   * @returns {AgentFormValidation} validation result
   */
  validateAgent(agent) {
    const errors = {};
    let isValid = true;

    if (!agent.name?.trim()) {
      errors.name = 'Agent name is required';
      isValid = false;
    } else if (agent.name.length > 50) {
      errors.name = 'Agent name must be 50 characters or less';
      isValid = false;
    }

    if (agent.systemPrompt && agent.systemPrompt.length > 5000) {
      errors.systemPrompt = 'System prompt must be 5000 characters or less';
      isValid = false;
    }

    if (!agent.model?.trim()) {
      errors.model = 'Model is required';
      isValid = false;
    }

    return { isValid, errors };
  },

  /**
   * Checks if agent is new (no id)
   * @param {CanonicalAgent} agent - agent to check
   * @returns {boolean} true if agent is new
   */
  isNewAgent(agent) {
    return !agent?.id;
  }
};
