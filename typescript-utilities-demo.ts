/**
 * TypeScript Utility Types Demo
 * 
 * This file demonstrates the enhanced type safety and reduced duplication 
 * achieved through the implementation of advanced TypeScript utility types.
 */

import type {
  // Base interfaces
  BaseAgentParams,
  BaseWorldParams,

  // Enhanced parameter types
  CreateAgentParams,
  UpdateAgentParams,
  CreateWorldParams,
  UpdateWorldParams,

  // Derived types
  Agent,
  AgentInfo,
  AgentStorage,
  World,
  WorldStorage,

  // Event system types
  EventPayloadMap,
  TypedEvent,
  MessageEventPayload,

  // LLM configuration types
  ProviderConfigMap,
  OpenAIConfig,
  AzureConfig
} from './core/types';

import {
  LLMProvider,
  EventType,
  SenderType
} from './core/types';

// ====================
// 1. Parameter Consolidation Benefits
// ====================

/**
 * Before: Separate interfaces with potential drift
 * After: Single source of truth with derived types
 */

// ✅ Type-safe agent creation - extends base
const createParams: CreateAgentParams = {
  name: "Assistant",
  type: "conversational",
  provider: LLMProvider.OPENAI,
  model: "gpt-4",
  systemPrompt: "You are a helpful assistant",
  // id is optional - auto-generated if not provided
};

// ✅ Type-safe partial updates - all fields optional
const updateParams: UpdateAgentParams = {
  systemPrompt: "Updated prompt",
  status: "active"
  // name, type, provider, model all optional
};

// ✅ Compile-time validation: this would error
// const invalidUpdate: UpdateAgentParams = {
//   invalidField: "error" // ❌ TypeScript error - property doesn't exist
// };

// ====================
// 2. AgentInfo Derivation Benefits  
// ====================

/**
 * Before: Manual AgentInfo definition could drift from Agent
 * After: AgentInfo automatically derives from Agent interface
 */

// ✅ This function automatically gets new Agent properties
function displayAgentInfo(info: AgentInfo): string {
  // AgentInfo automatically includes id, name, type, model, status, etc.
  // Plus computed field: memorySize
  return `${info.name} (${info.model}) - Memory: ${info.memorySize} messages`;
}

// ✅ If Agent interface changes, AgentInfo stays in sync
// No manual updates needed!

// ====================
// 3. Storage Type Safety
// ====================

/**
 * Before: Risk of accidentally including methods in storage
 * After: Storage types exclude all methods automatically
 */

// ✅ Storage-safe agent - no methods, no circular references
function saveAgentToDatabase(agent: AgentStorage): void {
  // agent has all data properties but no methods
  // Guaranteed safe for JSON serialization
  console.log(`Saving agent ${agent.name} to database`);
}

// ✅ Storage-safe world - minimal data only
function saveWorldToFile(world: WorldStorage): void {
  // Only id, name, description, turnLimit - no EventEmitter or agents Map
  console.log(`Saving world ${world.name} to file`);
}

// ====================
// 4. Event System Type Safety
// ====================

/**
 * Before: Union types with potential payload mismatches
 * After: Type-safe events with mapped payload types
 */

// ✅ Type-safe event creation
function createMessageEvent(): TypedEvent<EventType.MESSAGE> {
  return {
    id: "msg-123",
    type: EventType.MESSAGE,
    timestamp: new Date().toISOString(),
    sender: "user",
    senderType: "human" as const,
    payload: {
      content: "Hello world",
      sender: "user"
    } // ✅ TypeScript knows this must be MessageEventPayload
  };
}

// ✅ Type-safe event handling
function handleEvent<T extends EventType>(event: TypedEvent<T>): void {
  // TypeScript knows the exact payload type based on event type
  if (event.type === EventType.MESSAGE) {
    // event.payload is MessageEventPayload
    console.log(`Message: ${event.payload.content} from ${event.payload.sender}`);
  }
}

// ====================
// 5. LLM Configuration Type Safety
// ====================

/**
 * Before: Manual interface definitions
 * After: Derived from base with Required/Partial utility types
 */

// ✅ Type-safe configuration mapping
function configureProviders(): void {
  // Each provider has its exact required fields
  const openaiConfig: ProviderConfigMap[LLMProvider.OPENAI] = {
    apiKey: "sk-..." // ✅ Only apiKey required
  };

  const azureConfig: ProviderConfigMap[LLMProvider.AZURE] = {
    apiKey: "key",
    endpoint: "https://...",
    deployment: "gpt-4",
    apiVersion: "2023-12-01" // ✅ Optional
  };

  // ❌ This would error - missing required fields
  // const invalidAzure: AzureConfig = {
  //   apiKey: "key" // ❌ Missing endpoint and deployment
  // };
}

// ====================
// 6. Compile-Time Validation Examples
// ====================

/**
 * These examples show how TypeScript catches errors at compile time
 */

// ✅ Valid base parameters
const validBase: BaseAgentParams = {
  name: "Test",
  type: "conversational",
  provider: LLMProvider.OPENAI,
  model: "gpt-4"
};

// ✅ Valid create parameters (extends base)
const validCreate: CreateAgentParams = {
  ...validBase,
  id: "test-agent" // Optional additional field
};

// ✅ Valid update parameters (partial base)
const validUpdate: UpdateAgentParams = {
  name: "Updated Test" // Only updating name
};

// ====================
// 7. Type Relationship Guarantees
// ====================

/**
 * The utility types guarantee these relationships always hold:
 */

// ✅ CreateAgentParams always extends BaseAgentParams
// ✅ UpdateAgentParams is always Partial<BaseAgentParams> + status
// ✅ AgentInfo is always a subset of Agent properties
// ✅ AgentStorage never includes methods from Agent
// ✅ Event payloads always match their event types
// ✅ LLM configs always have their required fields

export {
  // Export for potential testing
  createParams,
  updateParams,
  displayAgentInfo,
  saveAgentToDatabase,
  saveWorldToFile,
  createMessageEvent,
  handleEvent,
  configureProviders
};

/**
 * Benefits Summary:
 * 
 * 1. ✅ Single Source of Truth: Base interfaces prevent drift
 * 2. ✅ Automatic Consistency: Derived types stay in sync
 * 3. ✅ Compile-Time Safety: TypeScript catches type errors
 * 4. ✅ Reduced Duplication: No manual interface copying
 * 5. ✅ Clear Relationships: Explicit type dependencies
 * 6. ✅ Better IDE Support: Enhanced autocomplete and error detection
 * 7. ✅ Storage Safety: Method-free types for persistence
 * 8. ✅ Event Type Safety: Payload types match event types
 * 9. ✅ Configuration Safety: Required fields enforced per provider
 * 10. ✅ Future-Proof: Changes propagate automatically
 */
