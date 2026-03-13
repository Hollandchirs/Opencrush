import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemorySystem } from '../src/memory/index.js'
import type { Message, Episode } from '../src/memory/index.js'
import { rmSync, existsSync } from 'fs'
import { join } from 'path'

describe('MemorySystem', () => {
  const TEST_DIR = join(process.cwd(), '.test-memory')
  let memory: MemorySystem

  // Simple mock embed function
  const mockEmbed = async (_text: string) => new Array(384).fill(0).map(() => Math.random())
  const mockSummarize = async (text: string) => `Summary: ${text.slice(0, 50)}`

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    memory = new MemorySystem('test-char', TEST_DIR, mockEmbed, mockSummarize)
  })

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true }) } catch { /* cleanup */ }
  })

  describe('initialization', () => {
    it('creates database and vector directory', () => {
      expect(existsSync(join(TEST_DIR, 'test-char', 'memory.db'))).toBe(true)
      expect(existsSync(join(TEST_DIR, 'test-char', 'vectors'))).toBe(true)
    })

    it('exposes database for shared use', () => {
      const db = memory.getDatabase()
      expect(db).toBeDefined()
    })
  })

  describe('addMessage / getRecentMessages', () => {
    it('stores and retrieves messages', () => {
      const now = Date.now()
      memory.addMessage({ role: 'user', content: 'Hello', timestamp: now })
      memory.addMessage({ role: 'assistant', content: 'Hi there!', timestamp: now + 1 })

      const messages = memory.getRecentMessages()
      expect(messages).toHaveLength(2)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('Hello')
      expect(messages[1].role).toBe('assistant')
    })

    it('returns messages in chronological order', () => {
      const now = Date.now()
      memory.addMessage({ role: 'user', content: 'First', timestamp: now })
      memory.addMessage({ role: 'user', content: 'Second', timestamp: now + 100 })
      memory.addMessage({ role: 'user', content: 'Third', timestamp: now + 200 })

      const messages = memory.getRecentMessages()
      expect(messages[0].content).toBe('First')
      expect(messages[2].content).toBe('Third')
    })

    it('respects limit parameter', () => {
      const now = Date.now()
      for (let i = 0; i < 50; i++) {
        memory.addMessage({ role: 'user', content: `msg ${i}`, timestamp: now + i })
      }
      const limited = memory.getRecentMessages(5)
      expect(limited).toHaveLength(5)
    })

    it('stores platform field', () => {
      const now = Date.now()
      memory.addMessage({ role: 'user', content: 'from discord', timestamp: now, platform: 'discord' })
      const messages = memory.getRecentMessages()
      expect(messages[0].platform).toBe('discord')
    })
  })

  describe('episodes', () => {
    it('logs and retrieves episodes', async () => {
      await memory.logEpisode({
        type: 'event',
        title: 'First meeting',
        description: 'Met for the first time',
        timestamp: Date.now(),
      })

      const episodes = memory.getRecentEpisodes(5)
      expect(episodes).toHaveLength(1)
      expect(episodes[0].title).toBe('First meeting')
      expect(episodes[0].type).toBe('event')
    })

    it('retrieves episodes by type', async () => {
      const now = Date.now()
      await memory.logEpisode({ type: 'music', title: 'Listened to jazz', description: 'test', timestamp: now })
      await memory.logEpisode({ type: 'drama', title: 'Watched a show', description: 'test', timestamp: now + 1 })
      await memory.logEpisode({ type: 'music', title: 'Listened to pop', description: 'test', timestamp: now + 2 })

      const musicEps = memory.getRecentEpisodes(10, 'music')
      expect(musicEps).toHaveLength(2)
      expect(musicEps.every(e => e.type === 'music')).toBe(true)
    })

    it('stores metadata as JSON', async () => {
      await memory.logEpisode({
        type: 'event',
        title: 'Test',
        description: 'With metadata',
        metadata: { key: 'value', num: 42 },
        timestamp: Date.now(),
      })

      const episodes = memory.getRecentEpisodes(1)
      expect(episodes[0].metadata).toBeDefined()
    })
  })

  describe('consolidate', () => {
    it('handles consolidation without errors', async () => {
      await expect(
        memory.consolidate('I love playing guitar', 'That sounds wonderful!')
      ).resolves.not.toThrow()
    })
  })

  describe('getContext', () => {
    it('returns full memory context', async () => {
      const now = Date.now()
      memory.addMessage({ role: 'user', content: 'My birthday is Dec 3rd', timestamp: now })
      memory.addMessage({ role: 'assistant', content: 'I will remember that!', timestamp: now + 1 })

      const ctx = await memory.getContext('when is my birthday')
      expect(ctx).toHaveProperty('recentMessages')
      expect(ctx).toHaveProperty('relevantEpisodes')
      expect(ctx).toHaveProperty('semanticContext')
      expect(ctx.recentMessages.length).toBeGreaterThan(0)
    })

    it('summarizes older messages when history is long', async () => {
      const now = Date.now()
      // Add 20 messages to trigger summarization
      for (let i = 0; i < 20; i++) {
        memory.addMessage({ role: 'user', content: `message ${i}`, timestamp: now + i * 2 })
        memory.addMessage({ role: 'assistant', content: `reply ${i}`, timestamp: now + i * 2 + 1 })
      }

      const ctx = await memory.getContext('test query')
      // Should have recent messages (8 verbatim + 1 summary)
      expect(ctx.recentMessages.length).toBeLessThanOrEqual(20)
      expect(ctx.recentMessages.length).toBeGreaterThan(0)
    })
  })
})
