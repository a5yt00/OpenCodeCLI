# 🚀 OpenCode LLM Server

Run open-source LLMs on Google Colab and use them with OpenCode via Cloudflare Tunnels.

## Features

- **Universal Model Support** - Qwen, DeepSeek, Mistral, CodeLlama
- **OpenAI-Compatible API** - Works with any OpenAI client
- **Streaming** - Real-time token output
- **Tool Calling** - Full function calling support
- **Loop Prevention** - Detects and stops infinite loops
- **Context Management** - Auto-truncates long conversations

## Quick Start

### 1. Upload to Colab

1. Go to [Google Colab](https://colab.research.google.com)
2. Upload `OpenCode_LLM_Server_Final.ipynb`
3. Runtime → Change runtime type → **T4 GPU**

### 2. Run the Notebook

1. Select your model in Cell 1
2. Runtime → **Run all** (Ctrl+F9)
3. Wait for model download (5-10 min for large models)
4. Copy the Cloudflare URL from Cell 6

### 3. Configure OpenCode

Open `~/.config/opencode/opencode.json`:

```json
{
  "provider": {
    "colab": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Colab LLM",
      "options": {
        "baseURL": "https://YOUR-URL.trycloudflare.com/v1"
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

### 4. Use OpenCode

1. Restart OpenCode
2. Select "Colab LLM" as provider
3. Start coding!

## Available Models

| Model | VRAM | Tool Support | Speed | Best For |
|-------|------|--------------|-------|----------|
| qwen2.5-coder:7b | ~5GB | ⭐⭐⭐ | Fast | General coding |
| qwen2.5-coder:14b | ~9GB | ⭐⭐⭐ | Medium | Complex tasks |
| deepseek-coder-v2:16b | ~10GB | ⭐⭐ | Slow | Deep reasoning |
| codellama:13b | ~8GB | ⭐ | Medium | Code generation |
| mistral:7b | ~5GB | ⭐ | Fast | General purpose |

## Custom Tools

The server supports these tools (installed in OpenCode):

| Tool | Description | Location |
|------|-------------|----------|
| `file_write` | Create/write files | `~/.config/opencode/tools/file_write.ts` |
| `file_read` | Read files | `~/.config/opencode/tools/file_read.ts` |
| `shell` | Run commands | `~/.config/opencode/tools/shell.ts` |
| `list_files` | List directory | `~/.config/opencode/tools/list_files.ts` |
| `search` | Search in files | `~/.config/opencode/tools/search.ts` |

## Troubleshooting

### "Loop detected" or infinite retries
- The server has loop prevention built-in
- If you see this, the model may not understand the request
- Try rephrasing or use a different model (qwen2.5-coder recommended)

### Slow responses
- Colab free tier GPUs vary in speed
- Larger models are slower
- Consider using qwen2.5-coder:7b for faster responses

### Connection errors
- Colab sessions timeout after ~12 hours
- Re-run the notebook to get a new URL
- Keep the notebook tab open

### Model not using tools
- qwen2.5-coder has the best tool support
- deepseek-coder-v2 may not output proper tool JSON
- The server extracts tools from text when possible

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Chat completion (main endpoint) |
| `/v1/models` | GET | List available models |
| `/health` | GET | Server health check |
| `/` | GET | Server info |

## Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│   OpenCode   │────▶│  Cloudflare     │────▶│  Flask API   │
│   (Local)    │◀────│  Tunnel         │◀────│  (Colab)     │
└──────────────┘     └─────────────────┘     └──────┬───────┘
                                                    │
                                                    ▼
                                             ┌──────────────┐
                                             │    Ollama    │
                                             │   + Model    │
                                             └──────────────┘
```

## Version History

- **v3.0** - Streaming, tool result handling, context management
- **v2.0** - Loop prevention, comprehensive system prompt
- **v1.0** - Basic tool support

## License

MIT - Use freely for personal and commercial projects.
