/**
 * Test for WebSocket Subscription Response Handling
 * 
 * This test verifies that subscription responses work correctly
 * and that the client can properly detect subscription success.
 */

import { WebSocket } from 'ws';

async function testSubscriptionResponse() {
  console.log('Testing WebSocket Subscription Response...');

  const ws = new WebSocket('ws://localhost:3000/ws');

  return new Promise((resolve, reject) => {
    let connected = false;
    let subscriptionPromiseResolve: ((value: boolean) => void) | null = null;

    ws.on('open', () => {
      connected = true;
      console.log('✓ Connected to WebSocket server');

      // Simulate the client subscription logic
      const subscribeToWorld = (worldName: string) => {
        return new Promise<boolean>((resolve, reject) => {
          subscriptionPromiseResolve = resolve;

          const timeout = setTimeout(() => {
            reject(new Error('Subscription timeout'));
          }, 5000);

          const handleResponse = (event: any) => {
            try {
              const data = JSON.parse(event.data);

              // Check for subscription success response (same logic as client)
              if (data.type === 'success' && data.message && data.message.includes('subscribed to world')) {
                clearTimeout(timeout);
                console.log('✓ Subscription success detected:', data.message);
                resolve(true);
              }
            } catch (error) {
              clearTimeout(timeout);
              reject(error);
            }
          };

          ws.addEventListener('message', handleResponse);

          // Send subscription request
          try {
            ws.send(JSON.stringify({
              type: 'subscribe',
              payload: {
                worldName: worldName
              }
            }));
          } catch (error) {
            clearTimeout(timeout);
            reject(new Error('Failed to send subscription message'));
          }
        });
      };

      // Test subscription to an existing world
      subscribeToWorld('default-world')
        .then(() => {
          console.log('✓ Subscription test completed successfully!');
          ws.close();
          resolve(true);
        })
        .catch((error) => {
          console.error('✗ Subscription test failed:', error.message);
          ws.close();
          reject(error);
        });
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());

        // Skip connection message
        if (response.type === 'connected') {
          console.log('✓ Received connection confirmation');
          return;
        }

        console.log('Received response:', JSON.stringify(response, null, 2));
      } catch (error) {
        console.error('Error parsing response:', error);
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
        reject(new Error('Test timeout - subscription not completed'));
      }
    }, 10000);
  });
}

// Run the test
testSubscriptionResponse()
  .then(() => {
    console.log('✓ Subscription response test passed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  });
