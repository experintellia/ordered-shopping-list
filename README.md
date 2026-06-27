# Grocery Board

A collaborative grocery shopping list as a [webxdc](https://webxdc.org) mini app
for Delta Chat and compatible messengers. Items you add are auto-sorted into
store-aisle sections; view them as a **List** or as a swipeable **Columns**
(kanban) board. All state is shared across everyone in the chat and works fully
offline.

Modeled on Apple Reminders' Groceries list, built with **React** on
**Yjs + y-webxdc** (a Level-2 webxdc app) so concurrent edits from many peers
converge with no lost updates.

## Features

- **Auto-categorizer** — type "organic whole milk", it lands in _Dairy & Eggs_.
  Offline keyword tables in **English and German**.
- **Multilanguage** — UI strings and aisle names localize to English or German
  (auto-detected from the browser, or chosen in Settings). Categories are stored
  as language-neutral keys so a shared list reads correctly for everyone.
- **No duplicates** — adding a name that's already on the list won't create a
  second entry; if that item was checked off, re-adding it brings it back.
  Duplicates from concurrent edits are merged deterministically across peers.
- **Delete** — swipe a row/card left to delete it, or use the long-press menu.
- **Shared learned overrides** — move an item to a different aisle once and the
  correction is remembered for that item name for _everyone_.
- **Two views over one model** — List (grouped by aisle, tap to check) and
  Columns: a Trello-style board you scroll horizontally, with a chip switcher
  pinned on top to jump to an aisle.
- **Drag items between aisles** — grab an item's grip handle and drop it onto
  another aisle's column (board) or section (list) to recategorize it, with a
  live drop-target highlight. (Long-press → move still works too.)
- **Orthogonal checking** — checking an item ("got it") strikes it through and
  sinks it; it never changes the item's aisle.
- **Completed-item visibility** — Settings offers _Always show_, _Always hide_,
  or _Hide after restart_ (the **default**): the last keeps items you just
  checked visible so a misclick is correctable, then hides them on reopen.
- **Custom groups** — create your own aisles (e.g. "Garage") for things the
  auto-sorter can't place; items enter them only via a manual move. Shared
  across the chat. Deleting a group returns its items to _Other_.
- **Import / export** — export the full shared state (items, checked state,
  custom groups, overrides) as JSON to copy or download, and import it back —
  applied to the shared doc for everyone.
- **Autocomplete** — the add field suggests names of items you've checked off,
  for quick re-adding.
- **Who-added** — optionally show who added each item (hidden by default).
- **Manage aisles** — **drag and drop** (react-draggable) to reorder the store
  layout; the order is shared so the household agrees. Empty aisles are hidden.
- **Dark mode**, large tap targets, long-press menu (move / rename / delete).

## Develop

```bash
npm install
npm run dev          # Vite dev server with the mockWebxdc emulator
```

The dev script passes `--host` so the port is reachable from outside a
container. In Docker, publish the port: `-p 3000:3000`.

### Multi-peer testing

Spin up multiple isolated instances to test convergence (concurrent adds,
checks, recategorizations, late joiners):

```bash
npm run test:peers   # concurrently runs the dev server + webxdc-dev
```

In Docker, also publish webxdc-dev's UI port (e.g. `--port 7000` → `-p 7000:7000`).

### Unit / integration tests

```bash
npm test             # categorizer, CRDT convergence, and DOM integration tests
```

### End-to-end tests (Playwright)

```bash
npm run test:e2e     # drives the real app in Chromium against the dev server
```

Covers the full UI: empty state, add + auto-categorize, tap-to-check (aisle
unchanged), checked items sinking, long-press menu (move/rename/delete), the
shared override being remembered, the three completed-visibility modes (incl.
hide-after-reload), custom groups, import/export round-trip, autocomplete,
columns view + persistence, and drag-and-drop aisle reordering. E2E uses
`vite.config.e2e.ts` (a plain-HTTP variant with only `mockWebxdc`, no HTTPS) so
Playwright's readiness probe works without a TLS handshake. First run needs
browsers: `npx playwright install --with-deps chromium`.

## Build

```bash
npm run build        # type-checks, bundles, and emits dist-xdc/app.xdc
```

`@webxdc/vite-plugins` produces a self-contained `.xdc` (~105 KB; React is
bundled). `webxdc.js` is provided by the messenger and intentionally **not**
bundled.

## Project layout

```
src/
  categories.ts    canonical aisles + en/de keyword language packs
  categorizer.ts   normalize() + categorize() (override → keyword → Other)
  i18n.ts          UI string + aisle-name translations (en/de), language pref
  visibility.ts    completed-item visibility modes (pure, testable)
  store.ts         Y.Doc + WebxdcProvider, shared types + mutations, custom
                   groups, import/export, subscribe + version snapshot
  react-store.ts   useSyncExternalStore hook bridging the store to React
  app/
    App.tsx        root: state, header, add bar (autocomplete), overlay routing
    views.tsx      ListView, BoardView, rows/cards, tap + long-press gestures
    sheets.tsx     item menu, manage (react-draggable reorder + groups),
                   settings, import/export sheets
    ui.tsx         language context + shared sheet primitives
  main.tsx         createRoot entry point
public/
  manifest.toml    name = "Grocery Board"
  icon.png         512×512 app icon (regenerate: node scripts/make-icon.mjs)
```

## Shared data model (Yjs)

- `items: Y.Map<id, Y.Map>` — `{ name, category, checked, addedBy, ts }`.
  `checked` is orthogonal to `category`. Per-item nested maps so a concurrent
  check and recategorize on the same item both survive.
- `aisleOrder: Y.Array<string>` — custom store layout (empty ⇒ default order).
- `overrides: Y.Map<normalizedName, category>` — shared learned recategorizations.
- `customAisles: Y.Array<string>` — user-created groups (shared). Categories are
  free strings, so an item's `category` may be a built-in key or a custom name.
