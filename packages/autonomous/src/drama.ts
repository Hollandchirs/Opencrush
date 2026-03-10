/**
 * Drama/Content Tracking Module
 *
 * Simulates watching dramas, anime, or movies.
 * Uses TMDB API for real show data (episode descriptions, ratings).
 * When she "finishes" an episode, triggers a proactive message.
 *
 * Tracking state: stored in the character's SQLite memory DB as episodes.
 */

export interface DramaConfig {
  tmdbApiKey?: string
  // Show preferences extracted from SOUL.md
  preferredGenres?: string[]
  preferredLanguages?: string[]
}

export interface ShowProgress {
  showId: number
  showName: string
  currentSeason: number
  currentEpisode: number
  totalEpisodes?: number
  lastWatched: number
}

export interface EpisodeInfo {
  showName: string
  season: number
  episode: number
  episodeTitle?: string
  summary?: string
  airDate?: string
}

export class DramaEngine {
  private config: DramaConfig
  // In-memory watch history (persisted via MemorySystem in scheduler)
  private watchHistory: Map<number, ShowProgress> = new Map()

  constructor(config: DramaConfig) {
    this.config = config
  }

  /**
   * Simulate watching an episode and return info about it.
   * Called by the scheduler during "drama time" slots.
   */
  async watchNextEpisode(): Promise<EpisodeInfo> {
    // Try to continue an in-progress show
    const inProgress = [...this.watchHistory.values()]
      .sort((a, b) => b.lastWatched - a.lastWatched)[0]

    if (inProgress) {
      const nextEpisode = inProgress.currentEpisode + 1
      const info = await this.getEpisodeInfo(
        inProgress.showId,
        inProgress.currentSeason,
        nextEpisode
      )

      if (info) {
        inProgress.currentEpisode = nextEpisode
        inProgress.lastWatched = Date.now()
        return info
      }
    }

    // Start a new show
    return this.startNewShow()
  }

  private async getEpisodeInfo(
    showId: number,
    season: number,
    episode: number
  ): Promise<EpisodeInfo | null> {
    if (!this.config.tmdbApiKey) return null

    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/tv/${showId}/season/${season}/episode/${episode}?api_key=${this.config.tmdbApiKey}`
      )

      if (!response.ok) return null

      const data = await response.json() as {
        name: string
        overview: string
        air_date: string
      }

      const showResp = await fetch(
        `https://api.themoviedb.org/3/tv/${showId}?api_key=${this.config.tmdbApiKey}`
      )
      const showData = await showResp.json() as { name: string }

      return {
        showName: showData.name,
        season,
        episode,
        episodeTitle: data.name,
        summary: data.overview?.slice(0, 200),
        airDate: data.air_date,
      }
    } catch {
      return null
    }
  }

  private async startNewShow(): Promise<EpisodeInfo> {
    // Curated list of popular shows by genre for fallback
    const popularShows: EpisodeInfo[] = [
      { showName: 'Crash Landing on You', season: 1, episode: 1, episodeTitle: 'Episode 1', summary: 'A South Korean heiress accidentally paraglides into North Korea and meets an army officer who tries to help her.' },
      { showName: 'My Demon', season: 1, episode: 1, episodeTitle: 'Episode 1', summary: 'A devil who lost his powers and a ruthless heiress are bound by a mysterious mark.' },
      { showName: 'Queen of Tears', season: 1, episode: 1, episodeTitle: 'Episode 1', summary: 'A powerful department store heiress and her husband face a marriage crisis and unexpected circumstances.' },
      { showName: 'Lovely Runner', season: 1, episode: 1, episodeTitle: 'Episode 1', summary: 'A fan travels back in time to save her idol from death and discovers time is complicated.' },
      { showName: 'Castlevania: Nocturne', season: 1, episode: 1, episodeTitle: 'Episode 1', summary: 'The son of a vampire hunter fights against a powerful villain in 18th-century France.' },
      { showName: 'Arcane', season: 2, episode: 1, episodeTitle: 'The Monster You Made', summary: 'The sisters are on a collision course that threatens to tear two cities apart.' },
      { showName: 'Only Murders in the Building', season: 3, episode: 1, episodeTitle: 'Showstopper', summary: 'An unexpected death during a Broadway musical\'s opening night kicks off a new mystery.' },
    ]

    const show = popularShows[Math.floor(Math.random() * popularShows.length)]

    // Track this show
    this.watchHistory.set(Math.random() * 1000 | 0, {
      showId: Math.random() * 1000 | 0,
      showName: show.showName,
      currentSeason: show.season,
      currentEpisode: show.episode,
      lastWatched: Date.now(),
    })

    return show
  }

  loadProgress(progress: ShowProgress[]): void {
    for (const p of progress) {
      this.watchHistory.set(p.showId, p)
    }
  }

  getProgress(): ShowProgress[] {
    return [...this.watchHistory.values()]
  }
}
