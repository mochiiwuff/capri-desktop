'use strict';

// Her voice from a text-to-speech service: one running on your PC that speaks OpenAI's speech API
// (Kokoro-FastAPI, openedai-speech…), OpenAI's own, or ElevenLabs'. Windows' own voices need none
// of this: the overlay speaks those itself (speech.js there). Returns the audio (mp3) for the
// overlay to play; the keys never leave this process.

const SERVICES = {
  local: { url: 'http://127.0.0.1:8880/v1', voice: 'af_bella', model: 'kokoro' },
  openai: { url: 'https://api.openai.com/v1', voice: 'shimmer', model: 'gpt-4o-mini-tts' },
  elevenlabs: { url: 'https://api.elevenlabs.io/v1', voice: '', model: 'eleven_flash_v2_5' },
};

// How she sounds, for the services that take a direction (OpenAI's gpt-4o-mini-tts)
const STYLE = 'A young woman, cool and a little teasing, with a dry sense of humor. Low-to-mid pitch, '
  + 'slightly husky, relaxed pace, clear words. Confident, never bubbly, never robotic.';

// Her lines come back often ("Mission terminée", her greetings): the last ones asked for are kept.
const CACHE_MAX = 40;
const cache = new Map();

const TIMEOUT_MS = 20000;

// `text` spoken by `service` ({ provider, voice, url } from her config, `key` for it): the audio as
// a Buffer, or throws with what went wrong, in a few words.
async function synthesize(text, { provider, voice, url }, key = '') {
  const s = SERVICES[provider];
  if (!s) throw new Error('no voice service');
  const input = String(text).trim().slice(0, 600);
  if (!input) throw new Error('nothing to say');
  const name = voice || s.voice;
  const id = `${provider}|${url || ''}|${name}|${input}`;
  if (cache.has(id)) {
    const hit = cache.get(id);
    cache.delete(id); // most recent last
    cache.set(id, hit);
    return hit;
  }
  if (provider !== 'local' && !key) throw new Error('no key');

  let res;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  if (provider === 'elevenlabs') {
    if (!name) throw new Error('no voice id');
    res = await fetch(`${s.url}/text-to-speech/${encodeURIComponent(name)}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: input, model_id: s.model }),
      signal,
    });
  } else {
    const base = (provider === 'local' ? (url || s.url) : s.url).replace(/\/+$/, '');
    const body = { model: s.model, voice: name, input, response_format: 'mp3' };
    if (provider === 'openai') body.instructions = STYLE;
    res = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key && { authorization: `Bearer ${key}` }) },
      body: JSON.stringify(body),
      signal,
    });
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(`${res.status}${detail ? ` ${detail}` : ''}`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  cache.set(id, audio);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return audio;
}

module.exports = { synthesize, SERVICES };
