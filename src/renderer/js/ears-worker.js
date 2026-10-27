// Her ears, off the page's thread (so her animation never hitches while she listens): Whisper,
// the speech recognition model, run on this PC by transformers.js, on the graphics card when
// there is one (WebGPU), else on the processor. The model is downloaded once from Hugging Face
// (after you said yes) and kept in the app's cache; what you say never leaves the PC.
//
// Messages in:  { type: 'load', model }                 -> 'progress'..., then 'ready' | 'error'
//               { type: 'hear', id, audio, lang }        -> 'text' { id, text } | 'error' { id }
// audio: a Float32Array of mono samples at 16 kHz.

import { pipeline, env } from '../../../node_modules/@huggingface/transformers/dist/transformers.js';

// the ONNX runtime's WebAssembly from the app's own files, not from a CDN
const ORT = new URL('../../../node_modules/onnxruntime-web/dist/', import.meta.url).href;
env.allowLocalModels = false;
env.useWasmCache = false;
env.backends.onnx.wasm.wasmPaths = {
  mjs: `${ORT}ort-wasm-simd-threaded.asyncify.mjs`,
  wasm: `${ORT}ort-wasm-simd-threaded.asyncify.wasm`,
};

let asr = null;

async function load(model) {
  const gpu = await navigator.gpu?.requestAdapter().catch(() => null);
  const device = gpu ? 'webgpu' : 'wasm';
  // on the graphics card the encoder wants full precision; on the processor, 8 bits is quicker
  const dtype = gpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8';
  const files = new Map(); // file -> [loaded, total]
  asr = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.total) return;
      files.set(p.file, [p.loaded, p.total]);
      let loaded = 0;
      let total = 0;
      for (const [l, t] of files.values()) {
        loaded += l;
        total += t;
      }
      postMessage({ type: 'progress', loaded, total });
    },
  });
  await asr(new Float32Array(16000), { language: 'en' }); // a second of silence: compiles it all now
  postMessage({ type: 'ready', device });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      await load(data.model);
    } else if (data.type === 'hear') {
      const out = await asr(data.audio, { language: data.lang, task: 'transcribe' });
      postMessage({ type: 'text', id: data.id, text: String(out?.text || '').trim() });
    }
  } catch (err) {
    postMessage({ type: 'error', id: data.id, error: String(err?.message || err) });
  }
};
