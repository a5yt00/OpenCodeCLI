import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Memory {
    key: string;
    value: string;
    category: string;
    timestamp: number;
    source: 'user' | 'agent';
}

export interface MemoryStore {
    version: number;
    memories: Memory[];
}

const MEMORY_FILE = path.join(os.homedir(), '.config', 'opencode', 'memory.json');
const MAX_MEMORIES = 100;

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Load memories from disk
 */
export function loadMemories(): MemoryStore {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            const raw = fs.readFileSync(MEMORY_FILE, 'utf-8');
            return JSON.parse(raw) as MemoryStore;
        }
    } catch (e) {
        console.warn('Failed to load memories:', (e as Error).message);
    }
    return { version: 1, memories: [] };
}

/**
 * Save memories to disk
 */
export function saveMemories(store: MemoryStore): void {
    ensureConfigDir();
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Add a new memory
 */
export function remember(key: string, value: string, category: string = 'general', source: 'user' | 'agent' = 'agent'): Memory {
    const store = loadMemories();

    // Check if memory with same key exists
    const existingIndex = store.memories.findIndex(m => m.key.toLowerCase() === key.toLowerCase());

    const memory: Memory = {
        key,
        value,
        category,
        timestamp: Date.now(),
        source
    };

    if (existingIndex >= 0) {
        // Update existing
        store.memories[existingIndex] = memory;
    } else {
        // Add new
        store.memories.push(memory);

        // Prune old memories if over limit
        if (store.memories.length > MAX_MEMORIES) {
            store.memories = store.memories
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, MAX_MEMORIES);
        }
    }

    saveMemories(store);
    return memory;
}

/**
 * Remove a memory by key
 */
export function forget(key: string): boolean {
    const store = loadMemories();
    const initialLength = store.memories.length;
    store.memories = store.memories.filter(m => m.key.toLowerCase() !== key.toLowerCase());

    if (store.memories.length < initialLength) {
        saveMemories(store);
        return true;
    }
    return false;
}

/**
 * Get all memories, optionally filtered by category
 */
export function getMemories(category?: string): Memory[] {
    const store = loadMemories();
    if (category) {
        return store.memories.filter(m => m.category.toLowerCase() === category.toLowerCase());
    }
    return store.memories;
}

/**
 * Search memories by keyword
 */
export function searchMemories(query: string): Memory[] {
    const store = loadMemories();
    const lowQuery = query.toLowerCase();
    return store.memories.filter(m =>
        m.key.toLowerCase().includes(lowQuery) ||
        m.value.toLowerCase().includes(lowQuery) ||
        m.category.toLowerCase().includes(lowQuery)
    );
}

/**
 * Get relevant memories for a prompt
 */
export function getRelevantMemories(prompt: string, limit: number = 5): Memory[] {
    const store = loadMemories();
    if (store.memories.length === 0) return [];

    const words = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    // Score each memory by relevance
    const scored = store.memories.map(m => {
        let score = 0;
        const combined = `${m.key} ${m.value} ${m.category}`.toLowerCase();

        for (const word of words) {
            if (combined.includes(word)) score += 1;
        }

        // Boost recent memories
        const ageHours = (Date.now() - m.timestamp) / (1000 * 60 * 60);
        if (ageHours < 24) score += 0.5;

        return { memory: m, score };
    });

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.memory);
}

/**
 * Format memories for LLM context
 */
export function formatMemoriesForPrompt(memories: Memory[]): string {
    if (memories.length === 0) return '';

    const lines: string[] = ['# Relevant Memories', ''];

    for (const m of memories) {
        const date = new Date(m.timestamp).toLocaleDateString();
        lines.push(`- **${m.key}** (${m.category}): ${m.value} [${date}]`);
    }

    return lines.join('\n');
}

/**
 * Clear all memories
 */
export function clearMemories(): void {
    const store: MemoryStore = { version: 1, memories: [] };
    saveMemories(store);
}

/**
 * Get memory statistics
 */
export function getMemoryStats(): { total: number; categories: Record<string, number>; oldest: number | null; newest: number | null } {
    const store = loadMemories();

    const categories: Record<string, number> = {};
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const m of store.memories) {
        categories[m.category] = (categories[m.category] || 0) + 1;
        if (oldest === null || m.timestamp < oldest) oldest = m.timestamp;
        if (newest === null || m.timestamp > newest) newest = m.timestamp;
    }

    return {
        total: store.memories.length,
        categories,
        oldest,
        newest
    };
}
