import fetch from 'node-fetch';
import { OpenCodeConfig } from './config';
import { ToolCall, TOOLS_DEFINITION } from './tools';
import { logDebug } from './logger';

export interface Message {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
}

export class LLMClient {
    private config: OpenCodeConfig;

    constructor(config: OpenCodeConfig) {
        this.config = config;
    }

    async chat(messages: Message[], options?: { stream?: boolean; onChunk?: (chunk: string) => void; tools?: object[]; debug?: boolean }): Promise<Message> {
        const url = `${this.config.baseURL}/chat/completions`;

        const cleanMessages = messages.map(m => ({
            role: m.role,
            content: m.content,
            tool_calls: m.tool_calls,
            tool_call_id: m.tool_call_id,
            name: m.name
        }));

        const stream = options?.stream ?? false;
        const tools = options?.tools ?? TOOLS_DEFINITION;
        const body = {
            model: this.config.model,
            messages: cleanMessages,
            tools,
            stream
        };

        if (options?.debug) {
            logDebug('Request', url, JSON.stringify(body, null, 2).slice(0, 2000));
        }

        const timeout = this.config.timeout ?? 60000;
        const maxRetries = this.config.retries ?? 3;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);

                const headers: Record<string, string> = {
                    'Content-Type': 'application/json'
                };

                if (this.config.apiKey) {
                    headers['Authorization'] = `Bearer ${this.config.apiKey}`;
                }

                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                    signal: controller.signal as any
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`API Error ${response.status}: ${text}`);
                }

                if (stream && options?.onChunk && response.body) {
                    return await this.parseStreamResponse(response, options.onChunk);
                }

                const data: any = await response.json();
                if (options?.debug) {
                    logDebug('Response', JSON.stringify(data).slice(0, 1000));
                }
                const choice = data.choices[0];

                return {
                    role: 'assistant',
                    content: choice.message.content,
                    tool_calls: choice.message.tool_calls
                };

            } catch (error: any) {
                const isRetryable = error.name === 'AbortError' || (error.message && (
                    error.message.includes('ECONNRESET') ||
                    error.message.includes('ETIMEDOUT') ||
                    error.message.includes('fetch failed') ||
                    error.message.startsWith('API Error 5')
                ));
                if (attempt < maxRetries && isRetryable) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    if (options?.debug) logDebug(`Retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    console.error('LLM Request failed:', error.message);
                    throw error;
                }
            }
        }

        throw new Error('LLM request failed after retries');
    }

    private async parseStreamResponse(response: any, onChunk: (chunk: string) => void): Promise<Message> {
        const stream = response.body as NodeJS.ReadableStream;
        let content = '';
        const toolCallsAccum: Record<number, { id?: string; name?: string; args: string }> = {};

        return new Promise((resolve, reject) => {
            let buffer = '';
            stream.on('data', (chunk: Buffer) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const json = JSON.parse(line.slice(6));
                            const delta = json.choices?.[0]?.delta;
                            if (delta?.content) {
                                content += delta.content;
                                onChunk(delta.content);
                            }
                            if (delta?.tool_calls) {
                                for (const tc of delta.tool_calls) {
                                    const idx = tc.index ?? 0;
                                    if (!toolCallsAccum[idx]) toolCallsAccum[idx] = { args: '' };
                                    if (tc.id) toolCallsAccum[idx].id = tc.id;
                                    if (tc.function?.name) toolCallsAccum[idx].name = tc.function.name;
                                    if (tc.function?.arguments) toolCallsAccum[idx].args += tc.function.arguments;
                                }
                            }
                        } catch (_) { /* skip parse errors */ }
                    }
                }
            });
            stream.on('end', () => {
                const toolCalls: ToolCall[] | undefined = Object.keys(toolCallsAccum).length > 0
                    ? Object.values(toolCallsAccum).map((tc) => ({
                        id: tc.id,
                        function: { name: tc.name || 'unknown', arguments: tc.args }
                    }))
                    : undefined;
                resolve({
                    role: 'assistant',
                    content: content || null,
                    tool_calls: toolCalls
                });
            });
            stream.on('error', reject);
        });
    }
}
