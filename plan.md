# Build spec: collaborative grocery kanban (webxdc)

A shared shopping-list mini app for Delta Chat / webxdc messengers, modeled on Apple Reminders' Groceries list: items auto-sorted into store-aisle sections, viewable as a list or as a swipeable kanban board, synced across everyone in the chat.

## Hard constraints (webxdc)
- **No internet access.** No CDN, no fetch, no external assets. Fully self-contained ZIP.
- `index.html` is the entry point. `webxdc.js` is injected by the messenger — reference `<script src="webxdc.js"></script>`, never bundle it.
- Target < 1 MB. ~10 MB is the practical ceiling.
- Must work offline-first; updates may arrive reordered.

## Stack
- Vanilla TS + a small render layer (no React needed; if used, bundle it). Unidirectional state→render, not imperative DOM mutation.
- **Yjs + `y-webxdc`** (`npm i yjs y-webxdc`) for collaborative state. This is a Level-2 webxdc app.
- **Vite** with **`@webxdc/vite-plugins`** for the dev server, bundling, and automatic `.xdc` generation.

### Scaffold
```
npm create @webxdc/vite-plugins@latest grocery-board -- --template vanilla-ts
```
`vite.config.ts` — default config:
```ts
import { webxdcViteConfig } from "@webxdc/vite-plugins";
import { defineConfig } from "vite";
export default defineConfig(webxdcViteConfig());
```
Or compose plugins for control: `buildXDC()` (emits the `.xdc`), `mockWebxdc()` (in-browser webxdc.js emulator for dev), `eruda()` (on-device debug console; enable via `ERUDA=1` / `NODE_ENV=debug`).

Reference implementation to mirror: **`webxdc/editor`** (codeberg) — yjs + y-webxdc + Vite, kept deliberately small.

## Sync layer (y-webxdc)
- One `Y.Doc`, wrapped in `WebxdcProvider` from `y-webxdc`. The provider owns `sendUpdate`/`setUpdateListener` — **do not call those APIs manually.**
- Configure `autosaveInterval` (~10s) and `getEditInfo` returning `{document, summary, startinfo}` so the chat shows a sensible last-edit summary.
- All app state lives in shared Yjs types below; re-render on `observe`/`observeDeep`.

## Data model (shared Yjs doc)
- `items: Y.Map<id, {name, category, checked, addedBy, ts}>` — `checked` is **orthogonal** to `category` (checking ≠ moving columns; it means "got it").
- `aisleOrder: Y.Array<string>` — ordered category/aisle names. Drives column order in board view; shared so the household agrees on store layout. Empty aisles are hidden in the UI.
- `overrides: Y.Map<normalizedName, category>` — learned manual recategorizations. **Shared**, so corrections accumulate for everyone (improvement over Apple's per-account memory).
- Within-aisle ordering does not need CRDT machinery; sort checked items to the bottom. No per-column position arrays required.

## Auto-categorizer (offline)
- Bundle a **static keyword→category table** (start with one language, e.g. EN or DE; structure it so the language table is swappable). Default aisles ~ Produce, Dairy, Meat/Seafood, Bakery, Frozen, Pantry/Baking, Household, Personal Care, Other.
- On add: normalize the name (lowercase, trim, naive singular/plural), then resolve category in this order:
  1. `overrides[normalizedName]` if present;
  2. keyword/substring match against the table ("organic whole milk" → contains "milk" → Dairy);
  3. fallback to "Other".
- On manual move (recategorize): write `overrides[normalizedName] = newCategory`.

## UI (mobile-first; two views over one model)
- **View toggle**: List ↔ Columns, like Reminders. Persist the chosen view in ephemeral localStorage (UI pref only).
- **List view**: vertical, grouped by aisle with section headers; tap to check; checked items strike through and sink.
- **Column view (kanban)**: one aisle per column, **one column visible at a time**, swipe left/right (snap-paging) to move between aisles. No sideways micro-scrolling. Segmented aisle switcher at top.
- **Interactions**: add-item field pinned within thumb reach; swipe a card / row to toggle checked; long-press for menu (recategorize → move to aisle, rename, delete). Large tap targets. Keep free drag-and-drop optional, not the primary path.
- Reorder aisles (edit `aisleOrder`) from a manage-aisles screen. Hide empty aisles.
- Dark mode; respect `prefers-color-scheme`.

## Dev & build
- **Dev (Docker):** the dev script **must** pass `--host` so the Vite port is reachable from outside the container — `"dev": "vite --host"` (equivalently `server.host: true` in config). Publish the port from the container, e.g. `-p 5173:5173` (match whatever port the scaffold configures). Without `--host`, Vite binds to localhost only and the port is unreachable from the host.
- **Build:** `npm run build` — `@webxdc/vite-plugins` bundles everything self-contained and emits the `.xdc` automatically. No manual zip step.
- `manifest.toml` → `name = "Grocery Board"` (+ optional `source_code_url`); `icon.png` 128–512 px square. Reference `webxdc.js` via `<script src="webxdc.js"></script>` — the messenger (and `mockWebxdc()` in dev) provides it; never bundle it.

## Testing
- **Single instance:** `mockWebxdc()` from the Vite plugins gives an in-browser webxdc emulator during `npm run dev`.
- **Multi-peer:** concurrent adds/checks/recategorizations and late joiners replaying history must all converge. Run `@webxdc/webxdc-dev` against the dev server: `concurrently "npm run dev" "webxdc-dev run http://localhost:5173"` — it spins up multiple isolated instances. In Docker, also publish webxdc-dev's UI port (7000+, set with `--port`) so it's reachable.

## Acceptance criteria
- Two users adding items concurrently both see all items, correctly categorized, with no lost updates.
- A manual recategorization by one user is remembered and applied to that item name for everyone afterward.
- Checking an item syncs and does not change its aisle.
- Reordering aisles syncs and reflects in board column order.
- App opens and is usable with no network; total `.xdc` well under 1 MB.

## Out of scope (v1)
- Realtime cursors/presence (Level 3). Multi-language categorizer beyond the first table. Quantities, notes, photos, per-item assignees.
