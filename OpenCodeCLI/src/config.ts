
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import dotenv from 'dotenv';

// Load environment variables from a .env file if present
dotenv.config();

export interface OpenCodeConfig {
    baseURL: string;
    model: string;
    apiKey?: string;
    timeout?: number;
    retries?: number;
}

export function loadConfig(configPathOverride?: string): OpenCodeConfig {
    const homeDir = os.homedir();
    const defaultConfigPath = path.join(homeDir, '.config', 'opencode', 'opencode.json');

    const envBaseURL = process.env.OPENCODE_BASE_URL;
    const envModel = process.env.OPENCODE_MODEL;
    const envApiKey = process.env.OPENCODE_API_KEY || process.env.OPENAI_API_KEY;

    const configPath = configPathOverride
        ? path.resolve(configPathOverride)
        : defaultConfigPath;

    try {
        if (!fs.existsSync(configPath)) {
            if (configPathOverride) {
                console.error(`Config file not found at ${configPath}.`);
                console.error('You can create it with a minimal JSON like:');
                console.error('');
                console.error(`  ${configPath}`);
                console.error('');
                console.error(`  {
  "provider": {
    "colab": {
      "options": { "baseURL": "http://localhost:5000/v1" },
      "models": { "qwen2.5-coder:7b": {} }
    }
  }
}`);
                process.exit(1);
            }

            console.warn(`Config file not found at ${configPath}. Using defaults.`);

            return {
                baseURL: envBaseURL || 'http://localhost:5000/v1',
                model: envModel || 'qwen2.5-coder:7b',
                apiKey: envApiKey,
                timeout: 60000,
                retries: 3
            };
        }

        const rawConfig = fs.readFileSync(configPath, 'utf-8');
        const configJson = JSON.parse(rawConfig);

        const colabProvider = configJson.provider?.colab;
        if (!colabProvider) {
            throw new Error('No Colab provider found in opencode.json');
        }

        const baseURL = colabProvider.options?.baseURL;
        const models = colabProvider.models || {};
        const modelName = Object.keys(models)[0] || 'qwen2.5-coder:7b';

        const timeout = configJson.timeout ?? (process.env.OPENCODE_TIMEOUT ? parseInt(process.env.OPENCODE_TIMEOUT, 10) : 60000);
        const retries = configJson.retries ?? (process.env.OPENCODE_RETRIES ? parseInt(process.env.OPENCODE_RETRIES, 10) : 3);

        return {
            baseURL: envBaseURL || baseURL || 'http://localhost:5000/v1',
            model: envModel || modelName || 'qwen2.5-coder:7b',
            apiKey: envApiKey,
            timeout: Number.isNaN(timeout) ? 60000 : timeout,
            retries: Number.isNaN(retries) ? 3 : Math.max(0, retries)
        };

    } catch (error: any) {
        console.error(`Error loading config from ${configPath}: ${error.message}`);
        console.error('Ensure your config file is valid JSON and follows the expected structure.');
        console.error(`If you prefer, you can also configure via environment variables:
- OPENCODE_BASE_URL
- OPENCODE_MODEL
- OPENCODE_API_KEY (or OPENAI_API_KEY)`);
        process.exit(1);
    }
}
