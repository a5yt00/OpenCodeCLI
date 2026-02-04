# 🚀 Colab LLM Server & CLI

Run open-source LLMs on Google Colab and use them with any OpenAI-compatible client, including this CLI.

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

### 3. Use with CLI

See `OpenCodeCLI/README.md` (if available) or use the source in `OpenCodeCLI/`.

### 4. Use with any generic client

```json
{
  "baseURL": "https://YOUR-URL.trycloudflare.com/v1",
  "model": "qwen2.5-coder:7b"
}
```

## Available Models

| Model | VRAM | Tool Support | Speed | Best For |
|-------|------|--------------|-------|----------|
| qwen2.5-coder:7b | ~5GB | ⭐⭐⭐ | Fast | General coding |
| qwen2.5-coder:14b | ~9GB | ⭐⭐⭐ | Medium | Complex tasks |
| deepseek-coder-v2:16b | ~10GB | ⭐⭐ | Slow | Deep reasoning |
| codellama:13b | ~8GB | ⭐ | Medium | Code generation |
| mistral:7b | ~5GB | ⭐ | Fast | General purpose |

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
│  Any Client  │────▶│  Cloudflare     │────▶│  Flask API   │
│   (CLI/IDE)  │◀────│  Tunnel         │◀────│  (Colab)     │
└──────────────┘     └─────────────────┘     └──────┬───────┘
                                                    │
                                                    ▼
                                             ┌──────────────┐
                                             │    Ollama    │
                                             │   + Model    │
                                             └──────────────┘
```

## License

MIT - Use freely for personal and commercial projects.
