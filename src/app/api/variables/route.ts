import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { UserVariable } from '@/types/automation';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'variables.json');

// データ初期化
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

import { getLocalQuota } from '@/lib/switchbot';

export async function GET() {
    try {
        const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
        const variables: UserVariable[] = JSON.parse(fileContent);
        const quota = getLocalQuota();
        return NextResponse.json({ variables, quota });
    } catch (error) {
        console.error('Failed to read variables:', error);
        return NextResponse.json({ error: 'Failed to read variables' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const newVariables: UserVariable[] = await req.json();

        const { searchParams } = new URL(req.url);
        const source = searchParams.get('source');

        // Log changes directly (No fetch to avoid network issues)
        try {
            const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
            const oldVariables: UserVariable[] = JSON.parse(fileContent);
            const HISTORY_FILE = path.join(process.cwd(), 'data', 'history.json');

            newVariables.forEach(nv => {
                const ov = oldVariables.find(v => v.id === nv.id);
                if (ov && ov.value !== nv.value) {
                    const newItem = {
                        id: randomUUID(),
                        type: 'variable',
                        message: `変数「${nv.name}」が ${nv.value ? 'ON' : 'OFF'} に変更されました`,
                        details: { variableId: nv.id, oldValue: ov.value, newValue: nv.value, source: source || undefined },
                        timestamp: new Date().toISOString()
                    };

                    let history = [];
                    if (fs.existsSync(HISTORY_FILE)) {
                        try {
                            history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
                            if (!Array.isArray(history)) history = [];
                        } catch { history = []; }
                    }

                    history.unshift(newItem);
                    if (history.length > 1000) history = history.slice(0, 1000);

                    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
                    console.log(`✅ History saved for variable ${nv.name} (Direct Write)`);
                }
            });
        } catch (e) {
            console.error('❌ History direct write error (variables):', e);
        }

        fs.writeFileSync(DATA_FILE, JSON.stringify(newVariables, null, 2), 'utf8');
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to save variables:', error);
        return NextResponse.json({ error: 'Failed to save variables' }, { status: 500 });
    }
}
