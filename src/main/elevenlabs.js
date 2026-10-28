'use strict';

const config = require('./config');

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel (expressive, natural female voice)
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2'; // High quality multilingual v2

class ElevenLabsService {
  constructor() {
    this.cache = new Map(); // simple cache for common short phrases
  }

  getKey() {
    const cfg = config.load();
    return (cfg.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY || '').trim();
  }

  getConfig() {
    const cfg = config.load();
    return {
      enabled: Boolean(cfg.elevenlabsEnabled && this.getKey()),
      apiKey: this.getKey(),
      modelId: (cfg.elevenlabsModel || DEFAULT_MODEL_ID).trim(),
      voiceId: (cfg.elevenlabsVoiceId || DEFAULT_VOICE_ID).trim(),
    };
  }

  async verify(apiKey) {
    const key = (apiKey || this.getKey()).trim();
    if (!key) return { ok: false, error: 'Chave de API não informada.' };

    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': key },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err?.detail?.message || `Erro ${res.status}: Chave inválida.` };
      }
      const data = await res.json();
      return {
        ok: true,
        tier: data?.subscription?.tier || 'free',
        characterCount: data?.subscription?.character_count || 0,
        characterLimit: data?.subscription?.character_limit || 0,
      };
    } catch (err) {
      return { ok: false, error: `Falha na conexão com ElevenLabs: ${err.message}` };
    }
  }

  async getVoices(apiKey) {
    const key = (apiKey || this.getKey()).trim();
    if (!key) return { ok: false, error: 'Chave de API não configurada.' };

    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': key },
      });
      if (!res.ok) {
        return { ok: false, error: `Erro ${res.status} ao obter vozes.` };
      }
      const data = await res.json();
      const voices = (data.voices || []).map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
        description: v.labels?.description || v.labels?.accent || '',
        previewUrl: v.preview_url,
      }));
      return { ok: true, voices };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async synthesize(text, options = {}) {
    const key = (options.apiKey || this.getKey()).trim();
    if (!key) return { ok: false, error: 'no_key' };

    const cleanText = String(text || '').trim();
    if (!cleanText || cleanText.length <= 1) {
      return { ok: false, error: 'empty_text' };
    }

    const cfg = this.getConfig();
    const voiceId = (options.voiceId || cfg.voiceId || DEFAULT_VOICE_ID).trim();
    const modelId = (options.modelId || cfg.modelId || DEFAULT_MODEL_ID).trim();

    const cacheKey = `${voiceId}:${modelId}:${cleanText}`;
    if (this.cache.has(cacheKey)) {
      return { ok: true, audioBase64: this.cache.get(cacheKey), cached: true };
    }

    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: modelId,
          voice_settings: {
            stability: options.stability ?? 0.45,
            similarity_boost: options.similarity_boost ?? 0.8,
            style: options.style ?? 0.35,
            use_speaker_boost: true,
          },
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson?.detail?.message || `ElevenLabs HTTP ${res.status}`;
        console.warn('[capri] ElevenLabs TTS error:', errMsg);
        return { ok: false, error: errMsg };
      }

      const buffer = await res.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      // Keep cache small (max 50 short utterances)
      if (cleanText.length < 100) {
        if (this.cache.size > 50) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }
        this.cache.set(cacheKey, base64);
      }

      return { ok: true, audioBase64: base64, mimeType: 'audio/mpeg' };
    } catch (err) {
      console.warn('[capri] ElevenLabs synthesis failed:', err.message);
      return { ok: false, error: err.message };
    }
  }
}

const elevenLabs = new ElevenLabsService();

module.exports = {
  elevenLabs,
  DEFAULT_VOICE_ID,
  DEFAULT_MODEL_ID,
};
