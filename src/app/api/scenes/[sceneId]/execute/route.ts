import { NextRequest, NextResponse } from 'next/server';
import { executeScene } from '@/lib/switchbot';

export async function POST(
    request: NextRequest,
    { params }: { params: { sceneId: string } }
) {
    try {
        const result = await executeScene(params.sceneId);
        return NextResponse.json(result);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error executing scene:', error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
