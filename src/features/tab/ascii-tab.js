const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];

export function serializeAsciiTab({ title = 'Untitled', measures = [] }) {
  const lines = STRING_LABELS.map((label) => `${label}|`);
  measures.forEach((measure) => {
    const beats = measure.voices?.[0]?.beats ?? measure.beats ?? [];
    const cells = beats.map((beat) => {
      const frets = Array.from({ length: 6 }, (_, index) => beat.strings?.find((note) => note.string === index + 1)?.fret);
      const width = Math.max(2, ...frets.filter(Number.isInteger).map((fret) => String(fret).length));
      return frets.map((fret) => Number.isInteger(fret) ? String(fret).padEnd(width, '-') : '-'.repeat(width));
    });
    lines.forEach((line, stringIndex) => {
      lines[stringIndex] = `${line}${cells.map((cell) => cell[stringIndex]).join('')}|`;
    });
  });
  return [`# ${title}`, '# Guitar Tool ASCII TAB (rhythm imports as quarter notes)', ...lines].join('\n');
}

export function parseAsciiTab(source) {
  const lines = source.split(/\r?\n/).filter((line) => /^[eBGDAE]\|/.test(line.trim()));
  if (lines.length < 6) throw new Error('找不到完整的六弦 ASCII TAB');
  const strings = lines.slice(0, 6).map((line) => line.trim().slice(2).split('|'));
  const measureCount = Math.max(...strings.map((parts) => Math.max(0, parts.length - 1)));
  const measures = [];
  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    const segments = strings.map((parts) => parts[measureIndex] ?? '');
    const positions = new Set();
    segments.forEach((segment) => {
      for (let index = 0; index < segment.length; index += 1) {
        if (/\d/.test(segment[index]) && !/\d/.test(segment[index - 1] ?? '')) positions.add(index);
      }
    });
    const beats = [...positions].sort((a, b) => a - b).map((position) => {
      const notes = segments.flatMap((segment, stringIndex) => {
        const match = segment.slice(position).match(/^\d+/);
        return match ? [{ string: stringIndex + 1, fret: Number(match[0]) }] : [];
      });
      return { duration: 'q', strings: notes, technique: null, isRest: !notes.length };
    });
    measures.push({ timeSig: '4/4', beats: beats.length ? beats : [{ duration: 'q', strings: [], technique: null, isRest: true }] });
  }
  if (!measures.length) throw new Error('ASCII TAB 沒有可匯入的小節');
  return { measures };
}
