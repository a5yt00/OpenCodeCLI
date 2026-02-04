import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    size?: number;
    children?: FileNode[];
}

export interface Symbol {
    name: string;
    type: 'function' | 'class' | 'interface' | 'variable' | 'export';
    file: string;
    line?: number;
}

export interface GitContext {
    branch: string;
    status: string;
    recentCommits: string[];
    changedFiles: string[];
}

export interface CodebaseContext {
    rootPath: string;
    fileTree: FileNode;
    fileCount: number;
    symbols: Symbol[];
    git?: GitContext;
    summary: string;
    lastIndexed: number;
}

// File patterns to skip during indexing
const IGNORE_PATTERNS = [
    'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
    '.cache', 'coverage', '.nyc_output', 'vendor', '.venv', 'venv'
];

const SOURCE_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift'
];

const MAX_FILES = 500;
const MAX_FILE_SIZE = 50000; // 50KB for symbol extraction

/**
 * Build a file tree of the project
 */
export function buildFileTree(dirPath: string, depth: number = 0, maxDepth: number = 5): FileNode | null {
    if (depth > maxDepth) return null;

    const name = path.basename(dirPath);
    if (IGNORE_PATTERNS.includes(name)) return null;

    try {
        const stat = fs.statSync(dirPath);

        if (stat.isFile()) {
            return {
                name,
                path: dirPath,
                type: 'file',
                size: stat.size
            };
        }

        if (stat.isDirectory()) {
            const entries = fs.readdirSync(dirPath);
            const children: FileNode[] = [];

            for (const entry of entries) {
                if (entry.startsWith('.')) continue;
                const child = buildFileTree(path.join(dirPath, entry), depth + 1, maxDepth);
                if (child) children.push(child);
            }

            return {
                name,
                path: dirPath,
                type: 'directory',
                children: children.sort((a, b) => {
                    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                    return a.name.localeCompare(b.name);
                })
            };
        }
    } catch (e) {
        // Skip inaccessible files
    }

    return null;
}

/**
 * Count files in tree
 */
export function countFiles(node: FileNode): number {
    if (node.type === 'file') return 1;
    return (node.children || []).reduce((sum, child) => sum + countFiles(child), 0);
}

/**
 * Extract symbols from source files (basic regex-based extraction)
 */
export function extractSymbols(rootPath: string, maxFiles: number = 50): Symbol[] {
    const symbols: Symbol[] = [];
    const sourceFiles: string[] = [];

    // Collect source files
    function collectFiles(dir: string) {
        if (sourceFiles.length >= maxFiles) return;

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (sourceFiles.length >= maxFiles) break;
                if (entry.name.startsWith('.') || IGNORE_PATTERNS.includes(entry.name)) continue;

                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    collectFiles(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (SOURCE_EXTENSIONS.includes(ext)) {
                        sourceFiles.push(fullPath);
                    }
                }
            }
        } catch (e) {
            // Skip inaccessible directories
        }
    }

    collectFiles(rootPath);

    // Extract symbols from each file
    for (const file of sourceFiles) {
        try {
            const stat = fs.statSync(file);
            if (stat.size > MAX_FILE_SIZE) continue;

            const content = fs.readFileSync(file, 'utf-8');
            const relativePath = path.relative(rootPath, file);
            const lines = content.split('\n');

            lines.forEach((line, idx) => {
                // Function declarations
                const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
                if (funcMatch) {
                    symbols.push({ name: funcMatch[1], type: 'function', file: relativePath, line: idx + 1 });
                }

                // Arrow functions as const
                const arrowMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/);
                if (arrowMatch) {
                    symbols.push({ name: arrowMatch[1], type: 'function', file: relativePath, line: idx + 1 });
                }

                // Class declarations
                const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/);
                if (classMatch) {
                    symbols.push({ name: classMatch[1], type: 'class', file: relativePath, line: idx + 1 });
                }

                // Interface declarations (TypeScript)
                const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
                if (interfaceMatch) {
                    symbols.push({ name: interfaceMatch[1], type: 'interface', file: relativePath, line: idx + 1 });
                }

                // Python functions and classes
                const pyFuncMatch = line.match(/^def\s+(\w+)/);
                if (pyFuncMatch) {
                    symbols.push({ name: pyFuncMatch[1], type: 'function', file: relativePath, line: idx + 1 });
                }

                const pyClassMatch = line.match(/^class\s+(\w+)/);
                if (pyClassMatch) {
                    symbols.push({ name: pyClassMatch[1], type: 'class', file: relativePath, line: idx + 1 });
                }
            });
        } catch (e) {
            // Skip unreadable files
        }
    }

    return symbols;
}

/**
 * Get git context for the repository
 */
export function getGitContext(repoPath: string): GitContext | undefined {
    try {
        // Check if it's a git repo
        const gitDir = path.join(repoPath, '.git');
        if (!fs.existsSync(gitDir)) return undefined;

        const execOpts = { cwd: repoPath, encoding: 'utf-8' as const };

        // Get current branch
        let branch = 'unknown';
        try {
            branch = execSync('git rev-parse --abbrev-ref HEAD', execOpts).toString().trim();
        } catch (e) { /* ignore */ }

        // Get status
        let status = '';
        try {
            status = execSync('git status --short', execOpts).toString().trim();
        } catch (e) { /* ignore */ }

        // Get recent commits
        const recentCommits: string[] = [];
        try {
            const log = execSync('git log --oneline -5', execOpts).toString().trim();
            if (log) recentCommits.push(...log.split('\n'));
        } catch (e) { /* ignore */ }

        // Get changed files
        const changedFiles: string[] = [];
        try {
            const diff = execSync('git diff --name-only', execOpts).toString().trim();
            if (diff) changedFiles.push(...diff.split('\n'));
            const staged = execSync('git diff --staged --name-only', execOpts).toString().trim();
            if (staged) {
                for (const f of staged.split('\n')) {
                    if (!changedFiles.includes(f)) changedFiles.push(f);
                }
            }
        } catch (e) { /* ignore */ }

        return { branch, status, recentCommits, changedFiles };
    } catch (e) {
        return undefined;
    }
}

/**
 * Build complete codebase context
 */
export function buildCodebaseContext(rootPath: string = process.cwd()): CodebaseContext {
    const fileTree = buildFileTree(rootPath) || { name: path.basename(rootPath), path: rootPath, type: 'directory' as const, children: [] };
    const fileCount = countFiles(fileTree);
    const symbols = extractSymbols(rootPath);
    const git = getGitContext(rootPath);

    // Build summary
    const parts: string[] = [];
    parts.push(`📁 ${fileCount} files indexed`);
    parts.push(`🔤 ${symbols.length} symbols found`);
    if (git) {
        parts.push(`🌿 Branch: ${git.branch}`);
        if (git.changedFiles.length > 0) {
            parts.push(`📝 ${git.changedFiles.length} changed files`);
        }
    }

    return {
        rootPath,
        fileTree,
        fileCount,
        symbols,
        git,
        summary: parts.join(' | '),
        lastIndexed: Date.now()
    };
}

/**
 * Format context for LLM prompt
 */
export function formatContextForPrompt(ctx: CodebaseContext): string {
    const lines: string[] = [];

    lines.push('# Codebase Context');
    lines.push('');
    lines.push(`Root: ${ctx.rootPath}`);
    lines.push(`Files: ${ctx.fileCount} | Symbols: ${ctx.symbols.length}`);

    if (ctx.git) {
        lines.push('');
        lines.push('## Git');
        lines.push(`Branch: ${ctx.git.branch}`);
        if (ctx.git.changedFiles.length > 0) {
            lines.push(`Changed: ${ctx.git.changedFiles.slice(0, 10).join(', ')}${ctx.git.changedFiles.length > 10 ? '...' : ''}`);
        }
        if (ctx.git.recentCommits.length > 0) {
            lines.push('Recent commits:');
            ctx.git.recentCommits.slice(0, 3).forEach(c => lines.push(`  - ${c}`));
        }
    }

    // Key symbols (limit to avoid overwhelming context)
    if (ctx.symbols.length > 0) {
        lines.push('');
        lines.push('## Key Symbols');
        const classes = ctx.symbols.filter(s => s.type === 'class').slice(0, 10);
        const functions = ctx.symbols.filter(s => s.type === 'function').slice(0, 15);
        const interfaces = ctx.symbols.filter(s => s.type === 'interface').slice(0, 10);

        if (classes.length > 0) {
            lines.push(`Classes: ${classes.map(s => s.name).join(', ')}`);
        }
        if (interfaces.length > 0) {
            lines.push(`Interfaces: ${interfaces.map(s => s.name).join(', ')}`);
        }
        if (functions.length > 0) {
            lines.push(`Functions: ${functions.map(s => s.name).join(', ')}`);
        }
    }

    return lines.join('\n');
}

/**
 * Format file tree as string (for display)
 */
export function formatFileTree(node: FileNode, prefix: string = '', isLast: boolean = true): string {
    const lines: string[] = [];
    const marker = isLast ? '└── ' : '├── ';
    const icon = node.type === 'directory' ? '📁' : '📄';

    lines.push(`${prefix}${marker}${icon} ${node.name}`);

    if (node.children && node.children.length > 0) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        node.children.forEach((child, idx) => {
            const isChildLast = idx === node.children!.length - 1;
            lines.push(formatFileTree(child, childPrefix, isChildLast));
        });
    }

    return lines.join('\n');
}
