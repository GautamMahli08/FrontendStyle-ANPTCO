// Client-side localStorage store for named destination geofences.
// Used by fleet monitor (manage), trip history & fuel history (display).

export interface SavedDestination {
  id:     string;   // crypto.randomUUID()
  name:   string;
  lat:    number;
  lng:    number;
  radius: number;   // metres
}

const KEY_LIST   = 'anptco_destinations';
const KEY_ACTIVE = 'anptco_active_dest_id';

export function loadDestinations(): SavedDestination[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_LIST) ?? '[]');
  } catch { return []; }
}

export function saveDestinations(list: SavedDestination[]): void {
  try { localStorage.setItem(KEY_LIST, JSON.stringify(list)); } catch {}
}

export function loadActiveDestId(): string | null {
  try { return localStorage.getItem(KEY_ACTIVE); } catch { return null; }
}

export function saveActiveDestId(id: string | null): void {
  try {
    if (id == null) localStorage.removeItem(KEY_ACTIVE);
    else            localStorage.setItem(KEY_ACTIVE, id);
  } catch {}
}

export function getActiveDest(
  list: SavedDestination[],
  id: string | null,
): SavedDestination | null {
  if (!id) return null;
  return list.find(d => d.id === id) ?? null;
}
