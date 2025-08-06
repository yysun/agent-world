/**
 * Integration Test Runner: WorldClass CRUD Operations
 *
 * Features:
 * - Runs all WorldClass integration tests in sequence
 * - Provides comprehensive test coverage reporting
 * - Handles test execution, timing, and results aggregation
 * - Designed for CI/CD integration and development validation
 *
 * Implementation:
 * - Executes tests using child_process for isolation
 * - Captures and reports test results and timing
 * - Provides summary of all test outcomes
 * - Designed as standalone TypeScript program with npx tsx
 *
 * Usage:
 * ```bash
 * npx tsx integration/test-world-class-runner.ts
 * ```
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { boldRed, boldGreen, boldYellow, red, green, yellow, cyan } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Additional color helper for this test
const boldBlue = (text: string) => `\x1b[1m\x1b[34m${text.toString()}\x1b[0m`;

interface TestResult {
  name: string;
  file: string;
  duration: number;
  success: boolean;
  error?: string;
}

// Test definitions
const tests = [
  {
    name: 'WorldClass World CRUD Operations',
    file: 'test-world-class-world.ts',
    description: 'Tests world creation, update, reload, export, and deletion'
  },
  {
    name: 'WorldClass Agent CRUD Operations',
    file: 'test-world-class-agent.ts',
    description: 'Tests agent creation, retrieval, update, listing, memory clearing, and deletion'
  },
  {
    name: 'WorldClass Chat CRUD Operations',
    file: 'test-world-class-chat.ts',
    description: 'Tests chat creation, listing, restoration, and deletion'
  },
  {
    name: 'WorldClass Comprehensive Operations',
    file: 'test-world-class-comprehensive.ts',
    description: 'Tests integrated workflows across all WorldClass functionality'
  }
];

function runTest(testFile: string): Promise<TestResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const testPath = join(__dirname, testFile);

    console.log(cyan(`\n🚀 Running: ${testFile}...`));

    const child = spawn('npx', ['tsx', testPath], {
      stdio: 'pipe',
      cwd: join(__dirname, '..')
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      const success = code === 0;

      if (success) {
        console.log(green(`✅ PASSED: ${testFile} (${duration}ms)`));
      } else {
        console.log(red(`❌ FAILED: ${testFile} (${duration}ms)`));
        if (stderr) {
          console.log(red('STDERR:'), stderr);
        }
      }

      resolve({
        name: testFile,
        file: testFile,
        duration,
        success,
        error: success ? undefined : stderr || 'Test failed with exit code ' + code
      });
    });

    child.on('error', (error) => {
      const duration = Date.now() - startTime;
      console.log(red(`❌ ERROR: ${testFile} (${duration}ms)`));
      console.log(red('ERROR:'), error.message);

      resolve({
        name: testFile,
        file: testFile,
        duration,
        success: false,
        error: error.message
      });
    });
  });
}

async function runAllTests(): Promise<void> {
  console.log(boldBlue('🧪 WorldClass Integration Test Runner'));
  console.log('='.repeat(60));
  console.log(`Running ${tests.length} integration test suites...\n`);

  const results: TestResult[] = [];
  let totalDuration = 0;

  // Run tests sequentially to avoid resource conflicts
  for (const test of tests) {
    console.log(boldYellow(`📋 ${test.name}`));
    console.log(`   ${test.description}`);

    const result = await runTest(test.file);
    results.push(result);
    totalDuration += result.duration;
  }

  // Generate summary report
  console.log('\n' + '='.repeat(60));
  console.log(boldBlue('📊 TEST SUMMARY REPORT'));
  console.log('='.repeat(60));

  const passed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Total Tests: ${results.length}`);
  console.log(`${green('Passed:')} ${passed.length}`);
  console.log(`${red('Failed:')} ${failed.length}`);
  console.log(`Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);

  // Detailed results
  console.log('\n' + boldYellow('📋 DETAILED RESULTS:'));
  results.forEach((result, index) => {
    const status = result.success ? green('PASS') : red('FAIL');
    const duration = `${result.duration}ms`;
    console.log(`${index + 1}. [${status}] ${result.name} (${duration})`);

    if (!result.success && result.error) {
      console.log(`   ${red('Error:')} ${result.error.split('\n')[0]}`);
    }
  });

  // Performance metrics
  console.log('\n' + boldYellow('⚡ PERFORMANCE METRICS:'));
  const avgDuration = totalDuration / results.length;
  const fastestTest = results.reduce((min, r) => r.duration < min.duration ? r : min);
  const slowestTest = results.reduce((max, r) => r.duration > max.duration ? r : max);

  console.log(`Average Test Duration: ${avgDuration.toFixed(2)}ms`);
  console.log(`Fastest Test: ${fastestTest.name} (${fastestTest.duration}ms)`);
  console.log(`Slowest Test: ${slowestTest.name} (${slowestTest.duration}ms)`);

  // Final status
  console.log('\n' + '='.repeat(60));
  if (failed.length === 0) {
    console.log(boldGreen('🎉 ALL TESTS PASSED!'));
    console.log(green('WorldClass integration tests completed successfully.'));
    process.exit(0);
  } else {
    console.log(boldRed('💥 SOME TESTS FAILED!'));
    console.log(red(`${failed.length} out of ${results.length} tests failed.`));
    console.log('\nFailed tests:');
    failed.forEach(f => {
      console.log(`  - ${red(f.name)}: ${f.error}`);
    });
    process.exit(1);
  }
}

// Run all tests
runAllTests().catch((error) => {
  console.error(boldRed('Fatal error running tests:'), error);
  process.exit(1);
});
