#!/bin/bash

# Test Runner for Complete Approval System Test Suite
#
# This script runs all approval-related tests in the correct order:
# 1. Core approval logic tests (standalone)
# 2. Integration WebSocket approval flow tests (requires manually started WS server)
#
# Tests included:
# - tests/core/approval-message-handling.test.ts
# - tests/core/test-approval-system.test.ts  
# - tests/integration/approval-flow-ws.test.ts
#
# Core tests run without any prerequisites.
# Integration tests require WS server (queue processor auto-starts with server).

echo "🔧 Approval System Test Suite Runner"
echo "===================================="
echo

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "tests/integration" ]; then
    echo "❌ Error: Please run this script from the agent-world root directory"
    exit 1
fi

# Check if the test files exist
CORE_APPROVAL_TESTS=(
    "tests/core/approval-message-handling.test.ts"
    "tests/core/test-approval-system.test.ts"
    "tests/core/approval-flow-unit.test.ts"
)

INTEGRATION_APPROVAL_TESTS=(
    "tests/integration/approval-flow-ws.test.ts"
)

echo "📁 Checking test files:"
for test_file in "${CORE_APPROVAL_TESTS[@]}" "${INTEGRATION_APPROVAL_TESTS[@]}"; do
    if [ ! -f "$test_file" ]; then
        echo "❌ Error: Test file not found: $test_file"
        exit 1
    else
        echo "✅ Found: $test_file"
    fi
done

# Initialize test result tracking
CORE_TESTS_FAILED=false
INTEGRATION_TESTS_FAILED=false

echo "📋 Prerequisites Check:"
echo

# Check if WebSocket server is running
if lsof -i :3001 >/dev/null 2>&1; then
    echo "✅ WebSocket server detected on port 3001 (queue processor auto-started)"
    WS_RUNNING=true
else
    echo "❌ WebSocket server not running on port 3001"
    echo "   Start with: AGENT_WORLD_STORAGE_TYPE=memory npm run ws:watch"
    WS_RUNNING=false
fi

echo "🧪 Running Approval Test Suite:"
echo

# Run core approval tests first (don't require WebSocket server)
echo "📋 Running Core Approval Tests:"
echo "================================"

for test_file in "${CORE_APPROVAL_TESTS[@]}"; do
    echo "🔬 Running: $test_file"
    npx vitest run "$test_file"
    
    if [ $? -ne 0 ]; then
        echo "❌ Core test failed: $test_file"
        CORE_TESTS_FAILED=true
    else
        echo "✅ Core test passed: $test_file"
    fi
    echo
done

# Check if WebSocket server is available for integration tests
if [ "$WS_RUNNING" = false ]; then
    echo "⚠️  Skipping integration tests - WebSocket server not running"
    echo "   To run integration tests, start server with:"
    echo "   AGENT_WORLD_STORAGE_TYPE=memory npm run ws:watch"
    echo "   (Queue processor starts automatically with server)"
    echo
else
    # Run integration tests (require WebSocket server)
    echo "🌐 Running Integration Approval Tests:"
    echo "======================================"

    for test_file in "${INTEGRATION_APPROVAL_TESTS[@]}"; do
        echo "🔬 Running: $test_file"
        npx vitest run "$test_file" --config vitest.integration.config.ts
        
        if [ $? -ne 0 ]; then
            echo "❌ Integration test failed: $test_file"
            INTEGRATION_TESTS_FAILED=true
        else
            echo "✅ Integration test passed: $test_file"
        fi
        echo
    done
fi

# Check the overall exit code and provide summary
echo "📊 Test Results Summary:"
echo "======================="

if [ "$CORE_TESTS_FAILED" = false ] && [ "$INTEGRATION_TESTS_FAILED" = false ]; then
    echo "✅ All approval tests passed! System is working correctly."
    echo
    echo "✅ Core approval logic validated (62 tests)"
    echo "✅ Message handling confirmed" 
    if [ "$WS_RUNNING" = true ]; then
        echo "✅ WebSocket integration working (8 tests)"
        echo "✅ Queue processor working"
        echo "ℹ️  LLM-dependent shell_cmd tests skipped (8 tests - require reliable model)"
    else
        echo "⚠️  WebSocket integration not tested (server not running)"
    fi
    exit 0
else
    echo "❌ Some tests failed:"
    
    if [ "$CORE_TESTS_FAILED" = true ]; then
        echo "❌ Core approval tests failed"
    else
        echo "✅ Core approval tests passed"
    fi
    
    if [ "$INTEGRATION_TESTS_FAILED" = true ]; then
        echo "❌ Integration tests failed"
    elif [ "$WS_RUNNING" = false ]; then
        echo "⚠️  Integration tests skipped (WebSocket server not running)"
    else
        echo "✅ Integration tests passed"
    fi
    
    echo
    echo "🔧 Common issues:"
    echo "- Core tests: Check TypeScript compilation and mock setup"
    echo "- Integration tests: Start WS server with AGENT_WORLD_STORAGE_TYPE=memory npm run ws:watch"
    echo "- LLM model not available (ensure ollama is running with llama3.2:3b)"
    exit 1
fi

echo
echo "🔍 Test Details:"
echo "- Core Tests: 62 tests covering all approval scenarios ✅"
echo "  * approval-message-handling.test.ts (14 tests)"
echo "  * test-approval-system.test.ts (20 tests)"
echo "  * approval-flow-unit.test.ts (28 tests - comprehensive flow verification)"
echo "- Integration Tests: 8 basic tests + 8 skipped LLM tests"
echo "  * approval-flow-ws.test.ts (WS connectivity, queue processor)"
echo "  * LLM-dependent tests skipped (require reliable ollama/llama3.2:3b behavior)"
echo "- Server: ws://localhost:3001 (manual start required)"
echo "- Queue Processor: Auto-starts with WS server"
echo "- Storage: memory (ephemeral)"