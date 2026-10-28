const SAMPLE_RATE = 16000;
const FRAME_SIZE = 4096;
const PRE_ROLL_SAMPLES = SAMPLE_RATE / 4;
const MIN_UTTERANCE_SAMPLES = SAMPLE_RATE / 3;
const MAX_UTTERANCE_SAMPLES = SAMPLE_RATE * 12;
const SILENCE_MS = 850;
const VOICE_RMS = 0.015;

function resample(input, fromRate, toRate) {
  if (!fromRate || !toRate || fromRate === toRate) return new Float32Array(input);
  const ratio = fromRate / toRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, input.length - 1);
    const weight = srcIndex - low;
    output[i] = input[low] * (1 - weight) + input[high] * weight;
  }
  return output;
}

export class LocalMicrophoneCapture {
  constructor({ onAudio, onError, getUserMedia, AudioContextClass } = {}) {
    this.onAudio = onAudio;
    this.onError = onError;
    this.mediaDevices = typeof navigator === 'undefined' ? null : navigator.mediaDevices;
    this.customGetUserMedia = Boolean(getUserMedia);
    this.getUserMedia = getUserMedia || ((constraints) => this.mediaDevices.getUserMedia(constraints));
    this.AudioContextClass = AudioContextClass || globalThis.AudioContext;
    this.audioContext = null;
    this.stream = null;
    this.source = null;
    this.processor = null;
    this.mute = null;
    this.active = false;
    this.ready = false;
    this.parts = [];
    this.preRoll = [];
    this.sampleCount = 0;
    this.lastVoiceAt = 0;
    this.speaking = false;
  }

  async start() {
    if (this.active) return;
    this.active = true;
    this.ready = false;
    try {
      if (!this.AudioContextClass || (!this.mediaDevices?.getUserMedia && !this.customGetUserMedia)) {
        throw new Error('voiceMicrophoneUnavailable');
      }
      if (!this.audioContext) {
        try {
          this.audioContext = new this.AudioContextClass({ sampleRate: SAMPLE_RATE });
        } catch {
          this.audioContext = new this.AudioContextClass();
        }
      }
      const stream = await this.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!this.active) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.source = this.audioContext.createMediaStreamSource(stream);
      this.processor = this.audioContext.createScriptProcessor(FRAME_SIZE, 1, 1);
      this.mute = this.audioContext.createGain();
      this.mute.gain.value = 0;
      this.processor.onaudioprocess = (event) => this.onAudioFrame(event);
      this.source.connect(this.processor);
      this.processor.connect(this.mute);
      this.mute.connect(this.audioContext.destination);
      await this.audioContext.resume();
    } catch (error) {
      this.stop({ closeContext: true });
      this.onError?.(error.message === 'voiceMicrophoneUnavailable'
        || ['NotAllowedError', 'NotFoundError', 'NotReadableError'].includes(error.name)
        ? 'voiceMicrophoneUnavailable'
        : 'voiceStartFailed');
    }
  }

  setReady(ready) {
    this.ready = Boolean(ready);
    if (!this.ready) this.clearUtterance();
  }

  onAudioFrame(event) {
    if (!this.active || !this.ready) return;
    const input = event.inputBuffer.getChannelData(0);
    const actualRate = event.inputBuffer?.sampleRate || this.audioContext?.sampleRate || SAMPLE_RATE;
    const frame = actualRate === SAMPLE_RATE ? new Float32Array(input) : resample(input, actualRate, SAMPLE_RATE);
    let power = 0;
    for (const sample of frame) power += sample * sample;
    const rms = Math.sqrt(power / frame.length);
    const now = performance.now();

    if (rms >= VOICE_RMS) {
      this.lastVoiceAt = now;
      if (!this.speaking) {
        this.speaking = true;
        this.parts = [...this.preRoll];
        this.sampleCount = this.parts.reduce((count, part) => count + part.length, 0);
      }
    }

    if (this.speaking) {
      const remaining = MAX_UTTERANCE_SAMPLES - this.sampleCount;
      const accepted = frame.length > remaining ? frame.slice(0, remaining) : frame;
      this.parts.push(accepted);
      this.sampleCount += accepted.length;
      if (now - this.lastVoiceAt >= SILENCE_MS || this.sampleCount >= MAX_UTTERANCE_SAMPLES) {
        this.finishUtterance();
        return;
      }
    } else {
      this.preRoll.push(frame);
      while (this.preRoll.length > 1
        && this.preRoll.reduce((count, part) => count + part.length, 0) > PRE_ROLL_SAMPLES) {
        this.preRoll.shift();
      }
    }
  }

  finishUtterance() {
    const samples = new Float32Array(this.sampleCount);
    let offset = 0;
    for (const part of this.parts) {
      samples.set(part, offset);
      offset += part.length;
    }
    this.stop();
    if (samples.length >= MIN_UTTERANCE_SAMPLES) this.onAudio?.(samples);
  }

  clearUtterance() {
    this.parts = [];
    this.preRoll = [];
    this.sampleCount = 0;
    this.lastVoiceAt = 0;
    this.speaking = false;
  }

  stop({ closeContext = false } = {}) {
    this.active = false;
    this.ready = false;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.mute?.disconnect();
    this.processor = null;
    this.source = null;
    this.mute = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.clearUtterance();
    if (closeContext) {
      this.audioContext?.close();
      this.audioContext = null;
    } else {
      this.audioContext?.suspend().catch(() => {});
    }
  }
}
