import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseChord, noteName } from '../src/music/theory.js';
import { canSetDuration, measureCapacity, validateTabDocument } from '../src/music/tab-model.js';

test('C, E, G is recognised as C major', () => {
  assert.equal(analyseChord([0, 4, 7], 'C', 0).label, 'Cmaj');
  assert.equal(noteName(10, 'Bb'), 'Bb');
});

test('a measure cannot exceed its time signature', () => {
  const measure = { timeSig: '3/4', beats: [{ duration: 'h' }, { duration: 'q' }] };
  assert.equal(measureCapacity('6/8'), 3);
  assert.equal(canSetDuration(measure, measure.beats[1], 'h'), false);
  assert.equal(validateTabDocument({ measures: [measure] }), true);
});
