import { promises as fs } from 'fs';
import * as path from 'path';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import * as readlineSync from 'readline-sync';
import { logVerbose } from './logger';
import { auditLog } from './audit';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export interface ToolCall {
    function: {
        name: string;
        arguments: string; // JSON string
    };
    id?: string;
}

export interface ToolResult {
    tool_call_id: string; // Match OpenAI format
    role: 'tool';
    name: string;
    content: string;
}

export const TOOLS_DEFINITION = [
    {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Create or overwrite a file with content',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path' },
                    content: { type: 'string', description: 'File content' }
                },
                required: ['path', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read the contents of a file',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_files',
            description: 'List files in a directory',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Directory path (default .)' }
                },
                required: ['path']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_command',
            description: 'Run a shell command',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'Command to run' }
                },
                required: ['command']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'git_status',
            description: 'Get git status (working tree, staged, untracked)',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Repo path (default .)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'git_diff',
            description: 'Get git diff (unstaged or staged changes)',
            parameters: {
                type: 'object',
                properties: {
                    staged: { type: 'boolean', description: 'Show staged diff (default false)' },
                    path: { type: 'string', description: 'Repo path (default .)' }
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'git_add',
            description: 'Stage files for commit (git add)',
            parameters: {
                type: 'object',
                properties: {
                    paths: { type: 'string', description: 'File paths to stage (space-separated or . for all)' },
                    path: { type: 'string', description: 'Repo path (default .)' }
                },
                required: ['paths']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'git_commit',
            description: 'Create a git commit',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'Commit message' },
                    path: { type: 'string', description: 'Repo path (default .)' }
                },
                required: ['message']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'git_stash',
            description: 'Stash or pop changes (git stash push/pop)',
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', description: 'push or pop' },
                    message: { type: 'string', description: 'Optional message for stash push' },
                    path: { type: 'string', description: 'Repo path (default .)' }
                },
                required: ['action']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'grep_search',
            description: 'Search for a pattern in files. Returns matching lines with file paths and line numbers.',
            parameters: {
                type: 'object',
                properties: {
                    pattern: { type: 'string', description: 'Search pattern (regex or text)' },
                    path: { type: 'string', description: 'File or directory path to search (default .)' },
                    recursive: { type: 'boolean', description: 'Search recursively in directories (default true)' },
                    ignore_case: { type: 'boolean', description: 'Case-insensitive search (default false)' }
                },
                required: ['pattern']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'edit_file',
            description: 'Edit a file by replacing specific text. Use for partial edits instead of rewriting the whole file.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'File path to edit' },
                    old_text: { type: 'string', description: 'Exact text to find and replace' },
                    new_text: { type: 'string', description: 'Replacement text' }
                },
                required: ['path', 'old_text', 'new_text']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_directory',
            description: 'Create a directory (and parent directories if needed)',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Directory path to create' }
                },
                required: ['path']
            }
        }
    }
];

export interface ToolExecutorOptions {
    autoApproveCommands?: boolean;
    pluginHandlers?: Map<string, (args: Record<string, unknown>) => Promise<string>>;
    dryRun?: boolean;
    allowlistCommands?: string[];
    quiet?: boolean;
}

export class ToolExecutor {
    private workspaceRoot: string;
    private autoApproveCommands: boolean;
    private pluginHandlers: Map<string, (args: Record<string, unknown>) => Promise<string>>;
    private dryRun: boolean;
    private allowlistCommands: Set<string>;
    private quiet: boolean;

    constructor(options?: ToolExecutorOptions) {
        this.workspaceRoot = process.cwd();
        this.autoApproveCommands = options?.autoApproveCommands ?? false;
        this.pluginHandlers = options?.pluginHandlers ?? new Map();
        this.dryRun = options?.dryRun ?? false;
        this.allowlistCommands = new Set((options?.allowlistCommands ?? []).map(c => c.toLowerCase().trim()));
        this.quiet = options?.quiet ?? false;
    }

    private log(...args: unknown[]) {
        if (!this.quiet) console.log(...args);
    }

    async execute(call: ToolCall): Promise<ToolResult> {
        const name = call.function.name;
        const callId = call.id || 'call_' + Math.random().toString(36).substr(2, 9);

        let args: any;
        try {
            args = JSON.parse(call.function.arguments);
        } catch (e) {
            return {
                tool_call_id: callId,
                role: 'tool',
                name,
                content: `Error parsing arguments: ${e}`
            };
        }

        if (this.dryRun) {
            const dryMsg = `[DRY-RUN] Would execute: ${name}(${JSON.stringify(args)})`;
            this.log(chalk.yellow(`\n🔨 ${dryMsg}`));
            auditLog({ tool: name, args, result: dryMsg });
            return {
                tool_call_id: callId,
                role: 'tool',
                name,
                content: dryMsg
            };
        }

        this.log(chalk.blue(`\n🔨 Tool: ${name}`));
        logVerbose(`   Args:`, args);

        let output = '';

        try {
            switch (name) {
                case 'write_file':
                case 'create_file': // Alias
                case 'file_write':  // Alias
                    output = await this.writeFile(args.path, args.content);
                    break;

                case 'read_file':
                case 'file_read': // Alias
                    output = await this.readFile(args.path);
                    break;

                case 'list_files':
                case 'ls': // Alias
                    output = await this.listFiles(args.path || '.');
                    break;

                case 'run_command':
                case 'shell': // Alias
                case 'bash': // Alias
                    output = await this.runCommand(args.command);
                    break;

                case 'git_status':
                    output = await this.gitStatus(args.path || '.');
                    break;

                case 'git_diff':
                    output = await this.gitDiff(args.staged === true, args.path || '.');
                    break;

                case 'git_add':
                    output = await this.gitAdd(args.paths, args.path || '.');
                    break;

                case 'git_commit':
                    output = await this.gitCommit(args.message, args.path || '.');
                    break;

                case 'git_stash':
                    output = await this.gitStash(args.action, args.message, args.path || '.');
                    break;

                case 'grep_search':
                case 'search':
                case 'grep':
                    output = await this.grepSearch(args.pattern, args.path || '.', args.recursive !== false, args.ignore_case === true);
                    break;

                case 'edit_file':
                case 'patch_file':
                    output = await this.editFile(args.path, args.old_text, args.new_text);
                    break;

                case 'create_directory':
                case 'mkdir':
                    output = await this.createDirectory(args.path);
                    break;

                default: {
                    const handler = this.pluginHandlers.get(name);
                    if (handler) {
                        output = await handler(args);
                    } else {
                        output = `Unknown tool: ${name}`;
                    }
                    break;
                }
            }
        } catch (err: any) {
            output = `Error: ${err.message}`;
            auditLog({ tool: name, args, error: err.message });
        }

        auditLog({ tool: name, args, result: output });
        return {
            tool_call_id: callId,
            role: 'tool',
            name,
            content: output
        };
    }

    private resolvePath(filePath: string): string {
        return path.resolve(this.workspaceRoot, filePath);
    }

    private async writeFile(filePath: string, content: string): Promise<string> {
        const fullPath = this.resolvePath(filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
        this.log(chalk.green(`   ✅ Wrote to ${filePath}`));
        return `Successfully wrote to ${filePath}`;
    }

    private async readFile(filePath: string): Promise<string> {
        const fullPath = this.resolvePath(filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        this.log(chalk.green(`   ✅ Read ${filePath} (${content.length} chars)`));
        return content;
    }

    private async listFiles(dirPath: string): Promise<string> {
        const fullPath = this.resolvePath(dirPath);
        const files = await fs.readdir(fullPath);
        this.log(chalk.green(`   ✅ Listed ${files.length} files in ${dirPath}`));
        return files.join('\n');
    }

    private async runCommand(command: string): Promise<string> {
        this.log(chalk.yellow(`   ⚠️  Agent wants to run: ${command}`));

        const cmdBase = (command.trim().split(/\s+/)[0] || '').toLowerCase();
        const isAllowlisted = this.allowlistCommands.size > 0 && this.allowlistCommands.has(cmdBase);
        const shouldAutoApprove = this.autoApproveCommands && (this.allowlistCommands.size === 0 || isAllowlisted);

        if (!shouldAutoApprove) {
            if (this.autoApproveCommands && this.allowlistCommands.size > 0 && !isAllowlisted) {
                this.log(chalk.red(`   ❌ Command "${cmdBase}" not in allowlist. Denied.`));
                return `Command "${cmdBase}" not in allowlist. Use --allow "cmd1,cmd2" to add.`;
            }
            const answer = readlineSync.question('   Allow? (y/n): ');
            if (answer.toLowerCase() !== 'y') {
                this.log(chalk.red('   ❌ Denied by user'));
                return 'User denied command execution.';
            }
        } else {
            this.log(chalk.gray('   Auto-approved (--yes)'));
        }

        this.log(chalk.gray('   Running...'));
        try {
            const { stdout, stderr } = await execAsync(command, { cwd: this.workspaceRoot });
            // console.log(chalk.green('   Command finished.'));
            return stdout + (stderr ? `\nStderr: ${stderr}` : '');
        } catch (e: any) {
            this.log(chalk.red(`   ❌ Command failed`));
            return `Command failed: ${e.message}\nStdout: ${e.stdout}\nStderr: ${e.stderr}`;
        }
    }

    private async gitStatus(repoPath: string): Promise<string> {
        const fullPath = this.resolvePath(repoPath);
        try {
            const { stdout, stderr } = await execAsync('git status', { cwd: fullPath });
            this.log(chalk.green(`   ✅ Git status for ${repoPath}`));
            return stdout + (stderr ? `\n${stderr}` : '');
        } catch (e: any) {
            return `Not a git repo or error: ${e.message}`;
        }
    }

    private async gitDiff(staged: boolean, repoPath: string): Promise<string> {
        const fullPath = this.resolvePath(repoPath);
        const cmd = staged ? 'git diff --staged' : 'git diff';
        try {
            const { stdout, stderr } = await execAsync(cmd, { cwd: fullPath });
            this.log(chalk.green(`   ✅ Git diff ${staged ? '(staged)' : ''} for ${repoPath}`));
            return stdout || '(no changes)' + (stderr ? `\n${stderr}` : '');
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }

    private async gitAdd(paths: string, repoPath: string): Promise<string> {
        const fullPath = this.resolvePath(repoPath);
        const pathArgs = paths.trim().split(/\s+/).filter(Boolean);
        if (pathArgs.length === 0) pathArgs.push('.');
        try {
            const { stdout, stderr } = await execFileAsync('git', ['add', ...pathArgs], { cwd: fullPath });
            this.log(chalk.green(`   ✅ Git add ${paths}`));
            return (stdout || 'Staged.') + (stderr ? `\n${stderr}` : '');
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }

    private async gitCommit(message: string, repoPath: string): Promise<string> {
        const fullPath = this.resolvePath(repoPath);
        try {
            const { stdout, stderr } = await execFileAsync('git', ['commit', '-m', message], { cwd: fullPath });
            this.log(chalk.green(`   ✅ Git commit`));
            return (stdout || 'Committed.') + (stderr ? `\n${stderr}` : '');
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }

    private async gitStash(action: string, message?: string, repoPath?: string): Promise<string> {
        const fullPath = this.resolvePath(repoPath || '.');
        const args = action === 'pop' ? ['stash', 'pop'] : message ? ['stash', 'push', '-m', message] : ['stash', 'push'];
        try {
            const { stdout, stderr } = await execFileAsync('git', args, { cwd: fullPath });
            this.log(chalk.green(`   ✅ Git stash ${action}`));
            return (stdout || 'Done.') + (stderr ? `\n${stderr}` : '');
        } catch (e: any) {
            return `Error: ${e.message}`;
        }
    }

    private async grepSearch(pattern: string, searchPath: string, recursive: boolean, ignoreCase: boolean): Promise<string> {
        const fullPath = this.resolvePath(searchPath);
        const results: string[] = [];
        const maxResults = 50;

        const searchFile = async (filePath: string) => {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                const lines = content.split('\n');
                const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');

                lines.forEach((line, idx) => {
                    if (results.length >= maxResults) return;
                    if (regex.test(line)) {
                        const relativePath = path.relative(this.workspaceRoot, filePath);
                        results.push(`${relativePath}:${idx + 1}: ${line.trim()}`);
                    }
                    regex.lastIndex = 0; // Reset for next test
                });
            } catch (e) {
                // Skip binary or unreadable files
            }
        };

        const searchDir = async (dirPath: string) => {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (results.length >= maxResults) break;
                const entryPath = path.join(dirPath, entry.name);

                // Skip hidden and common non-source directories
                if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
                    continue;
                }

                if (entry.isDirectory() && recursive) {
                    await searchDir(entryPath);
                } else if (entry.isFile()) {
                    await searchFile(entryPath);
                }
            }
        };

        try {
            const stats = await fs.stat(fullPath);
            if (stats.isFile()) {
                await searchFile(fullPath);
            } else if (stats.isDirectory()) {
                await searchDir(fullPath);
            }
        } catch (e: any) {
            return `Error: ${e.message}`;
        }

        this.log(chalk.green(`   ✅ Found ${results.length} matches for "${pattern}"`));
        if (results.length === 0) {
            return `No matches found for "${pattern}"`;
        }
        return results.join('\n') + (results.length >= maxResults ? `\n... (limited to ${maxResults} results)` : '');
    }

    private async editFile(filePath: string, oldText: string, newText: string): Promise<string> {
        const fullPath = this.resolvePath(filePath);

        try {
            const content = await fs.readFile(fullPath, 'utf-8');

            if (!content.includes(oldText)) {
                return `Error: Could not find the specified text in ${filePath}. Make sure to use exact matching text.`;
            }

            const occurrences = content.split(oldText).length - 1;
            const newContent = content.replace(oldText, newText);

            await fs.writeFile(fullPath, newContent, 'utf-8');
            this.log(chalk.green(`   ✅ Edited ${filePath} (replaced ${occurrences} occurrence(s))`));
            return `Successfully edited ${filePath}. Replaced ${occurrences} occurrence(s).`;
        } catch (e: any) {
            return `Error editing file: ${e.message}`;
        }
    }

    private async createDirectory(dirPath: string): Promise<string> {
        const fullPath = this.resolvePath(dirPath);

        try {
            await fs.mkdir(fullPath, { recursive: true });
            this.log(chalk.green(`   ✅ Created directory ${dirPath}`));
            return `Successfully created directory ${dirPath}`;
        } catch (e: any) {
            return `Error creating directory: ${e.message}`;
        }
    }
}
