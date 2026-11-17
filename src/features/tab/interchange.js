import { beatDuration, measureCapacity } from '../../music/tab-model.js';

const PPQ = 480;
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function beatsOf(measure) { return measure.voices?.[0]?.beats ?? measure.beats ?? []; }
function clampMidi(midi) { return Math.max(0, Math.min(127, midi)); }
function variableLength(value) {
  const bytes = [value & 0x7f];
  for (let remaining = value >> 7; remaining; remaining >>= 7) bytes.unshift((remaining & 0x7f) | 0x80);
  return bytes;
}
function chunk(id, data) {
  const size = data.length;
  return [...id].map((letter) => letter.charCodeAt(0)).concat([(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255], data);
}
function xmlEscape(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char])); }
function midiPitch(midi) {
  const name = SHARP_NAMES[((midi % 12) + 12) % 12];
  return { step: name[0], alter: name.length === 2 ? 1 : null, octave: Math.floor(midi / 12) - 1 };
}

export function createMidiFile({ measures, tuning, bpm = 120 }) {
  const events = [{ tick: 0, priority: 0, data: [0xff, 0x51, 0x03, ...tempoBytes(bpm)] }];
  let tick = 0;
  measures.forEach((measure) => {
    beatsOf(measure).forEach((beat, beatIndex) => {
      const tempo = measure.tempoEvents?.find((event) => event.beat === beatIndex);
      if (tempo) events.push({ tick, priority: 0, data: [0xff, 0x51, 0x03, ...tempoBytes(tempo.bpm)] });
      const duration = Math.max(1, Math.round(beatDuration(beat) * PPQ));
      if (!beat.isRest && beat.technique !== 'mute' && !(beat.effects ?? []).includes('dead_note')) {
        (beat.strings ?? []).forEach((note) => {
          const midi = clampMidi(tuning[note.string - 1] + note.fret + (beat.technique === 'harmonic' ? 12 : 0));
          events.push({ tick, priority: 2, data: [0x90, midi, 88] });
          events.push({ tick: tick + ((beat.effects ?? []).includes('palm_mute') ? Math.min(duration, 90) : duration), priority: 1, data: [0x80, midi, 0] });
        });
      }
      tick += duration;
    });
  });
  events.sort((left, right) => left.tick - right.tick || left.priority - right.priority);
  let previousTick = 0;
  const track = events.flatMap((event) => { const delta = event.tick - previousTick; previousTick = event.tick; return [...variableLength(delta), ...event.data]; });
  track.push(0x00, 0xff, 0x2f, 0x00);
  return new Uint8Array([...chunk('MThd', [0, 0, 0, 0, 0, 1, (PPQ >> 8) & 255, PPQ & 255]), ...chunk('MTrk', track)]);
}

export function serializeMusicXml({ title = 'Untitled', measures, tuning, bpm = 120 }) {
  let divisions = PPQ;
  const xmlMeasures = measures.map((measure, index) => {
    const [beats, beatType] = measure.timeSig.split('/');
    const attributes = index === 0 ? `<attributes><divisions>${divisions}</divisions><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><clef><sign>TAB</sign><line>5</line></clef></attributes>` : '';
    const tempo = measure.tempoEvents?.find((event) => event.beat === 0)?.bpm ?? (index === 0 ? bpm : null);
    const direction = tempo ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type><sound tempo="${tempo}"/></direction>` : '';
    const notes = beatsOf(measure).flatMap((beat) => {
      const duration = Math.max(1, Math.round(beatDuration(beat) * divisions));
      const stringNotes = !beat.isRest && beat.technique !== 'mute' ? beat.strings ?? [] : [];
      if (!stringNotes.length) return [`<note><rest/><duration>${duration}</duration><type>${musicXmlType(beat.duration)}</type></note>`];
      return stringNotes.map((note, noteIndex) => {
        const pitch = midiPitch(tuning[note.string - 1] + note.fret + (beat.technique === 'harmonic' ? 12 : 0));
        const technical = `<technical><string>${note.string}</string><fret>${note.fret}</fret>${beat.technique === 'harmonic' ? '<harmonic><natural/></harmonic>' : ''}</technical>`;
        const effects = (beat.effects ?? []).includes('palm_mute') ? '<other-technical>palm mute</other-technical>' : '';
        return `<note>${noteIndex ? '<chord/>' : ''}<pitch><step>${pitch.step}</step>${pitch.alter ? `<alter>${pitch.alter}</alter>` : ''}<octave>${pitch.octave}</octave></pitch><duration>${duration}</duration><type>${musicXmlType(beat.duration)}</type><notations>${technical}${effects}</notations></note>`;
      });
    }).join('');
    return `<measure number="${index + 1}">${attributes}${direction}${measure.repeatStart ? '<barline location="left"><repeat direction="forward"/></barline>' : ''}${notes}${measure.repeatEnd ? `<barline location="right"><repeat direction="backward" times="${measure.repeatEnd}"/></barline>` : ''}</measure>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?><score-partwise version="4.0"><work><work-title>${xmlEscape(title)}</work-title></work><part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list><part id="P1">${xmlMeasures}</part></score-partwise>`;
}

function tempoBytes(bpm) {
  const microseconds = Math.round(60000000 / Math.max(20, Math.min(400, bpm)));
  return [(microseconds >> 16) & 255, (microseconds >> 8) & 255, microseconds & 255];
}
function musicXmlType(duration) { return ({ w: 'whole', h: 'half', q: 'quarter', 8: 'eighth', 16: '16th' }[duration] ?? 'quarter'); }
