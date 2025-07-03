/**
 * Test for WebSocket Error Response Format
 * 
 * This test verifies that error responses have consistent structure
 */

import { WebSocket } from 'ws';

async function testErrorResponseFormat() {
  console.log('Testing WebSocket Error Response Format...');

  const ws = new WebSocket('ws://localhost:3000/ws');

  return new Promise((resolve, reject) => {
    let connected = false;
    const testRequestId = `error_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    ws.on('open', () => {
      connected = true;
      console.log('✓ Connected to WebSocket server');

      // Send an invalid command request
      const testRequest = {
        id: testRequestId,
        type: 'invalidCommand',
        timestamp: new Date().toISOString()
      };

      const message = {
        type: 'system',
        payload: {
          eventType: 'command-request',
          request: testRequest
        }
      };

      console.log(`Sending invalid command with requestId: ${testRequestId}`);
      ws.send(JSON.stringify(message));
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());

        // Skip connection message
        if (response.type === 'connected') return;

        console.log('Received response:', JSON.stringify(response, null, 2));

        // Check if this is a command response
        if (response.type === 'system' &&
          response.payload?.eventType === 'command-response') {

          const commandResponse = response.payload.response;

          // Verify error response structure
          if (commandResponse.requestId === testRequestId) {
            console.log('✓ Error response correlation successful!');
            console.log(`✓ RequestId matches: ${commandResponse.requestId}`);
            console.log(`✓ Response success: ${commandResponse.success}`);
            console.log(`✓ Response type: ${commandResponse.type}`);
            console.log(`✓ Has error field: ${!!commandResponse.error}`);
            console.log(`✓ Error message: ${commandResponse.error}`);

            // Verify required fields for error response
            const hasRequiredFields =
              commandResponse.hasOwnProperty('success') &&
              commandResponse.hasOwnProperty('requestId') &&
              commandResponse.hasOwnProperty('type') &&
              (commandResponse.success || commandResponse.hasOwnProperty('error'));

            if (hasRequiredFields) {
              console.log('✓ Error response has all required fields!');
              ws.close();
              resolve(true);
            } else {
              console.log('✗ Error response missing required fields');
              ws.close();
              reject(new Error('Error response structure incomplete'));
            }
          }
        }
      } catch (error) {
        console.error('Error parsing response:', error);
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

    // Timeout after 10 seconds
    setTimeout(() => {
      if (connected) {
        ws.close();
        reject(new Error('Test timeout - no response received'));
      }
    }, 10000);
  });
}

// Run the test
testErrorResponseFormat()
  .then(() => {
    console.log('✓ Error response format test passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  });
