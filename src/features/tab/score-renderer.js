export function equalMeasureWidths(totalWidth, count, slots = count) {
  const visibleCount = Math.max(1, count);
  const slotCount = Math.max(visibleCount, slots);
  const baseWidth = totalWidth / slotCount;
  const widths = Array.from({ length: visibleCount }, () => baseWidth);
  return widths;
}

export function createScoreRenderer({ vf, buildNotes, buildNotationNotes = () => [], calcStaveWidth, options }) {
  const { Renderer, Stave, TabStave, Voice, Formatter, Beam } = vf;
  const { maxWidth, lineHeight, clefWidth, marginWidth } = options;

  function layout(measures, availableWidth = maxWidth) {
    const width = Math.max(200, availableWidth || maxWidth);
    const lines = [];
    let line = [], lineWidth = 0;
    measures.forEach((measure, measureIndex) => {
      const measureWidth = calcStaveWidth(measure, line.length === 0);
      if (line.length && lineWidth + measureWidth > width) {
        lines.push(line); line = [measureIndex]; lineWidth = calcStaveWidth(measure, true);
      } else { line.push(measureIndex); lineWidth += measureWidth; }
    });
    if (line.length) lines.push(line);
    const measureLineIndex = {};
    lines.forEach((items, lineIndex) => items.forEach((measureIndex) => { measureLineIndex[measureIndex] = lineIndex; }));
    return { lines, measureLineIndex, width, height: lines.length * lineHeight + 30 };
  }

  function render({ container, measures, cursor, activeVoice = 0, availableWidth }) {
    const scoreLayout = layout(measures, availableWidth);
    container.innerHTML = '';
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(scoreLayout.width, scoreLayout.height);
    const context = renderer.getContext();
    context.setFont('Courier Prime, monospace', 10);
    context.setFillStyle('#111'); context.setStrokeStyle('#111');
    const notePositions = [], staveStringYs = {};

    scoreLayout.lines.forEach((line, lineIndex) => {
      const yBase = lineIndex * lineHeight + 35;
      const staveWidths = equalMeasureWidths(scoreLayout.width, line.length, line.length);
      let xOffset = 0;
      line.forEach((measureIndex, positionInLine) => {
        const measure = measures[measureIndex], first = positionInLine === 0, staveWidth = staveWidths[positionInLine];
        const notationStave = new Stave(xOffset, yBase, staveWidth - 4);
        const stave = new TabStave(xOffset, yBase + 62, staveWidth - 4);
        if (first) {
          notationStave.addClef('treble');
          stave.addClef('tab');
          const [beats, unit] = measure.timeSig.split('/').map(Number);
          notationStave.addTimeSignature(`${beats}/${unit}`);
          stave.addTimeSignature(`${beats}/${unit}`);
        }
        notationStave.setContext(context).draw();
        stave.setContext(context).draw();
        if (first) staveStringYs[lineIndex] = [0, 1, 2, 3, 4, 5].map((string) => stave.getYForLine(string));
        context.save(); context.setFont('Courier Prime, monospace', 8);
        context.setFillStyle(measureIndex === cursor.m ? '#888' : '#bbb'); context.fillText(`${measureIndex + 1}`, xOffset + 3, yBase - 2); context.restore();
        context.save(); context.setFont('Courier Prime, monospace', 9); context.setFillStyle('#333');
        if (measure.repeatStart) context.fillText('|:', xOffset + 4, yBase + 136);
        if (measure.repeatEnd) context.fillText(`:| ×${measure.repeatEnd}`, xOffset + staveWidth - 38, yBase + 136);
        const tempoEvent = measure.tempoEvents?.find((event) => event.beat === 0);
        if (tempoEvent) context.fillText(`♩ = ${tempoEvent.bpm}`, xOffset + 18, yBase - 14);
        context.restore();
        const noteGroups = (measure.voices ?? [{ beats: measure.beats }]).map((_, voiceIndex) => buildNotes(measure, voiceIndex, voiceIndex % 2 ? -1 : 1));
        const notationGroups = (measure.voices ?? [{ beats: measure.beats }]).map((_, voiceIndex) => buildNotationNotes(measure, voiceIndex, voiceIndex % 2 ? -1 : 1));
        const innerWidth = staveWidth - (first ? clefWidth + 4 : marginWidth + 4);
        const noteStart = xOffset + (first ? clefWidth + 4 : marginWidth + 4);
        if (noteGroups.some((notes) => notes.length)) {
          try {
            const [beats, unit] = measure.timeSig.split('/').map(Number);
            const voices = noteGroups.map((notes) => { const voice = new Voice({ numBeats: beats, beatValue: unit }); voice.setMode(Voice.Mode.SOFT); voice.addTickables(notes); return voice; });
            const notationVoices = notationGroups.map((notes) => { const voice = new Voice({ numBeats: beats, beatValue: unit }); voice.setMode(Voice.Mode.SOFT); voice.addTickables(notes); return voice; });
            new Formatter().joinVoices(voices).format(voices, innerWidth); voices.forEach((voice) => voice.draw(context, stave));
            new Formatter().joinVoices(notationVoices).format(notationVoices, innerWidth); notationVoices.forEach((voice) => voice.draw(context, notationStave));
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
