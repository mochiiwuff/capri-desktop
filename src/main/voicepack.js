'use strict';

// Her own voice (speech-worker.js): a neural voice per language (Piper, https://github.com/rhasspy/piper)
// and eSpeak-NG, which turns text into the sounds it reads. Neither ships with her: they're fetched
// once, when you say yes (her menu › Her voice › Capri's voice), each from a fixed version, checked
// against its known fingerprint, and kept in her data folder. Then it all runs on this PC.
//
// eSpeak-NG is under the GPL-3.0, the voices under their own licences (see VOICES): fetched as they
// are, never bundled into Capri (MIT).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { app } = require('electron');

const PIPER = 'https://huggingface.co/rhasspy/piper-voices/resolve/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/';
const ESPEAK = 'https://cdn.jsdelivr.net/npm/espeak-ng@1.0.2/dist/';

// her voice in each language she speaks: a woman's voice, and its speaker in the model when it has
// several. No Brazilian Portuguese woman among Piper's voices: there, Windows' voice.
const VOICES = {
  fr: { name: 'fr_FR-siwis-medium', dir: 'fr/fr_FR/siwis/medium', md5: ['20e876e8c839e9b11a26085858f2300c', 'a407e7e6901feb79c2ea2a5466076cce'], size: 63201294, license: 'CC-BY 4.0 (SIWIS, University of Edinburgh)' },
  en: { name: 'en_US-amy-medium', dir: 'en/en_US/amy/medium', md5: ['778d28aeb95fcdf8a882344d9df142fc', '7f37dadb26340c90ebc8088e0b252310'], size: 63201294, license: 'Mycroft mimic3 voices' },
  es: { name: 'es_ES-sharvard-medium', dir: 'es/es_ES/sharvard/medium', md5: ['77e6f9c26e92799fb04bb90b46bf1834', 'e49cab310ce362145f7d94b347c291ff'], size: 76733615, speaker: 1, license: 'CC-BY 3.0 (Sharvard, University of Edinburgh)' },
  ru: { name: 'ru_RU-irina-medium', dir: 'ru/ru_RU/irina/medium', md5: ['21fbe77fdc68bdc35d7adb6bf4f52199', 'e239bb7f22d5de4a44ec6b1cb6c06bb5'], size: 63201294, license: 'RHVoice (licence not stated)' },
};
const ESPEAK_FILES = [
  { file: 'espeak-ng.js', sha256: '406c6655a6cacf34d84fc69dc4478c81b71518809080ce2d05df1b706d76429d', size: 178386 },
  { file: 'espeak-ng.wasm', sha256: '10d24bb7e4124e983aa9cd8cd96c52c8ea4b607d81956ec70846684e2827d532', size: 18485010 },
];

const dir = () => path.join(app.getPath('userData'), 'voice');

// What a language needs: [{ url, file, hash: [algorithm, hex], size }]
function needs(lang) {
  const voice = VOICES[lang];
  if (!voice) return null;
  return [
    ...ESPEAK_FILES.map((f) => ({ url: ESPEAK + f.file, file: f.file, hash: ['sha256', f.sha256], size: f.size })),
    { url: `${PIPER}${voice.dir}/${voice.name}.onnx`, file: `${voice.name}.onnx`, hash: ['md5', voice.md5[0]], size: voice.size },
    { url: `${PIPER}${voice.dir}/${voice.name}.onnx.json`, file: `${voice.name}.onnx.json`, hash: ['md5', voice.md5[1]], size: 5000 },
  ];
}

const have = (f) => fs.existsSync(path.join(dir(), f.file));

// { available, ready, size (to fetch, bytes), voice, speaker, license }
function status(lang) {
  const list = needs(lang);
  if (!list) return { available: false, ready: false };
  const missing = list.filter((f) => !have(f));
  return {
    available: true,
    ready: !missing.length,
    size: missing.reduce((s, f) => s + f.size, 0),
    voice: VOICES[lang].name,
    speaker: VOICES[lang].speaker ?? 0,
    license: VOICES[lang].license,
  };
}

// Fetches what's missing, checking each file before keeping it. onProgress(done, total) in bytes.
async function install(lang, onProgress = () => {}, signal) {
  const list = needs(lang);
  if (!list) throw new Error('no voice of hers in this language');
  fs.mkdirSync(dir(), { recursive: true });
  const missing = list.filter((f) => !have(f));
  const total = missing.reduce((s, f) => s + f.size, 0);
  let done = 0;
  for (const f of missing) {
    const res = await fetch(f.url, { signal });
    if (!res.ok) throw new Error(`${f.file}: ${res.status}`);
    const hash = crypto.createHash(f.hash[0]);
    const part = path.join(dir(), `${f.file}.part`);
    const out = fs.createWriteStream(part);
    try {
      for await (const chunk of res.body) {
        hash.update(chunk);
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        done += chunk.length;
        onProgress(Math.min(done, total), total);
      }
      await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    } catch (err) {
      out.destroy();
      fs.rmSync(part, { force: true });
      throw err;
    }
    if (hash.digest('hex') !== f.hash[1]) {
      fs.rmSync(part, { force: true });
      throw new Error(`${f.file}: not the expected file`);
    }
    fs.renameSync(part, path.join(dir(), f.file));
  }
  return status(lang);
}

module.exports = { VOICES, dir, status, install };
