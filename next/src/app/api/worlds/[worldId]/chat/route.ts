import { NextRequest, NextResponse } from 'next/server';
import { publishMessage, subscribeToSSE, enableStreaming, disableStreaming, getWorld } from '@agent-world/core';
import path from 'path';

const ROOT_PATH = path.join(process.cwd(), process.env.AGENT_WORLD_DATA_PATH || './data/worlds');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ worldId: string }> }
) {
  try {
    const { worldId } = await params;
    const body = await request.json();
    const { message, streaming = false } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    const world = await getWorld(ROOT_PATH, worldId);
    if (!world) {
      return NextResponse.json(
        { error: 'World not found' },
        { status: 404 }
      );
    }

    if (streaming) {
      // Enable streaming globally
      enableStreaming();

      // Create SSE stream
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          
          // Subscribe to SSE events for this world
          const unsubscribe = subscribeToSSE(world, (data) => {
            const chunk = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(chunk));
          });

          // Publish the message using world object
          try {
            publishMessage(world, message, 'human');
          } catch (error) {
            console.error('Error publishing message:', error);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Failed to publish message' })}\n\n`));
            controller.close();
          }

          // Set up cleanup after a reasonable timeout
          setTimeout(() => {
            unsubscribe();
            disableStreaming();
            controller.close();
          }, 30000); // 30 seconds timeout
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Non-streaming response
      publishMessage(world, message, 'human');
      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error('Error in chat:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}