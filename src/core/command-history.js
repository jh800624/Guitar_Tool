export function createCommandHistory({ limit = 100, onChange = () => {} } = {}) {
  const done = [];
  const undone = [];
  const changed = () => onChange({ canUndo: done.length > 0, canRedo: undone.length > 0 });
  return {
    push(command) {
      done.push(command);
      if (done.length > limit) done.shift();
      undone.length = 0;
      changed();
    },
    undo() {
      const command = done.pop();
      if (!command) return false;
      command.undo();
      undone.push(command);
      changed();
      return true;
    },
    redo() {
      const command = undone.pop();
      if (!command) return false;
      command.redo();
      done.push(command);
      changed();
      return true;
    },
    clear() { done.length = 0; undone.length = 0; changed(); },
    get canUndo() { return done.length > 0; },
    get canRedo() { return undone.length > 0; },
  };
}
