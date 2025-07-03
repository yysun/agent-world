/**
 * Test for WebSocket Comprehensive Error Handling
 * 
 * This test verifies that different types of errors have consistent structure
 */

import { WebSocket } from 'ws';

async function testComprehensiveErrorHandling() {
  console.log('Testing WebSocket Comprehensive Error Handling...');

  const ws = new WebSocket('ws://localhost:3000/ws');

  return new Promise((resolve, reject) => {
    let connected = false;
    let testCount = 0;
    const expectedTests = 3;
    const results: any[] = [];

    const runTest = (testName: string, request: any) => {
      return new Promise<void>((testResolve) => {
        const timeout = setTimeout(() => {
          results.push({ test: testName, status: 'timeout' });
          testResolve();
        }, 3000);

        const handleResponse = (event: any) => {
          try {
            const response = JSON.parse(event.data);

            // Skip connection messages
            if (response.type === 'connected') return;

            if (response.type === 'system' &&
              response.payload?.eventType === 'command-response' &&
              response.payload.response.requestId === request.id) {

              clearTimeout(timeout);
              ws.removeEventListener('message', handleResponse);

              const commandResponse = response.payload.response;
              console.log(`\n${testName}:`);
              console.log('Response:', JSON.stringify(commandResponse, null, 2));

              // Verify error response structure
              const hasRequiredFields =
                commandResponse.hasOwnProperty('success') &&
                commandResponse.hasOwnProperty('requestId') &&
                commandResponse.hasOwnProperty('type') &&
                (commandResponse.success || commandResponse.hasOwnProperty('error'));

              results.push({
                test: testName,
                status: hasRequiredFields ? 'pass' : 'fail',
                success: commandResponse.success,
                hasError: !!commandResponse.error,
                type: commandResponse.type
              });

              testResolve();
            }
          } catch (error) {
            clearTimeout(timeout);
            ws.removeEventListener('message', handleResponse);
            results.push({ test: testName, status: 'error', error: error.message });
            testResolve();
          }
        };

        ws.addEventListener('message', handleResponse);
        ws.send(JSON.stringify({
          type: 'system',
          payload: {
            eventType: 'command-request',
            request
          }
        }));
      });
    };

    ws.on('open', async () => {
      connected = true;
      console.log('✓ Connected to WebSocket server');

      try {
        // Test 1: Invalid command type
        await runTest('Invalid Command Type', {
          id: 'test1_' + Date.now(),
          type: 'invalidCommand',
          timestamp: new Date().toISOString()
        });

        // Test 2: Missing required parameter
        await runTest('Missing Parameter', {
          id: 'test2_' + Date.now(),
          type: 'getWorld',
          timestamp: new Date().toISOString()
          // Missing worldName parameter
        });

        // Test 3: Non-existent world
        await runTest('Non-existent World', {
          id: 'test3_' + Date.now(),
          type: 'getWorld',
          worldName: 'non-existent-world',
          timestamp: new Date().toISOString()
        });

        // Analyze results
        console.log('\n=== Test Results ===');
        let allPassed = true;

        results.forEach(result => {
          console.log(`${result.test}: ${result.status}`);
          if (result.status !== 'pass') {
            allPassed = false;
          }
        });

        if (allPassed && results.length === expectedTests) {
          console.log('\n✓ All error handling tests passed!');
          ws.close();
          resolve(true);
        } else {
          console.log('\n✗ Some error handling tests failed');
          ws.close();
          reject(new Error('Error handling tests failed'));
        }

      } catch (error) {
        console.error('Test execution error:', error);
        ws.close();
        reject(error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      reject(error);
    });

    ws.on('close', () => {
      if (!connected) {
        reject(new Error('Failed to connect to WebSocket server'));
      }
    });

    // Global timeout
    setTimeout(() => {
      if (connected) {
        ws.close();
        reject(new Error('Test timeout'));
      }
    }, 15000);
  });
}

// Run the test
testComprehensiveErrorHandling()
  .then(() => {
    console.log('✓ Comprehensive error handling test passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  });
