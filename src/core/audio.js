import { midiToFrequency } from '../music/theory.js';

let context = null;
export function audioContext() {
  context ??= new (window.AudioContext || window.webkitAudioContext)();
  return context;
}
export function pluck(midi, start = audioContext().currentTime, duration = 1, { technique = null } = {}) {
  const ctx = audioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const frequency = midiToFrequency(midi);
  oscillator.frequency.setValueAtTime(frequency, start);
  if (technique === 'bend') oscillator.frequency.linearRampToValueAtTime(midiToFrequency(midi + 2), start + Math.min(duration * .7, .45));
  if (technique === 'release') oscillator.frequency.setValueAtTime(midiToFrequency(midi + 2), start), oscillator.frequency.linearRampToValueAtTime(frequency, start + Math.min(duration * .7, .45));
  if (technique === 'vibrato') {
    for (let point = .1; point < Math.min(duration, 1); point += .1) oscillator.frequency.linearRampToValueAtTime(midiToFrequency(midi + (Math.round(point * 10) % 2 ? .22 : -.22)), start + point);
  }
  oscillator.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, 1, .5, .25, .1]), new Float32Array(5)));
  gain.gain.setValueAtTime(.001, start);
  gain.gain.exponentialRampToValueAtTime(.55, start + .01);
  gain.gain.exponentialRampToValueAtTime(.001, start + Math.min(duration * .9, 2.5));
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start); oscillator.stop(start + Math.min(duration, 3));
  return oscillator;
}

export function metronomeClick(accent = false, start = audioContext().currentTime) {
  const ctx = audioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(accent ? 1320 : 880, start);
  gain.gain.setValueAtTime(.001, start);
  gain.gain.exponentialRampToValueAtTime(accent ? .16 : .09, start + .002);
  gain.gain.exponentialRampToValueAtTime(.001, start + .045);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start); oscillator.stop(start + .05);
  return oscillator;
}
