import { NextRequest, NextResponse } from 'next/server';
import { getAgent, updateAgent, deleteAgent } from '@agent-world/core';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ worldId: string; agentId: string }> }
) {
  try {
    const { worldId, agentId } = await params;
    const agent = await getAgent(worldId, agentId);

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('Error getting agent:', error);
    return NextResponse.json(
      { error: 'Failed to get agent' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ worldId: string; agentId: string }> }
) {
  try {
    const { worldId, agentId } = await params;
    const body = await request.json();
    const { name, system } = body;

    await updateAgent(worldId, agentId, {
      name,
      systemPrompt: system
    });

    const agent = await getAgent(worldId, agentId);
    return NextResponse.json({ agent });
  } catch (error) {
    console.error('Error updating agent:', error);
    return NextResponse.json(
      { error: 'Failed to update agent' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ worldId: string; agentId: string }> }
) {
  try {
    const { worldId, agentId } = await params;
    await deleteAgent(worldId, agentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent:', error);
    return NextResponse.json(
      { error: 'Failed to delete agent' },
      { status: 500 }
    );
  }
}