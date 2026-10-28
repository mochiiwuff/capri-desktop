'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');

const CULTURES = new Set(['en-US', 'fr-FR', 'es-ES', 'pt-BR', 'ru-RU']);
const WORKER = path.join(__dirname, 'whisper-worker.js');
const MAX_SAMPLES = 16_000 * 20;

function createSpeechController({
  onEvent,
  platform = process.platform,
  WorkerClass = Worker,
  processFactory,
  terminateProcess,
  workerPath = WORKER,
  cacheDir,
} = {}) {
  let worker = null;
  let culture = null;
  let ready = false;
  let listening = false;

  function terminate(active) {
    if (terminateProcess) return terminateProcess(active);
    if (typeof active?.terminate === 'function') return active.terminate();
    if (typeof active?.kill === 'function') return active.kill();
    return undefined;
  }

  function stop() {
    if (!worker) return false;
    const active = worker;
    worker = null;
    culture = null;
    ready = false;
    listening = false;
    terminate(active);
    return true;
  }

  function handleWorkerEvent(active, event) {
    if (worker !== active || !event || typeof event !== 'object') return;
    if (event.type === 'loading') {
      onEvent?.({ type: 'loading' });
    } else if (event.type === 'ready') {
      ready = true;
      listening = true;
      onEvent?.({ type: 'listening' });
    } else if (event.type === 'listening') {
      listening = true;
      onEvent?.({ type: 'listening' });
    } else if (event.type === 'transcript' || event.type === 'silence') {
      listening = false;
      onEvent?.(event);
    } else if (event.type === 'error') {
      worker = null;
      culture = null;
      ready = false;
      listening = false;
      onEvent?.({ type: 'error', error: event.error || 'voiceStartFailed' });
      terminate(active);
    }
  }

  function start(nextCulture) {
    if (platform !== 'win32') return { ok: false, error: 'voiceUnsupported' };
    if (!CULTURES.has(nextCulture)) return { ok: false, error: 'voiceLanguageUnsupported' };
    if (worker && culture === nextCulture) {
      if (ready) {
        listening = true;
        onEvent?.({ type: 'listening' });
      }
      return { ok: true };
    }
    stop();

    try {
      worker = processFactory
        ? processFactory(workerPath, { culture: nextCulture, cacheDir })
        : new WorkerClass(workerPath, { workerData: { culture: nextCulture, cacheDir } });
    } catch (error) {
      worker = null;
      return { ok: false, error: error.message || 'voiceStartFailed' };
    }

    const active = worker;
    culture = nextCulture;
    active.on('message', (event) => handleWorkerEvent(active, event?.data ?? event));
    active.on('error', (error) => {
      if (worker !== active) return;
      worker = null;
      culture = null;
      ready = false;
      listening = false;
      onEvent?.({ type: 'error', error: error.message || 'voiceStartFailed' });
    });
    active.on('exit', (code) => {
      if (worker !== active) return;
      worker = null;
      culture = null;
      ready = false;
      listening = false;
      if (code !== 0) onEvent?.({ type: 'error', error: 'voiceStartFailed' });
    });
    return { ok: true };
  }

  function pause() {
    listening = false;
  }

  function transcribe(samples) {
    if (!worker || !ready || !listening || !(samples instanceof Float32Array)
        || samples.length < 4000 || samples.length > MAX_SAMPLES) {
      return false;
    }
    listening = false;
    worker.postMessage({ type: 'transcribe', samples });
    return true;
  }

  return { start, pause, stop, transcribe };
}

module.exports = { createSpeechController, CULTURES, MAX_SAMPLES };
