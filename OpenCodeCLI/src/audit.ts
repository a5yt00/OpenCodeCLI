import * as fs from 'fs';
import * as path from 'path';

let auditPath: string | null = null;

export function setAuditLog(filePath: string | null) {
    auditPath = filePath;
}

export function getAuditPath(): string | null {
    return auditPath;
}

export function auditLog(entry: { tool: string; args: unknown; result?: string; error?: string }) {
    if (!auditPath) return;
    try {
        const line = JSON.stringify({
            ts: new Date().toISOString(),
            cwd: process.cwd(),
            ...entry
        }) + '\n';
        fs.appendFileSync(auditPath, line, 'utf-8');
    } catch (_) {
        /* ignore */
    }
}
