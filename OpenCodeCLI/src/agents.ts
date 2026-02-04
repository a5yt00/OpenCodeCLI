import { LLMClient, Message } from './llm-client';
import { ToolExecutor, ToolCall, TOOLS_DEFINITION } from './tools';
import chalk from 'chalk';

export interface SubAgent {
    name: string;
    displayName: string;
    description: string;
    systemPrompt: string;
    tools: string[];  // Tool names this agent can use
    maxSteps: number;
}

// Built-in specialist agents
export const BUILT_IN_AGENTS: SubAgent[] = [
    {
        name: 'reviewer',
        displayName: '🔍 Code Reviewer',
        description: 'Reviews code for bugs, security issues, and best practices',
        systemPrompt: `You are a senior code reviewer. Your job is to:
1. Identify potential bugs and logic errors
2. Find security vulnerabilities
3. Suggest improvements for readability and maintainability
4. Check for common anti-patterns
5. Verify error handling

Be specific and actionable in your feedback. Reference line numbers when possible.
Format your review as:
- 🔴 Critical: Must fix
- 🟡 Warning: Should fix
- 🟢 Suggestion: Nice to have`,
        tools: ['read_file', 'grep_search', 'list_files'],
        maxSteps: 5
    },
    {
        name: 'tester',
        displayName: '🧪 Test Writer',
        description: 'Generates unit tests and test cases',
        systemPrompt: `You are a testing specialist. Your job is to:
1. Analyze the code to understand its functionality
2. Identify edge cases and boundary conditions
3. Write comprehensive unit tests
4. Include both positive and negative test cases
5. Use appropriate testing frameworks (Jest, pytest, etc.)

Generate tests that are:
- Independent and isolated
- Clear and readable
- Cover edge cases
- Include meaningful assertions`,
        tools: ['read_file', 'write_file', 'grep_search', 'list_files', 'run_command'],
        maxSteps: 8
    },
    {
        name: 'documenter',
        displayName: '📝 Documenter',
        description: 'Writes documentation, comments, and README files',
        systemPrompt: `You are a documentation specialist. Your job is to:
1. Add clear JSDoc/docstring comments to functions and classes
2. Write or update README files
3. Create API documentation
4. Add inline comments for complex logic
5. Generate usage examples

Documentation should be:
- Clear and concise
- Include parameter and return type descriptions
- Provide usage examples
- Explain the "why" not just the "what"`,
        tools: ['read_file', 'write_file', 'edit_file', 'list_files'],
        maxSteps: 8
    },
    {
        name: 'refactorer',
        displayName: '♻️ Refactorer',
        description: 'Suggests and implements code refactoring',
        systemPrompt: `You are a refactoring specialist. Your job is to:
1. Identify code smells and anti-patterns
2. Extract reusable functions and modules
3. Improve code organization
4. Reduce complexity and duplication
5. Apply SOLID principles

When refactoring:
- Make small, incremental changes
- Preserve existing functionality
- Explain the reasoning for each change
- Consider backwards compatibility`,
        tools: ['read_file', 'write_file', 'edit_file', 'grep_search', 'list_files', 'run_command'],
        maxSteps: 10
    },
    {
        name: 'debugger',
        displayName: '🐛 Debugger',
        description: 'Helps debug issues and trace problems',
        systemPrompt: `You are a debugging specialist. Your job is to:
1. Analyze error messages and stack traces
2. Trace the flow of execution
3. Identify the root cause of bugs
4. Suggest fixes with explanations
5. Add debugging statements if needed

When debugging:
- Start from the error and work backwards
- Check assumptions about data
- Look for off-by-one errors, null references, type issues
- Consider race conditions and edge cases`,
        tools: ['read_file', 'grep_search', 'list_files', 'run_command', 'edit_file'],
        maxSteps: 8
    }
];

/**
 * Get a sub-agent by name
 */
export function getAgent(name: string): SubAgent | undefined {
    return BUILT_IN_AGENTS.find(a => a.name.toLowerCase() === name.toLowerCase());
}

/**
 * List all available agents
 */
export function listAgents(): SubAgent[] {
    return BUILT_IN_AGENTS;
}

/**
 * Filter tools for a sub-agent
 */
export function getAgentTools(agent: SubAgent): object[] {
    return TOOLS_DEFINITION.filter(tool => {
        const toolName = (tool as any).function?.name;
        return agent.tools.includes(toolName);
    });
}

/**
 * Run a sub-agent with a specific task
 */
export async function runSubAgent(
    agent: SubAgent,
    task: string,
    llm: LLMClient,
    toolExecutor: ToolExecutor,
    options?: { onProgress?: (msg: string) => void; debug?: boolean }
): Promise<string> {
    const agentTools = getAgentTools(agent);

    const history: Message[] = [
        {
            role: 'system',
            content: agent.systemPrompt + `\n\nCurrent working directory: ${process.cwd()}`
        },
        {
            role: 'user',
            content: task
        }
    ];

    let steps = 0;

    while (steps < agent.maxSteps) {
        steps++;
        options?.onProgress?.(`${agent.displayName} - Step ${steps}/${agent.maxSteps}`);

        try {
            const response = await llm.chat(history, {
                tools: agentTools.length > 0 ? agentTools : undefined,
                debug: options?.debug
            });
            history.push(response);

            // Check for tool calls
            if (response.tool_calls && response.tool_calls.length > 0) {
                for (const toolCall of response.tool_calls) {
                    options?.onProgress?.(`  → ${toolCall.function.name}`);
                    const result = await toolExecutor.execute(toolCall);
                    history.push({
                        role: 'tool',
                        content: result.content,
                        tool_call_id: result.tool_call_id,
                        name: result.name
                    });
                }
            } else {
                // No tools, return final response
                return response.content || 'Agent completed without response.';
            }
        } catch (error: any) {
            return `Agent error: ${error.message}`;
        }
    }

    // Get final summary if max steps reached
    history.push({
        role: 'user',
        content: 'Please provide a summary of what you found or accomplished.'
    });

    try {
        const summary = await llm.chat(history, { debug: options?.debug });
        return summary.content || 'Agent completed without summary.';
    } catch (error: any) {
        return `Agent completed but failed to summarize: ${error.message}`;
    }
}

/**
 * Format agent list for display
 */
export function formatAgentList(): string {
    const lines: string[] = [];
    lines.push(chalk.yellow('\n🤖 Available Sub-Agents:'));
    lines.push('');

    for (const agent of BUILT_IN_AGENTS) {
        lines.push(`   ${agent.displayName}`);
        lines.push(chalk.gray(`      ${agent.description}`));
        lines.push(chalk.gray(`      Tools: ${agent.tools.join(', ')}`));
        lines.push('');
    }

    lines.push(chalk.gray('   Usage: /agent <name> <task>'));
    lines.push(chalk.gray('   Example: /agent reviewer check src/index.ts for security issues'));

    return lines.join('\n');
}
