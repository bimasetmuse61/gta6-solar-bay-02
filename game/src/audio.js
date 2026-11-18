// audio.js — every sound in Solar Bay is synthesised with WebAudio: short
// oscillator-and-noise blips for shots, crashes and pickups, a two-tone siren
// while the police are interested, and a low engine hum pitched by speed.
// Nothing is loaded from a file. All entry points are safe to call before the
// first user gesture (they no-op until ensure() has run inside one).

export function createAudio() {
  let ctx = null;
  let master = null;
  let sirenNodes = null;
  let engineNodes = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** One enveloped tone; type and glide are optional. */
  function tone(freq, seconds, type = 'square', volume = 0.2, glideTo = null, delay = 0) {
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  /** A burst of filtered noise, for shots and impacts. */
  function noise(seconds, volume = 0.3, cutoff = 1200, delay = 0) {
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
  }

  return {
    ensure,
    shot() {
      noise(0.09, 0.25, 2600);
      tone(160, 0.07, 'square', 0.12, 60);
    },
    crash(strength = 1) {
      noise(0.18, Math.min(0.5, 0.15 + strength * 0.2), 700);
      tone(90, 0.16, 'triangle', 0.2, 40);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.2);
      tone(990, 0.14, 'sine', 0.2, null, 0.07);
    },
    cash() {
      tone(880, 0.07, 'triangle', 0.18);
      tone(1174, 0.07, 'triangle', 0.18, null, 0.06);
      tone(1568, 0.16, 'triangle', 0.18, null, 0.12);
    },
    ui() {
      tone(520, 0.05, 'sine', 0.12);
    },
    door() {
      tone(220, 0.06, 'triangle', 0.15, 140);
    },
    busted() {
      tone(392, 0.22, 'sawtooth', 0.16);
      tone(311, 0.22, 'sawtooth', 0.16, null, 0.2);
      tone(233, 0.45, 'sawtooth', 0.16, null, 0.4);
    },
    wasted() {
      tone(330, 0.3, 'triangle', 0.2, 110);
      tone(196, 0.6, 'triangle', 0.18, 65, 0.25);
    },
    missionDone() {
      tone(523, 0.12, 'triangle', 0.2);
      tone(659, 0.12, 'triangle', 0.2, null, 0.1);
      tone(784, 0.12, 'triangle', 0.2, null, 0.2);
      tone(1046, 0.3, 'triangle', 0.22, null, 0.3);
    },
    /** Start or stop the looping two-tone siren. */
    setSiren(on) {
      if (!ctx) return;
      if (on && !sirenNodes) {
        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 800;
        lfo.frequency.value = 0.7;
        lfoGain.gain.value = 160;
        lfo.connect(lfoGain).connect(osc.frequency);
        gain.gain.value = 0.045;
        osc.connect(gain).connect(master);
        osc.start();
        lfo.start();
        sirenNodes = { osc, lfo, gain };
      } else if (!on && sirenNodes) {
        try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
        sirenNodes = null;
      }
    },
    /** Feed the engine hum: speedRatio 0..1, or null to switch it off. */
    setEngine(speedRatio) {
      if (!ctx) return;
      if (speedRatio === null) {
        if (engineNodes) {
          try { engineNodes.osc.stop(); engineNodes.sub.stop(); } catch { /* already stopped */ }
          engineNodes = null;
        }
        return;
      }
      if (!engineNodes) {
        const osc = ctx.createOscillator();
        const sub = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        sub.type = 'sine';
        gain.gain.value = 0.0;
        osc.connect(gain);
        sub.connect(gain);
        gain.connect(master);
        osc.start();
        sub.start();
        engineNodes = { osc, sub, gain };
      }
      const base = 55 + speedRatio * 130;
      engineNodes.osc.frequency.value = base;
      engineNodes.sub.frequency.value = base / 2;
      engineNodes.gain.gain.value = 0.03 + speedRatio * 0.05;
    },
  };
}
