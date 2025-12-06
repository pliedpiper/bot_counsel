# Bot Council

A web app that lets you query multiple LLMs simultaneously and compare their responses side-by-side. Send a single prompt to up to 4 different AI models at once and watch their responses stream in real-time.

## Features

- **Multi-model comparison** - Query up to 4 LLMs in parallel with a single prompt
- **Streaming responses** - Watch responses generate in real-time
- **Configurable models** - Choose from a customizable list of models via dropdown menus
- **Copy to clipboard** - Easily copy any response with one click
- **OpenRouter integration** - Access 100+ models through a single API

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your API key

Create a `.env` file in the project root:

```
VITE_OPENROUTER_API_KEY=your_openrouter_api_key_here
```

Get your API key at [openrouter.ai/keys](https://openrouter.ai/keys)

### 3. Run the development server

```bash
npm run dev
```

The app will be available at `http://localhost:5174`

## Configuring Models

Models are loaded from `public/models.txt`. Each line should contain a model ID and human-readable name separated by a comma:

```
# Model ID,Human-readable Name
x-ai/grok-4-fast,Grok 4 Fast
anthropic/claude-opus-4.5,Claude Opus 4.5
openai/gpt-5-mini,GPT-5 Mini
```

You can add, remove, or reorder models by editing this file. Find available model IDs at [openrouter.ai/models](https://openrouter.ai/models).

## Usage

1. Select a model for each of the 4 panels (or leave some as "-- Select a model --" to skip them)
2. Enter your prompt in the text area at the bottom
3. Click "Send Prompt"
4. Watch responses stream in from all selected models simultaneously
5. Use the copy button on each panel to copy a response

## Tech Stack

- React 19
- Vite
- Tailwind CSS
- OpenRouter API
