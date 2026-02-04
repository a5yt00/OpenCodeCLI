# 🚀 OpenCode Colab & CLI

**The Ultimate Open-Source AI Coding Assistant Setup**

This repository contains everything you need to run powerful open-source LLMs (like Qwen 2.5 Coder) for free on Google Colab and use them locally with a feature-rich CLI agent.

## 📦 What's Inside?

1.  **Colab LLM Server** (`OpenCode_LLM_Server_Final.ipynb`)
    *   Runs on Google Colab's free T4 GPUs.
    *   Hosting OpenAI-compatible API via Cloudflare Tunnel.
    *   Supports: **Qwen 2.5 Coder**, DeepSeek, CodeLlama, Mistral.
    *   Features: Streaming, Tool Calling, Context Management.

2.  **OpenCode CLI** (`OpenCodeCLI/`)
    *   A powerful terminal-based AI agent.
    *   Connects to your Colab server (or any OpenAI-compatible source).
    *   Capabilities: File editing, shell execution, memory, sub-agents, skills.
    *   Interactive REPL & one-shot command modes.

---

## ☁️ Part 1: Setting up the Server (Google Colab)

1.  **Open in Colab**:
    *   Go to [Google Colab](https://colab.research.google.com).
    *   Upload `OpenCode_LLM_Server_Final.ipynb` from this repo.

2.  **Start the Server**:
    *   In the notebook, set your desired model in the first cell (default: `qwen2.5-coder:7b`).
    *   Go to **Runtime** > **Change runtime type** and select **T4 GPU**.
    *   Select **Run all** (Ctrl+F9).

3.  **Get the URL**:
    *   Wait for the model to download and load (approx. 5-10 mins).
    *   Look for the **Cloudflare Tunnel URL** in the output of the last cell (e.g., `https://crazy-random-words.trycloudflare.com`).
    *   **Copy this URL**.

---

## 💻 Part 2: Installing & Using the CLI

### Installation

```bash
# Clone the repository
git clone https://github.com/a5yt00/OpenCodeCLI.git
cd OpenCodeCLI/OpenCodeCLI

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional, to use 'opencode' command anywhere)
npm link
```

### Configuration

The CLI needs to know your Colab server URL.

**Interactive Setup:**
Run the CLI and use the `/config` command:
```bash
opencode
> /config https://your-new-url.trycloudflare.com/v1
```

**Manual Setup:**
Edit `~/.config/opencode/opencode.json`:
```json
{
  "provider": {
    "colab": {
      "options": {
        "baseURL": "https://your-url.trycloudflare.com/v1"
      },
      "models": {
        "qwen2.5-coder:7b": {
          "name": "Qwen 2.5 Coder 7B",
          "contextLength": 32768
        }
      }
    }
  }
}
```

### Usage

**Interactive Mode (REPL)**
Start the interactive session. The agent has context of your current directory.
```bash
opencode
```
*   **Chat**: Just type your request (e.g., "Analyze package.json and look for outdated dependencies").
*   **Commands**: Use `/help` to see available commands.

**One-Shot Mode**
Run a single task directly from the terminal.
```bash
opencode --run "Create a new file called hello.ts with a greeting function" --yes
```

**Options**
| Option | Description |
|--------|-------------|
| `--version`, `-v` | Show version |
| `--help`, `-h` | Show help |
| `--run <prompt>` | Run a single prompt and exit |
| `--yes`, `-y` | Auto-approve tool executions (dangerous!) |
| `--stream` | Stream token responses |
| `--debug` | Enable debug logging |
| `--session <path>` | Load a saved session file |
| `--no-project` | Skip loading project context |
| `--audit-log <path>` | Save tool execution logs to a file |

### 🛠️ Interactive Commands (REPL)

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/clear` | Clear conversation history |
| `/save <path>` | Save current session to JSON |
| `/load <path>` | Load a saved session |
| `/add <file>` | Add file content to the context manually |
| `/image <path>` | (If supported) Analyze an image |
| `/context` | Re-index codebase and git status |
| `/index` | Force full re-indexing of the codebase |
| `/memories` | View long-term memories |
| `/remember <k> <v>`| Manually save a long-term memory |
| `/agent <name>` | Delegate a task to a specialized sub-agent |
| `/skill <name>` | Load a specific skill/instruction set |
| `/status` | Show current connection and session stats |
| `/ping` | Test connection to the LLM server |

---

## 🧩 Advanced Features

### 🧠 Memory
The agent has a persistent memory system. It can "remember" facts across sessions.
*   "Remember that I prefer TypeScript for all new files."
*   "What do you know about my testing preferences?"

### 🤖 Sub-Agents
Delegate complex tasks to specialized agents.
```bash
/agent reviewer "Check src/index.ts for security issues"
/agent planner "Create a plan to migrate to Next.js"
```

### 📚 Skills
Load specialized instruction sets for specific tasks.
```bash
/skill react-best-practices
/skill security-audit
```

---

## License

MIT License. Feel free to use and modify!
