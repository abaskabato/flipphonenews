// Synthesized clamshell "snap" — a short noise transient + a low thunk.
// No audio files needed; built with the Web Audio API on first user gesture.

let ctx = null;

function ensure() {
    if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
}

function noiseBurst(ac, when, dur, gainPeak, hp) {
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filt = ac.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = hp;
    const g = ac.createGain();
    g.gain.setValueAtTime(gainPeak, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filt).connect(g).connect(ac.destination);
    src.start(when);
    src.stop(when + dur);
}

function thunk(ac, when, freq, dur, gainPeak) {
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, when + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gainPeak, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(when);
    osc.stop(when + dur);
}

// `open` true => opening flick + click; false => closing snap (heavier)
export function playFlip(open) {
    const ac = ensure();
    if (!ac) return;
    const t = ac.currentTime;
    if (open) {
        noiseBurst(ac, t, 0.05, 0.25, 1800);
        thunk(ac, t + 0.16, 320, 0.06, 0.18);   // latch click at end of swing
    } else {
        thunk(ac, t, 180, 0.09, 0.32);          // body meeting body
        noiseBurst(ac, t + 0.005, 0.04, 0.3, 1200);
    }
}
