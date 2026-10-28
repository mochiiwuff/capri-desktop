import { LocalMicrophoneCapture } from './microphone.js';

const VOICE_CULTURE = { en: 'en-US', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR', ru: 'ru-RU' };

export class VoiceChat {
  constructor({ host, onText, onState, microphone }) {
    this.host = host;
    this.onText = onText;
    this.onState = onState;
    this.enabled = false;
    this.waitingForReply = false;
    this.lang = 'en';
    this.microphone = microphone || new LocalMicrophoneCapture({
      onAudio: (samples) => this.onAudio(samples),
      onError: (error) => this.onMicrophoneError(error),
    });
    this.unsubscribe = host.onVoiceEvent((event) => this.onVoiceEvent(event));
  }

  start(lang = this.lang) {
    this.lang = lang;
    this.enabled = true;
    this.waitingForReply = false;
    this.microphone.start();
    this.host.startVoice(VOICE_CULTURE[this.lang] || 'en-US')
      .then((result) => {
        if (!this.enabled || result.ok) return;
        this.enabled = false;
        this.microphone.stop({ closeContext: true });
        this.onState?.(result.error || 'voiceStartFailed');
      })
      .catch(() => {
        if (!this.enabled) return;
        this.enabled = false;
        this.microphone.stop({ closeContext: true });
        this.onState?.('voiceStartFailed');
      });
    return { ok: true };
  }

  onVoiceEvent(event) {
    if (!this.enabled) return;
    if (event.type === 'loading') {
      this.onState?.('voiceModelLoading');
    } else if (event.type === 'listening') {
      this.microphone.setReady(true);
      this.onState?.('listening');
    } else if (event.type === 'transcript' && event.text?.trim()) {
      this.waitingForReply = true;
      this.microphone.stop();
      this.host.pauseVoice();
      this.onState?.('thinking');
      this.onText?.(event.text.trim());
    } else if (event.type === 'silence') {
      this.waitingForReply = false;
      this.start(this.lang);
    } else if (event.type === 'error') {
      this.enabled = false;
      this.waitingForReply = false;
      this.microphone.stop({ closeContext: true });
      this.host.stopVoice();
      this.onState?.(event.error || 'voiceStartFailed');
    }
  }

  onAudio(samples) {
    if (!this.enabled) return;
    this.waitingForReply = true;
    this.onState?.('thinking');
    this.host.transcribeVoice(samples);
  }

  onMicrophoneError(error) {
    if (!this.enabled) return;
    this.enabled = false;
    this.waitingForReply = false;
    this.host.stopVoice();
    this.onState?.(error || 'voiceMicrophoneUnavailable');
  }

  pauseForReply() {
    if (!this.enabled) return;
    this.waitingForReply = true;
    this.microphone.stop();
    this.host.pauseVoice();
    this.onState?.('thinking');
  }

  resume() {
    if (!this.enabled || !this.waitingForReply) return;
    this.waitingForReply = false;
    this.start(this.lang);
  }

  speak(text) {
    if (!this.enabled) return false;
    const cleanText = String(text || '').trim();
    // Do not speak empty strings, ellipsis, or single-character glitch utterances
    if (!cleanText || cleanText.length <= 2 || /^[\s.,!?:;…\-_~â€|]+$/.test(cleanText)) {
      this.resume();
      return false;
    }

    if (this.currentAudio) {
      try { this.currentAudio.pause(); } catch (_) {}
      this.currentAudio = null;
    }

    // If ElevenLabs is available and enabled in host, synthesize high-quality voice
    if (typeof this.host?.elevenlabsSynthesize === 'function') {
      let fallbackStarted = false;
      const fallback = () => {
        if (fallbackStarted) return;
        fallbackStarted = true;
        this.currentAudio = null;
        this.fallbackSpeech(cleanText);
      };
      this.host.elevenlabsConfig?.().then((cfg) => {
        if (cfg?.enabled) {
          this.host.elevenlabsSynthesize(cleanText).then((res) => {
            if (res?.ok && res.audioBase64) {
              try {
                const audio = new Audio(`data:${res.mimeType || 'audio/mpeg'};base64,${res.audioBase64}`);
                this.currentAudio = audio;
                audio.onended = () => {
                  this.currentAudio = null;
                  this.resume();
                };
                audio.onerror = fallback;
                audio.play().catch(fallback);
                return;
              } catch (_) {
                fallback();
                return;
              }
            }
            fallback();
          }).catch(fallback);
          return;
        }
        fallback();
      }).catch(fallback);
      return true;
    }

    return this.fallbackSpeech(cleanText);
  }

  fallbackSpeech(cleanText) {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      this.resume();
      return false;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(cleanText);
      utterance.lang = VOICE_CULTURE[this.lang] || 'en-US';
      utterance.onend = () => this.resume();
      utterance.onerror = () => this.resume();
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      this.resume();
      return false;
    }
  }

  stop() {
    this.enabled = false;
    this.waitingForReply = false;
    this.microphone.stop({ closeContext: true });
    this.host.stopVoice();
    if (this.currentAudio) {
      try { this.currentAudio.pause(); } catch (_) {}
      this.currentAudio = null;
    }
    window.speechSynthesis?.cancel();
    this.onState?.('off');
  }
}
