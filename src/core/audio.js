import { midiToFrequency } from '../music/theory.js';

let context = null;
export function audioContext() {
  context ??= new (window.AudioContext || window.webkitAudioContext)();
  return context;
}
export function pluck(midi, start = audioContext().currentTime, duration = 1) {
  const ctx = audioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.frequency.setValueAtTime(midiToFrequency(midi), start);
  oscillator.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, 1, .5, .25, .1]), new Float32Array(5)));
  gain.gain.setValueAtTime(.001, start);
  gain.gain.exponentialRampToValueAtTime(.55, start + .01);
  gain.gain.exponentialRampToValueAtTime(.001, start + Math.min(duration * .9, 2.5));
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start); oscillator.stop(start + Math.min(duration, 3));
  return oscillator;
}
