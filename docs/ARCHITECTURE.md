# Opencrush Architecture

## Overview

Opencrush is a monorepo built with pnpm workspaces and TypeScript.
Each package has a single responsibility.

```
packages/
├── core/           @opencrush/core      — Brain: blueprint, memory, LLM
├── bridges/
│   ├── discord/    @opencrush/bridge-discord   — Discord integration
│   └── telegram/   @opencrush/bridge-telegram  — Telegram integration
├── media/          @opencrush/media     — Image, video, TTS, STT
├── autonomous/     @opencrush/autonomous — Scheduler, music, dramas
└── cli/            @opencrush/cli       — Setup wizard, start command
```

## Data Flow

### Incoming message (user → character)

```
User sends message (Discord/Telegram/WhatsApp)
    │
    ▼
Bridge receives message
    │
    ▼
ConversationEngine.respond(incoming)
    │
    ├── 1. memory.getContext(userMessage)
    │       ├── Working memory: recent 20 messages (SQLite)
    │       ├── Episodic memory: recent life events (SQLite)
    │       └── Semantic memory: vector search (Vectra)
    │
    ├── 2. buildSystemPrompt(blueprint, mood, episodes, semanticContext)
    │
    ├── 3. llm.chat(systemPrompt, conversationHistory)
    │
    ├── 4. parseResponseActions(rawResponse)
    │       └── Extract [SELFIE: ...], [VOICE: ...], [VIDEO: ...] tags
    │
    └── 5. memory.consolidate(userMessage, response)
            └── Store in SQLite + vector index
    │
    ▼
Bridge sends response
    ├── Text message
    ├── Image (via media.generateImage → fal.ai)
    ├── Voice message (via media.textToSpeech → ElevenLabs/EdgeTTS)
    └── Video (via media.generateVideo → Wan/fal.ai)
```

### Proactive message (character → user)

```
AutonomousScheduler (cron jobs)
    │
    ├── listenToMusic()  → MusicEngine.listenToSomething()
    │                      → Log episode → memory
    │                      → 60% chance: trigger proactive message
    │
    ├── watchDrama()     → DramaEngine.watchNextEpisode()
    │                      → Log episode → memory
    │                      → 70% chance: trigger proactive message
    │
    └── checkMissingUser() → If been too long since last contact
                             → trigger 'missing_you' message
    │
    ▼
ConversationEngine.generateProactiveMessage(trigger)
    │ (Uses same LLM + blueprint, but generates the message from her perspective)
    ▼
Bridge.sendProactiveMessage(response)
```

## Memory Architecture

### Three-layer design (inspired by a16z companion-app + LongMem)

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Working Memory                                 │
│  SQLite table: messages                                  │
│  Stores: last ~50 conversation turns                     │
│  Retrieval: always included (most recent 20)             │
│  Expires: automatically pruned after 200 messages        │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Episodic Memory                                │
│  SQLite table: episodes                                  │
│  Stores: life events (music listened, dramas watched,    │
│          mood states, user facts, conversation highlights)│
│  Retrieval: most recent 5 episodes always included       │
│  Never expires                                           │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Semantic Memory                                │
│  Vectra local vector index (no cloud needed)             │
│  Stores: embeddings of important exchanges + episodes    │
│  Retrieval: cosine similarity search on user query       │
│  Returns: top-5 results with score > 0.75                │
└─────────────────────────────────────────────────────────┘
```

## Blueprint System

Inspired by openclaw-friends. Four markdown files define the character:

| File | Purpose | When Used |
|------|---------|-----------|
| `IDENTITY.md` | Who she is (name, age, background) | System prompt header |
| `SOUL.md` | Voice, values, emotional patterns | System prompt body |
| `USER.md` | Your relationship with her | System prompt relationship section |
| `MEMORY.md` | Initial facts and shared history | System prompt memory section |

The system prompt is rebuilt fresh for each message, incorporating:
- All 4 blueprint files
- Recent episodic memory (drama, music, moods)
- Semantic memory hits from vector search
- Current date/time and timezone

## Visual Consistency (inspired by clawra)

```
User uploads reference photo (characters/<name>/reference.jpg)
    │
    ▼
ImageEngine.generateSelfie({ prompt, referenceImagePath })
    │
    ├── If reference image exists:
    │   └── fal-ai/ip-adapter-face-id
    │       (locks face identity while varying pose/background)
    │
    └── If no reference image:
        └── fal-ai/flux/dev
            (uses appearance description from IDENTITY.md)
```

## Adding a New Bridge

To add a new messaging platform (e.g., iMessage, Line):

1. Create `packages/bridges/<platform>/`
2. Implement the interface:
   ```typescript
   class MyBridge {
     async start(): Promise<void>
     async stop(): Promise<void>
     async sendProactiveMessage(response: OutgoingMessage): Promise<void>
   }
   ```
3. Import in `packages/cli/src/start.ts`

## Tech Stack Summary

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js 20 + TypeScript | Type safety, ecosystem |
| Build | tsup | Fast TS bundler |
| Monorepo | pnpm workspaces + Turbo | Fast installs, parallel builds |
| LLM | Claude Sonnet 4.6 / GPT-4o | Best roleplay consistency |
| Memory | better-sqlite3 + Vectra | Zero cloud, works offline |
| Discord | discord.js v14 | Most mature, voice support |
| Telegram | grammy | Modern, well-maintained |
| Images | fal.ai + Flux + IP-Adapter | Best consistency |
| TTS | ElevenLabs → Edge TTS fallback | Natural voice, free fallback |
| STT | OpenAI Whisper | Most accurate transcription |
| Scheduler | node-cron | Lightweight, reliable |
| Video | fal.ai + Wan2.1 | Best open-source video |
