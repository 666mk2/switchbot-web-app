import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { AutomationRule } from '@/types/automation';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'automations.json');

// データ初期化
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

export async function GET() {
    try {
        const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
        const rules: AutomationRule[] = JSON.parse(fileContent);
        return NextResponse.json(rules);
    } catch (error) {
        console.error('Failed to read automations:', error);
        return NextResponse.json({ error: 'Failed to read automations' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const newRules: AutomationRule[] = await req.json();
        fs.writeFileSync(DATA_FILE, JSON.stringify(newRules, null, 2), 'utf8');
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to save automations:', error);
        return NextResponse.json({ error: 'Failed to save automations' }, { status: 500 });
    }
}
