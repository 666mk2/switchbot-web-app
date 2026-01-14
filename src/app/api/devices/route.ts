import { NextResponse } from 'next/server';
import { getDevices, SwitchBotError } from '@/lib/switchbot';

export async function GET() {
    try {
        const devices = await getDevices();
        return NextResponse.json(devices);
    } catch (error: unknown) {
        if (error instanceof SwitchBotError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching devices:', error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

