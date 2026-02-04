# OpenCode Configuration Guide

This guide explains how to configure OpenCode to connect to your Colab-hosted LLM.

## Step 1: Get Your API URL

After running the Colab notebook, you'll see output like:

```
🎉 YOUR PUBLIC API URL: https://random-words-here.trycloudflare.com
```

Copy this URL - you'll need it for configuration.

## Step 2: Configure OpenCode

### Method A: Environment Variables

```bash
# For Ollama notebook
export OLLAMA_HOST="https://YOUR-URL.trycloudflare.com"

# For AirLLM notebook
export OPENAI_API_BASE="https://YOUR-URL.trycloudflare.com/v1"
export OPENAI_API_KEY="sk-dummy"
```

### Method B: OpenCode Config File

Create or edit `~/.opencode/config.json`:

#### Ollama Configuration

```json
{
  "providers": {
    "ollama": {
      "name": "Ollama (Colab)",
      "baseUrl": "https://YOUR-URL.trycloudflare.com",
      "apiKey": ""
    }
  },
  "activeProvider": "ollama",
  "activeModel": "qwen2.5-coder:7b"
}
```

#### OpenAI-Compatible Configuration (for AirLLM)

```json
{
  "providers": {
    "custom": {
      "name": "AirLLM (Colab)",
      "type": "openai",
      "baseUrl": "https://YOUR-URL.trycloudflare.com/v1",
      "apiKey": "sk-dummy"
    }
  },
  "activeProvider": "custom",
  "activeModel": "qwen2.5-coder-32b-instruct"
}
```

## Step 3: Verify Connection

### Quick Test with cURL

```bas
# Test Ollama
curl https://YOUR-URL.trycloudflare.com/api/tags

# Test AirLLM
curl https://YOUR-URL.trycloudflare.com/v1/models
```

### Test in OpenCode

Open OpenCode and try a simple prompt:

```
Write a hello world program in Python
```

If you get a response, the connection is working!

## Available Models

### Ollama Notebook
- `qwen2.5-coder:7b` (default)
- `qwen2.5-coder:3b`
- `qwen2.5-coder:1.5b`

### AirLLM Notebook
- `qwen2.5-coder-32b-instruct` (default)
- `qwen2.5-coder-14b-instruct`
- `qwen2.5-72b-instruct`

## Common Issues

### "Connection refused" or timeout

1. Make sure the Colab notebook is running
2. Check that the tunnel cell is still active
3. Verify the URL hasn't changed (restart generates new URL)

### "Model not found"

1. Ensure the model was downloaded (check Cell 5 output in Ollama notebook)
2. Use the exact model name from the notebook

### Slow responses

- **Ollama**: Should be fast on T4 GPU
- **AirLLM**: Expect 30-60 seconds per response (layer streaming is slow but enables large models)

## Session Management

Since Colab sessions timeout:

1. **Keep the browser tab open** to prevent idle timeout
2. **Bookmark the notebook** for quick access
3. **Re-run all cells** when starting a new session
4. **Update your OpenCode config** with the new URL

## Pro Tips

1. **Use Colab Pro** for longer sessions and better GPUs (A100)
2. **Smaller models = faster responses** - start with 7B, scale up if needed
3. **Test locally first** - verify the API works before configuring OpenCode
4. **Save the notebook** to your Google Drive for persistence
