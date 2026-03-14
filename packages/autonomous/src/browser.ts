/**
 * Browser Agent
 *
 * Uses Playwright to simulate the AI character "living" on the computer.
 * Opens real browser windows to watch YouTube, listen to Spotify, browse the web.
 *
 * Three launch modes (in priority order):
 *   1. CDP — connect to user's running Chrome (has real login sessions)
 *      Start Chrome with: chrome --remote-debugging-port=9222
 *   2. Persistent Profile — launch Chromium with a dedicated profile directory
 *      Cookies/logins survive restarts. User logs in once, stays logged in.
 *   3. Fresh Chromium — launch isolated Chromium (no cookies, original behavior)
 *
 * Falls back gracefully if Playwright is not installed — activities still
 * update Discord presence even without a real browser.
 */

import { join } from 'path'
import { mkdirSync } from 'fs'

let playwright: typeof import('playwright') | null = null

// Dynamic import — Playwright is optional
async function loadPlaywright(): Promise<typeof import('playwright') | null> {
  if (playwright) return playwright
  try {
    playwright = await import('playwright')
    return playwright
  } catch {
    console.warn('[Browser] Playwright not installed — browser automation disabled. Install with: npx playwright install chromium')
    return null
  }
}

type Browser = Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>
type BrowserContext = Awaited<ReturnType<typeof import('playwright')['chromium']['launchPersistentContext']>>
type Page = Awaited<ReturnType<Browser['newPage']>>

export type BrowserMode = 'cdp' | 'persistent' | 'fresh' | 'chrome'

export interface BrowserConfig {
  /** Launch mode: 'cdp' | 'persistent' | 'fresh' | 'chrome' (default: auto-detect) */
  mode?: BrowserMode
  /** CDP endpoint URL for connecting to user's Chrome (default: http://localhost:9222) */
  cdpEndpoint?: string
  /** Profile directory for persistent mode (default: ~/.opencrush/chrome-profile) */
  profileDir?: string
  /** Whether to run headless (default: false) */
  headless?: boolean
}

export class BrowserAgent {
  private browser?: Browser
  private context?: BrowserContext
  private page?: Page
  private available = false
  private config: BrowserConfig
  private mode: BrowserMode = 'fresh'

  constructor(config: BrowserConfig = {}) {
    this.config = config
  }

  /**
   * Launch the browser. Tries modes in order: CDP → Persistent → Fresh.
   * Returns false if Playwright is unavailable.
   */
  async launch(): Promise<boolean> {
    const pw = await loadPlaywright()
    if (!pw) {
      this.available = false
      return false
    }

    const requestedMode = this.config.mode

    // Try Chrome mode — launches real Google Chrome with a separate profile
    if (requestedMode === 'chrome') {
      const chromeSuccess = await this.tryLaunchChrome(pw)
      if (chromeSuccess) return true
      console.warn('[Browser] Chrome mode failed — falling back to persistent')
      return this.tryLaunchPersistent(pw)
    }

    // Try CDP first (if requested or auto-detect)
    if (!requestedMode || requestedMode === 'cdp') {
      const cdpSuccess = await this.tryLaunchCDP(pw)
      if (cdpSuccess) return true
      if (requestedMode === 'cdp') {
        console.warn('[Browser] CDP mode requested but failed — no fallback')
        return false
      }
    }

    // Try persistent profile (if requested or auto-detect)
    if (!requestedMode || requestedMode === 'persistent') {
      const persistentSuccess = await this.tryLaunchPersistent(pw)
      if (persistentSuccess) return true
      if (requestedMode === 'persistent') {
        console.warn('[Browser] Persistent mode requested but failed — no fallback')
        return false
      }
    }

    // Fall back to fresh Chromium
    return this.tryLaunchFresh(pw)
  }

  /**
   * CDP mode: Connect to user's running Chrome instance.
   * User must start Chrome with: --remote-debugging-port=9222
   * Provides access to all logged-in sessions (YouTube, Spotify, etc.)
   */
  private async tryLaunchCDP(pw: typeof import('playwright')): Promise<boolean> {
    const endpoint = this.config.cdpEndpoint ?? 'http://localhost:9222'
    try {
      this.browser = await pw.chromium.connectOverCDP(endpoint)
      const contexts = this.browser.contexts()
      if (contexts.length > 0) {
        this.page = await contexts[0].newPage()
      } else {
        this.page = await this.browser.newPage()
      }
      this.available = true
      this.mode = 'cdp'
      console.log(`[Browser] Connected to Chrome via CDP (${endpoint}) — real login sessions available`)
      return true
    } catch {
      console.log('[Browser] CDP connection failed — Chrome not running with --remote-debugging-port=9222')
      return false
    }
  }

  /**
   * Persistent profile mode: Launch Chromium with a dedicated user data directory.
   * Cookies and login sessions are preserved between restarts.
   * User logs in once through the browser, stays logged in forever.
   */
  private async tryLaunchPersistent(pw: typeof import('playwright')): Promise<boolean> {
    const profileDir = this.config.profileDir
      ?? join(process.env.HOME ?? '/tmp', '.opencrush', 'chrome-profile')

    try {
      mkdirSync(profileDir, { recursive: true })

      this.context = await pw.chromium.launchPersistentContext(profileDir, {
        headless: this.config.headless ?? false,
        args: [
          '--disable-blink-features=AutomationControlled',
        ],
        viewport: { width: 1280, height: 800 },
        ignoreDefaultArgs: ['--enable-automation'],
      })
      this.page = this.context.pages()[0] ?? await this.context.newPage()
      this.available = true
      this.mode = 'persistent'
      console.log(`[Browser] Launched with persistent profile at ${profileDir} — logins will be saved`)
      return true
    } catch (err) {
      console.error('[Browser] Persistent profile launch failed:', err)
      return false
    }
  }

  /**
   * Chrome mode: Launch the user's real Google Chrome (not Chromium) with a
   * dedicated profile directory. This avoids Google's "unsafe browser" block
   * because it uses the real Chrome binary. Logins are saved in the profile.
   */
  private async tryLaunchChrome(pw: typeof import('playwright')): Promise<boolean> {
    const profileDir = this.config.profileDir
      ?? join(process.env.HOME ?? '/tmp', '.opencrush', 'chrome-profile')

    try {
      mkdirSync(profileDir, { recursive: true })

      this.context = await pw.chromium.launchPersistentContext(profileDir, {
        channel: 'chrome',
        headless: this.config.headless ?? false,
        args: [
          '--disable-blink-features=AutomationControlled',
        ],
        viewport: { width: 1280, height: 800 },
        ignoreDefaultArgs: ['--enable-automation'],
      })
      this.page = this.context.pages()[0] ?? await this.context.newPage()
      this.available = true
      this.mode = 'chrome'
      console.log(`[Browser] Launched real Google Chrome with profile at ${profileDir}`)
      return true
    } catch (err) {
      console.error('[Browser] Chrome launch failed:', err)
      return false
    }
  }

  /**
   * Fresh Chromium: original behavior, isolated instance with no cookies.
   */
  private async tryLaunchFresh(pw: typeof import('playwright')): Promise<boolean> {
    try {
      this.browser = await pw.chromium.launch({
        headless: this.config.headless ?? false,
        args: ['--disable-blink-features=AutomationControlled'],
      })
      this.page = await this.browser.newPage()
      this.available = true
      this.mode = 'fresh'
      console.log('[Browser] Launched fresh Chromium (no saved logins)')
      return true
    } catch (err) {
      console.error('[Browser] Failed to launch browser:', err)
      this.available = false
      return false
    }
  }

  isAvailable(): boolean {
    return this.available && !!this.page
  }

  getMode(): BrowserMode {
    return this.mode
  }

  /**
   * Take a screenshot of the current page.
   * Returns a PNG buffer, or null if unavailable.
   */
  async takeScreenshot(): Promise<Buffer | null> {
    if (!this.page) return null

    try {
      const buffer = await this.page.screenshot({ type: 'png' })
      console.log('[Browser] Screenshot taken')
      return Buffer.from(buffer)
    } catch (err) {
      console.error('[Browser] Screenshot error:', err)
      return null
    }
  }

  /**
   * Open YouTube and search for / watch a video.
   */
  async watchYouTube(query: string): Promise<{ title: string; url: string } | null> {
    if (!this.page) return null

    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

      // Wait for video results to load, then click first one
      await this.page.waitForSelector('ytd-video-renderer', { timeout: 10000 })
      const firstVideo = this.page.locator('ytd-video-renderer a#thumbnail').first()
      await firstVideo.click()

      // Wait for video page to load
      await this.page.waitForLoadState('domcontentloaded')
      const title = await this.page.title()
      const url = this.page.url()

      console.log(`[Browser] Watching YouTube: ${title}`)
      return { title: title.replace(' - YouTube', ''), url }
    } catch (err) {
      console.error('[Browser] YouTube error:', err)
      return null
    }
  }

  /**
   * Open Spotify Web Player and search for a track.
   */
  async listenToSpotify(query: string): Promise<{ title: string } | null> {
    if (!this.page) return null

    try {
      const url = `https://open.spotify.com/search/${encodeURIComponent(query)}`
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })

      const title = await this.page.title()
      console.log(`[Browser] Opened Spotify: ${query}`)
      return { title }
    } catch (err) {
      console.error('[Browser] Spotify error:', err)
      return null
    }
  }

  /**
   * Browse a generic URL.
   */
  async browseWeb(url: string): Promise<{ title: string } | null> {
    if (!this.page) return null

    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
      const title = await this.page.title()
      console.log(`[Browser] Browsing: ${title}`)
      return { title }
    } catch (err) {
      console.error('[Browser] Browse error:', err)
      return null
    }
  }

  /**
   * Browse a random website from a curated list of activities.
   */
  async browseRandom(): Promise<{ title: string; site: string } | null> {
    const sites = [
      { url: 'https://www.pinterest.com', site: 'Pinterest' },
      { url: 'https://twitter.com/explore', site: 'Twitter' },
      { url: 'https://www.reddit.com/r/popular', site: 'Reddit' },
      { url: 'https://www.instagram.com/explore', site: 'Instagram' },
      { url: 'https://www.tiktok.com', site: 'TikTok' },
      { url: 'https://news.ycombinator.com', site: 'Hacker News' },
      { url: 'https://www.bilibili.com', site: 'Bilibili' },
    ]

    const pick = sites[Math.floor(Math.random() * sites.length)]
    const result = await this.browseWeb(pick.url)
    if (result) {
      return { title: result.title, site: pick.site }
    }
    return null
  }

  /**
   * Get current page title and URL (for context-aware social posting).
   */
  async getCurrentPageInfo(): Promise<{ title: string; url: string } | null> {
    if (!this.page) return null
    try {
      const title = await this.page.title()
      const url = this.page.url()
      if (!title || url === 'about:blank') return null
      return { title, url }
    } catch {
      return null /* page may have navigated away */
    }
  }

  /**
   * Close the browser. Call on shutdown.
   * For CDP mode, only closes the page (not the user's Chrome).
   */
  async close(): Promise<void> {
    try {
      if (this.mode === 'cdp') {
        // Don't close user's Chrome — just close our page
        await this.page?.close()
      } else if (this.context) {
        await this.context.close()
      } else {
        await this.browser?.close()
      }
      this.browser = undefined
      this.context = undefined
      this.page = undefined
      this.available = false
      console.log('[Browser] Closed')
    } catch {
      /* Ignore close errors — browser may already be closed */
    }
  }
}
