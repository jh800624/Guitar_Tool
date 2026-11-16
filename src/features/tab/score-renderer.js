export function createScoreRenderer({ vf, buildNotes, calcStaveWidth, options }) {
  const { Renderer, TabStave, Voice, Formatter, Beam } = vf;
  const { maxWidth, lineHeight, clefWidth, marginWidth } = options;

  function layout(measures) {
    const lines = [];
    let line = [], width = 0;
    measures.forEach((measure, measureIndex) => {
      const first = line.length === 0;
      const measureWidth = calcStaveWidth(measure, first);
      if (line.length && width + measureWidth > maxWidth) {
        lines.push(line); line = [measureIndex]; width = calcStaveWidth(measure, true);
      } else { line.push(measureIndex); width += measureWidth; }
    });
    if (line.length) lines.push(line);
    const measureLineIndex = {};
    lines.forEach((items, lineIndex) => items.forEach((measureIndex) => { measureLineIndex[measureIndex] = lineIndex; }));
    const widest = Math.max(...lines.map((items) => items.reduce((sum, measureIndex, index) => sum + calcStaveWidth(measures[measureIndex], index === 0), 0)));
    return { lines, measureLineIndex, width: Math.min(maxWidth, Math.max(400, widest + 10)), height: lines.length * lineHeight + 30 };
  }

  function render({ container, measures, cursor, activeVoice = 0 }) {
    const scoreLayout = layout(measures);
    container.innerHTML = '';
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(scoreLayout.width, scoreLayout.height);
    const context = renderer.getContext();
    context.setFont('Courier Prime, monospace', 10);
    context.setFillStyle('#111'); context.setStrokeStyle('#111');
    const notePositions = [], staveStringYs = {};

    scoreLayout.lines.forEach((line, lineIndex) => {
      const yBase = lineIndex * lineHeight + 35;
      const rawWidths = line.map((measureIndex, index) => calcStaveWidth(measures[measureIndex], index === 0));
      const rawTotal = rawWidths.reduce((sum, value) => sum + value, 0);
      const staveWidths = rawWidths.map((value) => Math.floor(value * scoreLayout.width / rawTotal));
      staveWidths[staveWidths.length - 1] += scoreLayout.width - staveWidths.reduce((sum, value) => sum + value, 0);
      let xOffset = 0;
      line.forEach((measureIndex, positionInLine) => {
        const measure = measures[measureIndex], first = positionInLine === 0, staveWidth = staveWidths[positionInLine];
        const stave = new TabStave(xOffset, yBase, staveWidth - 4);
        if (first) {
          stave.addClef('tab');
          const [beats, unit] = measure.timeSig.split('/').map(Number);
          stave.addTimeSignature(`${beats}/${unit}`);
        }
        stave.setContext(context).draw();
        if (first) staveStringYs[lineIndex] = [0, 1, 2, 3, 4, 5].map((string) => stave.getYForLine(string));
        context.save(); context.setFont('Courier Prime, monospace', 8);
        context.setFillStyle(measureIndex === cursor.m ? '#888' : '#bbb'); context.fillText(`${measureIndex + 1}`, xOffset + 3, yBase - 2); context.restore();
        const noteGroups = (measure.voices ?? [{ beats: measure.beats }]).map((_, voiceIndex) => buildNotes(measure, voiceIndex, voiceIndex % 2 ? -1 : 1));
        const innerWidth = staveWidth - (first ? clefWidth + 4 : marginWidth + 4);
        const noteStart = xOffset + (first ? clefWidth + 4 : marginWidth + 4);
        if (noteGroups.some((notes) => notes.length)) {
          try {
            const [beats, unit] = measure.timeSig.split('/').map(Number);
            const voices = noteGroups.map((notes) => { const voice = new Voice({ numBeats: beats, beatValue: unit }); voice.setMode(Voice.Mode.SOFT); voice.addTickables(notes); return voice; });
            new Formatter().joinVoices(voices).format(voices, innerWidth); voices.forEach((voice) => voice.draw(context, stave));
            noteGroups.forEach((notes, voiceIndex) => {
              Beam.generateBeams(notes).forEach((beam) => beam.setContext(context).draw());
              if (voiceIndex !== activeVoice) return;
              notes.forEach((note, beatIndex) => {
              const box = note.getBoundingBox?.();
              const x = note.getAbsoluteX?.() || (box ? box.getX() + box.getW() / 2 : noteStart + innerWidth / notes.length * (beatIndex + .5));
              notePositions.push({ measureIndex, beatIndex, x });
              });
            });
          } catch {
            const notes = noteGroups[activeVoice] ?? [];
            notes.forEach((_, beatIndex) => notePositions.push({ measureIndex, beatIndex, x: noteStart + innerWidth / notes.length * (beatIndex + .5) }));
          }
        }
        xOffset += staveWidth;
      });
    });
    return { ...scoreLayout, notePositions, staveStringYs };
  }
  return { layout, render };
}
