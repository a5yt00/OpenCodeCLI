import * as fs from 'fs';
import * as path from 'path';
import { Message } from './llm-client';

export function loadSession(filePath: string): Message[] {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`Session file not found: ${fullPath}`);
    }
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) {
        throw new Error('Invalid session format: expected array of messages');
    }
    return data as Message[];
}

export function saveSession(messages: Message[], filePath: string): void {
    const fullPath = path.resolve(process.cwd(), filePath);
    fs.writeFileSync(fullPath, JSON.stringify(messages, null, 2), 'utf-8');
}
