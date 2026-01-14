import { NextRequest, NextResponse } from 'next/server';
import { controlDevice } from '@/lib/switchbot';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// ミリ秒付きのタイムスタンプを取得
const getTimestamp = () => {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const ss = now.getSeconds().toString().padStart(2, '0');
    const sss = now.getMilliseconds().toString().padStart(3, '0');
    return `${hh}:${mm}:${ss}.${sss}`;
};

export async function POST(
    request: NextRequest,
    { params }: { params: { deviceId: string } }
) {
    try {
        const { command, parameter, commandType, deviceName, source } = await request.json();

        // Log User Action from UI
        if (source === 'UI') {
            console.log(`📝 [${getTimestamp()}] [User Action] Device Control: ${deviceName || params.deviceId} -> ${command}`);
        }

        const result = await controlDevice(params.deviceId, command, parameter, commandType);

        // Log to history directly (No fetch to avoid network issues)
        try {
            const DATA_FILE = path.join(process.cwd(), 'data', 'history.json');

            let cmdName = command;
            if (command === 'turnOn') cmdName = 'オン';
            if (command === 'turnOff') cmdName = 'オフ';
            if (command === 'lock') cmdName = '施錠';
            if (command === 'unlock') cmdName = '解錠';

            const newItem = {
                id: randomUUID(),
                type: 'device',
                message: `${deviceName || params.deviceId} : ${cmdName}操作を行いました`,
                details: { deviceId: params.deviceId, deviceName, command, parameter, source },
                timestamp: new Date().toISOString()
            };

            let history = [];
            if (fs.existsSync(DATA_FILE)) {
                try {
                    history = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
                    if (!Array.isArray(history)) history = [];
                } catch {
                    history = [];
                }
            }

            history.unshift(newItem);
            if (history.length > 1000) history = history.slice(0, 1000);

            fs.writeFileSync(DATA_FILE, JSON.stringify(history, null, 2), 'utf-8');
            // console.log(`✅ [${getTimestamp()}] History saved for ${deviceName || params.deviceId}`);
        } catch (e) {
            console.error(`❌ [${getTimestamp()}] History direct write error:`, e);
        }

        return NextResponse.json(result);
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`❌ [${getTimestamp()}] Error controlling device:`, error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
