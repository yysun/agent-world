import { NextRequest, NextResponse } from 'next/server';
import { createWorld, listWorlds, getWorldConfig } from '@agent-world/core';
import path from 'path';

const ROOT_PATH = path.join(process.cwd(), process.env.AGENT_WORLD_DATA_PATH || './data/worlds');

export async function GET() {
  try {
    const worlds = await listWorlds(ROOT_PATH);
    return NextResponse.json({ worlds });
  } catch (error) {
    console.error('Error listing worlds:', error);
    return NextResponse.json(
      { error: 'Failed to list worlds' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, mcpConfig } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'World name is required' },
        { status: 400 }
      );
    }

    const world = await createWorld(ROOT_PATH, {
      name,
      description,
      mcpConfig: mcpConfig || null
    });

    return NextResponse.json({ world }, { status: 201 });
  } catch (error) {
    console.error('Error creating world:', error);
    return NextResponse.json(
      { error: 'Failed to create world' },
      { status: 500 }
    );
  }
}