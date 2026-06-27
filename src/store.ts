import * as Y from "yjs";
import WebxdcProvider from "y-webxdc";
import { categorize, normalize } from "./categorizer";
import { CATEGORIES } from "./categories";
import { resolveLang } from "./i18n";

// An "aisle" / category is a free string: a built-in category key or a
// user-created custom group name.
export type Aisle = string;

export interface Item {
  id: string;
  name: string;
  category: Aisle;
  checked: boolean;
  addedBy: string;
  ts: number;
}

// --- shared document ----------------------------------------------------------

const ydoc = new Y.Doc();

/** id -> Y.Map<{name, category, checked, addedBy, ts}> */
const yItems = ydoc.getMap<Y.Map<unknown>>("items");
/** custom store layout; empty until the household reorders aisles */
const yAisleOrder = ydoc.getArray<string>("aisleOrder");
/** normalizedName -> Aisle, shared learned recategorizations */
const yOverrides = ydoc.getMap<string>("overrides");
/** user-created custom group names (shared) */
const yCustomAisles = ydoc.getArray<string>("customAisles");

const webxdc = window.webxdc;

const provider = new WebxdcProvider({
  webxdc,
  ydoc,
  autosaveInterval: 10 * 1000,
  getEditInfo: () => {
    const me = webxdc.selfName || webxdc.selfAddr || "someone";
    const count = yItems.size;
    return {
      document: "Grocery Board",
      summary: `${count} item${count === 1 ? "" : "s"} · last edit by ${me}`,
      startinfo: `${me} started a shared grocery list`,
    };
  },
  resendAllUpdates: false,
});

// Flush immediately on local edits so peers see changes without waiting for the
// autosave tick (autosave remains the safety net / batcher).
export function flush(): void {
  provider.syncToChatPeers();
}

// --- subscriptions (also feeds React's useSyncExternalStore) ------------------

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Monotonic snapshot token: changes whenever shared state changes. */
export function getSnapshot(): number {
  return version;
}

function notify(): void {
  version++;
  scheduleDedupe();
  for (const fn of listeners) fn();
}

yItems.observeDeep(notify);
yAisleOrder.observe(notify);
yOverrides.observe(notify);
yCustomAisles.observe(notify);

// Items the local user checked during THIS app session (reset on reload). Used
// by the "keep just-checked items visible until restart" visibility mode so a
// misclick can be corrected without revealing the whole backlog of completed
// items. Not synced — it is a per-device, per-session affordance.
const sessionChecked = new Set<string>();
export function wasCheckedThisSession(id: string): boolean {
  return sessionChecked.has(id);
}

// --- reads --------------------------------------------------------------------

function itemFromMap(id: string, m: Y.Map<unknown>): Item {
  return {
    id,
    name: (m.get("name") as string) ?? "",
    category: (m.get("category") as string) ?? "Other",
    checked: Boolean(m.get("checked")),
    addedBy: (m.get("addedBy") as string) ?? "",
    ts: (m.get("ts") as number) ?? 0,
  };
}

export function allItems(): Item[] {
  const out: Item[] = [];
  yItems.forEach((m, id) => out.push(itemFromMap(id, m)));
  return out;
}

export function customAisles(): Aisle[] {
  return yCustomAisles.toArray();
}

/** Every known aisle: built-in categories plus custom groups. */
export function knownAisles(): Aisle[] {
  return [...CATEGORIES, ...customAisles()];
}

/**
 * Effective aisle order: the shared custom order if set, otherwise the default
 * layout. Any known aisle missing from a stored order is appended; stale
 * entries (e.g. a deleted custom group) are dropped.
 */
export function effectiveAisleOrder(): Aisle[] {
  const known = knownAisles();
  const stored = yAisleOrder.toArray();
  const order = stored.length ? [...stored] : [...known];
  for (const a of known) if (!order.includes(a)) order.push(a);
  return order.filter((a) => known.includes(a));
}

export interface AisleGroup {
  category: Aisle;
  items: Item[];
}

/** Items grouped by aisle in effective order. Within an aisle, unchecked items
 *  come first (checked sink to the bottom), then by insertion time. */
export function itemsByAisle(): AisleGroup[] {
  const order = effectiveAisleOrder();
  const byCat = new Map<Aisle, Item[]>();
  for (const cat of order) byCat.set(cat, []);
  for (const item of allItems()) {
    if (!byCat.has(item.category)) byCat.set(item.category, []);
    byCat.get(item.category)!.push(item);
  }
  const sortItems = (a: Item, b: Item) =>
    Number(a.checked) - Number(b.checked) || a.ts - b.ts;
  const groups: AisleGroup[] = [];
  for (const cat of byCat.keys()) {
    const items = byCat.get(cat)!.sort(sortItems);
    groups.push({ category: cat, items });
  }
  groups.sort((a, b) => {
    const ia = order.indexOf(a.category);
    const ib = order.indexOf(b.category);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
  return groups;
}

/** Distinct names of currently-checked ("closed"), non-deleted items — the
 *  source for add-field autocomplete. */
export function checkedItemNames(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of allItems()) {
    if (!item.checked) continue;
    const key = item.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item.name);
    }
  }
  return out;
}

// --- writes -------------------------------------------------------------------

let idCounter = 0;
function newId(): string {
  // clientID makes ids unique across peers without needing Math.random/Date.
  idCounter += 1;
  return `${ydoc.clientID.toString(36)}-${idCounter.toString(36)}-${yItems.size}`;
}

function findItemIdByName(name: string): string | null {
  const key = normalize(name);
  let found: string | null = null;
  yItems.forEach((m, id) => {
    if (!found && normalize(m.get("name") as string) === key) found = id;
  });
  return found;
}

export function addItem(rawName: string): void {
  const name = rawName.trim();
  if (!name) return;
  // dedupe by name: never create a second item with the same (normalized) name.
  const existing = findItemIdByName(name);
  if (existing) {
    const m = yItems.get(existing);
    if (m && m.get("checked")) {
      m.set("checked", false); // re-adding a bought item brings it back
      flush();
    }
    return;
  }
  const category = categorize(name, yOverrides, resolveLang());
  ydoc.transact(() => {
    const m = new Y.Map<unknown>();
    yItems.set(newId(), m);
    m.set("name", name);
    m.set("category", category);
    m.set("checked", false);
    m.set("addedBy", webxdc.selfName || webxdc.selfAddr || "");
    m.set("ts", Date.now());
  });
  flush();
}

// Collapse duplicate-named items (e.g. created by two peers adding the same
// thing concurrently). Deterministic across peers — keep the earliest by
// (ts, id), merge "checked" if any duplicate was checked, delete the rest — so
// every peer converges on the same result. Scheduled off the observe path.
let dedupePending = false;
function scheduleDedupe(): void {
  if (dedupePending) return;
  dedupePending = true;
  queueMicrotask(() => {
    dedupePending = false;
    dedupe();
  });
}

function dedupe(): void {
  const groups = new Map<string, string[]>();
  yItems.forEach((m, id) => {
    const key = normalize(m.get("name") as string);
    const arr = groups.get(key);
    if (arr) arr.push(id);
    else groups.set(key, [id]);
  });

  const toDelete: string[] = [];
  const toCheck: string[] = [];
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    ids.sort((a, b) => {
      const ta = yItems.get(a)!.get("ts") as number;
      const tb = yItems.get(b)!.get("ts") as number;
      return ta - tb || (a < b ? -1 : 1);
    });
    const keep = ids[0];
    const anyChecked = ids.some((id) => yItems.get(id)!.get("checked"));
    for (let i = 1; i < ids.length; i++) toDelete.push(ids[i]);
    if (anyChecked && !yItems.get(keep)!.get("checked")) toCheck.push(keep);
  }
  if (!toDelete.length && !toCheck.length) return;

  ydoc.transact(() => {
    for (const id of toCheck) yItems.get(id)?.set("checked", true);
    for (const id of toDelete) yItems.delete(id);
  });
  flush();
}

export function toggleChecked(id: string): void {
  const m = yItems.get(id);
  if (!m) return;
  const nowChecked = !m.get("checked");
  if (nowChecked) sessionChecked.add(id);
  m.set("checked", nowChecked);
  flush();
}

export function renameItem(id: string, rawName: string): void {
  const name = rawName.trim();
  const m = yItems.get(id);
  if (!m || !name) return;
  ydoc.transact(() => {
    m.set("name", name);
    // re-resolve category for the new name (respecting existing overrides)
    m.set("category", categorize(name, yOverrides, resolveLang()));
  });
  flush();
}

export function deleteItem(id: string): void {
  const name = yItems.get(id)?.get("name") as string | undefined;
  ydoc.transact(() => {
    yItems.delete(id);
    // also forget any manual aisle correction learned for this name
    if (name) yOverrides.delete(normalize(name));
  });
  flush();
}

/** Manually move an item to a different aisle and remember the correction for
 *  everyone via the shared overrides map (keyed by normalized name). */
export function recategorize(id: string, category: Aisle): void {
  const m = yItems.get(id);
  if (!m) return;
  const name = m.get("name") as string;
  ydoc.transact(() => {
    m.set("category", category);
    yOverrides.set(normalize(name), category);
  });
  flush();
}

export function setAisleOrder(order: Aisle[]): void {
  ydoc.transact(() => {
    yAisleOrder.delete(0, yAisleOrder.length);
    yAisleOrder.insert(0, order);
  });
  flush();
}

export function moveAisle(category: Aisle, dir: -1 | 1): void {
  const order = effectiveAisleOrder();
  const i = order.indexOf(category);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  setAisleOrder(order);
}

// --- custom groups ------------------------------------------------------------

/** Create a custom group. Items only ever enter it via a manual move — it is
 *  never an auto-categorization target. No-op on blank/duplicate names. */
export function addCustomAisle(rawName: string): void {
  const name = rawName.trim();
  if (!name) return;
  const exists = knownAisles().some(
    (a) => a.toLowerCase() === name.toLowerCase(),
  );
  if (exists) return;
  yCustomAisles.push([name]);
  flush();
}

/** Delete a custom group; its items fall back to "Other". */
export function deleteCustomAisle(name: Aisle): void {
  const idx = customAisles().indexOf(name);
  if (idx === -1) return;
  ydoc.transact(() => {
    yCustomAisles.delete(idx, 1);
    yItems.forEach((m) => {
      if (m.get("category") === name) m.set("category", "Other");
    });
    const oi = yAisleOrder.toArray().indexOf(name);
    if (oi !== -1) yAisleOrder.delete(oi, 1);
  });
  flush();
}

export function isCustomAisle(name: Aisle): boolean {
  return customAisles().includes(name);
}

// --- import / export ----------------------------------------------------------

export interface ExportData {
  version: 1;
  exportedAt: number;
  items: Array<{
    name: string;
    category: string;
    checked: boolean;
    addedBy: string;
    ts: number;
  }>;
  aisleOrder: string[];
  overrides: Record<string, string>;
  customAisles: string[];
}

/** Serialize the full shared state for export. */
export function exportState(): ExportData {
  return {
    version: 1,
    exportedAt: Date.now(),
    items: allItems().map(({ name, category, checked, addedBy, ts }) => ({
      name,
      category,
      checked,
      addedBy,
      ts,
    })),
    aisleOrder: yAisleOrder.toArray(),
    overrides: Object.fromEntries(yOverrides.entries()) as Record<
      string,
      string
    >,
    customAisles: yCustomAisles.toArray(),
  };
}

/** Replace the entire shared state from exported data (syncs to peers). */
export function importState(data: ExportData): void {
  if (!data || data.version !== 1 || !Array.isArray(data.items)) {
    throw new Error("Unrecognized import format");
  }
  ydoc.transact(() => {
    for (const id of [...yItems.keys()]) yItems.delete(id);
    yAisleOrder.delete(0, yAisleOrder.length);
    for (const k of [...yOverrides.keys()]) yOverrides.delete(k);
    yCustomAisles.delete(0, yCustomAisles.length);

    for (const it of data.items) {
      const m = new Y.Map<unknown>();
      yItems.set(newId(), m);
      m.set("name", String(it.name ?? ""));
      m.set("category", String(it.category ?? "Other"));
      m.set("checked", Boolean(it.checked));
      m.set("addedBy", String(it.addedBy ?? ""));
      m.set("ts", Number(it.ts ?? Date.now()));
    }
    if (Array.isArray(data.aisleOrder)) {
      yAisleOrder.insert(0, data.aisleOrder.map(String));
    }
    if (data.overrides) {
      for (const [k, v] of Object.entries(data.overrides)) {
        yOverrides.set(k, String(v));
      }
    }
    if (Array.isArray(data.customAisles)) {
      yCustomAisles.insert(0, data.customAisles.map(String));
    }
  });
  flush();
}

export { ydoc };
