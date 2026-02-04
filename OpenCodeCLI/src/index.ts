#!/usr/bin/env node
import * as readline from 'readline';
import * as os from 'os';
import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { loadConfig } from './config';
import { LLMClient } from './llm-client';
import { ToolExecutor, TOOLS_DEFINITION } from './tools';
import { Agent } from './agent';
import { gatherProjectContext, formatProjectContextForPrompt } from './project';
import { loadSession } from './session';
import { loadPlugins } from './plugins';
import { setLogLevel, getLogLevel } from './logger';
import { setAuditLog } from './audit';
import { renderTitleBar, renderBanner, renderInputPrompt, renderInputAreaTop, renderResponseSeparator, renderAssistantHeader, renderGoodbye } from './ui';
// Advanced features
import { buildCodebaseContext, formatContextForPrompt, formatFileTree, CodebaseContext } from './context';
import { remember, forget, getMemories, searchMemories, getRelevantMemories, formatMemoriesForPrompt, getMemoryStats } from './memory';
import { getAgent, listAgents, runSubAgent, formatAgentList } from './agents';
import { loadSkills, getSkill, findRelevantSkills, formatSkillForPrompt, formatSkillList, createSampleSkills } from './skills';

import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

marked.setOptions({
    // @ts-ignore
    renderer: new TerminalRenderer()
});

type CliAction = 'repl' | 'help' | 'version' | 'run';

interface CliOptions {
    configPath?: string;
    showBanner: boolean;
    runPrompt?: string;
    autoApprove?: boolean;
    stream?: boolean;
    sessionPath?: string;
    pluginDir?: string;
    noProject?: boolean;
    verbose?: boolean;
    quiet?: boolean;
    debug?: boolean;
    dryRun?: boolean;
    allowCommands?: string[];
    auditLogPath?: string;
}

interface ParsedCli {
    action: CliAction;
    options: CliOptions;
}

function printGlobalHelp() {
    console.log(chalk.bold.cyan('OpenCode CLI Agent'));
    console.log('');
    console.log(chalk.bold('Usage:'));
    console.log('  opencode [options]');
    console.log('');
    console.log(chalk.bold('Global options:'));
    console.log('  --help, -h        Show this help and exit');
    console.log('  --version, -v     Show version and exit');
    console.log('  --config <path>   Use a specific config file instead of the default');
    console.log('  --no-banner       Start without the startup banner');
    console.log('  --run <prompt>    Run a single prompt non-interactively and exit');
    console.log('  --yes, -y         Auto-approve shell commands (use with --run for scripts)');
    console.log('  --stream          Stream LLM response tokens as they arrive');
    console.log('  --session <path>  Load a saved session on startup');
    console.log('  --plugin-dir      Directory for plugin tools (~/.config/opencode/plugins)');
    console.log('  --no-project      Skip auto-loading project context (package.json, README)');
    console.log('  --verbose, -V     Verbose output (tool details)');
    console.log('  --quiet, -q       Minimal output');
    console.log('  --debug           Debug mode (log requests/responses)');
    console.log('  --dry-run         Show planned tool actions without executing');
    console.log('  --allow <list>    Comma-separated commands to auto-approve with --yes');
    console.log('  --audit-log <path>  Log tool executions to file');
    console.log('');
    console.log(chalk.bold('Interactive REPL:'));
    console.log('  Once running, type /help for available in-session commands.');
}

function printVersion() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pkg = require('../package.json') as { version?: string };
        console.log(pkg.version || 'unknown');
    } catch {
        console.log('unknown');
    }
}

function parseCliArgs(argv: string[]): ParsedCli {
    const options: CliOptions = {
        showBanner: true
    };

    let action: CliAction = 'repl';

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        switch (arg) {
            case '--help':
            case '-h':
                action = 'help';
                break;
            case '--version':
            case '-v':
                action = 'version';
                break;
            case '--config': {
                const next = argv[i + 1];
                if (!next || next.startsWith('-')) {
                    console.error(chalk.red('   ❌ Missing path for --config <path>'));
                    printGlobalHelp();
                    process.exit(1);
                }
                options.configPath = next;
                i++;
                break;
            }
            case '--no-banner':
                options.showBanner = false;
                break;
            case '--yes':
            case '-y':
                options.autoApprove = true;
                break;
            case '--run': {
                const next = argv[i + 1];
                if (!next || next.startsWith('-')) {
                    console.error(chalk.red('   ❌ Missing prompt for --run <prompt>'));
                    printGlobalHelp();
                    process.exit(1);
                }
                options.runPrompt = next;
                action = 'run';
                i++;
                break;
            }
            case '--stream':
                options.stream = true;
                break;
            case '--session': {
                const next = argv[i + 1];
                if (!next || next.startsWith('-')) {
                    console.error(chalk.red('   ❌ Missing path for --session <path>'));
                    printGlobalHelp();
                    process.exit(1);
                }
                options.sessionPath = next;
                i++;
                break;
            }
            case '--plugin-dir': {
                const next = argv[i + 1];
                if (!next || next.startsWith('-')) {
                    options.pluginDir = path.join(os.homedir(), '.config', 'opencode', 'plugins');
                } else {
                    options.pluginDir = next;
                    i++;
                }
                break;
            }
            case '--no-project':
                options.noProject = true;
                break;
            case '--verbose':
            case '-V':
                options.verbose = true;
                break;
            case '--quiet':
            case '-q':
                options.quiet = true;
                break;
            case '--debug':
                options.debug = true;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--allow': {
                const next = argv[i + 1];
                if (!next || next.startsWith('-')) {
                    console.error(chalk.red('   ❌ Missing list for --allow <cmd1,cmd2,...>'));
                    printGlobalHelp();
                    process.exit(1);
                }
                options.allowCommands = next.split(',').map(s => s.trim()).filter(Boolean);
                i++;
                break;
            }
            case '--audit-log': {
                const next = argv[i + 1];
                if (!next || next.startsWith('-')) {
                    console.error(chalk.red('   ❌ Missing path for --audit-log <path>'));
                    printGlobalHelp();
                    process.exit(1);
                }
                options.auditLogPath = next;
                i++;
                break;
            }
            default:
                if (arg.startsWith('-')) {
                    console.error(chalk.red(`   ❌ Unknown option: ${arg}`));
                } else {
                    console.error(chalk.red(`   ❌ Unexpected argument: ${arg}`));
                }
                printGlobalHelp();
                process.exit(1);
        }
    }

    return { action, options };
}

interface ReplContext {
    agent: Agent;
    config: ReturnType<typeof loadConfig>;
    options: CliOptions;
}

type CommandHandler = (args: string[], context: ReplContext) => Promise<void> | void;

// Track last input for /retry
let lastUserInput: string | null = null;
let lastInputFailed = false;

const replCommands: Record<string, CommandHandler> = {
    '/save': (args, { agent }) => {
        const sessionPath = args[0] ? path.resolve(process.cwd(), args[0]) : path.join(process.cwd(), `session_${Date.now()}.json`);
        const history = agent.getHistory();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('fs').writeFileSync(sessionPath, JSON.stringify(history, null, 2));
        console.log(chalk.green(`   💾 Session saved to ${sessionPath}`));
    },
    '/load': (args, { agent }) => {
        if (args.length < 1) {
            console.log(chalk.red('   ❌ Usage: /load <session_path>'));
            return;
        }
        try {
            const messages = loadSession(args[0]);
            agent.setHistory(messages);
            console.log(chalk.green(`   ✅ Loaded session (${messages.length} messages)`));
        } catch (e: any) {
            console.log(chalk.red(`   ❌ ${e.message}`));
        }
    },
    '/clear': (args, { agent }) => {
        agent.clearHistory();
        lastUserInput = null;
        lastInputFailed = false;
        console.log(chalk.green('   🧹 Context cleared.'));
    },
    '/add': (args, { agent }) => {
        if (args.length < 1) {
            console.log(chalk.red('   ❌ Usage: /add <file_path>'));
            return;
        }
        const filePath = args[0];
        try {
            // For simplicity, read directly from the filesystem.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const fs = require('fs') as typeof import('fs');
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pathModule = require('path') as typeof import('path');
            const fullPath = pathModule.resolve(process.cwd(), filePath);

            if (!fs.existsSync(fullPath)) {
                console.log(chalk.red(`   ❌ File not found: ${filePath}`));
                console.log(chalk.gray(`      Checked: ${fullPath}`));
                return;
            }

            const content = fs.readFileSync(fullPath, 'utf-8');
            agent.addToContext('user', `Context from file ${filePath}:\n\`\`\`\n${content}\n\`\`\``);
            console.log(chalk.green(`   ✅ Added ${filePath} to context (${content.length} chars)`));
        } catch (e: any) {
            console.log(chalk.red(`   ❌ Error reading file: ${e.message}`));
        }
    },
    '/ping': async (args, { config }) => {
        console.log(chalk.yellow('\n🔍 Testing connection...'));
        const url = `${config.baseURL}/models`;
        const startTime = Date.now();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal as any
            });

            clearTimeout(timeoutId);
            const latency = Date.now() - startTime;

            if (response.ok) {
                const data: any = await response.json();
                const modelCount = data.data?.length || 0;
                console.log(chalk.green(`   ✅ Connected! (${latency}ms)`));
                console.log(chalk.gray(`   Endpoint: ${config.baseURL}`));
                console.log(chalk.gray(`   Models available: ${modelCount}`));
                if (data.data && data.data.length > 0) {
                    console.log(chalk.gray(`   Available: ${data.data.map((m: any) => m.id).join(', ')}`));
                }
            } else {
                console.log(chalk.red(`   ❌ Server responded with ${response.status}`));
            }
        } catch (e: any) {
            const latency = Date.now() - startTime;
            if (e.name === 'AbortError') {
                console.log(chalk.red(`   ❌ Connection timeout (${latency}ms)`));
            } else {
                console.log(chalk.red(`   ❌ Connection failed: ${e.message}`));
            }
            console.log(chalk.gray(`   Endpoint: ${config.baseURL}`));
        }
    },
    '/model': (args, { config }) => {
        if (args.length === 0) {
            console.log(chalk.yellow('\n🤖 Current Model:'));
            console.log(`   ${config.model}`);
            console.log(chalk.gray('\n   💡 Use /model <name> to switch models'));
            console.log(chalk.gray('   💡 Use /ping to see available models'));
            return;
        }

        const newModel = args.join(' ').replace(/^["']|["']$/g, '').trim();
        const oldModel = config.model;
        config.model = newModel;

        // Update config file
        const homeDir = os.homedir();
        const configPath = path.join(homeDir, '.config', 'opencode', 'opencode.json');

        try {
            if (fs.existsSync(configPath)) {
                const rawConfig = fs.readFileSync(configPath, 'utf-8');
                const configJson = JSON.parse(rawConfig);

                // Update model in colab provider
                if (configJson.provider?.colab?.models) {
                    // Clear existing models and add new one
                    configJson.provider.colab.models = { [newModel]: { name: newModel, tools: true } };
                }

                fs.writeFileSync(configPath, JSON.stringify(configJson, null, 2));
            }
        } catch (err: any) {
            console.log(chalk.yellow(`   Note: Could not persist to config file: ${err.message}`));
        }

        console.log(chalk.green('\n✅ Model updated!'));
        console.log(chalk.gray(`   Old: ${oldModel}`));
        console.log(chalk.cyan(`   New: ${newModel}`));
    },
    '/timeout': (args, { config }) => {
        if (args.length === 0) {
            console.log(chalk.yellow('\n⏱️  Current Timeout:'));
            console.log(`   ${config.timeout || 60000}ms`);
            console.log(chalk.gray('\n   💡 Use /timeout <ms> to change (e.g., /timeout 120000)'));
            return;
        }

        const newTimeout = parseInt(args[0], 10);
        if (isNaN(newTimeout) || newTimeout < 1000) {
            console.log(chalk.red('   ❌ Please provide a valid timeout in milliseconds (min 1000)'));
            return;
        }

        const oldTimeout = config.timeout || 60000;
        config.timeout = newTimeout;

        console.log(chalk.green('\n✅ Timeout updated!'));
        console.log(chalk.gray(`   Old: ${oldTimeout}ms`));
        console.log(chalk.cyan(`   New: ${newTimeout}ms`));
    },
    '/retry': async (args, { agent, options }) => {
        if (!lastUserInput) {
            console.log(chalk.red('   ❌ No previous input to retry'));
            return;
        }

        if (!lastInputFailed) {
            console.log(chalk.yellow('   ⚠️  Last request succeeded. Retrying anyway...'));
        }

        console.log(chalk.gray(`   Retrying: "${lastUserInput.slice(0, 50)}${lastUserInput.length > 50 ? '...' : ''}"`));
        console.log(renderResponseSeparator() + renderAssistantHeader());

        try {
            const chatOpts = options.stream ? { stream: true, onChunk: (c: string) => process.stdout.write(c), debug: options.debug } : options.debug ? { debug: true } : undefined;
            const response = await agent.chat(lastUserInput, chatOpts);
            if (response) {
                if (!options.stream) process.stdout.write(await marked(response));
                process.stdout.write('\n');
            }
            lastInputFailed = false;
        } catch (e: any) {
            console.error(chalk.red(`Error: ${e.message}`));
            lastInputFailed = true;
        }
    },
    '/status': (args, { config, agent }) => {
        const history = agent.getHistory();
        const userMsgs = history.filter(m => m.role === 'user').length;
        const assistantMsgs = history.filter(m => m.role === 'assistant').length;
        const toolCalls = history.filter(m => m.role === 'tool').length;

        console.log(chalk.yellow('\n📊 Status:'));
        console.log(chalk.bold('\n   Connection:'));
        console.log(`   • Base URL: ${config.baseURL}`);
        console.log(`   • Model:    ${config.model}`);
        console.log(`   • Timeout:  ${config.timeout || 60000}ms`);
        console.log(`   • Retries:  ${config.retries || 3}`);

        console.log(chalk.bold('\n   Session:'));
        console.log(`   • Messages: ${history.length} total`);
        console.log(`     - User: ${userMsgs}, Assistant: ${assistantMsgs}, Tool: ${toolCalls}`);
        console.log(`   • CWD: ${process.cwd()}`);

        if (lastUserInput) {
            console.log(chalk.bold('\n   Last Input:'));
            console.log(`   • "${lastUserInput.slice(0, 60)}${lastUserInput.length > 60 ? '...' : ''}"`);
            console.log(`   • Status: ${lastInputFailed ? chalk.red('Failed') : chalk.green('OK')}`);
        }
    },
    '/config': (args, { config }) => {
        // If a URL argument is provided, update the config
        if (args.length > 0) {
            const newUrl = args.join(' ').replace(/^["']|["']$/g, '').trim();

            if (!newUrl) {
                console.log(chalk.red('   ❌ Please provide a valid URL'));
                return;
            }

            // Validate URL format (basic check)
            try {
                new URL(newUrl);
            } catch {
                console.log(chalk.red('   ❌ Invalid URL format. Please provide a valid URL.'));
                return;
            }

            // Update runtime config
            const oldUrl = config.baseURL;
            config.baseURL = newUrl;

            // Update the config file
            const homeDir = os.homedir();
            const configPath = path.join(homeDir, '.config', 'opencode', 'opencode.json');

            try {
                if (fs.existsSync(configPath)) {
                    const rawConfig = fs.readFileSync(configPath, 'utf-8');
                    const configJson = JSON.parse(rawConfig);

                    // Update the colab provider baseURL
                    if (configJson.provider?.colab?.options) {
                        configJson.provider.colab.options.baseURL = newUrl;
                    } else {
                        // Create the structure if it doesn't exist
                        configJson.provider = configJson.provider || {};
                        configJson.provider.colab = configJson.provider.colab || {};
                        configJson.provider.colab.options = configJson.provider.colab.options || {};
                        configJson.provider.colab.options.baseURL = newUrl;
                    }

                    fs.writeFileSync(configPath, JSON.stringify(configJson, null, 2));
                    console.log(chalk.green('\n✅ Configuration updated successfully!'));
                    console.log(chalk.gray(`   Old URL: ${oldUrl}`));
                    console.log(chalk.cyan(`   New URL: ${newUrl}`));
                    console.log(chalk.gray(`   Saved to: ${configPath}`));
                } else {
                    // Create a new config file
                    const newConfig = {
                        "$schema": "https://opencode.ai/config.json",
                        provider: {
                            colab: {
                                npm: "@ai-sdk/openai-compatible",
                                name: "Colab LLM",
                                options: { baseURL: newUrl },
                                models: { "qwen2.5-coder:7b": {} }
                            }
                        }
                    };

                    // Ensure directory exists
                    const configDir = path.dirname(configPath);
                    if (!fs.existsSync(configDir)) {
                        fs.mkdirSync(configDir, { recursive: true });
                    }

                    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
                    console.log(chalk.green('\n✅ New configuration file created!'));
                    console.log(chalk.cyan(`   URL: ${newUrl}`));
                    console.log(chalk.gray(`   Saved to: ${configPath}`));
                }
            } catch (err: any) {
                console.log(chalk.red(`   ❌ Failed to update config file: ${err.message}`));
                console.log(chalk.yellow('   Note: Runtime config was updated, but file save failed.'));
            }
            return;
        }

        // No arguments - show current config
        console.log(chalk.yellow('\n🔧 Current Configuration:'));
        console.log(`   Base URL: ${config.baseURL}`);
        console.log(`   Model:    ${config.model}`);
        console.log(chalk.gray('\n   💡 Tip: Use /config <new_url> to update the base URL'));
    },
    '/project': (args, { agent, options }) => {
        const ctx = gatherProjectContext();
        if (ctx.files.length === 0) {
            console.log(chalk.gray('   No project files found.'));
            return;
        }
        const prompt = formatProjectContextForPrompt(ctx);
        agent.addToContext('system', `Project context (refreshed):\n${prompt}`);
        console.log(chalk.green(`   ✅ Refreshed project context: ${ctx.summary}`));
    },
    // === CONTEXT AWARENESS ===
    '/context': (args, { agent }) => {
        console.log(chalk.yellow('\n📊 Building codebase context...'));
        const ctx = buildCodebaseContext();
        console.log(chalk.green(`   ${ctx.summary}`));

        if (ctx.git) {
            console.log(chalk.gray(`   Branch: ${ctx.git.branch}`));
            if (ctx.git.changedFiles.length > 0) {
                console.log(chalk.gray(`   Changed: ${ctx.git.changedFiles.slice(0, 5).join(', ')}`));
            }
        }

        // Add to agent context
        const contextPrompt = formatContextForPrompt(ctx);
        agent.addToContext('system', contextPrompt);
        console.log(chalk.green('   ✅ Context added to conversation'));
    },
    '/index': (args, { agent }) => {
        console.log(chalk.yellow('\n🔄 Force re-indexing codebase...'));
        const ctx = buildCodebaseContext();
        console.log(chalk.green(`   ${ctx.summary}`));
        const contextPrompt = formatContextForPrompt(ctx);
        agent.addToContext('system', `[Re-indexed] ${contextPrompt}`);
        console.log(chalk.green('   ✅ Codebase re-indexed'));
    },
    // === MEMORY SYSTEM ===
    '/remember': (args) => {
        if (args.length < 2) {
            console.log(chalk.red('   ❌ Usage: /remember <key> <value>'));
            console.log(chalk.gray('   Example: /remember editor vscode'));
            return;
        }
        const key = args[0];
        const value = args.slice(1).join(' ');
        const memory = remember(key, value, 'user', 'user');
        console.log(chalk.green(`   ✅ Remembered: "${key}" = "${value}"`));
    },
    '/forget': (args) => {
        if (args.length < 1) {
            console.log(chalk.red('   ❌ Usage: /forget <key>'));
            return;
        }
        const key = args[0];
        if (forget(key)) {
            console.log(chalk.green(`   ✅ Forgot: "${key}"`));
        } else {
            console.log(chalk.red(`   ❌ Memory not found: "${key}"`));
        }
    },
    '/memories': (args) => {
        const query = args.join(' ').trim();
        const memories = query ? searchMemories(query) : getMemories();

        if (memories.length === 0) {
            console.log(chalk.gray('\n   No memories found.'));
            console.log(chalk.gray('   Use /remember <key> <value> to save a memory'));
            return;
        }

        console.log(chalk.yellow(`\n🧠 Memories (${memories.length}):`));
        for (const m of memories) {
            const date = new Date(m.timestamp).toLocaleDateString();
            console.log(`   • ${chalk.cyan(m.key)}: ${m.value}`);
            console.log(chalk.gray(`     [${m.category}] ${date}`));
        }
    },
    // === SUB-AGENTS ===
    '/agent': async (args, { config, options }) => {
        if (args.length === 0) {
            console.log(formatAgentList());
            return;
        }

        const agentName = args[0];
        const task = args.slice(1).join(' ');

        if (!task) {
            console.log(chalk.red('   ❌ Usage: /agent <name> <task>'));
            console.log(chalk.gray('   Example: /agent reviewer check src/index.ts'));
            return;
        }

        const subAgent = getAgent(agentName);
        if (!subAgent) {
            console.log(chalk.red(`   ❌ Unknown agent: ${agentName}`));
            console.log(chalk.gray('   Use /agent to see available agents'));
            return;
        }

        console.log(chalk.yellow(`\n${subAgent.displayName} starting...`));

        const llm = new LLMClient(config);
        const tools = new ToolExecutor({ autoApproveCommands: options.autoApprove, quiet: true });

        try {
            const result = await runSubAgent(subAgent, task, llm, tools, {
                onProgress: (msg) => console.log(chalk.gray(`   ${msg}`))
            });
            console.log(chalk.green('\n' + subAgent.displayName + ' Result:'));
            console.log(await marked(result));
        } catch (e: any) {
            console.log(chalk.red(`   ❌ Agent error: ${e.message}`));
        }
    },
    '/agents': () => {
        console.log(formatAgentList());
    },
    // === SKILLS ===
    '/skill': (args, { agent }) => {
        if (args.length === 0) {
            const skills = loadSkills();
            console.log(formatSkillList(skills));
            return;
        }

        const skillName = args.join(' ');
        const skill = getSkill(skillName);

        if (!skill) {
            console.log(chalk.red(`   ❌ Skill not found: ${skillName}`));
            console.log(chalk.gray('   Use /skill to see available skills'));
            return;
        }

        console.log(chalk.green(`\n📚 Skill: ${skill.name}`));
        console.log(chalk.gray(`   ${skill.description}\n`));
        console.log(skill.content);

        // Add to context
        const skillPrompt = formatSkillForPrompt(skill);
        agent.addToContext('system', skillPrompt);
        console.log(chalk.green('\n   ✅ Skill added to context'));
    },
    '/skills': () => {
        const skills = loadSkills();
        console.log(formatSkillList(skills));
    },
    '/help': () => {
        console.log(chalk.yellow('\n❓ Available REPL Commands:'));
        console.log(chalk.bold('\n   Basic:'));
        console.log('   /add <file>    - Add file content to context');
        console.log('   /clear         - Clear conversation history');
        console.log('   /save [path]   - Save session to JSON file');
        console.log('   /load <path>   - Load a saved session');
        console.log('   /retry         - Retry the last failed request');
        console.log(chalk.bold('\n   Configuration:'));
        console.log('   /config [url]  - View config or update base URL');
        console.log('   /model [name]  - View or switch model');
        console.log('   /timeout [ms]  - View or set request timeout');
        console.log('   /ping          - Test server connectivity');
        console.log('   /status        - Show connection and session status');
        console.log(chalk.bold('\n   Context & Memory:'));
        console.log('   /context       - Index codebase (files, symbols, git)');
        console.log('   /index         - Force re-index codebase');
        console.log('   /project       - Load project files (package.json, README)');
        console.log('   /remember <k> <v> - Save a memory');
        console.log('   /forget <key>  - Delete a memory');
        console.log('   /memories      - List all memories');
        console.log(chalk.bold('\n   Agents & Skills:'));
        console.log('   /agent <name> <task> - Delegate to sub-agent');
        console.log('   /agents        - List available sub-agents');
        console.log('   /skill <name>  - Load a skill');
        console.log('   /skills        - List available skills');
        console.log('\n   exit | quit    - Quit the application');
    }
};

async function startRepl(
    config: ReturnType<typeof loadConfig>,
    agent: Agent,
    showBanner: boolean,
    opts?: { stream?: boolean; debug?: boolean; historyPath?: string },
    cliOptions?: CliOptions,
    projectSummary?: string
) {
    if (showBanner) {
        console.log(renderTitleBar());
        console.log(renderBanner(config, projectSummary));
        console.log(renderInputAreaTop());
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: renderInputPrompt()
    });

    const context: ReplContext = { agent, config, options: cliOptions ?? {} as CliOptions };

    const historyPath = opts?.historyPath ?? path.join(os.homedir(), '.opencode_history');
    try {
        if (fs.existsSync(historyPath)) {
            const hist = fs.readFileSync(historyPath, 'utf-8').split('\n').filter(Boolean).slice(-500);
            const rlAny = rl as any;
            if (Array.isArray(rlAny.history)) rlAny.history.push(...hist);
        }
    } catch (_) { /* ignore */ }

    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();

        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
            console.log(renderGoodbye());
            process.exit(0);
        }

        if (input.startsWith('/')) {
            const [cmd, ...args] = input.split(' ');
            const handler = replCommands[cmd.toLowerCase()];

            if (handler) {
                await handler(args, context);
            } else {
                console.log(chalk.red(`   ❌ Unknown command: ${cmd}`));
            }
        } else if (input) {
            // Track input for /retry
            lastUserInput = input;
            lastInputFailed = false;

            try {
                console.log(renderResponseSeparator() + renderAssistantHeader());
                const chatOpts = opts?.stream ? { stream: true, onChunk: (c: string) => process.stdout.write(c), debug: opts.debug } : opts?.debug ? { debug: true } : undefined;
                const response = await agent.chat(input, chatOpts);
                if (response) {
                    if (!opts?.stream) process.stdout.write(await marked(response));
                    process.stdout.write('\n');
                }
                if (opts?.historyPath && getLogLevel() !== 'quiet') {
                    try { fs.appendFileSync(opts.historyPath, input + '\n'); } catch (_) { /* ignore */ }
                }
            } catch (error: any) {
                lastInputFailed = true;
                console.error(chalk.red(`Error: ${error.message}`));
                console.log(chalk.gray('   💡 Use /retry to try again'));
            }
        }

        rl.prompt();
    }).on('close', () => {
        console.log(renderGoodbye());
        process.exit(0);
    });
}

async function main() {
    const argv = process.argv.slice(2);
    const { action, options } = parseCliArgs(argv);

    if (action === 'help') {
        printGlobalHelp();
        return;
    }

    if (action === 'version') {
        printVersion();
        return;
    }

    // 1. Load Config (with optional override)
    const config = loadConfig(options.configPath);

    // 2. Load plugins
    const defaultPluginDir = path.join(os.homedir(), '.config', 'opencode', 'plugins');
    const pluginDir = options.pluginDir ?? defaultPluginDir;
    const { definitions: pluginDefs, handlers: pluginHandlers } = loadPlugins(pluginDir);
    const toolsDefinition = pluginDefs.length > 0 ? [...TOOLS_DEFINITION, ...pluginDefs] : [];

    if (options.verbose) setLogLevel('verbose');
    if (options.quiet) setLogLevel('quiet');
    if (options.debug) setLogLevel('debug');
    if (options.auditLogPath) setAuditLog(path.resolve(options.auditLogPath));

    // 3. Initialize Components
    const tools = new ToolExecutor({
        autoApproveCommands: options.autoApprove ?? false,
        pluginHandlers,
        dryRun: options.dryRun ?? false,
        allowlistCommands: options.allowCommands,
        quiet: options.quiet ?? false
    });
    const llm = new LLMClient(config);
    const agent = new Agent(llm, tools, { toolsDefinition });

    // 4. Load session if requested
    if (options.sessionPath) {
        try {
            const messages = loadSession(options.sessionPath);
            agent.setHistory(messages);
            if (options.showBanner) console.log(chalk.gray(`   Loaded session: ${options.sessionPath}`));
        } catch (e: any) {
            console.error(chalk.red(`Failed to load session: ${e.message}`));
            process.exit(1);
        }
    }

    // 5. Add project context (unless --no-project)
    let projectSummary: string | undefined;
    if (!options.noProject && action !== 'run') {
        const ctx = gatherProjectContext();
        if (ctx.files.length > 0) {
            const prompt = formatProjectContextForPrompt(ctx);
            agent.addToContext('system', `Project context:\n${prompt}`);
            projectSummary = ctx.summary;
        }
    }

    // 6. Run or REPL
    if (action === 'run' && options.runPrompt) {
        if (!options.showBanner) {
            // Quiet mode: minimal output
        } else {
            console.log(renderTitleBar());
            console.log(chalk.gray(`\n  Prompt: ${options.runPrompt}\n`));
        }
        try {
            const chatOpts = options.stream ? { stream: true, onChunk: (c: string) => process.stdout.write(c), debug: options.debug } : options.debug ? { debug: true } : undefined;
            const response = await agent.chat(options.runPrompt, chatOpts);
            if (response) {
                if (options.stream) process.stdout.write('\n');
                else console.log(await marked(response));
            }
        } catch (error: any) {
            console.error(chalk.red(`Error: ${error.message}`));
            process.exit(1);
        }
        return;
    }

    // 7. Start REPL
    await startRepl(config, agent, options.showBanner, {
        stream: options.stream,
        debug: options.debug,
        historyPath: path.join(os.homedir(), '.opencode_history')
    }, options, projectSummary);
}

main().catch((err) => {
    console.error(chalk.red(`Fatal error: ${err?.message || err}`));
    process.exit(1);
});
