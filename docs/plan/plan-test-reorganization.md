# Plan: Core Unit Test Files Reorganization

## Overview
Reorganize the three core unit test files to improve maintainability, reduce duplication, and create clearer separation of concerns.

## Current State Analysis

### Files to Reorganize
- [x] **`agent-events.test.ts`** (1,047 lines) - Tests agent event processing and message handling
- [x] **`agent-storage.test.ts`** (580 lines) - Tests agent storage operations with mocked file I/O  
- [x] **`processAgentMessage.test.ts`** (678 lines) - Tests the processAgentMessage function specifically

### Issues Identified
- [x] **Overlap**: `agent-events.test.ts` and `processAgentMessage.test.ts` both test message processing
- [x] **Size**: `agent-events.test.ts` is very large (1,047 lines) and tests multiple concerns
- [x] **Duplication**: Similar test patterns and mock setups are repeated across files
- [x] **Unclear boundaries**: The separation of concerns between the files is not clear

## Proposed Reorganization Structure

### New Directory Layout
```
tests/core/
├── agents/
│   ├── agent-events.test.ts          # Event subscription & publishing
│   ├── agent-message-processing.test.ts  # Message processing logic
│   ├── agent-response-logic.test.ts      # Response decision logic
│   └── agent-auto-mentions.test.ts       # Auto-mention utilities
├── storage/
│   ├── agent-storage.test.ts         # File I/O operations (moved)
│   └── storage-error-handling.test.ts    # Error scenarios
├── utilities/
│   ├── utils.test.ts                 # Core utilities (existing)
│   ├── mention-extraction.test.ts    # Mention parsing logic
│   └── message-formatting.test.ts    # Message formatting utilities
├── shared/
│   ├── mock-helpers.ts               # Centralized mocking (existing)
│   ├── test-data-builders.ts        # Test data creation
│   └── test-scenarios.ts            # Complex test scenarios
└── setup.ts                         # Global setup (existing)
```

## Detailed Implementation Plan (Ordered for Easy Execution)

### Phase 1: Infrastructure Setup (Low Risk, Foundation)
**Goal**: Create foundation without breaking existing tests

#### Step 1.1: Directory Structure ✅
- [x] Create new directory structure
```bash
mkdir -p tests/core/{agents,storage,utilities,shared}
```

#### Step 1.2: Enhanced Mock Infrastructure ✅
- [x] **shared/mock-setup.ts** (Comprehensive mocking)
  - [x] Global file I/O mocking (fs module)
  - [x] Agent storage mocking (all functions)
  - [x] LLM manager mocking (all API calls)
  - [x] External AI SDK mocking (OpenAI, Anthropic, etc.)
  - [x] Utility module mocking (crypto, path, events)
  - [x] Import path resolution helpers
  - [x] Mock validation utilities

- [x] **shared/mock-validation.ts** (Mock verification)
  - [x] Complete mock setup validation
  - [x] Mock functionality testing
  - [x] Import path validation
  - [x] Coverage reporting
  - [x] Reset validation
  - [x] Comprehensive validation suite

#### Step 1.3: Test Data Builders ✅
- [x] **shared/test-data-builders.ts** (~400 lines)
  - [x] Enhanced mock data builders (AgentTestBuilder, WorldTestBuilder, MessageTestBuilder)
  - [x] Complex scenario generators (TestDataPresets)
  - [x] Realistic conversation patterns (WorldMessageEventTestBuilder)
  - [x] Edge case configurations (builder pattern support)

- [x] **shared/test-scenarios.ts** (~500 lines)
  - [x] Multi-agent conversation flows (AgentScenarios, WorldScenarios)
  - [x] Error recovery scenarios (ErrorHandlingScenario)
  - [x] Performance test patterns (PerformanceScenarios)
  - [x] Integration test helpers (IntegrationScenarios)

#### Step 1.4: Validation of Enhanced Mocks ✅
- [x] Run mock validation suite
- [x] Verify test data builders work correctly
- [x] Test TypeScript compilation
- [x] Validate builder pattern functionality
- [x] Test mock function behavior

**Phase 1 Status: ✅ COMPLETE** - All shared infrastructure successfully created and validated.

### Phase 2: Simple Moves (Low Risk, No Content Changes)
**Goal**: Move existing complete files without modification

#### Step 2.1: Storage Migration
- [ ] **storage/agent-storage.test.ts** (moved, ~300 lines)
  - [ ] Move current agent-storage.test.ts to storage folder
  - [ ] Update import paths only
  - [ ] Verify tests still pass

#### Step 2.2: Utilities Migration  
- [ ] Move existing utils.test.ts to utilities/ folder
- [ ] Update import paths
- [ ] Verify tests still pass

### Phase 3: Utility Extraction (Medium Risk, Content Splitting)
**Goal**: Split utilities logically before tackling complex agent tests

#### Step 3.1: Extract Mention Logic
- [ ] **utilities/mention-extraction.test.ts** (~200 lines)
  - [ ] Extract `extractMentions` tests from utils.test.ts
  - [ ] Extract `extractParagraphBeginningMentions` tests from utils.test.ts
  - [ ] Edge cases and performance tests
  - [ ] Regex pattern validation

#### Step 3.2: Extract Message Formatting
- [ ] **utilities/message-formatting.test.ts** (~150 lines)
  - [ ] Extract `prepareMessagesForLLM` tests from utils.test.ts
  - [ ] Message transformation logic
  - [ ] Content sanitization
  - [ ] Format conversion

#### Step 3.3: Clean Up Original Utils
- [ ] Remove extracted content from original utils.test.ts
- [ ] Keep remaining utility tests (generateId, toKebabCase, etc.)
- [ ] Verify all tests pass

### Phase 4: Agent Test Reorganization (Higher Risk, Complex Splitting)
**Goal**: Split the most complex files last, when all infrastructure is ready

#### Step 4.1: Extract Auto-Mentions (Smallest Split First)
- [ ] **agents/agent-auto-mentions.test.ts** (~200 lines)
  - [ ] Extract from agent-events.test.ts: `hasAnyMentionAtBeginning` tests
  - [ ] Extract from agent-events.test.ts: `addAutoMention` tests
  - [ ] Extract from agent-events.test.ts: `removeSelfMentions` tests
  - [ ] Extract from agent-events.test.ts: Loop prevention integration tests
  - [ ] Auto-mention logic for different sender types

#### Step 4.2: Extract Response Logic (Well-Defined Boundary)
- [ ] **agents/agent-response-logic.test.ts** (~300 lines)
  - [ ] Move current shouldAgentRespond.test.ts to agents folder
  - [ ] Extract additional `shouldAgentRespond` tests from agent-events.test.ts
  - [ ] Turn limit logic
  - [ ] Mention detection at paragraph beginnings
  - [ ] Public message handling
  - [ ] Agent self-filtering

#### Step 4.3: Extract Message Processing (Clear Function Boundary)
- [ ] **agents/agent-message-processing.test.ts** (~400 lines)
  - [ ] Move current processAgentMessage.test.ts to agents folder
  - [ ] Extract additional message processing tests from agent-events.test.ts
  - [ ] Memory management and persistence
  - [ ] LLM interaction and error handling
  - [ ] Agent state updates (call counts, timestamps)
  - [ ] Pass command handling

#### Step 4.4: Clean Up Core Events (Final Step)
- [ ] **agents/agent-events.test.ts** (~300 lines)
  - [ ] Keep only: `subscribeAgentToMessages` tests
  - [ ] Keep only: `publishMessage` and `publishSSE` tests  
  - [ ] Keep only: Event emitter integration tests
  - [ ] Keep only: Message subscription/unsubscription
  - [ ] Keep only: Real EventEmitter behavior validation
  - [ ] Remove all extracted content

### Phase 5: Storage Enhancement (Optional, After Core Reorganization)
**Goal**: Add missing test coverage only after successful reorganization

#### Step 5.1: Storage Error Handling
- [ ] **storage/storage-error-handling.test.ts** (new, ~200 lines)
  - [ ] Disk full errors, permission errors
  - [ ] Corrupted file handling
  - [ ] Recovery mechanisms
  - [ ] Graceful degradation

## Critical Mock Requirements ✅

### File I/O Operations (MUST BE MOCKED)
- [x] **fs.promises.readFile** - Prevents actual file reads
- [x] **fs.promises.writeFile** - Prevents actual file writes  
- [x] **fs.promises.mkdir** - Prevents directory creation
- [x] **fs.promises.rm** - Prevents file deletion
- [x] **fs.promises.access** - Prevents file access checks
- [x] **fs.promises.readdir** - Prevents directory listing
- [x] **fs.promises.rename** - Prevents file moves
- [x] **fs.promises.unlink** - Prevents file unlinking

### Agent Storage Operations (MUST BE MOCKED)
- [x] **saveAgentToDisk** - Prevents agent persistence
- [x] **loadAgentFromDisk** - Returns mock agent data
- [x] **loadAllAgentsFromDisk** - Returns mock agent arrays
- [x] **saveAgentMemoryToDisk** - Prevents memory persistence
- [x] **saveAgentConfigToDisk** - Prevents config persistence
- [x] **deleteAgentFromDisk** - Prevents agent deletion
- [x] **agentExistsOnDisk** - Returns mock existence checks

### LLM API Calls (MUST BE MOCKED)
- [x] **streamAgentResponse** - Returns mock LLM responses
- [x] **generateAgentResponse** - Returns mock text generation
- [x] **OpenAI SDK calls** - Prevents actual API calls
- [x] **Anthropic SDK calls** - Prevents actual API calls
- [x] **AI SDK calls** - Prevents external AI service calls

### System Dependencies (SHOULD BE MOCKED)
- [x] **crypto.randomUUID** - Provides deterministic IDs
- [x] **EventEmitter** - Provides mock event handling
- [x] **path utilities** - Cross-platform path handling
- [x] **os utilities** - Consistent environment simulation

### Enhanced Mock Features ✅
- [x] **Flexible import paths** - Works from any reorganized directory
- [x] **Mock validation** - Ensures all mocks are properly configured
- [x] **Comprehensive coverage** - All critical dependencies mocked
- [x] **Reset functionality** - Clean state between tests
- [x] **Error simulation** - Can simulate various error conditions

## Benefits Expected

### 1. Complete Test Isolation ✅
- [x] **No actual file I/O** - All filesystem operations mocked
- [x] **No actual LLM calls** - All AI API calls mocked
- [x] **No external dependencies** - All network/system calls mocked
- [x] **Deterministic behavior** - Consistent results across environments
- [x] **Fast execution** - No I/O or network delays

### 2. Clear Separation of Concerns
- [x] Each file has a single, well-defined responsibility
- [x] Easier to locate and maintain specific functionality
- [x] Reduced cognitive load when working on specific features

### 3. Reduced Code Duplication
- [x] Centralized mock helpers and test data builders
- [x] Reusable test scenarios across multiple files
- [x] Consistent testing patterns

### 4. Better Maintainability
- [x] Smaller, focused files are easier to understand and modify
- [x] Changes to specific functionality only affect related test files
- [x] Clear boundaries make refactoring safer

### 5. Improved Test Discovery
- [x] Descriptive file names make it easy to find relevant tests
- [x] Logical grouping helps developers navigate the test suite
- [x] Clear hierarchy reflects the application structure

### 6. Enhanced Reusability
- [x] Shared utilities and scenarios can be used across test files
- [x] Mock helpers are centralized and consistent
- [x] Test patterns can be easily replicated

## Implementation Commands (Ordered by Phase)

### Phase 1: Infrastructure Setup
```bash
# Step 1.1: Create directory structure
mkdir -p tests/core/{agents,storage,utilities,shared}

# Step 1.2: Enhanced mock infrastructure files (already created)
# - tests/core/shared/mock-setup.ts (comprehensive mocking)
# - tests/core/shared/mock-validation.ts (validation utilities)

# Step 1.3: Create additional shared infrastructure files
touch tests/core/shared/test-data-builders.ts
touch tests/core/shared/test-scenarios.ts

# Step 1.4: Validate mock setup
cd tests/core/shared
node -e "
const { runCompleteMockValidation, printMockValidationReport } = require('./mock-validation.ts');
runCompleteMockValidation().then(printMockValidationReport);
"

# Ensure all mocks are properly configured
npm test -- tests/core/setup.test.ts  # If we create a setup test
```

### Phase 2: Simple Moves  
```bash
# Step 2.1: Move storage tests
mv tests/core/agent-storage.test.ts tests/core/storage/
# Update imports in agent-storage.test.ts

# Step 2.2: Move utilities tests  
mv tests/core/utils.test.ts tests/core/utilities/
# Update imports in utils.test.ts

# Validation after Phase 2
npm test -- tests/core/
```

### Phase 3: Utility Extraction
```bash
# Step 3.1: Create mention extraction file
touch tests/core/utilities/mention-extraction.test.ts
# Extract mention tests from utils.test.ts (manual)

# Step 3.2: Create message formatting file
touch tests/core/utilities/message-formatting.test.ts  
# Extract formatting tests from utils.test.ts (manual)

# Validation after Phase 3
npm test -- tests/core/utilities/
```

### Phase 4: Agent Test Reorganization
```bash
# Step 4.1: Create auto-mentions file
touch tests/core/agents/agent-auto-mentions.test.ts
# Extract auto-mention tests (manual)

# Step 4.2: Move response logic
mv tests/core/shouldAgentRespond.test.ts tests/core/agents/agent-response-logic.test.ts
# Extract additional tests from agent-events.test.ts (manual)

# Step 4.3: Move message processing
mv tests/core/processAgentMessage.test.ts tests/core/agents/agent-message-processing.test.ts
# Extract additional tests from agent-events.test.ts (manual)

# Step 4.4: Clean up core events file
mv tests/core/agent-events.test.ts tests/core/agents/
# Remove extracted content (manual editing)

# Final validation
npm test -- tests/core/
```

### Phase 5: Storage Enhancement (Optional)
```bash
# Step 5.1: Add storage error handling
touch tests/core/storage/storage-error-handling.test.ts
# Create new error handling tests (manual)

# Final validation
npm test -- tests/core/storage/
```

## Validation Criteria

### Must Pass
- [ ] All existing tests continue to pass
- [ ] No regression in test coverage
- [ ] Test execution time remains similar
- [ ] All imports resolve correctly

### Should Achieve
- [ ] Reduced average file size (target: <400 lines per file)
- [ ] Clear test categorization
- [ ] Improved test discoverability
- [ ] Reduced code duplication (target: <20% duplicate patterns)

### Could Improve
- [ ] Enhanced test documentation
- [ ] Performance test benchmarks
- [ ] Integration test helpers
- [ ] Automated test organization validation

## Execution Strategy & Risk Management

### Risk-Based Ordering Rationale

**Phase 1 (Infrastructure)**: Lowest risk - Only creates new directories and files
**Phase 2 (Simple Moves)**: Low risk - Moves complete files without content changes  
**Phase 3 (Utilities)**: Medium risk - Splits well-defined utility functions
**Phase 4 (Agent Tests)**: Higher risk - Splits complex, interconnected test files
**Phase 5 (Enhancement)**: Optional - Adds new functionality after core reorganization

### Validation Checkpoints

#### After Each Phase
```bash
# Quick validation
npm test -- tests/core/

# Specific validations by phase
npm test -- tests/core/storage/          # After Phase 2.1
npm test -- tests/core/utilities/        # After Phase 2.2, 3
npm test -- tests/core/agents/           # After Phase 4
```

#### Rollback Strategy
- Keep original files until phase completion
- Use git branches for each phase
- Maintain backup copies of working test files

### Execution Safety

#### Before Starting
- [ ] Create git branch: `git checkout -b test-reorganization`
- [ ] Verify all tests currently pass: `npm test`
- [ ] Document current test count and coverage

#### During Each Phase
- [ ] Complete one step at a time
- [ ] Validate after each step
- [ ] Commit working state before next step

#### Emergency Rollback
```bash
# If something breaks, rollback to last working state
git checkout -- tests/core/
git checkout main
```

## Success Metrics

- [ ] **Test Organization**: Clear, logical file structure
- [ ] **Maintainability**: Average file size <400 lines
- [ ] **Reusability**: Centralized mock and utility functions
- [ ] **Performance**: Test suite execution time unchanged
- [ ] **Coverage**: No reduction in test coverage
- [ ] **Developer Experience**: Easier test discovery and modification

## Timeline (Revised for Easy Execution)

### Day 1: Foundation (Low Risk)
- **Morning**: Phase 1 - Infrastructure setup and shared utilities
- **Afternoon**: Phase 2 - Simple file moves (storage and utilities)
- **Validation**: Verify all moved tests still pass

### Day 2: Utilities (Medium Risk) 
- **Morning**: Phase 3.1-3.2 - Extract mention and formatting tests
- **Afternoon**: Phase 3.3 - Clean up original utils.test.ts
- **Validation**: Verify all utility tests pass

### Day 3: Agent Tests Part 1 (Higher Risk)
- **Morning**: Phase 4.1 - Extract auto-mentions (smallest split)
- **Afternoon**: Phase 4.2 - Move and enhance response logic tests
- **Validation**: Verify response logic tests pass

### Day 4: Agent Tests Part 2 (Highest Risk)
- **Morning**: Phase 4.3 - Move and enhance message processing tests
- **Afternoon**: Phase 4.4 - Clean up core events file
- **Validation**: Verify all agent tests pass

### Day 5: Polish and Enhancement (Optional)
- **Morning**: Phase 5 - Add storage error handling tests
- **Afternoon**: Final validation, documentation, and cleanup
- **Validation**: Full test suite validation

## Next Steps

1. Get approval for the reorganization plan
2. Start with Phase 1 (low-risk directory setup)
3. Implement phases incrementally with validation at each step
4. Monitor test performance and coverage throughout
5. Document new testing conventions and best practices
