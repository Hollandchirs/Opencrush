import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RelationshipTracker } from '../src/relationship/index.js'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

describe('RelationshipTracker', () => {
  const TEST_DIR = join(process.cwd(), '.test-relationship')
  let db: Database.Database
  let tracker: RelationshipTracker

  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true })
    mkdirSync(TEST_DIR, { recursive: true })
    db = new Database(join(TEST_DIR, 'test.db'))
    tracker = new RelationshipTracker(db)
  })

  afterEach(() => {
    db.close()
    try { rmSync(TEST_DIR, { recursive: true }) } catch { /* cleanup */ }
  })

  describe('initialization', () => {
    it('starts as stranger stage', () => {
      const state = tracker.getState()
      expect(state.stage).toBe('stranger')
    })

    it('starts with low closeness', () => {
      const state = tracker.getState()
      expect(state.closeness).toBeLessThan(0.15)
    })

    it('starts with zero messages', () => {
      const state = tracker.getState()
      expect(state.totalMessages).toBe(0)
    })

    it('returns a copy (immutable)', () => {
      const s1 = tracker.getState()
      const s2 = tracker.getState()
      expect(s1).toEqual(s2)
      expect(s1).not.toBe(s2)
    })
  })

  describe('getRelationshipContext', () => {
    it('returns stranger description initially', () => {
      const ctx = tracker.getRelationshipContext()
      expect(ctx).toContain('just met')
    })

    it('returns a non-empty string', () => {
      const ctx = tracker.getRelationshipContext()
      expect(typeof ctx).toBe('string')
      expect(ctx.length).toBeGreaterThan(0)
    })
  })

  describe('recordInteraction', () => {
    it('increments message count', () => {
      tracker.recordInteraction('hi', 'hello')
      expect(tracker.getState().totalMessages).toBe(1)
      tracker.recordInteraction('how are you', 'good')
      expect(tracker.getState().totalMessages).toBe(2)
    })

    it('increases closeness over time', () => {
      const before = tracker.getState().closeness
      for (let i = 0; i < 20; i++) {
        tracker.recordInteraction('I love talking to you', 'Me too!')
      }
      const after = tracker.getState().closeness
      expect(after).toBeGreaterThan(before)
    })

    it('emotional messages boost closeness more', () => {
      const tracker2 = new RelationshipTracker(db)

      // 10 neutral messages
      for (let i = 0; i < 10; i++) {
        tracker.recordInteraction('hello', 'hi')
      }
      const neutralCloseness = tracker.getState().closeness

      // Reset - create fresh tracker
      db.exec("DELETE FROM relationship")
      const tracker3 = new RelationshipTracker(db)

      // 10 emotional messages
      for (let i = 0; i < 10; i++) {
        tracker3.recordInteraction('I love you and miss you so much', 'I care about you deeply')
      }
      const emotionalCloseness = tracker3.getState().closeness

      expect(emotionalCloseness).toBeGreaterThan(neutralCloseness)
    })

    it('trust increases when user shares personal info', () => {
      const before = tracker.getState().trust
      tracker.recordInteraction('My name is Alice and my job is engineering', 'Nice to meet you!')
      const after = tracker.getState().trust
      expect(after).toBeGreaterThan(before)
    })

    it('familiarity increases when user shares facts', () => {
      const before = tracker.getState().familiarity
      tracker.recordInteraction('I am a student and I like music', 'Cool!')
      const after = tracker.getState().familiarity
      expect(after).toBeGreaterThan(before)
    })

    it('progresses through stages with enough interaction', () => {
      // Simulate many emotional interactions
      for (let i = 0; i < 200; i++) {
        tracker.recordInteraction(
          'I love you, I miss you, I trust you with my secret',
          'I love you too, I care about you so much'
        )
      }
      const state = tracker.getState()
      // Should have progressed past stranger
      expect(state.stage).not.toBe('stranger')
      expect(state.closeness).toBeGreaterThan(0.15)
    })

    it('closeness never exceeds 1.0', () => {
      for (let i = 0; i < 1000; i++) {
        tracker.recordInteraction('I love you so much!', 'I adore you!')
      }
      expect(tracker.getState().closeness).toBeLessThanOrEqual(1.0)
    })
  })

  describe('persistence', () => {
    it('survives tracker recreation from same db', () => {
      tracker.recordInteraction('hello', 'hi')
      tracker.recordInteraction('how are you', 'good')
      const msgs = tracker.getState().totalMessages

      // Create new tracker from same db
      const tracker2 = new RelationshipTracker(db)
      expect(tracker2.getState().totalMessages).toBe(msgs)
    })
  })

  describe('streak tracking', () => {
    it('tracks total days', () => {
      tracker.recordInteraction('hi', 'hello')
      const state = tracker.getState()
      expect(state.totalDays).toBeGreaterThanOrEqual(1)
    })
  })
})
