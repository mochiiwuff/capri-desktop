// Her ears' tap on the microphone (ears.js): hands the samples over in blocks of 2048.

class CapriEars extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(2048);
    this.n = 0;
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    for (let i = 0; i < samples.length; i++) {
      this.block[this.n++] = samples[i];
      if (this.n === this.block.length) {
        this.port.postMessage(this.block);
        this.block = new Float32Array(2048);
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor('capri-ears', CapriEars);
