export function createDebouncedWriter(write, { delay = 650, onError = () => {} } = {}) {
  let timer = null;
  const run = () => {
    timer = null;
    try { write(); } catch (error) { onError(error); }
  };
  return {
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    },
    flush() {
      if (!timer) return;
      clearTimeout(timer);
      run();
    },
    cancel() { clearTimeout(timer); timer = null; },
    get pending() { return timer !== null; },
  };
}
