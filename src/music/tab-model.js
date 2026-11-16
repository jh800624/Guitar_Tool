export const DURATIONS = Object.freeze({ w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25 });
export const TIME_SIGNATURES = new Set(['4/4', '3/4', '6/8']);

export function measureCapacity(timeSignature) {
  const [beats, denominator] = timeSignature.split('/').map(Number);
  return (beats / denominator) * 4;
}

export function measureDuration(measure, exceptBeat = null) {
  return measure.beats.reduce((total, beat) => total + (beat === exceptBeat ? 0 : DURATIONS[beat.duration]), 0);
}

export function canSetDuration(measure, beat, duration) {
  return measureDuration(measure, beat) + DURATIONS[duration] <= measureCapacity(measure.timeSig) + 0.001;
}

export function nextFittingDuration(remaining) {
  return ['w', 'h', 'q', '8', '16'].find((duration) => DURATIONS[duration] <= remaining + 0.001) ?? null;
}

export function validateTabDocument(document) {
  if (!document || !Array.isArray(document.measures) || !document.measures.length) return false;
  return document.measures.every((measure) => TIME_SIGNATURES.has(measure.timeSig)
    && Array.isArray(measure.beats) && measure.beats.length
    && measureDuration(measure) <= measureCapacity(measure.timeSig) + 0.001);
}
