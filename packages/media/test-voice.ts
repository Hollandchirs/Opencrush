import { VoiceEngine } from './src/voice'
import { writeFileSync } from 'fs'

const ELEVENLABS_API_KEY = 'sk_0a58665e0dc5306a8ecd41ed5832956940e9c1b1e9795cb1'

async function testVoice() {
  console.log('=== ElevenLabs TTS Test ===\n')

  const engine = new VoiceEngine({
    provider: 'elevenlabs',
    elevenLabsApiKey: ELEVENLABS_API_KEY,
  })

  // Test 1: English
  console.log('[Test 1] English TTS (Rachel default voice)...')
  let start = Date.now()
  const r1 = await engine.textToSpeech(
    "Hey! I just got caught in the rain without an umbrella. I'm soaking wet right now, haha. How's your day going?"
  )
  console.log(r1 ? `✅ ${r1.length} bytes, ${Date.now() - start}ms` : `❌ Failed`)
  if (r1) writeFileSync('/tmp/voice-test1-english.mp3', r1)

  // Test 2: Sanitization (markdown, tags, URLs stripped)
  console.log('\n[Test 2] Sanitization (markdown/tags/URLs)...')
  start = Date.now()
  const r2 = await engine.textToSpeech(
    "**Oh my god** look at this [SELFIE: wet hair selfie] I'm literally *dripping* haha 😂 https://example.com"
  )
  console.log(r2 ? `✅ ${r2.length} bytes, ${Date.now() - start}ms` : `❌ Failed`)
  if (r2) writeFileSync('/tmp/voice-test2-sanitized.mp3', r2)

  // Test 3: Chinese (multilingual_v2)
  console.log('\n[Test 3] Chinese TTS...')
  start = Date.now()
  const r3 = await engine.textToSpeech(
    "哎呀，今天下雨了都没带伞，整个人都淋湿了，好惨哦"
  )
  console.log(r3 ? `✅ ${r3.length} bytes, ${Date.now() - start}ms` : `❌ Failed`)
  if (r3) writeFileSync('/tmp/voice-test3-chinese.mp3', r3)

  // Test 4: Long emotional text
  console.log('\n[Test 4] Long emotional text...')
  start = Date.now()
  const r4 = await engine.textToSpeech(
    "I miss you so much, you know? Like, every time it rains I think about that time we got stuck at the cafe together. Remember? We were laughing so hard about literally nothing. I wish we could go back to that moment."
  )
  console.log(r4 ? `✅ ${r4.length} bytes, ${Date.now() - start}ms` : `❌ Failed`)
  if (r4) writeFileSync('/tmp/voice-test4-emotional.mp3', r4)

  // List voices
  console.log('\n[Voices] Available voices:')
  const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
  })
  if (resp.ok) {
    const data = await resp.json() as { voices: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> }
    for (const v of data.voices.slice(0, 20)) {
      const labels = v.labels ? Object.values(v.labels).join(', ') : ''
      console.log(`  ${v.name} (${v.voice_id}) — ${labels}`)
    }
  }

  console.log('\n=== Files saved to /tmp/voice-test*.mp3 ===')
}

testVoice().catch(console.error)
