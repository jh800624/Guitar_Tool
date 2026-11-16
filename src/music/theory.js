export const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const SCALES = Object.freeze({
  major: [0, 2, 4, 5, 7, 9, 11],
  natural_minor: [0, 2, 3, 5, 7, 8, 10],
  penta_major: [0, 2, 4, 7, 9],
  penta_minor: [0, 3, 5, 7, 10],
});

export const CHORD_TEMPLATES = Object.freeze([
  { quality: '5', intervals: [0, 7] }, { quality: 'maj', intervals: [0, 4, 7] },
  { quality: 'm', intervals: [0, 3, 7] }, { quality: 'aug', intervals: [0, 4, 8] },
  { quality: 'dim', intervals: [0, 3, 6] }, { quality: 'sus2', intervals: [0, 2, 7] },
  { quality: 'sus4', intervals: [0, 5, 7] }, { quality: '7', intervals: [0, 4, 7, 10] },
  { quality: 'maj7', intervals: [0, 4, 7, 11] }, { quality: 'm7', intervals: [0, 3, 7, 10] },
  { quality: 'm7b5', intervals: [0, 3, 6, 10] }, { quality: 'dim7', intervals: [0, 3, 6, 9] },
  { quality: '6', intervals: [0, 4, 7, 9] }, { quality: 'min6', intervals: [0, 3, 7, 9] },
  { quality: 'add9', intervals: [0, 4, 7, 14] }, { quality: 'maj6/9', intervals: [0, 4, 7, 9, 14] },
  { quality: '9', intervals: [0, 4, 7, 10, 14] }, { quality: 'maj9', intervals: [0, 4, 7, 11, 14] },
  { quality: 'min9', intervals: [0, 3, 7, 10, 14] }, { quality: '11', intervals: [0, 4, 7, 10, 14, 17] },
  { quality: '13', intervals: [0, 4, 7, 10, 14, 21] },
]);

export const norm = (value) => ((value % 12) + 12) % 12;
export const midiToFrequency = (midi) => 440 * (2 ** ((midi - 69) / 12));

export function noteName(pitchClass, key = 'C') {
  const flatKeys = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
  return (flatKeys.has(key) ? NOTES_FLAT : NOTES_SHARP)[norm(pitchClass)];
}

export function analyseChord(pitchClasses, key, bassPitchClass = null) {
  const selected = new Set(pitchClasses.map(norm));
  if (selected.size < 2) return null;
  let best = null;
  for (let root = 0; root < 12; root += 1) {
    for (const template of CHORD_TEMPLATES) {
      const tones = new Set(template.intervals.map((interval) => norm(root + interval)));
      const intersection = [...selected].filter((pc) => tones.has(pc)).length;
      let score = (tones.size - intersection) * 10 + (selected.size - intersection) * 3 - intersection * 0.1;
      if (bassPitchClass !== null) score += root === bassPitchClass ? -6 : tones.has(bassPitchClass) ? 2 : 6;
      if (!best || score < best.score) {
        const bass = bassPitchClass !== null && tones.has(bassPitchClass) && bassPitchClass !== root
          ? `/${noteName(bassPitchClass, key)}` : '';
        best = { root, template, score, label: `${noteName(root, key)}${template.quality}${bass}`, tones };
      }
    }
  }
  return best;
}
