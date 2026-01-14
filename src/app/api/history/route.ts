import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { HistoryItem } from '../../../types/history';

const DATA_FILE = path.join(process.cwd(), 'data', 'history.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DATA_FILE))) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

// Initial data if file doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]), 'utf-8');
}

export async function GET() {
    try {
        const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
        const history: HistoryItem[] = JSON.parse(fileContent);
        // Sort by timestamp desc (newest first)
        history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return NextResponse.json(history);
    } catch {
        return NextResponse.json({ error: 'Failed to read history' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const newItem: HistoryItem = await request.json();

        // Validate required fields
        if (!newItem.message || !newItem.type) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
        let history: HistoryItem[] = JSON.parse(fileContent);

        // Add ID and Timestamp if missing
        const itemToAdd = {
            ...newItem,
            id: newItem.id || crypto.randomUUID(),
            timestamp: newItem.timestamp || new Date().toISOString()
        };

        // Prepend new item
        history.unshift(itemToAdd);

        // Limit to 1000 items
        if (history.length > 1000) {
            history = history.slice(0, 1000);
        }

        fs.writeFileSync(DATA_FILE, JSON.stringify(history, null, 2), 'utf-8');
        return NextResponse.json(itemToAdd);
    } catch {
        return NextResponse.json({ error: 'Failed to save history' }, { status: 500 });
    }
}
