# Requirement: Pluggable Storage Architecture

**Objective:** Refactor the storage layer to use a pluggable interface-based architecture. This will allow `WorldStorage` and `AgentStorage` to have different underlying persistence mechanisms (e.g., file system, database, web API, browser storage) that can be easily swapped while maintaining full compatibility with existing functionality.

## Key Components

### 1. `WorldStorageInterface`

An interface defining the contract for all world-related data operations, matching current `world-storage.ts` function signatures.

**Path:** `core/world-storage.ts`

**Interface Definition:**

```typescript
export interface WorldStorageInterface {
  // Core world operations
  saveWorldToDisk(rootPath: string, worldData: WorldData): Promise<void>;
  loadWorldFromDisk(rootPath: string, worldId: string): Promise<WorldData | null>;
  deleteWorldFromDisk(rootPath: string, worldId: string): Promise<boolean>;
  loadAllWorldsFromDisk(rootPath: string): Promise<WorldData[]>;
  worldExistsOnDisk(rootPath: string, worldId: string): Promise<boolean>;
  
  // Directory operations
  getWorldDir(rootPath: string, worldId: string): string;
  ensureWorldDirectory(rootPath: string, worldId: string): Promise<void>;
}
```

### 2. `AgentStorageInterface`

An interface defining the contract for all agent-related data operations, including advanced features like batch operations, retry mechanisms, and integrity validation.

**Path:** `core/agent-storage.ts`

**Interface Definition:**

```typescript
export interface AgentStorageInterface {
  // Core agent operations
  saveAgentToDisk(rootPath: string, worldId: string, agent: Agent): Promise<void>;
  saveAgentConfigToDisk(rootPath: string, worldId: string, agent: Agent): Promise<void>;
  saveAgentMemoryToDisk(rootPath: string, worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;
  loadAgentFromDisk(rootPath: string, worldId: string, agentId: string): Promise<Agent | null>;
  deleteAgentFromDisk(rootPath: string, worldId: string, agentId: string): Promise<boolean>;
  agentExistsOnDisk(rootPath: string, worldId: string, agentId: string): Promise<boolean>;
  
  // Advanced operations
  loadAgentFromDiskWithRetry(rootPath: string, worldId: string, agentId: string, options?: AgentLoadOptions): Promise<Agent | null>;
  loadAllAgentsFromDisk(rootPath: string, worldId: string): Promise<Agent[]>;
  loadAllAgentsFromDiskBatch(rootPath: string, worldId: string, options?: AgentLoadOptions): Promise<BatchLoadResult>;
  
  // Data integrity and recovery
  validateAgentIntegrity(rootPath: string, worldId: string, agentId: string): Promise<AgentIntegrityResult>;
  repairAgentData(rootPath: string, worldId: string, agentId: string): Promise<boolean>;
  archiveAgentMemory(rootPath: string, worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;
  
  // Directory operations
  getAgentDir(rootPath: string, worldId: string, agentId: string): string;
  ensureAgentDirectory(rootPath: string, worldId: string, agentId: string): Promise<void>;
}
```

### 3. Concrete Implementations

The implementation strategy preserves existing functionality while adding pluggable architecture.

#### **Phase 1: File System Implementations**

*   **`FileSystemWorldStorage implements WorldStorageInterface`**
    *   Wraps existing `world-storage.ts` functions in a class-based implementation
    *   **Path:** `core/world-storage-file.ts`
    *   Maintains backward compatibility with current function-based approach

*   **`FileSystemAgentStorage implements AgentStorageInterface`**
    *   Wraps existing `agent-storage.ts` functions in a class-based implementation
    *   **Path:** `core/agent-storage-file.ts`  
    *   Preserves advanced features (batch operations, retry mechanisms, integrity validation)

#### **Phase 2: Browser Storage Implementations**

*   **`BrowserWorldStorage implements WorldStorageInterface`**
    *   Uses IndexedDB/localStorage for browser environments
    *   **Path:** `core/world-storage-browser.ts`
    *   Integrates with existing `public/storage.js` infrastructure

*   **`BrowserAgentStorage implements AgentStorageInterface`**
    *   Browser-compatible agent storage using IndexedDB
    *   **Path:** `core/agent-storage-browser.ts`
    *   Maintains data format compatibility with file system storage

## Migration Strategy

#### **Backward Compatibility**
*   Existing `world-storage.ts` and `agent-storage.ts` function exports remain unchanged
*   Current manager modules continue working without modification during transition
*   New interface implementations are additive, not replacing

#### **Dependency Injection Framework**
```typescript
// Storage provider registry
export interface StorageProviders {
  worldStorage: WorldStorageInterface;
  agentStorage: AgentStorageInterface;
}

// Configuration mechanism
export function configureStorageProviders(providers: StorageProviders): void;

// Default providers (file system for Node.js, browser storage for browser)
export function getDefaultStorageProviders(): StorageProviders;
```

#### **Environment Detection**
*   Automatic provider selection based on environment (Node.js vs browser)
*   Override mechanism for testing and custom implementations
*   Graceful fallback to existing function-based approach if providers not configured

## Browser Compatibility Integration

#### **Unified Storage Interface**
*   Browser implementations use existing `public/storage.js` infrastructure
*   File format compatibility ensures seamless data exchange
*   Automatic synchronization between IndexedDB and file system when possible

#### **Dynamic Import Preservation**
*   Maintains current browser/Node.js separation patterns
*   Storage providers loaded conditionally based on environment
*   No-op implementations for unavailable storage methods in browser

## Type System Requirements

### **Current Type Compatibility**
*   Use existing `WorldData` type (not deprecated `WorldConfig`)
*   Use existing `AgentMessage[]` type for memory operations
*   Preserve all existing type definitions and imports
*   Maintain compatibility with `Agent`, `BatchLoadResult`, `AgentLoadOptions`, `AgentIntegrityResult` types

### **Interface Type Safety**
*   All interface methods must match current function signatures exactly
*   Generic types for storage implementations to support different backends
*   Proper error type definitions for storage-specific failures

## Testing Requirements

### **Backward Compatibility Testing**
*   All existing tests must continue passing without modification
*   Integration tests for both function-based and interface-based approaches
*   Performance benchmarking to ensure no regression

### **Multi-Implementation Testing**
*   Test suite runs against all storage implementations
*   Mock implementations for testing isolation
*   Cross-platform compatibility validation (Node.js/browser)

## Performance Requirements

### **Zero Runtime Overhead**
*   Interface abstraction must not impact performance
*   Existing direct function calls preserved during transition
*   Lazy loading of storage implementations

### **Memory Efficiency**
*   Single instance storage providers (singleton pattern)
*   Minimal memory overhead for abstraction layer
*   Efficient data serialization/deserialization

## Risk Mitigation

### **Feature Flags**
*   Gradual rollout mechanism for interface-based storage
*   Fallback to existing implementation if interface fails
*   Runtime switching between storage backends

### **Monitoring**
*   Error tracking for storage operation failures
*   Performance monitoring for regression detection
*   Usage analytics for adoption tracking
