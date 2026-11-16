export function bindTabKeyboard({
  isActive, isFretInput, isTextInput, togglePlayback, move, setString,
  commitFret, rest, remove, technique, undo, redo, status,
}) {
  let buffer = '';
  let timer = null;
  const clear = () => { buffer = ''; clearTimeout(timer); };
  const commitBuffer = () => {
    const fret = Number.parseInt(buffer, 10);
    clear();
    if (Number.isInteger(fret) && fret >= 0 && fret <= 24) commitFret(fret);
    else status('格數需介於 0–24', 'err');
  };

  document.addEventListener('keydown', (event) => {
    if (!isActive()) return;
    const fretField = isFretInput(event.target);
    if (isTextInput(event.target) && !fretField) return;

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); return; }
    if (event.key === ' ' && !fretField) { event.preventDefault(); togglePlayback(); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); move('next'); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); move('previous'); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); setString(-1); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setString(1); return; }
    if (event.key === 'Enter') {
      event.preventDefault();
      const fret = Number.parseInt(fretField ? event.target.value.trim() : buffer, 10);
      clear();
      if (Number.isInteger(fret) && fret >= 0 && fret <= 24) { commitFret(fret); if (fretField) event.target.value = ''; }
      else status('請輸入格數 0–24', 'warn');
      return;
    }
    if (event.key === 'Delete' || (event.key === 'Backspace' && !fretField)) { event.preventDefault(); remove(); return; }
    if (fretField) return;

    const shortcuts = { h: 'h', p: 'p', s: 'slide_up', b: 'bend', '~': 'vibrato', x: 'mute' };
    if (shortcuts[event.key]) { event.preventDefault(); technique(shortcuts[event.key]); return; }
    if (event.key === 'r' || event.key === 'R') { event.preventDefault(); rest(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey || !/^[0-9]$/.test(event.key)) return;
    event.preventDefault();
    buffer += event.key;
    const field = document.getElementById('fretInput');
    field.value = buffer;
    clearTimeout(timer);
    if (buffer.length >= 2) { commitBuffer(); field.value = ''; return; }
    timer = setTimeout(() => { commitBuffer(); field.value = ''; }, 800);
  });
}
