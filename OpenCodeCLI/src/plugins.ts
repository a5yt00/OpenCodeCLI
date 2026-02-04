import * as fs from 'fs';
import * as path from 'path';

export interface PluginTool {
    name: string;
    description: string;
    parameters: { type: string; properties?: Record<string, unknown>; required?: string[] };
    execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface PluginModule {
    tools?: PluginTool[];
    default?: { tools?: PluginTool[] };
}

function loadPluginFile(filePath: string): PluginTool[] {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(filePath) as PluginModule;
        const tools = mod.tools ?? mod.default?.tools ?? [];
        return Array.isArray(tools) ? tools : [];
    } catch (e) {
        console.warn(`[plugins] Failed to load ${filePath}:`, (e as Error).message);
        return [];
    }
}

export function loadPlugins(pluginsDir?: string): { definitions: object[]; handlers: Map<string, (args: Record<string, unknown>) => Promise<string>> } {
    const definitions: object[] = [];
    const handlers = new Map<string, (args: Record<string, unknown>) => Promise<string>>();

    if (!pluginsDir || !fs.existsSync(pluginsDir)) return { definitions, handlers };

    const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js') || f.endsWith('.cjs'));
    for (const file of files) {
        const fullPath = path.join(pluginsDir, file);
        const tools = loadPluginFile(fullPath);
        for (const t of tools) {
            definitions.push({
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }
            });
            handlers.set(t.name, t.execute);
        }
    }
    return { definitions, handlers };
}
