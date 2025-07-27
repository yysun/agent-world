import { NextRequest, NextResponse } from 'next/server';
import { createAgent, listAgents, getWorld, LLMProvider } from '@agent-world/core';
import path from 'path';

const ROOT_PATH = path.join(process.cwd(), process.env.AGENT_WORLD_DATA_PATH || './data/worlds');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ worldId: string }> }
) {
  try {
    const { worldId } = await params;
    const world = await getWorld(ROOT_PATH, worldId);

    if (!world) {
      return NextResponse.json(
        { error: 'World not found' },
        { status: 404 }
      );
    }

    const agents = await listAgents(ROOT_PATH, worldId);
    return NextResponse.json({ agents });
  } catch (error) {
    console.error('Error listing agents:', error);
    return NextResponse.json(
      { error: 'Failed to list agents' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ worldId: string }> }
) {
  try {
    const { worldId } = await params;
    const body = await request.json();
    const { name, description, system } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Agent name is required' },
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

    const agent = await createAgent(ROOT_PATH, worldId, {
      name,
      type: 'general',
      provider: LLMProvider.OPENAI,
      model: 'gpt-3.5-turbo',
      systemPrompt: system || `You are ${name}, a helpful AI assistant.`
    });

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    console.error('Error creating agent:', error);
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    );
  }
}