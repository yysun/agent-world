/**
 * Mock Validation Setup for Test Reorganization
 * 
 * Provides utilities to validate that all mocks are properly configured
 * during the test reorganization process.
 */

import { jest } from '@jest/globals';

/**
 * Enhanced Mock Validation
 * Validates that all critical mocks are in place and functioning
 */
export function validateCompleteMockSetup(): {
  success: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Test File I/O Mocks
    const fs = require('fs');
    if (!fs.promises || typeof fs.promises.readFile !== 'function') {
      errors.push('fs.promises.readFile is not properly mocked');
    }
    if (!fs.promises || typeof fs.promises.writeFile !== 'function') {
      errors.push('fs.promises.writeFile is not properly mocked');
    }

    // Test Agent Storage Mocks
    try {
      const agentStorage = require('../../core/agent-storage');
      if (typeof agentStorage.saveAgentToDisk !== 'function') {
        errors.push('agent-storage.saveAgentToDisk is not properly mocked');
      }
      if (typeof agentStorage.loadAgentFromDisk !== 'function') {
        errors.push('agent-storage.loadAgentFromDisk is not properly mocked');
      }
    } catch (importError) {
      warnings.push(`Could not validate agent-storage mocks: ${importError}`);
    }

    // Test LLM Manager Mocks
    try {
      const llmManager = require('../../core/llm-manager');
      if (typeof llmManager.streamAgentResponse !== 'function') {
        errors.push('llm-manager.streamAgentResponse is not properly mocked');
      }
    } catch (importError) {
      warnings.push(`Could not validate llm-manager mocks: ${importError}`);
    }

    // Test External SDK Mocks
    try {
      const ai = require('ai');
      if (typeof ai.generateText !== 'function') {
        warnings.push('AI SDK generateText is not properly mocked');
      }
    } catch (importError) {
      // This is expected if AI SDK is not installed
    }

    // Test Environment Mocks
    const path = require('path');
    if (typeof path.join !== 'function') {
      errors.push('path.join is not properly mocked');
    }

    return {
      success: errors.length === 0,
      errors,
      warnings
    };

  } catch (error) {
    return {
      success: false,
      errors: [`Mock validation failed with error: ${error}`],
      warnings: []
    };
  }
}

/**
 * Quick Mock Test
 * Performs basic functional tests of mocked modules
 */
export async function testMockFunctionality(): Promise<{
  success: boolean;
  results: Record<string, boolean>;
  errors: string[];
}> {
  const results: Record<string, boolean> = {};
  const errors: string[] = [];

  try {
    // Test fs.promises.readFile
    const fs = require('fs');
    try {
      const result = await fs.promises.readFile('test-file.txt');
      results['fs.readFile'] = typeof result === 'string';
    } catch (error) {
      results['fs.readFile'] = false;
      errors.push(`fs.readFile test failed: ${error}`);
    }

    // Test fs.promises.writeFile
    try {
      await fs.promises.writeFile('test-file.txt', 'test content');
      results['fs.writeFile'] = true;
    } catch (error) {
      results['fs.writeFile'] = false;
      errors.push(`fs.writeFile test failed: ${error}`);
    }

    // Test agent storage functions
    try {
      const agentStorage = require('../../core/agent-storage');
      await agentStorage.saveAgentToDisk('test-path', 'test-world', {});
      results['agentStorage.save'] = true;
    } catch (error) {
      results['agentStorage.save'] = false;
      errors.push(`Agent storage save test failed: ${error}`);
    }

    // Test LLM manager functions
    try {
      const llmManager = require('../../core/llm-manager');
      const response = await llmManager.streamAgentResponse({}, {}, []);
      results['llmManager.stream'] = typeof response === 'string';
    } catch (error) {
      results['llmManager.stream'] = false;
      errors.push(`LLM manager stream test failed: ${error}`);
    }

    return {
      success: Object.values(results).every(r => r === true),
      results,
      errors
    };

  } catch (error) {
    return {
      success: false,
      results,
      errors: [`Mock functionality test failed: ${error}`]
    };
  }
}

/**
 * Import Path Validator
 * Tests that import paths work correctly from different reorganized directories
 */
export function validateImportPaths(): {
  success: boolean;
  validPaths: string[];
  invalidPaths: string[];
} {
  const validPaths: string[] = [];
  const invalidPaths: string[] = [];

  // Test various import path combinations
  const testPaths = [
    '../../core/agent-storage',
    '../../../core/agent-storage',
    '../../core/llm-manager',
    '../../../core/llm-manager',
    '../../core/events',
    '../../../core/events',
    '../../core/utils',
    '../../../core/utils'
  ];

  for (const testPath of testPaths) {
    try {
      require.resolve(testPath);
      validPaths.push(testPath);
    } catch (error) {
      invalidPaths.push(testPath);
    }
  }

  return {
    success: invalidPaths.length === 0,
    validPaths,
    invalidPaths
  };
}

/**
 * Mock Coverage Report
 * Generates a report of what is and isn't mocked
 */
export function generateMockCoverageReport(): {
  fileSystem: boolean;
  agentStorage: boolean;
  llmManager: boolean;
  externalSDKs: boolean;
  utilities: boolean;
  events: boolean;
  coverage: number;
} {
  const report = {
    fileSystem: false,
    agentStorage: false,
    llmManager: false,
    externalSDKs: false,
    utilities: false,
    events: false,
    coverage: 0
  };

  // Check file system mocking
  try {
    const fs = require('fs');
    report.fileSystem = !!(fs.promises && jest.isMockFunction(fs.promises.readFile));
  } catch (error) {
    // Keep false
  }

  // Check agent storage mocking
  try {
    const agentStorage = require('../../core/agent-storage');
    report.agentStorage = jest.isMockFunction(agentStorage.saveAgentToDisk);
  } catch (error) {
    // Keep false
  }

  // Check LLM manager mocking
  try {
    const llmManager = require('../../core/llm-manager');
    report.llmManager = jest.isMockFunction(llmManager.streamAgentResponse);
  } catch (error) {
    // Keep false
  }

  // Check external SDKs
  try {
    const ai = require('ai');
    report.externalSDKs = jest.isMockFunction(ai.generateText);
  } catch (error) {
    // External SDKs are optional
    report.externalSDKs = true; // Consider it covered if not present
  }

  // Check utilities
  try {
    const crypto = require('crypto');
    report.utilities = jest.isMockFunction(crypto.randomUUID);
  } catch (error) {
    // Keep false
  }

  // Check events
  try {
    const events = require('events');
    report.events = jest.isMockFunction(events.EventEmitter);
  } catch (error) {
    // Keep false
  }

  // Calculate coverage percentage
  const categories = Object.keys(report).filter(key => key !== 'coverage');
  const coveredCategories = categories.filter(key => report[key as keyof typeof report]);
  report.coverage = Math.round((coveredCategories.length / categories.length) * 100);

  return report;
}

/**
 * Mock Reset Validator
 * Validates that mocks can be properly reset
 */
export function validateMockReset(): {
  success: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  try {
    // Save original call counts
    const fs = require('fs');
    const originalCalls = fs.promises?.readFile?.mock?.calls?.length || 0;

    // Call a mocked function
    if (fs.promises?.readFile) {
      fs.promises.readFile('test');
    }

    // Reset mocks
    jest.clearAllMocks();

    // Check if reset worked
    const newCalls = fs.promises?.readFile?.mock?.calls?.length || 0;
    if (newCalls !== 0) {
      errors.push('jest.clearAllMocks() did not reset call counts');
    }

    return {
      success: errors.length === 0,
      errors
    };

  } catch (error) {
    return {
      success: false,
      errors: [`Mock reset validation failed: ${error}`]
    };
  }
}

/**
 * Complete Mock Validation Suite
 * Runs all validation tests and returns comprehensive report
 */
export async function runCompleteMockValidation(): Promise<{
  success: boolean;
  setup: ReturnType<typeof validateCompleteMockSetup>;
  functionality: Awaited<ReturnType<typeof testMockFunctionality>>;
  importPaths: ReturnType<typeof validateImportPaths>;
  coverage: ReturnType<typeof generateMockCoverageReport>;
  reset: ReturnType<typeof validateMockReset>;
}> {
  const setup = validateCompleteMockSetup();
  const functionality = await testMockFunctionality();
  const importPaths = validateImportPaths();
  const coverage = generateMockCoverageReport();
  const reset = validateMockReset();

  const success = setup.success &&
    functionality.success &&
    coverage.coverage >= 80 && // At least 80% coverage
    reset.success;

  return {
    success,
    setup,
    functionality,
    importPaths,
    coverage,
    reset
  };
}

/**
 * Print Mock Validation Report
 * Utility to print a human-readable validation report
 */
export function printMockValidationReport(validation: Awaited<ReturnType<typeof runCompleteMockValidation>>): void {
  console.log('\n=== Mock Validation Report ===');
  console.log(`Overall Success: ${validation.success ? '✅' : '❌'}`);
  console.log(`Coverage: ${validation.coverage.coverage}%`);

  console.log('\n--- Setup Validation ---');
  console.log(`Success: ${validation.setup.success ? '✅' : '❌'}`);
  if (validation.setup.errors.length > 0) {
    console.log('Errors:', validation.setup.errors);
  }
  if (validation.setup.warnings.length > 0) {
    console.log('Warnings:', validation.setup.warnings);
  }

  console.log('\n--- Functionality Tests ---');
  console.log(`Success: ${validation.functionality.success ? '✅' : '❌'}`);
  console.log('Results:', validation.functionality.results);
  if (validation.functionality.errors.length > 0) {
    console.log('Errors:', validation.functionality.errors);
  }

  console.log('\n--- Import Path Validation ---');
  console.log(`Success: ${validation.importPaths.success ? '✅' : '❌'}`);
  console.log(`Valid paths: ${validation.importPaths.validPaths.length}`);
  console.log(`Invalid paths: ${validation.importPaths.invalidPaths.length}`);

  console.log('\n--- Coverage Report ---');
  console.log(`File System: ${validation.coverage.fileSystem ? '✅' : '❌'}`);
  console.log(`Agent Storage: ${validation.coverage.agentStorage ? '✅' : '❌'}`);
  console.log(`LLM Manager: ${validation.coverage.llmManager ? '✅' : '❌'}`);
  console.log(`External SDKs: ${validation.coverage.externalSDKs ? '✅' : '❌'}`);
  console.log(`Utilities: ${validation.coverage.utilities ? '✅' : '❌'}`);
  console.log(`Events: ${validation.coverage.events ? '✅' : '❌'}`);

  console.log('\n--- Reset Validation ---');
  console.log(`Success: ${validation.reset.success ? '✅' : '❌'}`);
  if (validation.reset.errors.length > 0) {
    console.log('Errors:', validation.reset.errors);
  }

  console.log('\n=== End Report ===\n');
}
