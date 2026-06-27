// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

function installFakeWebxdc(): void {
  (globalThis.window as unknown as { webxdc: unknown }).webxdc = {
    selfAddr: "alice@example.com",
    selfName: "Alice",
    setUpdateListener: () => Promise.resolve(),
    sendUpdate: () => {},
  };
}

type Store = typeof import("../src/store");
type Visibility = typeof import("../src/visibility");
let store: Store;
let vis: Visibility;

const EMPTY = {
  version: 1 as const,
  exportedAt: 0,
  items: [],
  aisleOrder: [],
  overrides: {},
  customAisles: [],
};

beforeAll(async () => {
  installFakeWebxdc();
  store = await import("../src/store");
  vis = await import("../src/visibility");
});

beforeEach(() => {
  store.importState(EMPTY); // reset shared state between tests
});

describe("custom groups (feature C)", () => {
  it("adds a custom group and exposes it as a known aisle", () => {
    store.addCustomAisle("BBQ Corner");
    expect(store.customAisles()).toContain("BBQ Corner");
    expect(store.knownAisles()).toContain("BBQ Corner");
    expect(store.effectiveAisleOrder()).toContain("BBQ Corner");
    expect(store.isCustomAisle("BBQ Corner")).toBe(true);
  });

  it("ignores blank and duplicate group names", () => {
    store.addCustomAisle("Garden");
    store.addCustomAisle("garden"); // case-insensitive dup
    store.addCustomAisle("   ");
    store.addCustomAisle("Produce"); // collides with a built-in
    expect(store.customAisles()).toEqual(["Garden"]);
  });

  it("is never an auto-categorization target — items only enter via manual move", () => {
    store.addCustomAisle("Garden");
    store.addItem("Tomatoes"); // would auto-sort to Produce
    let item = store.allItems().find((i) => i.name === "Tomatoes")!;
    expect(item.category).toBe("Produce");
    store.recategorize(item.id, "Garden");
    item = store.allItems().find((i) => i.id === item.id)!;
    expect(item.category).toBe("Garden");
  });

  it("deleting a custom group moves its items to Other", () => {
    store.addCustomAisle("Garden");
    store.addItem("Gnome");
    const item = store.allItems().find((i) => i.name === "Gnome")!;
    store.recategorize(item.id, "Garden");
    store.deleteCustomAisle("Garden");
    expect(store.customAisles()).not.toContain("Garden");
    expect(store.allItems().find((i) => i.id === item.id)!.category).toBe(
      "Other",
    );
  });
});

describe("completed visibility (feature B)", () => {
  function names(mode: "show" | "session" | "hide"): string[] {
    return vis.visibleGroups(mode).flatMap((g) => g.items.map((i) => i.name));
  }

  it("session mode shows items checked THIS session, hides ones checked before", () => {
    // an item that is checked but was not checked this session (came via import)
    store.importState({
      ...EMPTY,
      items: [
        {
          name: "OldMilk",
          category: "Dairy & Eggs",
          checked: true,
          addedBy: "",
          ts: 1,
        },
      ],
    });
    // an item checked during this session, plus an unchecked one
    store.addItem("FreshBread");
    const fresh = store.allItems().find((i) => i.name === "FreshBread")!;
    store.toggleChecked(fresh.id); // checked this session
    store.addItem("Eggs"); // unchecked

    expect(names("show")).toEqual(
      expect.arrayContaining(["OldMilk", "FreshBread", "Eggs"]),
    );
    expect(names("hide")).toEqual(["Eggs"]); // all checked hidden
    const session = names("session");
    expect(session).toContain("FreshBread"); // checked this session → visible
    expect(session).toContain("Eggs"); // unchecked → visible
    expect(session).not.toContain("OldMilk"); // checked earlier → hidden
  });
});

describe("import / export (feature D)", () => {
  it("round-trips items, checked state, custom groups and overrides", () => {
    store.addItem("Milk");
    store.addItem("Bread");
    store.addCustomAisle("Garden");
    const milk = store.allItems().find((i) => i.name === "Milk")!;
    store.toggleChecked(milk.id);
    store.recategorize(milk.id, "Garden"); // also writes an override

    const snapshot = store.exportState();
    store.importState(EMPTY);
    expect(store.allItems()).toHaveLength(0);

    store.importState(snapshot);
    const items = store.allItems();
    expect(items.map((i) => i.name).sort()).toEqual(["Bread", "Milk"]);
    expect(store.customAisles()).toContain("Garden");
    const milk2 = store.allItems().find((i) => i.name === "Milk")!;
    expect(milk2.checked).toBe(true);
    expect(milk2.category).toBe("Garden");
    // deleting an item drops its override: re-adding falls back to the keyword
    // aisle (Dairy & Eggs), not the previously-corrected Garden
    store.deleteItem(milk2.id);
    store.addItem("Milk");
    const reAdded = store.allItems().find((i) => i.name === "Milk")!;
    expect(reAdded.category).toBe("Dairy & Eggs");
  });

  it("rejects unrecognized import data", () => {
    expect(() => store.importState({} as never)).toThrow();
  });
});

describe("autocomplete source (feature E)", () => {
  it("returns distinct names of checked items only", () => {
    store.addItem("Milk");
    store.addItem("Milk"); // duplicate
    store.addItem("Bread"); // stays unchecked
    for (const it of store.allItems()) {
      if (it.name === "Milk") store.toggleChecked(it.id);
    }
    const suggestions = store.checkedItemNames();
    expect(suggestions).toContain("Milk");
    expect(suggestions).not.toContain("Bread");
    expect(suggestions.filter((n) => n === "Milk")).toHaveLength(1); // distinct
  });
});

describe("dedupe (feature H)", () => {
  it("addItem never creates a second item with the same (normalized) name", () => {
    store.addItem("Bread");
    store.addItem("bread");
    store.addItem("BREAD");
    expect(store.allItems()).toHaveLength(1);
  });

  it("re-adding a checked item brings it back (unchecks it)", () => {
    store.addItem("Eggs");
    const egg = store.allItems().find((i) => i.name === "Eggs")!;
    store.toggleChecked(egg.id);
    expect(store.allItems().find((i) => i.id === egg.id)!.checked).toBe(true);

    store.addItem("eggs"); // same name, different case
    expect(store.allItems()).toHaveLength(1);
    expect(store.allItems().find((i) => i.id === egg.id)!.checked).toBe(false);
  });

  it("reactive dedupe collapses pre-existing duplicates, merging checked", async () => {
    store.importState({
      ...EMPTY,
      items: [
        {
          name: "Bread",
          category: "Bakery",
          checked: false,
          addedBy: "",
          ts: 1,
        },
        {
          name: "bread",
          category: "Bakery",
          checked: true,
          addedBy: "",
          ts: 2,
        },
        {
          name: "BREAD",
          category: "Bakery",
          checked: false,
          addedBy: "",
          ts: 3,
        },
      ],
    });
    await Promise.resolve();
    await Promise.resolve();
    const items = store.allItems();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Bread"); // earliest by ts kept
    expect(items[0].checked).toBe(true); // checked merged from a duplicate
  });
});
