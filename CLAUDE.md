# CLAUDE.md — Openlove

This file provides context for AI assistants working on the Openlove codebase.

## Project Overview

Openlove is an open-source AI companion framework that runs locally. Users create a character (with personality, appearance, memories) and interact with it over Discord, Telegram, or WhatsApp. The companion autonomously browses dramas, listens to music, and proactively reaches out via messaging platforms.

**Key design principles:**
- Everything runs locally — no cloud databases, all data stays on the user's machine
- Zero-config where possible — SQLite for storage, Vectra for local vector search
- Graceful degradation — if an API key is missing, features degrade silently (return null) rather than crash

## Tech Stack

- **Runtime:** Node.js 20+, TypeScript (strict mode), ES2022 target
- **Monorepo:** pnpm 9+ workspaces with Turborepo for orchestration
- **Build:** tsup (fast TypeScript bundler), outputs ESM + CJS with declarations
- **Database:** better-sqlite3 (synchronous, local, zero-config)
- **Vector search:** Vectra (local vector index, no cloud)
- **LLM:** Multi-provider — Anthropic Claude, OpenAI, DeepSeek, Qwen, Kimi, Zhipu, MiniMax, Ollama
- **Messaging:** discord.js v14 (with @discordjs/voice), grammy (Telegram)
- **Media:** fal.ai (images/video), ElevenLabs + Edge TTS (voice), OpenAI Whisper (STT)
- **Scheduling:** node-cron
- **Validation:** zod
- **CLI UI:** inquirer, chalk, ora, boxen, figlet

## Repository Structure

```
Openlove/
├── packages/
│   ├── core/           @openlove/core          — Brain: blueprint, memory, LLM router
│   ├── cli/            @openlove/cli           — Setup wizard, start command, character creator
│   ├── media/          @openlove/media         — Image gen, TTS/STT, video gen
│   ├── autonomous/     @openlove/autonomous    — Scheduler, music awareness, drama tracking
│   └── bridges/
│       ├── discord/    @openlove/bridge-discord — Discord text, voice, media
│       └── telegram/   @openlove/bridge-telegram — Telegram text, voice, media
├── characters/         — User-created characters (gitignored except example/)
├── templates/          — Character blueprint templates (IDENTITY.md, SOUL.md, USER.md, MEMORY.md)
├── docs/               — ARCHITECTURE.md, CONTRIBUTING.md
├── .env.example        — All environment variables with inline docs
├── turbo.json          — Turborepo task config
├── tsconfig.base.json  — Shared TS config (ES2022, strict, bundler resolution)
└── pnpm-workspace.yaml — Workspace: packages/* and packages/bridges/*
```

## Package Dependency Graph

```
@openlove/cli (entry point)
├── @openlove/core
├── @openlove/media
├── @openlove/autonomous → @openlove/core
├── @openlove/bridge-discord → @openlove/core, @openlove/media
└── @openlove/bridge-telegram → @openlove/core, @openlove/media
```

All inter-package deps use `workspace:*` protocol.

## Key Commands

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages (via turbo, respects dependency order)
pnpm dev                  # Dev mode with watch (all packages)
pnpm lint                 # Lint all packages
pnpm clean                # Remove all dist/ directories

pnpm setup                # Run interactive setup wizard
pnpm start                # Start the companion (loads .env, boots all services)
pnpm create-character     # AI-guided character creation

# Single package dev
pnpm --filter @openlove/core dev
pnpm --filter @openlove/bridge-discord build
```

## Core Architecture

### Data Flow — Incoming Message

1. Bridge receives message (Discord/Telegram)
2. `ConversationEngine.respond(incoming)` is called
3. `MemorySystem.getContext()` retrieves: recent messages (SQLite), recent episodes (SQLite), semantic search (Vectra)
4. `buildSystemPrompt()` assembles blueprint + mood + episodes + semantic context
5. `LLMRouter.chat()` calls the configured provider
6. `parseResponseActions()` extracts `[SELFIE: ...]`, `[VOICE: ...]`, `[VIDEO: ...]` tags from response
7. `MemorySystem.consolidate()` stores the exchange
8. Bridge sends text + media back to user

### Data Flow — Proactive Message

1. `AutonomousScheduler` fires cron job (music/drama/morning/random/missing)
2. Engine activity logged to episodic memory
3. Probability gate decides whether to message user (60-70% for music/drama, 20% for random)
4. `ConversationEngine.generateProactiveMessage(trigger)` generates the message
5. Sent to all active bridges via `sendProactiveMessage()`

### Three-Layer Memory System

| Layer | Storage | Contents | Retrieval |
|-------|---------|----------|-----------|
| Working Memory | SQLite `messages` table | Recent ~50 conversation turns | Most recent 20 always included |
| Episodic Memory | SQLite `episodes` table | Life events (music, dramas, moods, user facts) | Most recent 5 always included |
| Semantic Memory | Vectra local vector index | Embeddings of exchanges + episodes | Cosine similarity, top-5 > 0.75 threshold |

### Blueprint System (4-file character definition)

Characters live in `characters/<name>/` with four markdown files:
- `IDENTITY.md` — Who (name, age, background); frontmatter has `gender`, `language`, `timezone`
- `SOUL.md` — Voice, values, emotional patterns
- `USER.md` — Relationship with the user
- `MEMORY.md` — Initial shared memories and known facts
- Optional: `reference.jpg` (or .png/.webp) for visual consistency in selfie generation

### LLM Router

All providers except Anthropic use OpenAI-compatible chat completions API with different `baseURL` and default model. Chinese providers (DeepSeek, Qwen, Kimi, Zhipu, MiniMax) share one code path. Ollama uses a custom base URL. Embedding falls back to a pseudo-embed function for providers without embedding endpoints.

### Bridge Interface

Every bridge implements:
```typescript
class Bridge {
  async start(): Promise<void>
  async stop(): Promise<void>
  async sendProactiveMessage(response: OutgoingMessage): Promise<void>
}
```

Bridges are dynamically imported in `packages/cli/src/start.ts` based on which env vars are set.

## Code Conventions

- **TypeScript strict mode** — no implicit any, strict null checks
- **No `any`** unless unavoidable (add a comment explaining why)
- **ESM imports** with `.js` extension in source (e.g., `'./engine.js'`) — required for ESM compatibility
- **Functions over classes** where it makes sense; classes used for stateful components (Engine, Bridge, Memory)
- **Comments explain *why*, not *what*** — block comments at top of files describe purpose
- **Error messages tell users what to do**, not just what went wrong
- **Graceful degradation** — media/voice/image return `null` on failure, never crash the process
- **Console logging** uses bracketed prefixes: `[Discord]`, `[Autonomous]`, `[Media/Image]`
- **Exports** are re-exported through barrel `index.ts` files per package
- **Type exports** use explicit `export type` syntax

## Environment Variables

All variables are documented in `.env.example`. Key groups:
- `LLM_PROVIDER` + provider API keys (pick one)
- `CHARACTER_NAME` — folder name under `characters/`
- Platform tokens: `DISCORD_BOT_TOKEN`, `TELEGRAM_BOT_TOKEN`, `WHATSAPP_ENABLED`
- Media: `FAL_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
- Autonomous: `SPOTIFY_CLIENT_ID/SECRET`, `TMDB_API_KEY`
- Behavior: `PROACTIVE_MESSAGE_MIN/MAX_INTERVAL`, `QUIET_HOURS_START/END`

## Important Files

| File | Purpose |
|------|---------|
| `packages/core/src/engine.ts` | Main conversation orchestrator — the heart of Openlove |
| `packages/core/src/blueprint/index.ts` | Character loading + system prompt building |
| `packages/core/src/memory/index.ts` | Three-layer memory system (SQLite + Vectra) |
| `packages/core/src/llm/index.ts` | Multi-provider LLM router |
| `packages/cli/src/start.ts` | Boot sequence — loads config, initializes all services |
| `packages/bridges/discord/src/index.ts` | Discord bridge with voice call support |
| `packages/autonomous/src/scheduler.ts` | Cron-based autonomous behavior |
| `packages/media/src/image.ts` | Image generation with visual consistency |
| `templates/` | Character blueprint templates with `{{CHARACTER_NAME}}` placeholders |

## Adding a New Bridge

1. Create `packages/bridges/<platform>/` with `package.json` and `src/index.ts`
2. Depend on `@openlove/core` (workspace:*) and `@openlove/media` (workspace:*)
3. Implement the bridge interface (start, stop, sendProactiveMessage)
4. Add dynamic import in `packages/cli/src/start.ts` gated on an env var
5. Add the env var to `.env.example`
6. Add to `pnpm-workspace.yaml` (already covers `packages/bridges/*`)

## Testing

There is no formal test suite yet. Manual testing with a real character is the primary testing method. When testing:
- Copy `.env.example` to `.env` and add at least one LLM key + one platform token
- Run `pnpm build && pnpm start`
- Test via the configured messaging platform

## Things to Watch Out For

- **`.js` extensions in imports** — TypeScript source uses `.js` extensions for ESM compatibility. Don't remove them.
- **SQLite is synchronous** — better-sqlite3 calls block the event loop briefly; this is intentional for simplicity.
- **Vector memory is best-effort** — `addToSemanticMemory` and `searchSemanticMemory` catch all errors silently.
- **Bridges are dynamically imported** — `start.ts` uses `await import()` so missing bridge packages don't crash startup.
- **WhatsApp bridge is not yet implemented** — the import references `@openlove/bridge-whatsapp` which doesn't exist yet.
- **Chinese LLM providers** use the OpenAI SDK with a different `baseURL` — don't add separate client code for them.
- **The `parseResponseActions` function** in `engine.ts` extracts `[SELFIE:]`, `[VOICE:]`, `[VIDEO:]` tags — these are part of the LLM prompt contract.
- **Character data is gitignored** — `memory.db`, `vectors/`, `.session` files are private. Only `characters/example/` is tracked.
