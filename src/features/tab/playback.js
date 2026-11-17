import { beatDuration, measureCapacity } from '../../music/tab-model.js';

export function createBeatTimeline({ measures, tuning, bpm, fromMeasure = 0, toMeasure = measures.length - 1, loopCount = 1, startTime = 0 }) {
  const timeline = [];
  const measureStarts = [];
  let time = startTime;
  let currentTempo = bpm;
  const sequence = createMeasureSequence(measures, fromMeasure, toMeasure);
  const repetitions = Math.max(1, Math.min(16, Number(loopCount) || 1));
  for (let loopIndex = 0; loopIndex < repetitions; loopIndex += 1) for (const measureIndex of sequence) {
    const measure = measures[measureIndex];
    const measureStart = time;
    let measureTempo = currentTempo;
    for (let beatIndex = 0; beatIndex < measure.beats.length; beatIndex += 1) {
      const beat = measure.beats[beatIndex];
      const tempoEvent = measure.tempoEvents?.find((event) => event.beat === beatIndex && Number.isFinite(event.bpm));
      if (tempoEvent) currentTempo = tempoEvent.bpm;
      if (beatIndex === 0) measureTempo = currentTempo;
      const duration = beatDuration(beat) * (60 / currentTempo);
      const effects = beat.effects ?? [];
      const notes = !beat.isRest && beat.technique !== 'mute' && !effects.includes('dead_note')
        ? (beat.strings ?? []).map((note) => tuning[note.string - 1] + note.fret + (beat.technique === 'harmonic' ? 12 : 0)).filter(Number.isFinite) : [];
      const soundDuration = effects.includes('palm_mute') ? Math.min(duration * .45, .18)
        : effects.includes('let_ring') ? Math.min(duration * 3, 3) : duration;
      timeline.push({ time, duration, soundDuration, measureIndex, beatIndex, bpm: currentTempo, technique: beat.technique, effects, notes });
      time += duration;
    }
    measureStarts.push({ time: measureStart, measureIndex, bpm: measureTempo, timeSig: measure.timeSig });
  }
  return { events: timeline, measureStarts, endTime: time };
}

export function createMeasureSequence(measures, fromMeasure = 0, toMeasure = measures.length - 1) {
  const sequence = [];
  const endVisits = new Map();
  let index = Math.max(0, Math.min(fromMeasure, Math.max(0, measures.length - 1)));
  const lastMeasure = Math.max(index, Math.min(toMeasure, measures.length - 1));
  let repeatStart = index;
  let safety = 0;
  while (index <= lastMeasure && safety < measures.length * 16) {
    safety += 1;
    const measure = measures[index];
    if (measure.repeatStart) repeatStart = index;
    sequence.push(index);
    const repetitions = Math.max(0, Number(measure.repeatEnd) || 0);
    const previousVisits = endVisits.get(index) ?? 0;
    if (repetitions > 1 && previousVisits < repetitions - 1) {
      endVisits.set(index, previousVisits + 1);
      index = repeatStart;
    } else {
      if (repetitions > 0) repeatStart = index + 1;
      index += 1;
    }
  }
  return sequence;
}

export function createMetronomeTimeline(measureStarts) {
  return measureStarts.flatMap(({ time, bpm, timeSig }) => {
    const beats = Math.max(1, Math.round(measureCapacity(timeSig)));
    const secondsPerBeat = 60 / bpm;
    return Array.from({ length: beats }, (_, beat) => ({ time: time + beat * secondsPerBeat, accent: beat === 0 }));
  });
}

export function createTabPlayback({ getContext, pluck, metronomeClick = () => null, onState = () => {}, onBeat = () => {} }) {
  let playing = false;
  let animationFrame = null;
  let scheduledNodes = [];

  const stop = (reason = 'stopped') => {
    playing = false;
    scheduledNodes.forEach((node) => { try { node.stop(); } catch {} });
    scheduledNodes = [];
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    onState({ playing: false, reason });
  };

  const start = async ({ measures, tuning, bpm, fromMeasure, toMeasure, loopCount, metronome = false }) => {
    if (playing) stop('restarted');
    const context = getContext();
    if (context.state === 'suspended') await context.resume();
    const startMeasure = Math.min(measures.length - 1, Math.max(0, fromMeasure));
    const { events, measureStarts, endTime } = createBeatTimeline({
      measures, tuning, bpm, fromMeasure: startMeasure, toMeasure, loopCount, startTime: context.currentTime + .05,
    });
    if (!events.length) return;
    playing = true;
    onState({ playing: true, reason: 'started', fromMeasure: startMeasure });
    events.forEach((event) => event.notes.forEach((midi) => scheduledNodes.push(pluck(midi, event.time, event.soundDuration, { technique: event.technique, effects: event.effects }))));
    if (metronome) createMetronomeTimeline(measureStarts).forEach((event) => {
      const node = metronomeClick(event.accent, event.time); if (node) scheduledNodes.push(node);
    });

    const sync = () => {
      if (!playing) return;
      const now = context.currentTime;
      if (now >= endTime) { stop('finished'); return; }
      let current = events[0];
      for (const event of events) { if (event.time <= now) current = event; else break; }
      onBeat(current);
      animationFrame = requestAnimationFrame(sync);
    };
    animationFrame = requestAnimationFrame(sync);
  };

  return { start, stop, get isPlaying() { return playing; } };
}
