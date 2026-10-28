'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');
const { createSpeechController } = require('../src/main/speech');
const { createWhisperRuntime } = require('../src/main/whisper-worker');

function moduleUrl(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/from '(\.\/[^']+)'/g,
    (_, relative) => `from '${moduleUrl(path.resolve(path.dirname(file), relative))}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

class FakeWorker extends EventEmitter {
  constructor(file, options) {
    super();
    this.file = file;
    this.options = options;
    this.messages = [];
    FakeWorker.instances.push(this);
  }

  postMessage(message, transfer) {
    this.messages.push({ message, transfer });
  }

  terminate() {
    this.terminated = true;
  }
}
FakeWorker.instances = [];

test('local Whisper controller validates the platform and culture, loads once, and forwards audio', () => {
  const events = [];
  FakeWorker.instances = [];
  const controller = createSpeechController({
    platform: 'win32',
    workerPath: 'whisper-worker.js',
    cacheDir: 'speech-models',
    WorkerClass: FakeWorker,
    onEvent: (event) => events.push(event),
  });

  assert.deepEqual(controller.start('pt-BR'), { ok: true });
  const worker = FakeWorker.instances[0];
  assert.equal(worker.file, 'whisper-worker.js');
  assert.deepEqual(worker.options.workerData, { culture: 'pt-BR', cacheDir: 'speech-models' });
  worker.emit('message', { type: 'loading' });
  worker.emit('message', { type: 'ready' });
  assert.deepEqual(events, [
    { type: 'loading' },
    { type: 'listening' },
  ]);
  assert.deepEqual(controller.start('pt-BR'), { ok: true });
  assert.equal(FakeWorker.instances.length, 1);
  const samples = new Float32Array(5000);
  assert.equal(controller.transcribe(samples), true);
  assert.equal(worker.messages[0].message.type, 'transcribe');
  assert.equal(worker.messages[0].message.samples.length, 5000);
  worker.emit('message', { type: 'transcript', text: 'Oi Capri' });
  assert.deepEqual(events.at(-1), { type: 'transcript', text: 'Oi Capri' });
  assert.equal(controller.transcribe(samples), false);
  controller.start('pt-BR');
  assert.deepEqual(events.at(-1), { type: 'listening' });
  assert.equal(controller.stop(), true);
  assert.equal(worker.terminated, true);
});

test('utility-process voice errors terminate with kill instead of Worker.terminate', () => {
  const child = new EventEmitter();
  child.messages = [];
  child.postMessage = (message) => child.messages.push(message);
  child.kill = () => { child.killed = true; };
  const events = [];
  const controller = createSpeechController({
    platform: 'win32',
    processFactory: () => child,
    onEvent: (event) => events.push(event),
  });

  assert.deepEqual(controller.start('pt-BR'), { ok: true });
  child.emit('message', { data: { type: 'error', error: 'voiceModelDownloadFailed' } });
  assert.equal(child.killed, true);
  assert.deepEqual(events, [{ type: 'error', error: 'voiceModelDownloadFailed' }]);
  assert.equal(controller.transcribe(new Float32Array(5000)), false);
});

test('Whisper runtime loads multilingual Portuguese transcription and handles silence', async () => {
  const events = [];
  let pipelineOptions;
  let pipelineInput;
  const runtime = createWhisperRuntime({
    postMessage: (event) => events.push(event),
    loadPipeline: async ({ cacheDir, postMessage }) => {
      assert.equal(cacheDir, 'speech-models');
      return async (task, model, options) => {
        assert.equal(task, 'automatic-speech-recognition');
        assert.equal(model, 'onnx-community/whisper-tiny');
        options.progress_callback({ status: 'progress' });
        pipelineOptions = options;
        return async (samples, settings) => {
          pipelineInput = { samples, settings };
          return { text: '' };
        };
      };
    },
  });

  await runtime.initialize({ culture: 'pt-BR', cacheDir: 'speech-models' });
  assert.deepEqual(events, [
    { type: 'loading' },
    { type: 'ready' },
  ]);
  assert.equal(pipelineOptions.dtype, 'q8');
  await runtime.handle({ type: 'transcribe', samples: new Float32Array(5000) }, 'pt-BR');
  assert.equal(pipelineInput.settings.language, 'portuguese');
  assert.equal(pipelineInput.settings.task, 'transcribe');
  assert.equal(events.at(-1).type, 'silence');
});

test('local microphone packages 16 kHz audio and stops the capture after an utterance', async (t) => {
  const originalWindow = globalThis.window;
  globalThis.window = { speechSynthesis: { cancel() {} } };
  t.after(() => {
    if (originalWindow) globalThis.window = originalWindow;
    else delete globalThis.window;
  });

  const { LocalMicrophoneCapture } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/microphone.js')));
  const track = { stopped: false, stop() { this.stopped = true; } };
  let processor;
  class AudioContext {
    constructor({ sampleRate }) {
      this.sampleRate = sampleRate;
      this.destination = {};
    }

    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() {
      processor = { connect() {}, disconnect() {} };
      return processor;
    }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  let received;
  const capture = new LocalMicrophoneCapture({
    getUserMedia: async () => ({ getTracks: () => [track] }),
    AudioContextClass: AudioContext,
    onAudio: (samples) => { received = samples; },
  });

  await capture.start();
  capture.setReady(true);
  const frame = new Float32Array(4096).fill(0.1);
  for (let i = 0; i < 50 && !received; i += 1) {
    processor.onaudioprocess({ inputBuffer: { getChannelData: () => frame } });
  }
  assert.ok(received instanceof Float32Array);
  assert.equal(received.length, 16_000 * 12);
  assert.equal(track.stopped, true);
  assert.equal(capture.active, false);
});

test('Whisper model errors stop capture without falling back to online recognition', async (t) => {
  const originalWindow = globalThis.window;
  globalThis.window = { speechSynthesis: { cancel() {} } };
  t.after(() => {
    if (originalWindow) globalThis.window = originalWindow;
    else delete globalThis.window;
  });
  const { VoiceChat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/voice-chat.js')));
  const callbacks = [];
  const states = [];
  const microphone = {
    start() {},
    setReady() {},
    stop() {},
  };
  const host = {
    onVoiceEvent: (callback) => { callbacks.push(callback); return () => {}; },
    startVoice: async () => ({ ok: true }),
    pauseVoice() {},
    stopVoice() {},
    transcribeVoice() {},
  };
  const voice = new VoiceChat({ host, microphone, onState: (state) => states.push(state) });
  voice.start('pt');
  callbacks[0]({ type: 'error', error: 'voiceModelDownloadFailed' });
  assert.equal(voice.enabled, false);
  assert.deepEqual(states, ['voiceModelDownloadFailed']);
});

test('voice chat sends transcripts, pauses local capture, and resumes after its reply', async (t) => {
  const originalWindow = globalThis.window;
  const actions = [];
  const states = [];
  const callbacks = [];
  const spoken = [];
  const microphone = {
    start: () => actions.push('captureStart'),
    setReady: (ready) => actions.push(['captureReady', ready]),
    stop: (options) => actions.push(['captureStop', options]),
  };
  class Utterance {
    constructor(text) { this.text = text; }
  }
  globalThis.window = {
    speechSynthesis: {
      cancel: () => actions.push('cancelSpeech'),
      speak: (utterance) => spoken.push(utterance),
    },
    SpeechSynthesisUtterance: Utterance,
  };
  t.after(() => {
    if (originalWindow) globalThis.window = originalWindow;
    else delete globalThis.window;
  });

  const { VoiceChat } = await import(moduleUrl(path.join(__dirname, '../src/renderer/js/voice-chat.js')));
  const transcripts = [];
  const host = {
    onVoiceEvent: (callback) => { callbacks.push(callback); return () => {}; },
    startVoice: async (culture) => { actions.push(['start', culture]); return { ok: true }; },
    pauseVoice: () => actions.push('pause'),
    stopVoice: () => actions.push('stop'),
    transcribeVoice: (samples) => actions.push(['transcribe', samples.length]),
  };
  const voice = new VoiceChat({
    host,
    microphone,
    onText: (text) => transcripts.push(text),
    onState: (state) => states.push(state),
  });

  assert.deepEqual(voice.start('pt'), { ok: true });
  await Promise.resolve();
  assert.deepEqual(actions.slice(0, 2), ['captureStart', ['start', 'pt-BR']]);
  callbacks[0]({ type: 'loading' });
  callbacks[0]({ type: 'listening' });
  voice.onAudio(new Float32Array(5000));
  assert.deepEqual(actions.at(-1), ['transcribe', 5000]);
  callbacks[0]({ type: 'transcript', text: 'Oi Capri' });
  assert.deepEqual(transcripts, ['Oi Capri']);
  assert.equal(actions.at(-1), 'pause');
  assert.equal(voice.waitingForReply, true);

  assert.equal(voice.speak('Olá!'), true);
  assert.equal(spoken[0].text, 'Olá!');
  assert.equal(spoken[0].lang, 'pt-BR');
  spoken[0].onend();
  await Promise.resolve();
  assert.deepEqual(actions.at(-2), 'captureStart');
  assert.deepEqual(actions.at(-1), ['start', 'pt-BR']);

  voice.stop();
  assert.equal(voice.enabled, false);
  assert.ok(actions.includes('stop'));
  assert.equal(actions.at(-1), 'cancelSpeech');
  assert.equal(states.at(-1), 'off');
});
