// ── Web Audio API singleton ────────────────────────────────────────────────
// All synth — no external files.

let _ctx         = null;
let _drillNodes  = null; // { osc, filter, g }
let _alarmNodes  = null; // { osc, lfo, lfog, g }

function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

/** Call on first user gesture to unblock AudioContext. */
export function init() { try { ctx(); } catch {} }

// ── UI Click ───────────────────────────────────────────────────────────────
/** Short high sine "tick" for buttons. */
export function playClick() {
  try {
    const c = ctx();
    const o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = 'sine'; o.frequency.value = 1200;
    g.gain.setValueAtTime(0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.06);
    o.start(c.currentTime); o.stop(c.currentTime + 0.07);
  } catch {}
}

// ── Cash arpegio ───────────────────────────────────────────────────────────
/** C5–E5–G5–C6 ascending sine arpegio for rewards. */
export function playCash() {
  try {
    const c = ctx();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const t = c.currentTime + i * 0.09;
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.20, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
      o.start(t); o.stop(t + 0.22);
    });
  } catch {}
}

// ── Alarm siren (LFO pitch-modulated square wave) ─────────────────────────
/** Continuous two-tone siren. Call once; stays active until stopAlarm(). */
export function playAlarm() {
  if (_alarmNodes) return;
  try {
    const c    = ctx();
    const osc  = c.createOscillator();
    const lfo  = c.createOscillator();
    const lfog = c.createGain();
    const g    = c.createGain();
    // LFO at 2.5 Hz swings pitch ±120 Hz around 770 Hz → 650–890 Hz siren
    lfo.frequency.value = 2.5; lfog.gain.value = 120;
    osc.type = 'square'; osc.frequency.value = 770;
    g.gain.value = 0.07;
    lfo.connect(lfog); lfog.connect(osc.frequency);
    osc.connect(g); g.connect(c.destination);
    lfo.start(); osc.start();
    _alarmNodes = { osc, lfo, g };
  } catch {}
}

export function stopAlarm() {
  if (!_alarmNodes) return;
  try {
    const c = ctx();
    _alarmNodes.g.gain.setTargetAtTime(0, c.currentTime, 0.1);
    const n = _alarmNodes; _alarmNodes = null;
    setTimeout(() => { try { n.osc.stop(); n.lfo.stop(); } catch {} }, 450);
  } catch {}
}

// ── Drill hum (sawtooth + lowpass, pitch = f(density)) ────────────────────
// fine_sand(1.65)→82Hz  soft_loam(1.85)→75Hz  frozen(1.9)→73Hz  granite(2.65)→47Hz
function _d2f(density) { return Math.max(28, 140 - density * 35); }

/** Start continuous drill hum. density = layer.soil.density */
export function startDrill(density) {
  if (_drillNodes) return;
  try {
    const c      = ctx();
    const osc    = c.createOscillator();
    const filter = c.createBiquadFilter();
    const g      = c.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = _d2f(density);
    filter.type = 'lowpass'; filter.frequency.value = 280; filter.Q.value = 3;
    osc.connect(filter); filter.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(0.14, c.currentTime + 0.5);
    osc.start();
    _drillNodes = { osc, filter, g };
  } catch {}
}

/** Smoothly shift pitch when soil layer changes. */
export function updateDrill(density) {
  if (!_drillNodes) return;
  try {
    _drillNodes.osc.frequency.setTargetAtTime(_d2f(density), ctx().currentTime, 0.4);
  } catch {}
}

/** Fade out and stop drill hum. */
export function stopDrill() {
  if (!_drillNodes) return;
  try {
    const c = ctx();
    _drillNodes.g.gain.setTargetAtTime(0, c.currentTime, 0.25);
    const n = _drillNodes; _drillNodes = null;
    setTimeout(() => { try { n.osc.stop(); } catch {} }, 900);
  } catch {}
}
