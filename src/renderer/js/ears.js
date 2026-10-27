// Her ears, in a spoken conversation (chat.js): the microphone, a simple voice detector (she
// waits for you to start talking, and to stop), and Whisper turning it into words (ears-worker.js,
// on this PC). Only while a spoken conversation is on: the microphone is let go of after it, and
// nothing is kept or sent anywhere.

import { clamp } from './util.js';

const RATE = 16000;            // what Whisper wants
const FRAME = 512;             // 32 ms at 16 kHz: what the voice detector looks at
const START_FRAMES = 3;        // ~100 ms over the threshold: you're talking
const END_MS = 900;            // this much quiet after: you're done
const PREROLL_FRAMES = 10;     // what came just before (the start of the first word)
const MAX_MS = 20000;          // one turn at most
export const MODELS = { tiny: 'onnx-community/whisper-tiny', base: 'onnx-community/whisper-base', small: 'onnx-community/whisper-small' };
const CACHE = 'transformers-cache'; // where transformers.js keeps what it downloaded

export class Ears {
  constructor() {
    this.worker = null;
    this.model = null;  // the one loaded (or loading)
    this.loading = null;
    this.calls = new Map(); // id -> { resolve, reject }
    this.seq = 0;
    this.onProgress = null; // (loaded, total) while downloading
    this.stream = null;
    this.ctx = null;
    this.node = null;
    this.onFrames = null;
  }

  // Is that model already on this PC? (she asks before downloading it)
  async cached(size) {
    try {
      const cache = await caches.open(CACHE);
      const keys = await cache.keys();
      return keys.some((req) => req.url.includes(`${MODELS[size]}/`) && req.url.endsWith('.onnx'));
    } catch {
      return false;
    }
  }

  // Loads the model (the first time: downloads it). Resolves with the device it runs on.
  load(size) {
    const model = MODELS[size] || MODELS.base;
    if (this.model === model && this.loading) return this.loading;
    this.worker?.terminate();
    this.model = model;
    this.worker = new Worker(new URL('./ears-worker.js', import.meta.url), { type: 'module' });
    this.loading = new Promise((resolve, reject) => {
      this.worker.onmessage = ({ data }) => {
        if (data.type === 'progress') this.onProgress?.(data.loaded, data.total);
        else if (data.type === 'ready') resolve(data.device);
        else if (data.type === 'text') this.calls.get(data.id)?.resolve(data.text);
        else if (data.type === 'error') {
          const call = this.calls.get(data.id);
          if (call) call.reject(new Error(data.error));
          else reject(new Error(data.error));
        }
        if (data.id) this.calls.delete(data.id);
      };
      this.worker.onerror = (e) => reject(new Error(e.message || 'speech recognition failed'));
    });
    this.loading.catch(() => {
      this.model = null;
      this.loading = null;
    });
    this.worker.postMessage({ type: 'load', model });
    return this.loading;
  }

  // Words from 16 kHz samples, in `lang` (her language, fr / en / es / pt / ru).
  async transcribe(audio, lang) {
    await this.loading;
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.calls.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'hear', id, audio, lang }, [audio.buffer]);
    });
  }

  // The microphone, on. Throws when there's none, or it's not allowed (Windows' privacy settings).
  async open() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule(new URL('./ears-worklet.js', import.meta.url));
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'capri-ears');
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    source.connect(this.node).connect(mute).connect(this.ctx.destination); // pulled, never heard
    const ratio = this.ctx.sampleRate / RATE;
    let carry = new Float32Array(0);
    this.node.port.onmessage = ({ data }) => {
      // down to 16 kHz (averaging what falls in each new sample), in frames of 512
      const n = Math.floor(data.length / ratio);
      const down = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = Math.floor(i * ratio), b = Math.min(data.length, Math.floor((i + 1) * ratio));
        let sum = 0;
        for (let j = a; j < b; j++) sum += data[j];
        down[i] = sum / Math.max(1, b - a);
      }
      const all = new Float32Array(carry.length + down.length);
      all.set(carry);
      all.set(down, carry.length);
      let at = 0;
      for (; at + FRAME <= all.length; at += FRAME) this.onFrames?.(all.slice(at, at + FRAME));
      carry = all.slice(at);
    };
  }

  close() {
    this.onFrames = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.node = null;
  }

  // Waits for you to say something and stop: resolves with the samples (Float32Array, 16 kHz),
  // or null if you said nothing for `wait` ms, or `signal` aborted it.
  // onLevel(0..1, talking): how loud, as it comes (for her ears' arcs).
  record({ wait = 15000, onLevel = null, signal = null } = {}) {
    return new Promise((resolve) => {
      let floor = 0.004;   // the room's own noise, as it goes
      let over = 0;
      let talking = false;
      let quietMs = 0;
      let spokenMs = 0;
      let waited = 0;
      const pre = [];
      const kept = [];
      const frameMs = (FRAME / RATE) * 1000;
      const finish = (audio) => {
        this.onFrames = null;
        signal?.removeEventListener('abort', abort);
        resolve(audio);
      };
      const abort = () => finish(null);
      signal?.addEventListener('abort', abort);
      this.onFrames = (frame) => {
        let sum = 0;
        for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
        const rms = Math.sqrt(sum / frame.length);
        const threshold = Math.max(0.012, floor * 3);
        onLevel?.(clamp(rms / 0.08, 0, 1), talking);
        if (!talking) {
          waited += frameMs;
          pre.push(frame);
          if (pre.length > PREROLL_FRAMES) pre.shift();
          if (rms > threshold) over++;
          else {
            over = 0;
            floor = floor * 0.95 + rms * 0.05;
          }
          if (over >= START_FRAMES) {
            talking = true;
            kept.push(...pre);
          } else if (waited > wait) finish(null);
          return;
        }
        kept.push(frame);
        spokenMs += frameMs;
        quietMs = rms < threshold * 0.7 ? quietMs + frameMs : 0;
        if (quietMs >= END_MS || spokenMs >= MAX_MS) {
          const audio = new Float32Array(kept.length * FRAME);
          kept.forEach((f, i) => audio.set(f, i * FRAME));
          finish(spokenMs - quietMs < 250 ? new Float32Array(0) : audio); // a cough, a click: nothing
        }
      };
    });
  }
}
