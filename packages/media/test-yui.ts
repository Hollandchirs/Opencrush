import { VoiceEngine } from './src/voice'
import { writeFileSync } from 'fs'

const FAL_KEY = 'd543d060-0cfd-411e-b422-656144d84545:1678aa662ead3cc6e1f48164825351a0'
const ELEVENLABS_API_KEY = 'sk_0a58665e0dc5306a8ecd41ed5832956940e9c1b1e9795cb1'
const YUI_VOICE_ID = 'kbrsaic1zriFXx1pgRYN'

async function testAll() {
  // ── Test 1: FAL Kokoro (English) ──
  console.log('=== FAL Kokoro TTS ===\n')
  const falEngine = new VoiceEngine({
    provider: 'fal',
    falKey: FAL_KEY,
  })

  console.log('[1] FAL Kokoro English...')
  let start = Date.now()
  const r1 = await falEngine.textToSpeech(
    "Hey! I just got caught in the rain without an umbrella. I'm soaking wet right now, haha."
  )
  console.log(r1 ? `✅ ${r1.length} bytes, ${Date.now() - start}ms` : '❌ Failed')
  if (r1) writeFileSync('/tmp/voice-fal-english.mp3', r1)

  // ── Test 2: FAL Kokoro (Chinese) ──
  console.log('[2] FAL Kokoro Chinese...')
  start = Date.now()
  const r2 = await falEngine.textToSpeech(
    "哎呀，今天下雨了都没带伞，整个人都淋湿了，好惨哦"
  )
  console.log(r2 ? `✅ ${r2.length} bytes, ${Date.now() - start}ms` : '❌ Failed')
  if (r2) writeFileSync('/tmp/voice-fal-chinese.mp3', r2)

  // ── Test 3: ElevenLabs + Yui voice ──
  console.log('\n=== ElevenLabs + Yui ===\n')
  const elEngine = new VoiceEngine({
    provider: 'elevenlabs',
    elevenLabsApiKey: ELEVENLABS_API_KEY,
    elevenLabsVoiceId: YUI_VOICE_ID,
  })

  console.log('[3] ElevenLabs Yui English...')
  start = Date.now()
  const r3 = await elEngine.textToSpeech(
    "Hey! I just got caught in the rain without an umbrella. I'm soaking wet right now, haha."
  )
  console.log(r3 ? `✅ ${r3.length} bytes, ${Date.now() - start}ms` : '❌ Failed')
  if (r3) writeFileSync('/tmp/voice-yui-english.mp3', r3)

  // ── Test 4: Auto-detect (should pick elevenlabs since key is set) ──
  console.log('\n=== Auto-detect Provider ===\n')
  const autoEngine = new VoiceEngine({
    elevenLabsApiKey: ELEVENLABS_API_KEY,
    elevenLabsVoiceId: YUI_VOICE_ID,
    falKey: FAL_KEY,
  })
  console.log('[4] Auto-detect...')
  start = Date.now()
  const r4 = await autoEngine.textToSpeech("Hello, testing auto detection!")
  console.log(r4 ? `✅ ${r4.length} bytes, ${Date.now() - start}ms` : '❌ Failed (expected if ElevenLabs blocked)')

  console.log('\nDone! Check /tmp/voice-*.mp3')
}

testAll().catch(console.error)
