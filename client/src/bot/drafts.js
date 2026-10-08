// Unfinished registrations kept on this device so a reload or a dropped connection does not lose them.
// They hold personal details, so:
//  - a resident's (public) draft expires after 20 minutes - the next person on a shared phone cannot open it;
//  - a volunteer's (staff) draft belongs to that account only and is erased on logout (clearStaffDrafts).

const PREFIX = 'enp_bot_draft_';
const PUBLIC_TTL_MS = 20 * 60 * 1000;

const keyFor = (mode, userId) => (mode === 'staff' ? `${PREFIX}staff_${userId ?? 'none'}` : `${PREFIX}public`);

export function loadDraft(mode, userId) {
  try {
    const draft = JSON.parse(localStorage.getItem(keyFor(mode, userId)) ?? 'null');
    if (!draft?.data || !draft?.pos) return null;
    if (mode !== 'staff' && !(draft.savedAt > Date.now() - PUBLIC_TTL_MS)) {
      localStorage.removeItem(keyFor(mode, userId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function saveDraft(mode, userId, draft) {
  try { localStorage.setItem(keyFor(mode, userId), JSON.stringify({ ...draft, savedAt: Date.now() })); } catch { /* ignore */ }
}

export function clearDraft(mode, userId) {
  try { localStorage.removeItem(keyFor(mode, userId)); } catch { /* ignore */ }
}

/** On logout: remove every staff draft on this device (and the old un-namespaced one). */
export function clearStaffDrafts() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${PREFIX}staff`)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}
