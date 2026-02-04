import * as fs from 'fs';
import * as path from 'path';

/** Project files to auto-load for context */
const PROJECT_FILES = [
    'package.json',
    'README.md',
    'requirements.txt',
    'Cargo.toml',
    'go.mod',
    'pyproject.toml',
    '.env.example',
    'tsconfig.json',
    'tsconfig.base.json'
];

const MAX_FILE_SIZE = 8000;

export interface ProjectContext {
    summary: string;
    files: { path: string; content: string }[];
}

export function gatherProjectContext(cwd: string = process.cwd()): ProjectContext {
    const files: { path: string; content: string }[] = [];

    for (const name of PROJECT_FILES) {
        const fullPath = path.join(cwd, name);
        try {
            if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const truncated = content.length > MAX_FILE_SIZE
                    ? content.slice(0, MAX_FILE_SIZE) + '\n... (truncated)'
                    : content;
                files.push({ path: name, content: truncated });
            }
        } catch (_) {
            /* skip */
        }
    }

    const summary = files.length > 0
        ? `Project context (${files.length} files): ${files.map(f => f.path).join(', ')}`
        : 'No standard project files found.';

    return { summary, files };
}

export function formatProjectContextForPrompt(ctx: ProjectContext): string {
    if (ctx.files.length === 0) return '';

    const parts = [ctx.summary, ''];
    for (const { path: p, content } of ctx.files) {
        parts.push(`--- ${p} ---`);
        parts.push(content);
        parts.push('');
    }
    return parts.join('\n');
}
