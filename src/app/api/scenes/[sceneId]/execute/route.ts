import { NextRequest, NextResponse } from 'next/server';
import { executeScene, SwitchBotError } from '@/lib/switchbot';

export async function POST(
    request: NextRequest,
    { params }: { params: { sceneId: string } }
) {
    const { sceneId } = params;

    try {
        const result = await executeScene(sceneId);
        return NextResponse.json(result);
    } catch (error: unknown) {
        if (error instanceof SwitchBotError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error executing scene (${sceneId}):`, error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
