export type LogLevel = 'quiet' | 'normal' | 'verbose' | 'debug';

let globalLevel: LogLevel = 'normal';

export function setLogLevel(level: LogLevel) {
    globalLevel = level;
}

export function getLogLevel(): LogLevel {
    return globalLevel;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
    quiet: 0,
    normal: 1,
    verbose: 2,
    debug: 3
};

function shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] <= LEVEL_ORDER[globalLevel];
}

export function logVerbose(...args: unknown[]) {
    if (shouldLog('verbose')) console.log(...args);
}

export function logDebug(...args: unknown[]) {
    if (shouldLog('debug')) console.log('[debug]', ...args);
}

export function logTool(name: string, args: unknown, result?: string) {
    if (shouldLog('verbose')) {
        console.log(`[tool] ${name}`, args, result ? `-> ${String(result).slice(0, 80)}...` : '');
    }
    if (shouldLog('debug')) {
        console.log(`[tool] ${name} full result:`, result);
    }
}
