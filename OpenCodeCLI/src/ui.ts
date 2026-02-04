import chalk from 'chalk';

const WIDTH = 60;
const BAR = '═';
const SIDE = '║';
const TL = '╔';
const TR = '╗';
const BL = '╚';
const BR = '╝';
const H = '─';
const SEP = '─'.repeat(WIDTH - 2);

function getVersion(): string {
    try {
        const pkg = require('../package.json') as { version?: string };
        return pkg.version || '1.0.0';
    } catch {
        return '1.0.0';
    }
}

export function renderTitleBar(title?: string) {
    const ver = getVersion();
    const t = title || 'OpenCode CLI Agent';
    const padding = Math.max(0, WIDTH - t.length - ver.length - 6);
    const line = TL + BAR.repeat(WIDTH - 2) + TR;
    const mid = SIDE + '  ' + chalk.bold.cyan(t) + '  ' + chalk.gray(`v${ver}`) + ' '.repeat(padding) + SIDE;
    const bot = BL + BAR.repeat(WIDTH - 2) + BR;
    return chalk.cyan(line + '\n' + mid + '\n' + bot);
}

export function renderBanner(config: { baseURL: string; model: string }, projectSummary?: string) {
    const lines: string[] = [];
    lines.push('');
    lines.push(chalk.gray('  Endpoint:') + '  ' + chalk.white(config.baseURL));
    lines.push(chalk.gray('  Model:') + '    ' + chalk.white(config.model));
    if (projectSummary) {
        lines.push(chalk.gray('  Project:') + '  ' + chalk.white(projectSummary));
    }
    lines.push('');
    lines.push(chalk.green('  Ready!') + chalk.gray(' Type your request below. Use ') + chalk.cyan('/help') + chalk.gray(' for commands.'));
    lines.push('');
    return lines.join('\n');
}

export function renderInputPrompt() {
    return chalk.cyan('  › ');
}

export function renderInputAreaTop() {
    return '\n' + chalk.gray('  ┌' + H.repeat(WIDTH - 4) + '┐') + '\n' + chalk.gray('  │ ') + chalk.dim('Input') + '\n' + chalk.gray('  └' + H.repeat(WIDTH - 4) + '┘') + '\n';
}

export function renderResponseSeparator() {
    return '\n' + chalk.gray('  ' + SEP) + '\n';
}

export function renderAssistantHeader() {
    return chalk.cyan('  ┌─ ') + chalk.bold.magenta('Assistant') + chalk.cyan(' ─' + H.repeat(42) + '\n  │\n  ');
}

export function renderGoodbye() {
    return '\n' + chalk.gray(SEP) + '\n  ' + chalk.green('Goodbye!') + '\n';
}
