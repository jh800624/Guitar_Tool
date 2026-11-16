import { DURATIONS } from '../../music/tab-model.js';

export function createBeatTimeline({ measures, tuning, bpm, fromMeasure = 0, startTime = 0 }) {
  const secondsPerBeat = 60 / bpm;
  const timeline = [];
  let time = startTime;
  for (let measureIndex = fromMeasure; measureIndex < measures.length; measureIndex += 1) {
    for (let beatIndex = 0; beatIndex < measures[measureIndex].beats.length; beatIndex += 1) {
      const beat = measures[measureIndex].beats[beatIndex];
      const duration = (DURATIONS[beat.duration] ?? 1) * secondsPerBeat;
      const notes = !beat.isRest && beat.technique !== 'mute'
        ? beat.strings.map((note) => tuning[note.string - 1] + note.fret).filter(Number.isFinite) : [];
      timeline.push({ time, duration, measureIndex, beatIndex, notes });
      time += duration;
    }
  }
  return { events: timeline, endTime: time };
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
