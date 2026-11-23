// SOLMAR audio: everything synthesised with WebAudio, no assets, no network.
// One-shot effects live on `sfx`; the game calls game.sfx(name), never the
// imported object directly. Loops (engine, siren, radio) are started and
// stopped explicitly so a pause or a wasted screen never leaves a drone.

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let radioTimer = null;
let radioStep = 0;
let radioStation = 0;

export const RADIO_STATIONS = ['SOLMAR FM', 'BAY ROCK'];

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, when = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol = 0.2, lowpass = 1200) {
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t);
}

export const sfx = {
  shoot() {
    noise(0.09, 0.25, 2500);
    tone(180, 0.08, 'square', 0.12, 60);
  },
  crash() {
    noise(0.25, 0.3, 700);
    tone(90, 0.2, 'sawtooth', 0.15, 40);
  },
  blip() {
    tone(880, 0.07, 'sine', 0.12);
  },
  cash() {
    tone(990, 0.09, 'sine', 0.15);
    tone(1320, 0.14, 'sine', 0.15, null, 0.09);
  },
  horn() {
    tone(392, 0.22, 'square', 0.1);
    tone(311, 0.22, 'square', 0.1);
  },
  wasted() {
    tone(220, 0.5, 'sawtooth', 0.15, 110);
    tone(165, 0.7, 'sawtooth', 0.15, 82, 0.4);
  },
  click() {
    tone(660, 0.05, 'sine', 0.1);
  },
  heal() {
    tone(520, 0.12, 'sine', 0.12);
    tone(780, 0.18, 'sine', 0.12, null, 0.1);
  },
  steal() {
    tone(440, 0.08, 'triangle', 0.14);
    tone(587, 0.1, 'triangle', 0.14, null, 0.08);
  },
};

/** Engine hum: pitch follows speed01 (0-1). Pass driving=false to silence it. */
export function updateEngine(driving, speed01) {
  if (!ctx || !master) return;
  if (!driving) {
    if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    return;
  }
  if (!engineOsc) {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }
  engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.08);
  engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.05, ctx.currentTime, 0.1);
}

/** Two-tone police siren loop. */
export function updateSiren(active) {
  if (!ctx || !master) return;
  if (!active) {
    if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    return;
  }
  if (!sirenOsc) {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    let high = true;
    setInterval(() => {
      if (!sirenOsc) return;
      high = !high;
      sirenOsc.frequency.setTargetAtTime(high ? 950 : 700, ctx.currentTime, 0.05);
    }, 450);
  }
  sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.15);
}

// Radio: a tiny step sequencer. SOLMAR FM is a chill synthwave arpeggio,
// BAY ROCK a driving bass riff. Oscillator patterns only, no assets.
const PATTERNS = [
  { bpm: 96, notes: [220, 261.6, 329.6, 392, 329.6, 261.6, 196, 261.6], type: 'triangle', vol: 0.09 },
  { bpm: 128, notes: [110, 110, 130.8, 110, 98, 110, 146.8, 130.8], type: 'sawtooth', vol: 0.08 },
];

export function startRadio(station = 0) {
  if (!ctx) return;
  stopRadio();
  radioStation = station % PATTERNS.length;
  const pat = PATTERNS[radioStation];
  const stepMs = (60 / pat.bpm) * 1000 / 2;
  radioTimer = setInterval(() => {
    const note = pat.notes[radioStep % pat.notes.length];
    tone(note, stepMs / 1000 * 0.9, pat.type, pat.vol);
    if (radioStep % 4 === 0) tone(note / 2, 0.3, 'sine', 0.06);
    radioStep++;
  }, stepMs);
}

export function stopRadio() {
  if (radioTimer) {
    clearInterval(radioTimer);
    radioTimer = null;
  }
}

export function nextStation() {
  radioStation = (radioStation + 1) % PATTERNS.length;
  if (radioTimer) startRadio(radioStation);
  return radioStation;
}

export function currentStation() {
  return RADIO_STATIONS[radioStation];
}

export function stopAllLoops() {
  stopRadio();
  if (engineGain && ctx) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  if (sirenGain && ctx) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
}
