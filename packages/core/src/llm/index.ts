/**
 * LLM Router
 *
 * Supports: Anthropic Claude (primary) → OpenAI (fallback) → Ollama (local)
 * Automatically selects based on available API keys in environment.
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

export type LLMProvider = 'anthropic' | 'openai' | 'ollama'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMConfig {
  provider: LLMProvider
  anthropicApiKey?: string
  openaiApiKey?: string
  ollamaBaseUrl?: string
  ollamaModel?: string
  maxTokens?: number
  temperature?: number
}

export class LLMRouter {
  private config: LLMConfig
  private anthropic?: Anthropic
  private openai?: OpenAI

  constructor(config: LLMConfig) {
    this.config = config
    if (config.anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey })
    }
    if (config.openaiApiKey || config.provider === 'ollama') {
      this.openai = new OpenAI({
        apiKey: config.openaiApiKey ?? 'ollama',
        baseURL: config.provider === 'ollama' ? (config.ollamaBaseUrl ?? 'http://localhost:11434/v1') : undefined,
      })
    }
  }

  async chat(
    systemPrompt: string,
    messages: ChatMessage[],
    options: { stream?: boolean } = {}
  ): Promise<string> {
    const provider = this.resolveProvider()

    switch (provider) {
      case 'anthropic':
        return this.chatAnthropic(systemPrompt, messages)
      case 'openai':
      case 'ollama':
        return this.chatOpenAI(systemPrompt, messages)
    }
  }

  private resolveProvider(): LLMProvider {
    if (this.config.provider === 'anthropic' && this.anthropic) return 'anthropic'
    if (this.config.provider === 'ollama') return 'ollama'
    if (this.openai) return 'openai'
    if (this.anthropic) return 'anthropic'
    throw new Error(
      'No LLM provider configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to your .env file.'
    )
  }

  private async chatAnthropic(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    if (!this.anthropic) throw new Error('Anthropic not configured')

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: this.config.maxTokens ?? 1024,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    })

    const block = response.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response type from Anthropic')
    return block.text
  }

  private async chatOpenAI(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    if (!this.openai) throw new Error('OpenAI not configured')

    const model = this.config.provider === 'ollama'
      ? (this.config.ollamaModel ?? 'qwen2.5:72b')
      : 'gpt-4o-mini'

    const response = await this.openai.chat.completions.create({
      model,
      max_tokens: this.config.maxTokens ?? 1024,
      temperature: this.config.temperature ?? 0.85,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    })

    return response.choices[0]?.message?.content ?? ''
  }

  /**
   * Generate text embeddings for semantic memory.
   */
  async embed(text: string): Promise<number[]> {
    // Use OpenAI's embedding model (works with any OpenAI-compatible endpoint)
    if (this.openai && this.config.provider !== 'ollama') {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      })
      return response.data[0].embedding
    }

    // Ollama embedding
    if (this.config.provider === 'ollama') {
      const response = await fetch(`${this.config.ollamaBaseUrl ?? 'http://localhost:11434'}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text', input: text }),
      })
      const data = await response.json() as { embeddings: number[][] }
      return data.embeddings[0]
    }

    // Fallback: simple hash-based pseudo-embedding (not great, but works offline)
    return simplePseudoEmbed(text)
  }

  /**
   * Generate a short creative text using a different prompt style.
   * Used for proactive messages, mood generation, etc.
   */
  async generate(prompt: string, systemContext?: string): Promise<string> {
    const sys = systemContext ?? 'You are a creative writing assistant. Be concise.'
    return this.chat(sys, [{ role: 'user', content: prompt }])
  }
}

/**
 * Offline fallback: deterministic pseudo-embedding via character code hashing.
 * Produces a 384-dim vector. Not semantically meaningful, but allows the system
 * to run without any API key at all.
 */
function simplePseudoEmbed(text: string): number[] {
  const dim = 384
  const vec = new Array(dim).fill(0)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    vec[i % dim] = (vec[i % dim] + Math.sin(code * (i + 1))) / 2
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return vec.map(v => v / norm)
}
