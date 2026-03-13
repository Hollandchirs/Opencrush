# Contributing to Opencrush

Thank you for wanting to make Opencrush better. This guide helps you get started.

## Ways to Contribute

- 🐛 **Fix bugs** — check [Issues](https://github.com/Hollandchirs/Opencrush/issues)
- 🌉 **Add a bridge** — WhatsApp, iMessage, Line, Signal...
- 🎨 **Improve character templates** — better defaults for SOUL.md, IDENTITY.md
- 🧠 **Improve memory** — better retrieval, consolidation, pruning
- 📖 **Improve docs** — clearer setup guides, more examples
- 🌐 **Internationalization** — non-English character templates

## Getting Started

```bash
git clone https://github.com/Hollandchirs/Opencrush.git
cd Opencrush

# Install dependencies
npm install -g pnpm
pnpm install

# Copy example env
cp .env.example .env
# Edit .env with your API keys

# Run a specific package in dev mode
pnpm --filter @opencrush/core dev
```

## Project Structure

```
packages/core/src/
  blueprint/index.ts   — Blueprint loading and system prompt building
  memory/index.ts      — Three-layer memory system
  llm/index.ts         — LLM router (Anthropic/OpenAI/Ollama)
  engine.ts            — Main conversation orchestrator

packages/bridges/discord/src/index.ts  — Discord integration
packages/bridges/telegram/src/index.ts — Telegram integration
packages/media/src/
  image.ts  — fal.ai image generation
  voice.ts  — TTS/STT
  video.ts  — Video generation

packages/autonomous/src/
  scheduler.ts  — Cron job orchestration
  music.ts      — Music awareness (Spotify/curated)
  drama.ts      — Drama tracking (TMDB/curated)

packages/cli/src/
  index.ts   — CLI entry point
  setup.ts   — Interactive setup wizard
  start.ts   — Start all services
```

## Adding a New Bridge

Bridges connect the conversation engine to a messaging platform.

```typescript
// packages/bridges/myplatform/src/index.ts

import { ConversationEngine, OutgoingMessage } from '@opencrush/core'
import { MediaEngine } from '@opencrush/media'

export class MyPlatformBridge {
  constructor(config: { engine: ConversationEngine; media: MediaEngine; /* platform config */ }) {}

  async start(): Promise<void> {
    // Initialize SDK, authenticate, set up event listeners
    // On each message: call this.config.engine.respond(incoming)
    // Send response: call this.sendResponse(channel, response)
  }

  async stop(): Promise<void> {
    // Clean disconnect
  }

  async sendProactiveMessage(response: OutgoingMessage): Promise<void> {
    // Send to the owner's DM/chat
  }
}
```

Then add to `packages/cli/src/start.ts` and `packages/bridges/<name>/package.json`.

## Code Style

- TypeScript strict mode
- No `any` unless unavoidable (add a comment explaining why)
- Functions over classes where it makes sense
- Comments explain *why*, not *what*
- Error messages should tell the user what to do, not just what went wrong

## Pull Request Process

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test manually with a real character
5. Submit PR with a description of what changed and why

## Questions?

Open a [Discussion](https://github.com/Hollandchirs/Opencrush/discussions) —
no question is too basic.
