/**
 * Integration Test: WorldClass Comprehensive CRUD Operations
 *
 * Features:
 * - Tests complete WorldClass interface with all world, agent, and chat operations
 * - Demonstrates real-world usage patterns and workflows
 * - Validates integrated functionality across all WorldClass methods
 * - Tests complex scenarios with multiple entities and interactions
 *
 * Implementation:
 * - Uses WorldClass for comprehensive workflow testing
 * - Tests realistic scenarios with multiple agents and chats
 * - Validates cross-functional behavior (agents + chats + world updates)
 * - Designed as standalone TypeScript program with npx tsx
 *
 * Changes:
 * - Comprehensive integration of all WorldClass functionality
 * - Tests realistic multi-entity workflows
 * - Validates complex cross-functional scenarios
 * - Uses consistent test patterns from existing integration tests
 */

import {
  createWorld,
  disableStreaming,
} from '../core/index.js';
import { WorldClass } from '../core/world-class.js';
import type { CreateWorldParams, CreateAgentParams } from '../core/types.js';
import { LLMProvider } from '../core/types.js';
import { boldRed, boldGreen, boldYellow, red, green, yellow, cyan, log, assert } from './utils.js';

const ROOT_PATH = '.';

// Additional color helper for this test
const blue = (text: string) => `\x1b[34m${text.toString()}\x1b[0m`;

async function runComprehensiveWorldClassTest(): Promise<void> {
  let worldClass: WorldClass | null = null;

  try {
    console.log('Starting Integration Test: WorldClass Comprehensive CRUD Operations');
    console.log('='.repeat(80));

    disableStreaming();

    // ========================================
    // PHASE 1: WORLD SETUP AND INITIALIZATION
    // ========================================
    console.log(boldYellow('\n📁 PHASE 1: WORLD SETUP AND INITIALIZATION'));

    console.log('\n1. Creating test world with comprehensive configuration...');
    const createWorldParams: CreateWorldParams = {
      name: 'Comprehensive Test World',
      description: 'A comprehensive test environment for WorldClass integration testing',
      turnLimit: 25
    };

    const createdWorld = await createWorld(ROOT_PATH, createWorldParams);
    assert(createdWorld !== null, 'World should be created successfully');

    worldClass = new WorldClass(ROOT_PATH, createdWorld!.id);
    log('World and WorldClass initialized', {
      id: worldClass.id,
      name: createdWorld!.name,
      turnLimit: createdWorld!.turnLimit
    });

    // ========================================
    // PHASE 2: AGENT MANAGEMENT OPERATIONS
    // ========================================
    console.log(boldYellow('\n🤖 PHASE 2: AGENT MANAGEMENT OPERATIONS'));

    console.log('\n2. Creating multiple agents with different configurations...');

    // Create Assistant Agent
    const assistantParams: CreateAgentParams = {
      name: 'AI Assistant',
      type: 'assistant',
      provider: LLMProvider.ANTHROPIC,
      model: 'claude-3-haiku-20240307',
      systemPrompt: 'You are a helpful AI assistant specialized in general tasks.',
      temperature: 0.7,
      maxTokens: 2000
    };
    const assistant = await worldClass.createAgent(assistantParams);

    // Create Researcher Agent
    const researcherParams: CreateAgentParams = {
      name: 'Research Specialist',
      type: 'researcher',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a research specialist focused on data analysis and information gathering.',
      temperature: 0.3,
      maxTokens: 4000
    };
    const researcher = await worldClass.createAgent(researcherParams);

    // Create Creative Agent
    const creativeParams: CreateAgentParams = {
      name: 'Creative Writer',
      type: 'creative',
      provider: LLMProvider.ANTHROPIC,
      model: 'claude-3-sonnet-20240229',
      systemPrompt: 'You are a creative writer specializing in storytelling and content creation.',
      temperature: 0.9,
      maxTokens: 3000
    };
    const creative = await worldClass.createAgent(creativeParams);

    assert(assistant !== null && researcher !== null && creative !== null, 'All agents should be created');
    log('Created agents', {
      assistant: { id: assistant.id, name: assistant.name, provider: assistant.provider },
      researcher: { id: researcher.id, name: researcher.name, provider: researcher.provider },
      creative: { id: creative.id, name: creative.name, provider: creative.provider }
    });

    console.log('\n3. Validating agent list and retrieval...');
    const allAgents = await worldClass.listAgents();
    assert(allAgents.length === 3, 'Should have exactly three agents');

    const retrievedAssistant = await worldClass.getAgent(assistant.id);
    const retrievedResearcher = await worldClass.getAgent(researcher.id);
    assert(retrievedAssistant !== null && retrievedResearcher !== null, 'Agent retrieval should work');
    log('Agent validation', {
      totalCount: allAgents.length,
      agentNames: allAgents.map(a => a.name)
    });

    // ========================================
    // PHASE 3: CHAT SESSION MANAGEMENT
    // ========================================
    console.log(boldYellow('\n💬 PHASE 3: CHAT SESSION MANAGEMENT'));

    console.log('\n4. Creating and managing multiple chat sessions...');

    // Create first chat session
    const firstChatWorld = await worldClass.newChat(true);
    assert(firstChatWorld !== null, 'First chat should be created');
    const firstChatId = firstChatWorld!.currentChatId!;

    // Create second chat session
    const secondChatWorld = await worldClass.newChat(true);
    assert(secondChatWorld !== null, 'Second chat should be created');
    const secondChatId = secondChatWorld!.currentChatId!;

    // Create third chat without setting as current
    const thirdChatWorld = await worldClass.newChat(false);
    assert(thirdChatWorld !== null, 'Third chat should be created');
    assert(thirdChatWorld!.currentChatId === secondChatId, 'Current chat should remain second');

    const allChats = await worldClass.listChats();
    assert(allChats.length === 3, 'Should have three chat sessions');
    log('Chat sessions created', {
      totalChats: allChats.length,
      currentChatId: thirdChatWorld!.currentChatId,
      chatIds: allChats.map(c => c.id)
    });

    // ========================================
    // PHASE 4: COMPLEX WORKFLOW OPERATIONS
    // ========================================
    console.log(boldYellow('\n🔄 PHASE 4: COMPLEX WORKFLOW OPERATIONS'));

    console.log('\n5. Testing agent updates and memory management...');

    // Update assistant agent
    const updatedAssistant = await worldClass.updateAgent(assistant.id, {
      name: 'Enhanced AI Assistant',
      systemPrompt: 'You are an enhanced AI assistant with improved capabilities.',
      temperature: 0.8
    });
    assert(updatedAssistant !== null, 'Agent update should succeed');
    assert(updatedAssistant!.name === 'Enhanced AI Assistant', 'Agent name should be updated');

    // Clear researcher memory
    const clearedResearcher = await worldClass.clearAgentMemory(researcher.id);
    assert(clearedResearcher !== null, 'Memory clearing should succeed');

    log('Agent workflow operations', {
      updatedAgent: updatedAssistant!.name,
      clearedMemoryAgent: clearedResearcher!.name
    });

    console.log('\n6. Testing world updates and configuration changes...');

    // Update world configuration
    const updatedWorld = await worldClass.update({
      name: 'Enhanced Comprehensive Test World',
      description: 'An enhanced comprehensive test environment with updated configuration',
      turnLimit: 50
    });
    assert(updatedWorld !== null, 'World update should succeed');
    assert(updatedWorld!.name === 'Enhanced Comprehensive Test World', 'World name should be updated');
    assert(updatedWorld!.turnLimit === 50, 'Turn limit should be updated');

    log('World configuration updated', {
      name: updatedWorld!.name,
      turnLimit: updatedWorld!.turnLimit,
      description: updatedWorld!.description?.substring(0, 50) + '...'
    });

    // ========================================
    // PHASE 5: CHAT SESSION SWITCHING
    // ========================================
    console.log(boldYellow('\n🔀 PHASE 5: CHAT SESSION SWITCHING'));

    console.log('\n7. Testing chat session restoration and switching...');

    // Switch to first chat
    const switchToFirst = await worldClass.restoreChat(firstChatId, true);
    assert(switchToFirst !== null && switchToFirst!.currentChatId === firstChatId, 'Should switch to first chat');

    // Switch to second chat
    const switchToSecond = await worldClass.restoreChat(secondChatId, true);
    assert(switchToSecond !== null && switchToSecond!.currentChatId === secondChatId, 'Should switch to second chat');

    log('Chat session switching', {
      currentChat: switchToSecond!.currentChatId,
      totalChats: (await worldClass.listChats()).length
    });

    // ========================================
    // PHASE 6: DATA EXPORT AND VALIDATION
    // ========================================
    console.log(boldYellow('\n📊 PHASE 6: DATA EXPORT AND VALIDATION'));

    console.log('\n8. Testing world export and data consistency...');

    const markdownExport = await worldClass.exportToMarkdown();
    assert(typeof markdownExport === 'string' && markdownExport.length > 0, 'Export should generate content');
    assert(markdownExport.includes('Enhanced Comprehensive Test World'), 'Export should contain world name');
    assert(markdownExport.includes('Enhanced AI Assistant'), 'Export should contain updated agent name');

    log('World export validation', {
      exportLength: markdownExport.length,
      containsWorldName: markdownExport.includes('Enhanced Comprehensive Test World'),
      containsAgentNames: markdownExport.includes('Enhanced AI Assistant')
    });

    log('World export validation', {
      exportLength: markdownExport.length,
      containsWorldName: markdownExport.includes('Enhanced Comprehensive Test World'),
      containsAgentNames: markdownExport.includes('Enhanced AI Assistant')
    });

    // ========================================
    // PHASE 7: SELECTIVE CLEANUP OPERATIONS
    // ========================================
    console.log(boldYellow('\n🧹 PHASE 7: SELECTIVE CLEANUP OPERATIONS'));

    console.log('\n9. Testing selective deletion operations...');

    // Delete one agent
    const deleteAgentResult = await worldClass.deleteAgent(creative.id);
    assert(deleteAgentResult === true, 'Agent deletion should succeed');

    const remainingAgents = await worldClass.listAgents();
    assert(remainingAgents.length === 2, 'Should have two agents remaining');
    assert(!remainingAgents.some(a => a.id === creative.id), 'Deleted agent should not be in list');

    // Delete one chat
    const deleteChatResult = await worldClass.deleteChat(firstChatId);
    assert(deleteChatResult === true, 'Chat deletion should succeed');

    const remainingChats = await worldClass.listChats();
    assert(remainingChats.length === 2, 'Should have two chats remaining');
    assert(!remainingChats.some(c => c.id === firstChatId), 'Deleted chat should not be in list');

    log('Selective cleanup results', {
      remainingAgents: remainingAgents.length,
      remainingChats: remainingChats.length,
      currentChatId: (await worldClass.reload())!.currentChatId
    });

    // ========================================
    // PHASE 8: FINAL STATE VALIDATION
    // ========================================
    console.log(boldYellow('\n✅ PHASE 8: FINAL STATE VALIDATION'));

    console.log('\n10. Validating final comprehensive state...');

    const finalWorld = await worldClass.reload();
    const finalAgents = await worldClass.listAgents();
    const finalChats = await worldClass.listChats();

    assert(finalWorld !== null, 'Final world state should be available');
    assert(finalAgents.length === 2, 'Should have two agents in final state');
    assert(finalChats.length === 2, 'Should have two chats in final state');
    assert(finalWorld!.name === 'Enhanced Comprehensive Test World', 'World name should be preserved');
    assert(finalWorld!.turnLimit === 50, 'World turn limit should be preserved');

    log('Final comprehensive state', {
      worldName: finalWorld!.name,
      worldTurnLimit: finalWorld!.turnLimit,
      agentCount: finalAgents.length,
      chatCount: finalChats.length,
      currentChatId: finalWorld!.currentChatId,
      agentNames: finalAgents.map(a => a.name),
      chatNames: finalChats.map(c => c.name)
    });

    console.log('\n' + '='.repeat(80));
    console.log(boldGreen('🎉 COMPREHENSIVE INTEGRATION TEST COMPLETED SUCCESSFULLY!'));
    console.log(green('All WorldClass operations validated across world, agent, and chat management.'));
    console.log(blue('✨ Complex workflows and cross-functional scenarios working correctly.'));

  } catch (error) {
    console.error(boldRed('💥 Comprehensive integration test failed:'), error);

    // Cleanup on error
    if (worldClass) {
      try {
        await worldClass.delete();
        console.log(yellow('🧹 Cleanup: Test world deleted'));
      } catch (cleanupError) {
        console.log(red('❌ Cleanup failed:'), cleanupError);
      }
    }

    process.exit(1);
  } finally {
    // Cleanup test world
    if (worldClass) {
      try {
        await worldClass.delete();
        console.log(cyan('🧹 Cleanup: Test world deleted successfully'));
      } catch (cleanupError) {
        console.log(red('❌ Final cleanup failed:'), cleanupError);
      }
    }
  }
}

// Run the test
runComprehensiveWorldClassTest();
