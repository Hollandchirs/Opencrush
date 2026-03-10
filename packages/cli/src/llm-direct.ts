/**
 * Direct LLM caller for CLI use (setup wizard, character creation, test chat).
 *
 * All Chinese providers (DeepSeek, Qwen, Kimi, Zhipu, MiniMax) use the
 * OpenAI-compatible chat completions API — only the baseURL and model differ.
 *
 * Anthropic uses its own SDK.
 * Ollama uses OpenAI-compat with a local baseURL.
 */

export type CliProvider =
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'qwen'
  | 'kimi'
  | 'zhipu'
  | 'minimax'
  | 'ollama'

interface ProviderMeta {
  baseURL: string
  defaultModel: string
}

export const PROVIDER_META: Record<string, ProviderMeta> = {
  openai:   { baseURL: '',                                                   defaultModel: 'gpt-4o-mini' },
  deepseek: { baseURL: 'https://api.deepseek.com',                          defaultModel: 'deepseek-chat' },
  qwen:     { baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-max' },
  kimi:     { baseURL: 'https://api.moonshot.cn/v1',                        defaultModel: 'moonshot-v1-8k' },
  zhipu:    { baseURL: 'https://open.bigmodel.cn/api/paas/v4',              defaultModel: 'glm-4-flash' },
  minimax:  { baseURL: 'https://api.minimax.chat/v1',                       defaultModel: 'abab6.5s-chat' },
  ollama:   { baseURL: 'http://localhost:11434/v1',                          defaultModel: 'qwen2.5:7b' },
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Call any LLM provider with a system prompt + message history.
 * Returns the assistant's reply text.
 */
export async function callLLMDirect(
  provider: string,
  apiKey: string,
  systemPrompt: string,
  messages: Message[],
  maxTokens = 500,
  model?: string
): Promise<string> {

  // ── Anthropic ────────────────────────────────────────────────────────────
  if (provider === 'anthropic') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model: model ?? 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    })
    const block = resp.content[0]
    return block.type === 'text' ? block.text : ''
  }

  // ── All OpenAI-compatible providers (openai, deepseek, qwen, kimi, zhipu, minimax, ollama) ──
  const meta = PROVIDER_META[provider]
  if (!meta) throw new Error(`Unknown provider: ${provider}`)

  const OpenAI = (await import('openai')).default
  const client = new OpenAI({
    apiKey: apiKey || 'no-key',
    baseURL: meta.baseURL || undefined,
  })

  const resp = await client.chat.completions.create({
    model: model ?? meta.defaultModel,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  })

  return resp.choices[0]?.message?.content ?? ''
}

/**
 * Provider display info — used in setup wizard and error messages.
 */
export interface ProviderInfo {
  id: string
  name: string
  emoji: string
  tagline: string
  taglineCN: string
  keyUrl: string
  keyUrlCN: string
  envKey: string
  keyPrefix?: string
  requiresVPN: boolean   // from mainland China
  isLocal: boolean
}

export const PROVIDER_INFO: ProviderInfo[] = [
  // ── Chinese providers ──
  {
    id: 'deepseek',
    name: 'DeepSeek',
    emoji: '🔥',
    tagline: 'Powerful reasoning, very affordable, no VPN needed',
    taglineCN: '推理极强，价格实惠，国内直连',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyUrlCN: 'https://platform.deepseek.com/api_keys',
    envKey: 'DEEPSEEK_API_KEY',
    requiresVPN: false,
    isLocal: false,
  },
  {
    id: 'qwen',
    name: '通义千问 Qwen',
    emoji: '🌟',
    tagline: 'Alibaba — stable, multilingual, strong Chinese',
    taglineCN: '阿里出品，稳定可靠，中英双强',
    keyUrl: 'https://dashscope.aliyuncs.com',
    keyUrlCN: 'https://dashscope.console.aliyun.com/apiKey',
    envKey: 'DASHSCOPE_API_KEY',
    requiresVPN: false,
    isLocal: false,
  },
  {
    id: 'kimi',
    name: 'Kimi / Moonshot',
    emoji: '🌙',
    tagline: 'Long context, natural conversation, no VPN',
    taglineCN: '超长上下文，对话自然，国内直连',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    keyUrlCN: 'https://platform.moonshot.cn/console/api-keys',
    envKey: 'MOONSHOT_API_KEY',
    requiresVPN: false,
    isLocal: false,
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    emoji: '🔵',
    tagline: 'Tsinghua-backed, bilingual, free tier available',
    taglineCN: '清华系，中英双强，有免费额度',
    keyUrl: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
    keyUrlCN: 'https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys',
    envKey: 'ZHIPU_API_KEY',
    requiresVPN: false,
    isLocal: false,
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    emoji: '💜',
    tagline: 'Roleplay-optimized, character voice support',
    taglineCN: '角色扮演优化，支持角色音色',
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    keyUrlCN: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    envKey: 'MINIMAX_API_KEY',
    requiresVPN: false,
    isLocal: false,
  },
  // ── International ──
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    emoji: '🤖',
    tagline: 'Best-in-class for character roleplay (needs VPN in CN)',
    taglineCN: '角色扮演最强，需要VPN',
    keyUrl: 'https://console.anthropic.com',
    keyUrlCN: 'https://console.anthropic.com',
    envKey: 'ANTHROPIC_API_KEY',
    keyPrefix: 'sk-ant-',
    requiresVPN: true,
    isLocal: false,
  },
  {
    id: 'openai',
    name: 'OpenAI GPT-4',
    emoji: '🟢',
    tagline: 'Reliable, widely supported (needs VPN in CN)',
    taglineCN: '成熟稳定，需要VPN',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyUrlCN: 'https://platform.openai.com/api-keys',
    envKey: 'OPENAI_API_KEY',
    keyPrefix: 'sk-',
    requiresVPN: true,
    isLocal: false,
  },
  // ── Local ──
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    emoji: '🏠',
    tagline: 'Completely free, runs on your computer',
    taglineCN: '完全免费，本地运行，需要高性能电脑',
    keyUrl: 'https://ollama.ai',
    keyUrlCN: 'https://ollama.ai',
    envKey: '',
    requiresVPN: false,
    isLocal: true,
  },
]

export function getProviderInfo(id: string): ProviderInfo | undefined {
  return PROVIDER_INFO.find(p => p.id === id)
}

/** Detect if user is likely in mainland China based on timezone. */
export function detectRegion(): 'cn' | 'overseas' {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const cnZones = ['Asia/Shanghai', 'Asia/Beijing', 'Asia/Chongqing', 'Asia/Harbin', 'PRC']
  return cnZones.includes(tz) ? 'cn' : 'overseas'
}
