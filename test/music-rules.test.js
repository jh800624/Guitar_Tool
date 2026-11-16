import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseChord, noteName } from '../src/music/theory.js';
import { canSetDuration, measureCapacity, validateTabDocument } from '../src/music/tab-model.js';
import { createScoreDocument, migrateStoredTab, validateScoreDocument, voiceBeats } from '../src/music/score-document.js';
import { createCommandHistory } from '../src/core/command-history.js';
import { createDebouncedWriter } from '../src/core/debounced-writer.js';

test('C, E, G is recognised as C major', () => {
  assert.equal(analyseChord([0, 4, 7], 'C', 0).label, 'Cmaj');
  assert.equal(noteName(10, 'Bb'), 'Bb');
});

test('legacy tab storage migrates to a multi-track score document without losing beats', () => {
  const score = migrateStoredTab({ title: 'Lesson', measures: [{ timeSig: '4/4', beats: [{ duration: 'q', strings: [{ string: 1, fret: 3 }] }] }] });
  assert.equal(validateScoreDocument(score), true);
  assert.equal(score.metadata.title, 'Lesson');
  assert.equal(voiceBeats(score.tracks[0].measures[0])[0].strings[0].fret, 3);
  assert.equal(createScoreDocument().tracks[0].tuning.length, 6);
});

test('command history replays only the requested edit', () => {
  let value = 1;
  const history = createCommandHistory();
  history.push({ undo: () => { value = 1; }, redo: () => { value = 2; } });
  value = 2;
  assert.equal(history.undo(), true);
  assert.equal(value, 1);
  assert.equal(history.redo(), true);
  assert.equal(value, 2);
});

test('debounced persistence combines rapid edits into one write', async () => {
  let writes = 0;
  const writer = createDebouncedWriter(() => { writes += 1; }, { delay: 5 });
  writer.schedule(); writer.schedule(); writer.schedule();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(writes, 1);
});

test('a measure cannot exceed its time signature', () => {
  const measure = { timeSig: '3/4', beats: [{ duration: 'h' }, { duration: 'q' }] };
  assert.equal(measureCapacity('6/8'), 3);
  assert.equal(canSetDuration(measure, measure.beats[1], 'h'), false);
  assert.equal(validateTabDocument({ measures: [measure] }), true);
});
