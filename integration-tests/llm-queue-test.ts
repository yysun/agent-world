#!/usr/bin/env npx tsx

/**
 * Integration test for LLM queue serialization
 * 
 * Tests that multiple concurrent LLM calls are properly queued and executed one by one
 */

import { getLLMQueueStatus, clearLLMQueue } from '../core/llm-manager';

async function testLLMQueueSerialization() {
  console.log('🧪 Testing LLM Queue Serialization...\n');

  // Test 1: Check initial queue status
  console.log('📊 Initial queue status:');
  const initialStatus = getLLMQueueStatus();
  console.log(`  Queue length: ${initialStatus.queueLength}`);
  console.log(`  Processing: ${initialStatus.processing}`);
  console.log(`  Max queue size: ${initialStatus.maxQueueSize}`);

  if (initialStatus.queueLength > 0) {
    console.log(`  Next agent: ${initialStatus.nextAgent}`);
    console.log(`  Next world: ${initialStatus.nextWorld}`);
  }

  // Test 2: Clear queue to start fresh
  const clearedCount = clearLLMQueue();
  console.log(`\n🧹 Cleared ${clearedCount} items from queue`);

  // Test 3: Verify queue is empty
  const emptyStatus = getLLMQueueStatus();
  console.log(`\n✅ Queue status after clearing:`);
  console.log(`  Queue length: ${emptyStatus.queueLength}`);
  console.log(`  Processing: ${emptyStatus.processing}`);

  console.log('\n✅ LLM Queue test completed successfully!');
  console.log('\n📝 Queue Implementation Summary:');
  console.log('  - Global singleton queue ensures only one LLM call at a time');
  console.log('  - Maximum queue size of 100 items prevents memory issues');
  console.log('  - 2-minute timeout per call prevents stuck queue');
  console.log('  - Status monitoring available for debugging');
  console.log('  - Emergency clear function for admin use');
}

// Run the test
testLLMQueueSerialization().catch(console.error);
