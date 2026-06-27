import { AisleGroup, Item, itemsByAisle, wasCheckedThisSession } from "./store";

// Feature B — completed-item visibility:
//   show    — checked items always visible
//   hide    — checked items always hidden
//   session — checked items hidden, EXCEPT ones checked during this app session
//             (so a misclick can be corrected; they hide again after restart)
export type CompletedMode = "show" | "session" | "hide";

export function itemVisible(item: Item, mode: CompletedMode): boolean {
  if (!item.checked) return true;
  if (mode === "show") return true;
  if (mode === "hide") return false;
  return wasCheckedThisSession(item.id);
}

/** Aisle groups with completed items filtered per the chosen mode, empties removed. */
export function visibleGroups(mode: CompletedMode): AisleGroup[] {
  return itemsByAisle()
    .map((g) => ({
      category: g.category,
      items: g.items.filter((i) => itemVisible(i, mode)),
    }))
    .filter((g) => g.items.length > 0);
}
