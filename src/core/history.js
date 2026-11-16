export function createHistory({ snapshot, restore, limit = 100 }) {
  const past = [];
  const future = [];
  return {
    checkpoint() {
      past.push(snapshot());
      if (past.length > limit) past.shift();
      future.length = 0;
    },
    undo() {
      if (!past.length) return false;
      future.push(snapshot());
      restore(past.pop());
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(snapshot());
      restore(future.pop());
      return true;
    },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}
