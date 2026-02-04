import chalk from 'chalk';
import { LLMClient, Message } from './llm-client';
import { ToolExecutor, ToolCall, ToolResult } from './tools';

import ora from 'ora';

export interface AgentOptions {
    toolsDefinition?: object[];
}

export class Agent {
    private llm: LLMClient;
    private tools: ToolExecutor;
    private toolsDefinition: object[];
    private history: Message[] = [];
    private maxSteps = 10;

    constructor(llm: LLMClient, tools: ToolExecutor, options?: AgentOptions) {
        this.llm = llm;
        this.tools = tools;
        this.toolsDefinition = options?.toolsDefinition ?? [];
        this.initSystemPrompt();
    }

    private initSystemPrompt() {
        const cwd = process.cwd();
        const osType = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';
        const shell = osType === 'Windows' ? 'PowerShell' : 'bash';

        this.history = [{
            role: 'system',
            content: `You are OpenCode, an autonomous coding agent in the user's terminal.

ENVIRONMENT: ${osType}, ${shell}, CWD: ${cwd}

TOOLS AVAILABLE:
- list_files(path): List directory contents
- read_file(path): Read file content  
- write_file(path, content): Create/overwrite file
- edit_file(path, old_text, new_text): Replace text in file
- grep_search(pattern, path): Search for patterns
- run_command(command): Execute shell command
- create_directory(path): Create folder
- git_status, git_diff, git_add(files), git_commit(message)

WORKFLOW:
1. UNDERSTAND the request
2. EXPLORE using list_files, read_file
3. PLAN your approach
4. EXECUTE using tools
5. VERIFY your changes

RULES:
- Always read a file before editing
- Use tools to interact with the filesystem
- Be concise in responses
- Handle errors and try alternatives

Respond to user requests by using the available tools.`
        }];
    }

    addToContext(role: 'user' | 'system', content: string) {
        this.history.push({ role, content });
    }

    clearHistory() {
        this.initSystemPrompt();
    }

    getHistory(): Message[] {
        return this.history;
    }

    setHistory(messages: Message[]) {
        this.history = [...messages];
    }

    async chat(userInput: string, options?: { stream?: boolean; onChunk?: (chunk: string) => void; debug?: boolean }): Promise<string | void> {
        this.history.push({ role: 'user', content: userInput });

        let currentStep = 0;
        const spinner = ora('Thinking...').start();

        try {
            while (currentStep < this.maxSteps) {
                currentStep++;

                const useStream = options?.stream && options?.onChunk;
                const chatOpts: { stream?: boolean; onChunk?: (c: string) => void; tools?: object[]; debug?: boolean } = useStream
                    ? { stream: true, onChunk: options.onChunk! }
                    : {};
                if (this.toolsDefinition.length > 0) chatOpts.tools = this.toolsDefinition;
                if (options?.debug) chatOpts.debug = true;
                const response = await this.llm.chat(this.history, chatOpts);
                this.history.push(response);

                // 2. Check for tool calls
                if (response.tool_calls && response.tool_calls.length > 0) {
                    spinner.text = `Executing ${response.tool_calls.length} tools...`;

                    // 3. Execute tools
                    for (const toolCall of response.tool_calls) {
                        spinner.text = `Executing tool: ${toolCall.function.name}...`;
                        const result = await this.tools.execute(toolCall);

                        // 4. Add result to history
                        this.history.push({
                            role: 'tool',
                            content: result.content,
                            tool_call_id: result.tool_call_id,
                            name: result.name
                        });
                    }
                    spinner.text = 'Analyzing results...';
                    // Loop continues to let LLM see the results
                } else {
                    // No tools, just text response. We are done with this turn.
                    spinner.stop();
                    return response.content || ''; // Return content for caller to render
                }
            }
        } catch (error: any) {
            spinner.fail('An error occurred');
            console.error('\n   Error details:', error.message);
            if (options?.debug && error.stack) {
                console.error('   Stack:', error.stack);
            }
            throw error;
        }
        spinner.stop();
    }
}
