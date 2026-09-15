// Atmosphere Engine: Synthesized Sound

class Atmosphere {
  constructor() {
    this.audioCtx = null;
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  playTone(freq, type = "sine", duration = 0.1, vol = 0.1, delay = 0) {
    if (!this.audioCtx) return;
    const t = this.audioCtx.currentTime + delay;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain);
    gain.connect(this.audioCtx.destination);
    
    osc.start(t);
    osc.stop(t + duration);
  }

  playHoverSound() {
    this.initAudio();
    this.playTone(600, "sine", 0.1, 0.02);
  }

  playClickSound() {
    this.initAudio();
    this.playTone(880, "sine", 0.1, 0.05);
  }

  playMagicChime() {
    this.initAudio();
    // A magical arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      this.playTone(freq, "sine", 0.5, 0.05, i * 0.08);
    });
  }

  playErrorSound() {
    this.initAudio();
    this.playTone(150, "sawtooth", 0.2, 0.05);
    this.playTone(130, "sawtooth", 0.3, 0.05, 0.1);
  }
}

window.atmosphere = new Atmosphere();
