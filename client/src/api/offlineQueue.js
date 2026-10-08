// Field volunteers often lose signal. A family saved while offline is kept on this device and sent
// later (the Sync button in the staff header). Stored in localStorage: it survives a reload or the
// phone going to sleep, but only on this device and browser - so sync before clearing browser data.
import { api } from './client.js';

const KEY = 'enp_offline_households';
const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function write(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage full or blocked */ }
  listeners.forEach((fn) => fn(items.length));
}

export const offlineQueue = {
  count: () => read().length,
  add(data) {
    write([...read(), { data, queuedAt: new Date().toISOString() }]);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Send everything queued. Returns { sent, failed } - entries the server rejects stay queued. */
  async sync() {
    const items = read();
    const keep = [];
    let sent = 0;
    for (const item of items) {
      try {
        await api.createHousehold(item.data);
        sent += 1;
      } catch (err) {
        keep.push({ ...item, error: err.message });
        if (err.offline) { // still no network: stop trying the rest
          keep.push(...items.slice(items.indexOf(item) + 1));
          break;
        }
      }
    }
    write(keep);
    return { sent, failed: keep.length };
  },
};
