const TAB_KEY = 'guitar-tool-tab-v1';
const SNAPSHOT_KEY = 'guitar-tool-snapshots-v1';

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

export const storage = Object.freeze({
  loadTab: () => read(TAB_KEY, null), saveTab: (tab) => write(TAB_KEY, tab),
  loadSnapshots: () => read(SNAPSHOT_KEY, []), saveSnapshots: (snapshots) => write(SNAPSHOT_KEY, snapshots),
});
