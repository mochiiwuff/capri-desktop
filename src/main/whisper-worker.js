'use strict';

const { isMainThread, parentPort, workerData } = require('node:worker_threads');

const LANGUAGE = {
  'en-US': 'english',
  'fr-FR': 'french',
  'es-ES': 'spanish',
  'pt-BR': 'portuguese',
  'ru-RU': 'russian',
};

function createWhisperRuntime({ postMessage, loadPipeline }) {
  let transcriber;
  let busy = false;

  async function initialize({ culture, cacheDir }) {
    try {
      const pipeline = await loadPipeline({ cacheDir, postMessage });
      let loadingNotified = false;
      transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {
        dtype: 'q8',
        device: 'cpu',
        progress_callback: ({ status }) => {
          if (status === 'progress' && !loadingNotified) {
            loadingNotified = true;
            postMessage({ type: 'loading' });
          }
        },
      });
      postMessage({ type: 'ready' });
    } catch (error) {
      postMessage({ type: 'error', error: 'voiceModelDownloadFailed', detail: error.message });
    }
  }

  async function transcribe(samples, culture) {
    if (!transcriber || busy || !(samples instanceof Float32Array)) return;
    busy = true;
    try {
      const result = await transcriber(samples, {
        language: LANGUAGE[culture],
        task: 'transcribe',
      });
      const text = typeof result?.text === 'string' ? result.text.trim() : '';
      postMessage(text ? { type: 'transcript', text } : { type: 'silence' });
    } catch (error) {
      postMessage({ type: 'error', error: 'voiceTranscriptionFailed', detail: error.message });
    } finally {
      busy = false;
    }
  }

  return {
    initialize,
    handle(message, culture) {
      if (message?.type === 'transcribe') return transcribe(message.samples, culture);
      return Promise.resolve();
    },
  };
}

// In the desktop app this runs in an Electron UtilityProcess so inference cannot
// stall Capri. Keep worker_threads support for development and tests too.
const utilityPort = (() => {
  try { return require('electron').parentPort || null; } catch { return null; }
})();

if (!isMainThread || utilityPort) {
  const channel = utilityPort || parentPort;
  const settings = workerData || { culture: process.argv[2], cacheDir: process.argv[3] };
  const runtime = createWhisperRuntime({
    postMessage: (event) => channel.postMessage(event),
    loadPipeline: async ({ cacheDir, postMessage }) => {
      const { env, pipeline } = await import('@huggingface/transformers');
      env.cacheDir = cacheDir;
      env.allowRemoteModels = true;
      return (task, model, options) => pipeline(task, model, options);
    },
  });
  runtime.initialize(settings).then(() => {
    channel.on('message', (event) => runtime.handle(event?.data ?? event, settings.culture));
  });
}

module.exports = { createWhisperRuntime, LANGUAGE };
