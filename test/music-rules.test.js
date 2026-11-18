import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseChord, noteName } from '../src/music/theory.js';
import { beatDuration, canSetDuration, measureCapacity, measureDuration, validateTabDocument } from '../src/music/tab-model.js';
import { activeTrack, addTrack, createScoreDocument, migrateStoredTab, setActiveTrack, validateScoreDocument, voiceBeats } from '../src/music/score-document.js';
import { createCommandHistory } from '../src/core/command-history.js';
import { createDebouncedWriter } from '../src/core/debounced-writer.js';
import { createBeatTimeline, createMeasureSequence, createMetronomeTimeline, createPlaybackMix } from '../src/features/tab/playback.js';
import { createScoreRenderer } from '../src/features/tab/score-renderer.js';
import { parseAsciiTab, serializeAsciiTab } from '../src/features/tab/ascii-tab.js';
import { createMidiFile, parseMidiFile, parseMusicXml, serializeMusicXml } from '../src/features/tab/interchange.js';

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

test('playback timeline observes tempo, rests, mutes and string tuning', () => {
  const { events, endTime } = createBeatTimeline({
    measures: [{ beats: [
      { duration: 'q', strings: [{ string: 1, fret: 3 }], isRest: false },
      { duration: '8', strings: [{ string: 6, fret: 0 }], isRest: false, technique: 'mute' },
      { duration: 'q', strings: [], isRest: true },
    ] }], tuning: [64, 59, 55, 50, 45, 40], bpm: 120,
  });
  assert.deepEqual(events.map((event) => event.notes), [[67], [], []]);
  assert.equal(events[1].time, .5);
  assert.equal(endTime, 1.25);
});

test('guitar articulations alter playback pitch and sustain without changing score time', () => {
  const { events } = createBeatTimeline({ measures: [{ beats: [
    { duration: 'q', technique: 'harmonic', strings: [{ string: 1, fret: 0 }] },
    { duration: 'q', effects: ['palm_mute'], strings: [{ string: 1, fret: 0 }] },
    { duration: 'q', effects: ['let_ring'], strings: [{ string: 1, fret: 0 }] },
  ] }], tuning: [64], bpm: 120 });
  assert.equal(events[0].notes[0], 76);
  assert.equal(events[1].duration, .5);
  assert.equal(events[1].soundDuration, .18);
  assert.equal(events[2].soundDuration, 1.5);
});

test('dotted and tuplet notes share timing rules across the score and playback', () => {
  const dottedQuarter = { duration: 'q', dots: 1 };
  const tripletQuarter = { duration: 'q', tuplet: { actual: 3, normal: 2 } };
  assert.equal(beatDuration(dottedQuarter), 1.5);
  assert.ok(Math.abs(beatDuration(tripletQuarter) - (2 / 3)) < 0.0001);
  assert.ok(Math.abs(measureDuration({ beats: [dottedQuarter, tripletQuarter] }) - (13 / 6)) < 0.0001);
  const { events, endTime } = createBeatTimeline({
    measures: [{ beats: [dottedQuarter, tripletQuarter] }], tuning: [64, 59, 55, 50, 45, 40], bpm: 120,
  });
  assert.equal(events[1].time, .75);
  assert.ok(Math.abs(endTime - (13 / 12)) < 0.0001);
});

test('playback honours per-measure tempo events and repeat endings', () => {
  const measures = [
    { repeatStart: true, beats: [{ duration: 'q', strings: [] }] },
    { repeatEnd: 2, tempoEvents: [{ beat: 0, bpm: 60 }], beats: [{ duration: 'q', strings: [] }] },
    { beats: [{ duration: 'q', strings: [] }] },
  ];
  assert.deepEqual(createMeasureSequence(measures), [0, 1, 0, 1, 2]);
  const { events, endTime } = createBeatTimeline({ measures, tuning: [64, 59, 55, 50, 45, 40], bpm: 120 });
  assert.deepEqual(events.map((event) => event.bpm), [120, 60, 60, 60, 60]);
  assert.ok(Math.abs(endTime - 4.5) < 0.0001);
});

test('practice loop limits playback to its range and produces accented metronome beats', () => {
  const measures = [
    { timeSig: '4/4', beats: [{ duration: 'q', strings: [] }] },
    { timeSig: '3/4', beats: [{ duration: 'q', strings: [] }, { duration: 'q', strings: [] }, { duration: 'q', strings: [] }] },
    { timeSig: '4/4', beats: [{ duration: 'q', strings: [] }] },
  ];
  const result = createBeatTimeline({ measures, tuning: [64], bpm: 120, fromMeasure: 1, toMeasure: 1, loopCount: 2 });
  assert.deepEqual(result.events.map((event) => event.measureIndex), [1, 1, 1, 1, 1, 1]);
  const clicks = createMetronomeTimeline(result.measureStarts);
  assert.equal(clicks.length, 6);
  assert.deepEqual(clicks.filter((event) => event.accent).map((event) => event.time), [.0, 1.5]);
});

test('playback mix schedules only the tracks selected by solo and mute filtering', () => {
  const source = (fret) => ({ measures: [{ timeSig: '4/4', beats: [{ duration: 'q', strings: [{ string: 1, fret }] }] }], tuning: [64] });
  const mix = createPlaybackMix({ parts: [{ id: 'rhythm', ...source(0) }, { id: 'lead', ...source(7) }], bpm: 120, primaryPartId: 'lead' });
  assert.deepEqual(mix.events.map((event) => event.partId), ['rhythm', 'lead']);
  assert.deepEqual(mix.events.map((event) => event.notes[0]), [64, 71]);
  const soloMix = createPlaybackMix({ parts: [{ id: 'lead', ...source(7) }], bpm: 120, primaryPartId: 'lead' });
  assert.deepEqual(soloMix.events.map((event) => event.partId), ['lead']);
});

test('ASCII TAB export and import preserve frets, chords and measure boundaries', () => {
  const text = serializeAsciiTab({ title: 'Lesson', measures: [{ timeSig: '4/4', beats: [
    { strings: [{ string: 1, fret: 3 }, { string: 2, fret: 12 }] }, { strings: [{ string: 6, fret: 0 }] },
  ] }] });
  const imported = parseAsciiTab(text);
  assert.equal(imported.measures.length, 1);
  assert.deepEqual(imported.measures[0].beats[0].strings, [{ string: 1, fret: 3 }, { string: 2, fret: 12 }]);
  assert.deepEqual(imported.measures[0].beats[1].strings, [{ string: 6, fret: 0 }]);
});

test('MIDI and MusicXML exports retain tempo, guitar string and fret data', () => {
  const measures = [{ timeSig: '4/4', tempoEvents: [{ beat: 0, bpm: 90 }], beats: [{ duration: 'q', strings: [{ string: 1, fret: 3 }] }] }];
  const midi = createMidiFile({ measures, tuning: [64], bpm: 120 });
  assert.deepEqual([...midi.slice(0, 4)], [77, 84, 104, 100]);
  assert.ok([...midi].includes(67));
  const xml = serializeMusicXml({ title: 'A & B', measures, tuning: [64], bpm: 120 });
  assert.match(xml, /work-title>A &amp; B/);
  assert.match(xml, /<string>1<\/string><fret>3<\/fret>/);
  assert.match(xml, /per-minute>90/);
  const importedXml = parseMusicXml(xml, [64, 59, 55, 50, 45, 40]);
  assert.equal(importedXml.measures[0].beats[0].strings[0].fret, 3);
  const importedMidi = parseMidiFile(midi, [64, 59, 55, 50, 45, 40]);
  assert.equal(importedMidi.measures[0].beats[0].strings[0].fret, 3);
});

test('renderer layout wraps measures and records their line index without a browser', () => {
  const renderer = createScoreRenderer({ vf: {}, buildNotes: () => [], calcStaveWidth: () => 80,
    options: { maxWidth: 180, lineHeight: 100, clefWidth: 0, marginWidth: 0, measuresPerLine: 2 } });
  const result = renderer.layout([{ beats: [] }, { beats: [] }, { beats: [] }]);
  assert.deepEqual(result.lines, [[0, 1], [2]]);
  assert.equal(result.measureLineIndex[2], 1);
});

test('score document switches active tracks without sharing measures', () => {
  const score = createScoreDocument();
  const first = activeTrack(score);
  const second = addTrack(score, { name: 'Lead Guitar' });
  second.measures[0].beats[0].strings.push({ string: 1, fret: 7 });
  setActiveTrack(score, first.id);
  assert.equal(activeTrack(score).name, 'Guitar');
  assert.equal(activeTrack(score).measures[0].beats[0].strings.length, 0);
  setActiveTrack(score, second.id);
  assert.equal(activeTrack(score).measures[0].beats[0].strings[0].fret, 7);
  assert.equal(activeTrack(score).muted, false);
  assert.equal(activeTrack(score).measures.length, 24);
});

test('a measure cannot exceed its time signature', () => {
  const measure = { timeSig: '3/4', beats: [{ duration: 'h' }, { duration: 'q' }] };
  assert.equal(measureCapacity('6/8'), 3);
  assert.equal(canSetDuration(measure, measure.beats[1], 'h'), false);
  assert.equal(validateTabDocument({ measures: [measure] }), true);
  assert.equal(canSetDuration({ timeSig: '4/4', beats: [{ duration: 'h' }, { duration: 'q' }] }, { duration: 'q' }, { duration: 'q', dots: 1 }), false);
});
