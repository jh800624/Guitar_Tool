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

export function parseMusicXml(source, tuning) {
  const measures = [];
  let divisions = PPQ, timeSig = '4/4', bpm = 120;
  const chunks = source.match(/<measure\b[^>]*>[\s\S]*?<\/measure>/g) ?? [];
  chunks.forEach((chunk) => {
    const foundDivisions = tagValue(chunk, 'divisions'); if (foundDivisions) divisions = Number(foundDivisions) || divisions;
    const beats = tagValue(chunk, 'beats'), beatType = tagValue(chunk, 'beat-type'); if (beats && beatType) timeSig = `${beats}/${beatType}`;
    const measure = { timeSig, beats: [] };
    const tempo = chunk.match(/<sound\b[^>]*tempo="([\d.]+)"/)?.[1]; if (tempo) { bpm = Number(tempo); measure.tempoEvents = [{ beat: 0, bpm }]; }
    measure.repeatStart = /<repeat\b[^>]*direction="forward"/.test(chunk);
    const repeatEnd = chunk.match(/<repeat\b[^>]*direction="backward"[^>]*times="(\d+)"/)?.[1]; if (repeatEnd) measure.repeatEnd = Number(repeatEnd);
    const notes = chunk.match(/<note>[\s\S]*?<\/note>/g) ?? [];
    notes.forEach((noteXml) => {
      const isChord = /<chord\s*\/>/.test(noteXml), isRest = /<rest\s*\/>/.test(noteXml);
      const duration = Number(tagValue(noteXml, 'duration')) || divisions;
      const note = isRest ? null : xmlNoteToTab(noteXml, tuning);
      const beat = { duration: durationToken(duration / divisions), strings: note ? [note] : [], technique: /<harmonic\b/.test(noteXml) ? 'harmonic' : null, effects: /palm mute/.test(noteXml) ? ['palm_mute'] : [], isRest };
      if (isChord && measure.beats.length) {
        if (note) measure.beats.at(-1).strings.push(note);
      } else measure.beats.push(beat);
    });
    measures.push(measure.beats.length ? measure : { timeSig, beats: [emptyBeat()] });
  });
  if (!measures.length) throw new Error('找不到 MusicXML 小節');
  return { measures, bpm };
}

export function parseMidiFile(input, tuning) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (textAt(bytes, 0, 4) !== 'MThd') throw new Error('不是標準 MIDI 檔案');
  const headerSize = uint32(bytes, 4), division = uint16(bytes, 12);
  if (!division || division & 0x8000) throw new Error('不支援 SMPTE MIDI 時基');
  let offset = 8 + headerSize, bpm = 120, timeSig = '4/4'; const notes = [], active = new Map();
  while (offset + 8 <= bytes.length && textAt(bytes, offset, 4) === 'MTrk') {
    const size = uint32(bytes, offset + 4), end = offset + 8 + size; offset += 8; let tick = 0, running = 0;
    while (offset < end) {
      const delta = readVlq(bytes, offset); tick += delta.value; offset = delta.next;
      let status = bytes[offset]; if (status < 0x80) status = running; else { offset += 1; running = status; }
      if (status === 0xff) { const type = bytes[offset++], length = readVlq(bytes, offset); offset = length.next; const data = bytes.slice(offset, offset + length.value); offset += length.value;
        if (type === 0x51 && data.length === 3) bpm = Math.round(60000000 / ((data[0] << 16) | (data[1] << 8) | data[2]));
        if (type === 0x58 && data.length >= 2) timeSig = `${data[0]}/${2 ** data[1]}`;
      } else if (status === 0xf0 || status === 0xf7) { const length = readVlq(bytes, offset); offset = length.next + length.value; }
      else { const data1 = bytes[offset++], data2 = (status & 0xe0) === 0xc0 || (status & 0xe0) === 0xd0 ? 0 : bytes[offset++]; const key = `${status & 15}:${data1}`;
        if ((status & 0xf0) === 0x90 && data2) active.set(key, { tick, midi: data1 });
        if ((status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && !data2)) { const started = active.get(key); if (started) { notes.push({ ...started, duration: Math.max(1, tick - started.tick) }); active.delete(key); } }
      }
    } offset = end;
  }
  if (!notes.length) throw new Error('MIDI 沒有可匯入的音符');
  const groups = new Map(); notes.forEach((note) => { const group = groups.get(note.tick) ?? []; group.push(note); groups.set(note.tick, group); });
  const starts = [...groups.keys()].sort((a, b) => a - b), measureTicks = division * 4, measures = [];
  for (let measureStart = 0, index = 0; index < starts.length; measureStart += measureTicks) {
    const inMeasure = starts.filter((tick) => tick >= measureStart && tick < measureStart + measureTicks); if (!inMeasure.length) { if (measureStart > starts.at(-1)) break; measures.push({ timeSig, beats: [emptyBeat()] }); continue; }
    const beats = inMeasure.map((tick, position) => {
      const mapped = mapMidiChord(groups.get(tick).map((note) => note.midi), tuning);
      const next = inMeasure[position + 1] ?? tick + Math.max(...groups.get(tick).map((note) => note.duration));
      return { duration: durationToken((next - tick) / division), strings: mapped, technique: null, effects: [], isRest: !mapped.length };
    });
    measures.push({ timeSig, beats }); index += inMeasure.length;
  }
  return { measures, bpm, skippedNotes: notes.length - measures.flatMap((measure) => measure.beats).reduce((total, beat) => total + beat.strings.length, 0) };
}

function emptyBeat() { return { duration: 'q', strings: [], technique: null, effects: [], isRest: true }; }
function durationToken(quarters) { const choices = [['w', 4], ['h', 2], ['q', 1], ['8', .5], ['16', .25]]; return choices.reduce((best, entry) => Math.abs(entry[1] - quarters) < Math.abs(best[1] - quarters) ? entry : best)[0]; }
function mapMidiChord(midis, tuning) { const used = new Set(); return [...midis].sort((a, b) => a - b).flatMap((midi) => {
  const candidates = tuning.map((open, index) => ({ string: index + 1, fret: midi - open })).filter((note) => note.fret >= 0 && note.fret <= 24 && !used.has(note.string)).sort((a, b) => a.fret - b.fret || a.string - b.string);
  if (!candidates.length) return []; used.add(candidates[0].string); return [candidates[0]];
}); }
function xmlNoteToTab(noteXml, tuning) { const string = Number(tagValue(noteXml, 'string')), fret = Number(tagValue(noteXml, 'fret')); if (Number.isInteger(string) && Number.isInteger(fret)) return { string, fret };
  const step = tagValue(noteXml, 'step'), octave = Number(tagValue(noteXml, 'octave')), alter = Number(tagValue(noteXml, 'alter') || 0); const midi = (octave + 1) * 12 + SHARP_NAMES.indexOf(step) + alter; return mapMidiChord([midi], tuning)[0] ?? null; }
function tagValue(source, tag) { return source.match(new RegExp(`<${tag}>([^<]+)<\\/${tag}>`))?.[1]; }
function textAt(bytes, offset, length) { return String.fromCharCode(...bytes.slice(offset, offset + length)); }
function uint32(bytes, offset) { return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]; }
function uint16(bytes, offset) { return (bytes[offset] << 8) + bytes[offset + 1]; }
function readVlq(bytes, offset) { let value = 0, byte; do { byte = bytes[offset++]; value = (value << 7) | (byte & 0x7f); } while (byte & 0x80); return { value, next: offset }; }
