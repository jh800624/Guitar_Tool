import { beatDuration } from '../../music/tab-model.js';

export function createBeatTimeline({ measures, tuning, bpm, fromMeasure = 0, startTime = 0 }) {
  const timeline = [];
  let time = startTime;
  let currentTempo = bpm;
  for (const measureIndex of createMeasureSequence(measures, fromMeasure)) {
    const measure = measures[measureIndex];
    for (let beatIndex = 0; beatIndex < measure.beats.length; beatIndex += 1) {
      const beat = measure.beats[beatIndex];
      const tempoEvent = measure.tempoEvents?.find((event) => event.beat === beatIndex && Number.isFinite(event.bpm));
      if (tempoEvent) currentTempo = tempoEvent.bpm;
      const duration = beatDuration(beat) * (60 / currentTempo);
      const notes = !beat.isRest && beat.technique !== 'mute'
        ? (beat.strings ?? []).map((note) => tuning[note.string - 1] + note.fret).filter(Number.isFinite) : [];
      timeline.push({ time, duration, measureIndex, beatIndex, bpm: currentTempo, notes });
      time += duration;
    }
  }
  return { events: timeline, endTime: time };
}

export function createMeasureSequence(measures, fromMeasure = 0) {
  const sequence = [];
  const endVisits = new Map();
  let index = Math.max(0, Math.min(fromMeasure, Math.max(0, measures.length - 1)));
  let repeatStart = index;
  let safety = 0;
  while (index < measures.length && safety < measures.length * 16) {
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

export function createTabPlayback({ getContext, pluck, onState = () => {}, onBeat = () => {} }) {
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

  const start = async ({ measures, tuning, bpm, fromMeasure }) => {
    if (playing) stop('restarted');
    const context = getContext();
    if (context.state === 'suspended') await context.resume();
    const startMeasure = Math.min(measures.length - 1, Math.max(0, fromMeasure));
    const { events, endTime } = createBeatTimeline({
      measures, tuning, bpm, fromMeasure: startMeasure, startTime: context.currentTime + .05,
    });
    if (!events.length) return;
    playing = true;
    onState({ playing: true, reason: 'started', fromMeasure: startMeasure });
    events.forEach((event) => event.notes.forEach((midi) => scheduledNodes.push(pluck(midi, event.time, event.duration))));

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
