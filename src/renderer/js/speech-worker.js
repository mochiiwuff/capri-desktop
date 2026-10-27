// Her own voice, off the page's thread: eSpeak-NG turns the text into the sounds to say, Piper (a
// neural voice) says them, voicefx.js makes it hers. All on this PC, from the files voicepack.js
// fetched once (served at /.voice/). A sentence at a time, so she starts talking while the rest is
// still being made.
//
// Messages in:  { type: 'load', voice, speaker }            -> 'ready' | 'error'
//               { type: 'say', id, text, style, seed }      -> 'chunk' { id, audio, sr }..., then 'end' { id }
//               { type: 'stop', id }                        -> no more chunks for that one

import * as ort from '../../../node_modules/onnxruntime-web/dist/ort.webgpu.min.mjs';
import { capriVoice, giggle, varispeed, normalize, concat } from './voicefx.js';

// the ONNX runtime's WebAssembly from the app's own files (the same as her ears')
const ORT = new URL('../../../node_modules/onnxruntime-web/dist/', import.meta.url).href;
ort.env.wasm.wasmPaths = { mjs: `${ORT}ort-wasm-simd-threaded.asyncify.mjs`, wasm: `${ORT}ort-wasm-simd-threaded.asyncify.wasm` };
ort.env.wasm.numThreads = 1;

const VOICE = new URL('../../../.voice/', import.meta.url).href;
// how she sounds (the "creepy doll" of the samples): higher, a touch slower, breathy
const PITCH = 1.26;
const PACE = 0.96;
const BREATH = 0.06;
// her giggles and her "oops", said apart and pushed into the red
const GIGGLE = /(\s*(?:hihi|hi hi|hé ?hé|haha|ha ha|oups|oops|whoops|jiji|jaja|хи-?хи|ой)\s*[!.…]*\s*)/i;

let voice = null; // { session, config, speaker, espeak }
const stopped = new Set();

async function load({ voice: name, speaker = 0 }) {
  const config = await (await fetch(`${VOICE}${name}.onnx.json`)).json();
  const model = new Uint8Array(await (await fetch(`${VOICE}${name}.onnx`)).arrayBuffer());
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  // eSpeak-NG: compiled once, a fresh instance per piece of text (it's a command line program)
  const { default: ESpeakNg } = await import(`${VOICE}espeak-ng.js`);
  const wasm = await WebAssembly.compileStreaming(fetch(`${VOICE}espeak-ng.wasm`));
  const espeak = (args) => ESpeakNg({
    arguments: args,
    instantiateWasm: (imports, done) => {
      WebAssembly.instantiate(wasm, imports).then((instance) => done(instance));
      return {};
    },
  });
  voice = { session, config, speaker, espeak };
}

// text -> the sounds eSpeak-NG reads, a clause at a time, each clause's punctuation kept (Piper
// sings it differently)
async function phonemes(text) {
  const out = [];
  for (const [, piece, punct] of text.matchAll(/([^,.!?;:…]+)([,.!?;:…]*)/g)) {
    if (!piece.trim()) continue;
    const e = await voice.espeak(['--phonout', 'out', '-q', '--ipa', '-v', voice.config.espeak.voice, piece.trim()]);
    const ipa = e.FS.readFile('out', { encoding: 'utf8' }).replace(/\([a-z-]+\)/g, '').replace(/\s+/g, ' ').trim();
    out.push(ipa + (punct ? punct.trim()[0].replace('…', '.') : ''));
  }
  return out.join(' ');
}

// Piper says it, `pitch` times slower (so once raised it keeps its pace)
async function piper(text, pitch) {
  const map = voice.config.phoneme_id_map;
  const ids = [...map['^'], ...map._];
  for (const ch of await phonemes(text)) if (map[ch]) ids.push(...map[ch], ...map._);
  ids.push(...map.$);
  const { noise_scale: noise = 0.667, noise_w: noiseW = 0.8 } = voice.config.inference || {};
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([noise, PACE * pitch, noiseW]), [3]),
  };
  if (voice.config.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(voice.speaker)]), [1]);
  const out = await voice.session.run(feeds);
  return Float32Array.from(out.output.data);
}

async function say({ id, text, style = 0.5, seed = 1 }) {
  const sr = voice.config.audio.sample_rate;
  let n = seed;
  for (const sentence of String(text).match(/[^.!?…]+[.!?…]*/g) || []) {
    if (stopped.has(id)) break;
    const parts = [];
    for (const part of sentence.split(GIGGLE).map((p) => p.trim()).filter(Boolean)) {
      if (!/[\p{L}\p{N}]/u.test(part)) continue;
      if (GIGGLE.test(` ${part} `) && part.split(/\s+/).length <= 2) {
        parts.push(giggle(varispeed(await piper(part, PITCH * 1.08), PITCH * 1.08), sr));
      } else {
        parts.push(capriVoice(await piper(part, PITCH), sr, { pitch: PITCH, style, breathLevel: BREATH, seed: n++ }));
      }
      parts.push(new Float32Array(Math.round(sr * 0.06)));
    }
    if (!parts.length || stopped.has(id)) continue;
    const audio = normalize(concat(parts));
    postMessage({ type: 'chunk', id, audio, sr }, [audio.buffer]);
  }
  stopped.delete(id);
  postMessage({ type: 'end', id });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      await load(data);
      postMessage({ type: 'ready' });
    } else if (data.type === 'say') {
      await say(data);
    } else if (data.type === 'stop') {
      stopped.add(data.id);
    }
  } catch (err) {
    postMessage({ type: 'error', id: data.id, error: String(err?.message || err) });
  }
};
