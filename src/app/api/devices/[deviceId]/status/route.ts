import { NextRequest, NextResponse } from 'next/server';
import { getDeviceStatus } from '@/lib/switchbot';

export async function GET(
    request: NextRequest,
    { params }: { params: { deviceId: string } }
) {
    try {
        const result = await getDeviceStatus(params.deviceId);
        return NextResponse.json(result);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error fetching device status:', error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
