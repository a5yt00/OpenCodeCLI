import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Skill {
    name: string;
    description: string;
    content: string;
    path: string;
    triggers?: string[];  // Keywords that might trigger this skill
}

const SKILLS_DIR = path.join(os.homedir(), '.config', 'opencode', 'skills');

/**
 * Ensure skills directory exists
 */
export function ensureSkillsDir(): void {
    if (!fs.existsSync(SKILLS_DIR)) {
        fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }
}

/**
 * Parse skill frontmatter from markdown file
 */
function parseSkillFile(filePath: string): Skill | null {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        // Check for frontmatter
        if (lines[0].trim() !== '---') {
            // No frontmatter, use filename as name
            return {
                name: path.basename(filePath, '.md'),
                description: 'No description provided',
                content,
                path: filePath
            };
        }

        // Parse frontmatter
        let endFrontmatter = -1;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '---') {
                endFrontmatter = i;
                break;
            }
        }

        if (endFrontmatter === -1) {
            return null;
        }

        const frontmatter = lines.slice(1, endFrontmatter).join('\n');
        const body = lines.slice(endFrontmatter + 1).join('\n').trim();

        // Simple YAML-like parsing
        let name = path.basename(filePath, '.md');
        let description = 'No description provided';
        let triggers: string[] = [];

        for (const line of frontmatter.split('\n')) {
            const nameMatch = line.match(/^name:\s*(.+)/);
            if (nameMatch) name = nameMatch[1].trim();

            const descMatch = line.match(/^description:\s*(.+)/);
            if (descMatch) description = descMatch[1].trim();

            const triggerMatch = line.match(/^triggers:\s*\[(.+)\]/);
            if (triggerMatch) {
                triggers = triggerMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
            }
        }

        return {
            name,
            description,
            content: body,
            path: filePath,
            triggers: triggers.length > 0 ? triggers : undefined
        };
    } catch (e) {
        console.warn(`Failed to parse skill: ${filePath}`, (e as Error).message);
        return null;
    }
}

/**
 * Load all skills from the skills directory
 */
export function loadSkills(): Skill[] {
    ensureSkillsDir();

    const skills: Skill[] = [];

    try {
        const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md'));

        for (const file of files) {
            const fullPath = path.join(SKILLS_DIR, file);
            const skill = parseSkillFile(fullPath);
            if (skill) skills.push(skill);
        }
    } catch (e) {
        console.warn('Failed to load skills:', (e as Error).message);
    }

    return skills;
}

/**
 * Get a specific skill by name
 */
export function getSkill(name: string): Skill | undefined {
    const skills = loadSkills();
    return skills.find(s => s.name.toLowerCase() === name.toLowerCase());
}

/**
 * Find skills relevant to a prompt
 */
export function findRelevantSkills(prompt: string, limit: number = 3): Skill[] {
    const skills = loadSkills();
    if (skills.length === 0) return [];

    const lowPrompt = prompt.toLowerCase();

    const scored = skills.map(skill => {
        let score = 0;

        // Check triggers
        if (skill.triggers) {
            for (const trigger of skill.triggers) {
                if (lowPrompt.includes(trigger.toLowerCase())) {
                    score += 3;
                }
            }
        }

        // Check name
        if (lowPrompt.includes(skill.name.toLowerCase())) {
            score += 2;
        }

        // Check description words
        const descWords = skill.description.toLowerCase().split(/\s+/);
        for (const word of descWords) {
            if (word.length > 4 && lowPrompt.includes(word)) {
                score += 1;
            }
        }

        return { skill, score };
    });

    return scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.skill);
}

/**
 * Format skill for LLM context
 */
export function formatSkillForPrompt(skill: Skill): string {
    return `# Skill: ${skill.name}\n\n${skill.content}`;
}

/**
 * Create a new skill file
 */
export function createSkill(name: string, description: string, content: string): Skill {
    ensureSkillsDir();

    const fileName = name.toLowerCase().replace(/\s+/g, '-') + '.md';
    const filePath = path.join(SKILLS_DIR, fileName);

    const fileContent = `---
name: ${name}
description: ${description}
---

${content}`;

    fs.writeFileSync(filePath, fileContent, 'utf-8');

    return {
        name,
        description,
        content,
        path: filePath
    };
}

/**
 * Delete a skill
 */
export function deleteSkill(name: string): boolean {
    const skill = getSkill(name);
    if (skill) {
        try {
            fs.unlinkSync(skill.path);
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
}

/**
 * Format skill list for display
 */
export function formatSkillList(skills: Skill[]): string {
    if (skills.length === 0) {
        return `No skills found.

Skills are markdown files in: ${SKILLS_DIR}

Create a skill file like:
---
name: my-skill
description: What this skill does
triggers: [keyword1, keyword2]
---

# Steps
1. First step
2. Second step
`;
    }

    const lines: string[] = [];
    lines.push(`\n📚 Available Skills (${skills.length}):`);
    lines.push('');

    for (const skill of skills) {
        lines.push(`   • ${skill.name}`);
        lines.push(`     ${skill.description}`);
        if (skill.triggers) {
            lines.push(`     Triggers: ${skill.triggers.join(', ')}`);
        }
    }

    lines.push('');
    lines.push(`   Skills directory: ${SKILLS_DIR}`);
    lines.push('   Usage: /skill <name>');

    return lines.join('\n');
}

/**
 * Create sample skills for first-time users
 */
export function createSampleSkills(): void {
    ensureSkillsDir();

    const samples: Array<{ name: string; description: string; content: string }> = [
        {
            name: 'git-commit',
            description: 'Create a conventional commit',
            content: `# Git Commit Workflow

## Steps
1. Check git status to see changed files
2. Review the diff to understand changes
3. Stage relevant files with git add
4. Create a commit message following conventional commits:
   - feat: new feature
   - fix: bug fix
   - docs: documentation
   - refactor: code refactoring
   - test: adding tests
5. Commit the changes

## Example
\`\`\`bash
git add .
git commit -m "feat: add user authentication"
\`\`\``
        },
        {
            name: 'debug-error',
            description: 'Debug an error or exception',
            content: `# Debug Error Workflow

## Steps
1. Identify the error message and stack trace
2. Locate the file and line number from the stack trace
3. Read the relevant code section
4. Search for similar patterns in the codebase
5. Check for common issues:
   - Null/undefined references
   - Type mismatches
   - Missing imports
   - Incorrect parameters
6. Suggest a fix with explanation`
        },
        {
            name: 'code-review',
            description: 'Review code for quality and issues',
            content: `# Code Review Checklist

## Security
- [ ] No hardcoded secrets or credentials
- [ ] Input validation on user data
- [ ] Proper error handling

## Quality  
- [ ] Code is readable and well-named
- [ ] No unnecessary complexity
- [ ] DRY - no duplicated logic

## Performance
- [ ] No obvious performance issues
- [ ] Efficient data structures used
- [ ] Async operations handled properly`
        }
    ];

    for (const sample of samples) {
        const filePath = path.join(SKILLS_DIR, `${sample.name}.md`);
        if (!fs.existsSync(filePath)) {
            createSkill(sample.name, sample.description, sample.content);
        }
    }
}
