import { DURATIONS, TIME_SIGNATURES, measureCapacity, measureDuration } from './tab-model.js';

export const SCORE_SCHEMA_VERSION = 2;
export const STANDARD_GUITAR_TUNING = [64, 59, 55, 50, 45, 40];

export function createBeat(duration = 'q') {
  return { duration, strings: [], technique: null, isRest: false };
}

export function createMeasure(timeSig = '4/4') {
  return { timeSig, voices: [{ beats: [createBeat()] }] };
}

export function voiceBeats(measure, voiceIndex = 0) {
  measure.voices ??= [{ beats: measure.beats ?? [createBeat()] }];
  measure.beats = measure.voices[voiceIndex].beats;
  return measure.voices[voiceIndex].beats;
}

export function createTrack({ name = 'Guitar', tuning = STANDARD_GUITAR_TUNING, measures = [createMeasure()] } = {}) {
  const normalizedMeasures = measures.map(normalizeMeasure);
  return { id: crypto.randomUUID(), name, instrument: 'guitar', tuning: [...tuning], measures: normalizedMeasures };
}

export function createScoreDocument({ title = 'Untitled', artist = '', bpm = 120, measures } = {}) {
  return {
    schemaVersion: SCORE_SCHEMA_VERSION,
    metadata: { title, artist, bpm },
    tracks: [createTrack({ measures: measures?.length ? measures : [createMeasure()] })],
    activeTrackId: null,
  };
}

export function activeTrack(score) {
  return score.tracks.find((track) => track.id === score.activeTrackId) ?? score.tracks[0];
}

export function replaceActiveMeasures(score, measures) {
  activeTrack(score).measures = measures.map(normalizeMeasure);
  return activeTrack(score).measures;
}

export function cloneScore(score) {
  return JSON.parse(JSON.stringify(score));
}

export function migrateStoredTab(saved) {
  if (saved?.schemaVersion === SCORE_SCHEMA_VERSION && saved.score && validateScoreDocument(saved.score)) return cloneScore(saved.score);
  const score = createScoreDocument({ title: saved?.title, artist: saved?.artist, bpm: saved?.bpm, measures: saved?.measures });
  return score;
}

export function validateScoreDocument(score) {
  return score?.schemaVersion === SCORE_SCHEMA_VERSION && Array.isArray(score.tracks) && score.tracks.length > 0
    && score.tracks.every((track) => Array.isArray(track.tuning) && track.tuning.length >= 3 && track.tuning.length <= 10
      && Array.isArray(track.measures) && track.measures.length > 0 && track.measures.every(isValidMeasure));
}

function normalizeMeasure(measure) {
  const timeSig = TIME_SIGNATURES.has(measure?.timeSig) ? measure.timeSig : '4/4';
  const sourceVoices = measure?.voices ?? [{ beats: measure?.beats }];
  const voices = sourceVoices.slice(0, 4).map((voice) => ({ beats: normalizeBeats(voice?.beats, timeSig) }));
  const normalized = { timeSig, voices: voices.length ? voices : [{ beats: [createBeat()] }] };
  normalized.beats = normalized.voices[0].beats; // Compatibility bridge while the editor moves to explicit voices.
  return normalized;
}

function normalizeBeats(beats, timeSig) {
  const normalized = Array.isArray(beats) ? beats.filter((beat) => DURATIONS[beat?.duration]).map((beat) => ({
    duration: beat.duration,
    strings: Array.isArray(beat.strings) ? beat.strings.filter((note) => Number.isInteger(note.string) && note.string >= 1 && note.string <= 10
      && Number.isInteger(note.fret) && note.fret >= 0 && note.fret <= 24) : [],
    technique: typeof beat.technique === 'string' ? beat.technique : null,
    isRest: Boolean(beat.isRest),
  })) : [];
  const capacity = measureCapacity(timeSig);
  const withinCapacity = [];
  normalized.forEach((beat) => { if (measureDuration({ beats: withinCapacity }) + DURATIONS[beat.duration] <= capacity + .001) withinCapacity.push(beat); });
  return withinCapacity.length ? withinCapacity : [createBeat()];
}

function isValidMeasure(measure) {
  return TIME_SIGNATURES.has(measure.timeSig) && Array.isArray(measure.voices) && measure.voices.length > 0
    && measure.voices.every((voice) => Array.isArray(voice.beats) && voice.beats.length > 0
      && measureDuration({ beats: voice.beats }) <= measureCapacity(measure.timeSig) + .001);
}
