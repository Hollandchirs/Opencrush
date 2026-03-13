/**
 * Dynamic Emotion Model
 *
 * Tracks the character's emotional state across conversations.
 * Instead of a single mood string, models emotions as a multidimensional
 * state that evolves based on conversation content.
 *
 * Inspired by:
 *   - Plutchik's wheel of emotions (8 primary emotions)
 *   - SillyTavern's emotion framework
 *   - Zep's emotional weight in memory scoring
 *
 * The emotion state decays toward a "baseline" personality over time,
 * so the character doesn't stay angry forever after one bad conversation.
 */

export interface EmotionState {
  /** Primary emotions — each 0.0 to 1.0 */
  joy: number
  sadness: number
  anger: number
  fear: number
  surprise: number
  trust: number
  anticipation: number
  love: number

  /** Overall energy level (low = subdued, high = animated) */
  energy: number

  /** Last update timestamp */
  updatedAt: number
}

export interface EmotionConfig {
  /** Baseline personality — what the character reverts to (0.0-1.0 each) */
  baseline: Partial<EmotionState>
  /** How quickly emotions decay to baseline (0.0 = instant, 1.0 = never) */
  persistence: number
}

const DEFAULT_BASELINE: EmotionState = {
  joy: 0.6,
  sadness: 0.1,
  anger: 0.05,
  fear: 0.05,
  surprise: 0.2,
  trust: 0.5,
  anticipation: 0.3,
  love: 0.4,
  energy: 0.6,
  updatedAt: Date.now(),
}

const EMOTION_KEYS = ['joy', 'sadness', 'anger', 'fear', 'surprise', 'trust', 'anticipation', 'love', 'energy'] as const

export class EmotionEngine {
  private state: EmotionState
  private baseline: EmotionState
  private persistence: number

  constructor(config?: Partial<EmotionConfig>) {
    this.baseline = { ...DEFAULT_BASELINE, ...config?.baseline }
    this.persistence = config?.persistence ?? 0.85
    this.state = { ...this.baseline }
  }

  /** Get the current emotional state, with time-based decay applied */
  getState(): EmotionState {
    this.applyDecay()
    return { ...this.state }
  }

  /** Generate a natural-language mood description for the system prompt */
  getMoodDescription(): string {
    this.applyDecay()

    const dominant = this.getDominantEmotions()
    if (dominant.length === 0) return 'feeling neutral and calm'

    const descriptors: string[] = []

    for (const [emotion, intensity] of dominant) {
      const desc = emotionDescriptor(emotion, intensity)
      if (desc) descriptors.push(desc)
    }

    const energyDesc = this.state.energy > 0.7 ? 'energetic and animated'
      : this.state.energy < 0.3 ? 'quiet and subdued'
      : ''

    const parts = [...descriptors]
    if (energyDesc) parts.push(energyDesc)

    return parts.join(', ') || 'feeling neutral'
  }

  /**
   * Update emotional state based on conversation content.
   * Call after each exchange to evolve the character's mood.
   */
  updateFromConversation(userMessage: string, assistantResponse: string): void {
    const combined = `${userMessage} ${assistantResponse}`.toLowerCase()
    const deltas = analyzeEmotionalContent(combined)

    for (const key of EMOTION_KEYS) {
      if (deltas[key] !== undefined) {
        // Blend: 70% current state + 30% new signal
        this.state[key] = clamp(this.state[key] * 0.7 + deltas[key]! * 0.3)
      }
    }

    this.state.updatedAt = Date.now()
  }

  /** Apply time-based decay toward baseline */
  private applyDecay(): void {
    const now = Date.now()
    const hoursSinceUpdate = (now - this.state.updatedAt) / (1000 * 60 * 60)

    if (hoursSinceUpdate < 0.1) return // skip if very recent

    // Exponential decay toward baseline
    const decayRate = Math.pow(this.persistence, hoursSinceUpdate)

    for (const key of EMOTION_KEYS) {
      this.state[key] = this.baseline[key] + (this.state[key] - this.baseline[key]) * decayRate
    }

    this.state.updatedAt = now
  }

  /** Get emotions significantly above baseline, sorted by deviation */
  private getDominantEmotions(): Array<[string, number]> {
    const threshold = 0.15 // must be at least 0.15 above baseline

    return EMOTION_KEYS
      .filter(key => key !== 'energy')
      .map(key => [key, this.state[key]] as [string, number])
      .filter(([key, val]) => Math.abs(val - this.baseline[key as keyof EmotionState] as number) > threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3) // top 3 emotions
  }
}

// ── Emotion analysis ──────────────────────────────────────────────────────

function analyzeEmotionalContent(text: string): Partial<Record<typeof EMOTION_KEYS[number], number>> {
  const deltas: Partial<Record<typeof EMOTION_KEYS[number], number>> = {}

  // Joy signals
  if (/haha|lol|😂|笑死|太好了|开心|happy|excited|awesome|amazing|great|yay|love it/i.test(text)) {
    deltas.joy = 0.8
    deltas.energy = 0.7
  }

  // Sadness signals
  if (/sad|cry|crying|miss|lonely|alone|hurt|难过|伤心|想你|孤独|哭|舍不得/i.test(text)) {
    deltas.sadness = 0.7
    deltas.energy = 0.3
  }

  // Anger signals
  if (/angry|mad|furious|annoyed|frustrated|hate|stupid|生气|烦|讨厌|气死|混蛋/i.test(text)) {
    deltas.anger = 0.7
    deltas.energy = 0.8
  }

  // Fear/worry signals
  if (/scared|afraid|worry|nervous|anxious|害怕|担心|紧张|焦虑|恐怖/i.test(text)) {
    deltas.fear = 0.6
    deltas.energy = 0.5
  }

  // Love/affection signals
  if (/love you|miss you|care about|adore|babe|darling|honey|爱你|喜欢你|想你|宝贝|亲爱的/i.test(text)) {
    deltas.love = 0.9
    deltas.joy = 0.6
    deltas.trust = 0.7
  }

  // Surprise signals
  if (/wow|omg|no way|what!|really\?|seriously|天哪|真的假的|不会吧|卧槽|啊\?/i.test(text)) {
    deltas.surprise = 0.7
    deltas.energy = 0.7
  }

  // Trust/comfort signals
  if (/thank|trust|believe|safe|comfortable|谢谢|相信|放心|安全|舒服/i.test(text)) {
    deltas.trust = 0.7
  }

  // Anticipation/excitement
  if (/can't wait|excited|looking forward|tomorrow|plan|等不及|期待|明天|计划/i.test(text)) {
    deltas.anticipation = 0.7
    deltas.energy = 0.7
  }

  return deltas
}

function emotionDescriptor(emotion: string, intensity: number): string | null {
  if (intensity < 0.3) return null

  const descriptors: Record<string, [string, string, string]> = {
    joy:          ['content', 'happy', 'overjoyed'],
    sadness:      ['a bit down', 'sad', 'deeply upset'],
    anger:        ['slightly annoyed', 'frustrated', 'really angry'],
    fear:         ['a bit uneasy', 'worried', 'scared'],
    surprise:     ['curious', 'surprised', 'completely shocked'],
    trust:        ['comfortable', 'trusting', 'deeply connected'],
    anticipation: ['interested', 'excited', 'can barely wait'],
    love:         ['warm', 'affectionate', 'deeply in love'],
  }

  const levels = descriptors[emotion]
  if (!levels) return null

  const idx = intensity < 0.5 ? 0 : intensity < 0.8 ? 1 : 2
  return `feeling ${levels[idx]}`
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
