/**
 * Three-Layer Memory System
 *
 * Layer 1 — Working Memory:    Recent conversation turns (SQLite, fast)
 * Layer 2 — Episodic Memory:   Life events log (SQLite JSON, queryable)
 * Layer 3 — Semantic Memory:   Vector embeddings for long-term recall (vectra)
 *
 * Inspired by: a16z companion-app (Redis+pgvector) → adapted for local SQLite
 * Design principle: zero cloud dependencies, everything runs locally
 */

import Database from 'better-sqlite3'
import { LocalIndex } from 'vectra'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  platform?: string
}

export interface Episode {
  id?: number
  type: 'music' | 'drama' | 'mood' | 'event' | 'user_fact' | 'conversation_highlight'
  title: string
  description: string
  metadata?: Record<string, unknown>
  timestamp: number
}

export interface MemoryContext {
  recentMessages: Message[]
  relevantEpisodes: Episode[]
  semanticContext: string[]
}

export class MemorySystem {
  private db: Database.Database
  private vectorIndex: LocalIndex
  private characterName: string
  private embedFn: (text: string) => Promise<number[]>

  constructor(
    characterName: string,
    dataDir: string,
    embedFn: (text: string) => Promise<number[]>
  ) {
    this.characterName = characterName
    this.embedFn = embedFn

    const dbPath = join(dataDir, characterName, 'memory.db')
    const vectorPath = join(dataDir, characterName, 'vectors')

    mkdirSync(join(dataDir, characterName), { recursive: true })
    mkdirSync(vectorPath, { recursive: true })

    this.db = new Database(dbPath)
    this.vectorIndex = new LocalIndex(vectorPath)
    this.initSchema()
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        role      TEXT NOT NULL,
        content   TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        platform  TEXT
      );

      CREATE TABLE IF NOT EXISTS episodes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        type        TEXT NOT NULL,
        title       TEXT NOT NULL,
        description TEXT NOT NULL,
        metadata    TEXT,
        timestamp   INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_episodes_type ON episodes(type);
      CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp);
    `)
  }

  // ── Working Memory ─────────────────────────────────────────────────────────

  addMessage(msg: Message): void {
    this.db.prepare(`
      INSERT INTO messages (role, content, timestamp, platform)
      VALUES (?, ?, ?, ?)
    `).run(msg.role, msg.content, msg.timestamp, msg.platform ?? null)
  }

  getRecentMessages(limit = 30): Message[] {
    const rows = this.db.prepare(`
      SELECT role, content, timestamp, platform
      FROM messages
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as Message[]
    return rows.reverse()
  }

  // ── Episodic Memory ────────────────────────────────────────────────────────

  async logEpisode(episode: Omit<Episode, 'id'>): Promise<void> {
    const metaStr = episode.metadata ? JSON.stringify(episode.metadata) : null
    this.db.prepare(`
      INSERT INTO episodes (type, title, description, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(episode.type, episode.title, episode.description, metaStr, episode.timestamp)

    // Also embed into semantic memory for retrieval
    const text = `${episode.title}: ${episode.description}`
    await this.addToSemanticMemory(text, { type: episode.type, timestamp: episode.timestamp })
  }

  getRecentEpisodes(limit = 10, type?: Episode['type']): Episode[] {
    if (type) {
      return this.db.prepare(`
        SELECT * FROM episodes WHERE type = ?
        ORDER BY timestamp DESC LIMIT ?
      `).all(type, limit) as Episode[]
    }
    return this.db.prepare(`
      SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Episode[]
  }

  // ── Semantic Memory ────────────────────────────────────────────────────────

  async addToSemanticMemory(
    text: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      if (!await this.vectorIndex.isIndexCreated()) {
        await this.vectorIndex.createIndex({ version: 1, deleteIfExists: false })
      }
      const vector = await this.embedFn(text)
      await this.vectorIndex.insertItem({ vector, metadata: { text, ...metadata } })
    } catch {
      // Vector memory is best-effort — don't crash if it fails
    }
  }

  async searchSemanticMemory(query: string, topK = 5): Promise<string[]> {
    try {
      if (!await this.vectorIndex.isIndexCreated()) return []
      const vector = await this.embedFn(query)
      const results = await this.vectorIndex.queryItems(vector, topK)
      return results
        .filter(r => r.score > 0.75)
        .map(r => (r.item.metadata as { text: string }).text)
    } catch {
      return []
    }
  }

  // ── Combined Context Retrieval ─────────────────────────────────────────────

  async getContext(userMessage: string): Promise<MemoryContext> {
    const [recentMessages, semanticContext] = await Promise.all([
      Promise.resolve(this.getRecentMessages(20)),
      this.searchSemanticMemory(userMessage),
    ])

    const relevantEpisodes = this.getRecentEpisodes(5)

    return { recentMessages, relevantEpisodes, semanticContext }
  }

  /**
   * Extract and store important facts from a conversation turn.
   * Called after each exchange to build up long-term memory.
   */
  async consolidate(userMessage: string, assistantResponse: string): Promise<void> {
    // Store the exchange in working memory
    const now = Date.now()
    this.addMessage({ role: 'user', content: userMessage, timestamp: now })
    this.addMessage({ role: 'assistant', content: assistantResponse, timestamp: now + 1 })

    // Add to semantic memory for later retrieval
    const exchange = `User said: "${userMessage}" — Response: "${assistantResponse.slice(0, 200)}"`
    await this.addToSemanticMemory(exchange, { timestamp: now })
  }

  getMoodContext(): string {
    const recentEpisodes = this.getRecentEpisodes(3)
    if (recentEpisodes.length === 0) return ''

    const latest = recentEpisodes[0]
    if (latest.type === 'mood') return latest.title
    return ''
  }
}
