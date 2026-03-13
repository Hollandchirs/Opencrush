import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SocialEngine } from '../src/social/index.js'
import type { SocialPost } from '../src/social/index.js'

describe('SocialEngine', () => {
  describe('constructor and config', () => {
    it('creates engine with empty config', () => {
      const engine = new SocialEngine({})
      expect(engine.isReady()).toBe(false)
    })

    it('isReady returns false before initialization', () => {
      const engine = new SocialEngine({
        twitter: { clientId: 'test', clientSecret: 'test' },
      })
      expect(engine.isReady()).toBe(false)
    })
  })

  describe('post rate limiting', () => {
    it('skips post when too soon', async () => {
      const engine = new SocialEngine({
        minPostIntervalMinutes: 60,
      })

      // Manually set last post time to now
      ;(engine as any).lastPostTime = Date.now()
      ;(engine as any).twitterReady = false

      const results = await engine.post('test')
      expect(results).toEqual([])
    })

    it('allows post when enough time has passed', async () => {
      const engine = new SocialEngine({
        minPostIntervalMinutes: 0, // no limit
      })

      // No platform ready, so no results but it proceeds past rate limit check
      ;(engine as any).twitterReady = false
      const results = await engine.post('test')
      expect(results).toEqual([]) // no platforms configured
    })
  })

  describe('getOAuth2Token', () => {
    it('returns null when not initialized', () => {
      const engine = new SocialEngine({})
      expect(engine.getOAuth2Token()).toBeNull()
    })
  })

  describe('getPostHistory', () => {
    it('returns empty array initially', () => {
      const engine = new SocialEngine({})
      expect(engine.getPostHistory()).toEqual([])
    })

    it('respects limit parameter', () => {
      const engine = new SocialEngine({})
      // Manually push some history
      const history = (engine as any).postHistory as SocialPost[]
      for (let i = 0; i < 30; i++) {
        history.push({
          platform: 'twitter',
          content: `post ${i}`,
          timestamp: Date.now(),
          status: 'posted',
        })
      }
      expect(engine.getPostHistory(5)).toHaveLength(5)
      expect(engine.getPostHistory(20)).toHaveLength(20)
      expect(engine.getPostHistory()).toHaveLength(20) // default limit
    })
  })
})
