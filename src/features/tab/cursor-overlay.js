export function renderCursorOverlay({ overlay, scoreSvg, scoreWrap, layout, cursor, stringLabels = ['e', 'B', 'G', 'D', 'A', 'E'] }) {
  overlay.innerHTML = '';
  if (!scoreSvg) return;
  const lineIndex = layout.measureLineIndex[cursor.m] ?? 0;
  const stringYs = layout.staveStringYs[lineIndex];
  if (!stringYs || stringYs.length < 6) return;
  const note = layout.notePositions.find((entry) => entry.measureIndex === cursor.m && entry.beatIndex === cursor.b);
  const styles = getComputedStyle(scoreWrap);
  const x = Number.parseFloat(styles.paddingLeft) + (note?.x ?? 80);
  const top = Number.parseFloat(styles.paddingTop) + stringYs[0];
  const bottom = Number.parseFloat(styles.paddingTop) + stringYs[5];
  const y = Number.parseFloat(styles.paddingTop) + stringYs[cursor.s - 1];
  const pad = 6, width = 24;

  const column = document.createElement('div');
  column.className = 'cur-col';
  column.style.cssText = `left:${x - width / 2}px;top:${top - pad}px;width:${width}px;height:${bottom - top + pad * 2}px;`;
  const dot = document.createElement('div');
  dot.className = 'cur-dot'; dot.style.cssText = `left:${x}px;top:${y}px;`;
  const label = document.createElement('div');
  label.className = 'cur-label'; label.textContent = `M${cursor.m + 1}  B${cursor.b + 1}  ${stringLabels[cursor.s - 1]}弦`;
  label.style.cssText = `left:${x}px;top:${top - pad - 22}px;`;
  overlay.append(column, dot, label);
}
