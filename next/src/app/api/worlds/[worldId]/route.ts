import { NextRequest, NextResponse } from 'next/server';
import { getWorldConfig, updateWorld, deleteWorld } from '@agent-world/core';
import path from 'path';

const ROOT_PATH = path.join(process.cwd(), process.env.AGENT_WORLD_DATA_PATH || './data/worlds');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ worldId: string }> }
) {
  try {
    const { worldId } = await params;
    const world = await getWorldConfig(ROOT_PATH, worldId);

    if (!world) {
      return NextResponse.json(
        { error: 'World not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ world });
  } catch (error) {
    console.error('Error getting world:', error);
    return NextResponse.json(
      { error: 'Failed to get world' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ worldId: string }> }
) {
  try {
    const { worldId } = await params;
    const body = await request.json();
    const { name, description, mcpConfig } = body;

    await updateWorld(ROOT_PATH, worldId, { 
      name, 
      description,
      mcpConfig: mcpConfig !== undefined ? mcpConfig : undefined
    });
    const world = await getWorldConfig(ROOT_PATH, worldId);

    return NextResponse.json({ world });
  } catch (error) {
    console.error('Error updating world:', error);
    return NextResponse.json(
      { error: 'Failed to update world' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ worldId: string }> }
) {
  try {
    const { worldId } = await params;
    await deleteWorld(ROOT_PATH, worldId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting world:', error);
    return NextResponse.json(
      { error: 'Failed to delete world' },
      { status: 500 }
    );
  }
}