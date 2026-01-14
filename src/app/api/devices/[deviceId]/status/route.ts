import { NextRequest, NextResponse } from 'next/server';
import { getDeviceStatus, SwitchBotError } from '@/lib/switchbot';

export async function GET(
    request: NextRequest,
    { params }: { params: { deviceId: string } }
) {
    const { deviceId } = params;

    try {
        const status = await getDeviceStatus(deviceId);
        return NextResponse.json(status);
    } catch (error: unknown) {
        if (error instanceof SwitchBotError) {
            return NextResponse.json({ error: error.message }, { status: error.statusCode });
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error fetching device status (${deviceId}):`, error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
