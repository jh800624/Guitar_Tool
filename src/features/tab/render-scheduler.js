export function createRenderScheduler(render) {
  let frame = null;
  return {
    request() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        render();
      });
    },
    cancel() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
    get pending() { return frame !== null; },
  };
}
