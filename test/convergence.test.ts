import { describe, expect, it } from "vitest";
import * as Y from "yjs";

// These tests model the shared data structures used by the app (items as nested
// Y.Maps, an aisleOrder Y.Array, an overrides Y.Map) and verify that concurrent
// edits on independent peers converge after exchanging updates — the same merge
// the WebxdcProvider performs with encodeStateAsUpdateV2 / applyUpdateV2.

interface Peer {
  doc: Y.Doc;
  items: Y.Map<Y.Map<unknown>>;
  aisleOrder: Y.Array<string>;
  overrides: Y.Map<string>;
}

function makePeer(): Peer {
  const doc = new Y.Doc();
  return {
    doc,
    items: doc.getMap("items"),
    aisleOrder: doc.getArray("aisleOrder"),
    overrides: doc.getMap("overrides"),
  };
}

function addItem(p: Peer, id: string, name: string, category: string): void {
  p.doc.transact(() => {
    const m = new Y.Map<unknown>();
    p.items.set(id, m);
    m.set("name", name);
    m.set("category", category);
    m.set("checked", false);
    m.set("ts", 0);
  });
}

// Two-way sync, simulating eventual delivery of all updates in both directions.
function sync(a: Peer, b: Peer): void {
  const ua = Y.encodeStateAsUpdateV2(a.doc);
  const ub = Y.encodeStateAsUpdateV2(b.doc);
  Y.applyUpdateV2(a.doc, ub);
  Y.applyUpdateV2(b.doc, ua);
}

function snapshot(p: Peer): Record<string, unknown> {
  const items: Record<string, unknown> = {};
  p.items.forEach((m, id) => {
    items[id] = {
      name: m.get("name"),
      category: m.get("category"),
      checked: m.get("checked"),
    };
  });
  return {
    items,
    aisleOrder: p.aisleOrder.toArray(),
    overrides: Object.fromEntries(p.overrides.entries()),
  };
}

describe("convergence", () => {
  it("concurrent adds from two peers: both see all items, no lost updates", () => {
    const a = makePeer();
    const b = makePeer();

    addItem(a, "a1", "Milk", "Dairy & Eggs");
    addItem(a, "a2", "Apples", "Produce");
    addItem(b, "b1", "Chicken", "Meat & Seafood");
    addItem(b, "b2", "Bread", "Bakery");

    sync(a, b);

    expect(a.items.size).toBe(4);
    expect(b.items.size).toBe(4);
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("checking an item syncs and does not change its aisle", () => {
    const a = makePeer();
    const b = makePeer();
    addItem(a, "x", "Milk", "Dairy & Eggs");
    sync(a, b);

    // peer B checks the item
    b.items.get("x")!.set("checked", true);
    sync(a, b);

    expect(a.items.get("x")!.get("checked")).toBe(true);
    expect(a.items.get("x")!.get("category")).toBe("Dairy & Eggs");
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("concurrent check + recategorize on the same item both survive", () => {
    const a = makePeer();
    const b = makePeer();
    addItem(a, "x", "Olive Oil", "Other");
    sync(a, b);

    // A checks it; B (concurrently) moves it to Pantry & Baking + records override
    a.items.get("x")!.set("checked", true);
    b.doc.transact(() => {
      b.items.get("x")!.set("category", "Pantry & Baking");
      b.overrides.set("olive oil", "Pantry & Baking");
    });

    sync(a, b);

    // checked (from A) and category (from B) both present — orthogonal fields
    expect(a.items.get("x")!.get("checked")).toBe(true);
    expect(a.items.get("x")!.get("category")).toBe("Pantry & Baking");
    expect(a.overrides.get("olive oil")).toBe("Pantry & Baking");
    expect(snapshot(a)).toEqual(snapshot(b));
  });

  it("a recategorization override propagates to a peer", () => {
    const a = makePeer();
    const b = makePeer();
    a.overrides.set("ketchup", "Other");
    sync(a, b);
    expect(b.overrides.get("ketchup")).toBe("Other");
  });

  it("aisle reorder syncs to other peers", () => {
    const a = makePeer();
    const b = makePeer();
    a.doc.transact(() => {
      a.aisleOrder.delete(0, a.aisleOrder.length);
      a.aisleOrder.insert(0, ["Bakery", "Produce", "Dairy & Eggs"]);
    });
    sync(a, b);
    expect(b.aisleOrder.toArray()).toEqual([
      "Bakery",
      "Produce",
      "Dairy & Eggs",
    ]);
  });

  it("late joiner replays full history and converges", () => {
    const a = makePeer();
    const b = makePeer();
    addItem(a, "a1", "Milk", "Dairy & Eggs");
    addItem(b, "b1", "Bread", "Bakery");
    sync(a, b);
    a.items.get("a1")!.set("checked", true);
    b.doc.transact(() => {
      b.items.get("b1")!.set("category", "Snacks");
      b.overrides.set("bread", "Snacks");
    });
    sync(a, b);

    // A brand-new peer joins and receives the entire merged state at once.
    const late = makePeer();
    Y.applyUpdateV2(late.doc, Y.encodeStateAsUpdateV2(a.doc));

    expect(late.items.size).toBe(2);
    expect(snapshot(late)).toEqual(snapshot(a));
    expect(snapshot(late)).toEqual(snapshot(b));
  });

  it("reordered/duplicate update delivery still converges (idempotent merge)", () => {
    const a = makePeer();
    const b = makePeer();
    addItem(a, "a1", "Eggs", "Dairy & Eggs");
    const u1 = Y.encodeStateAsUpdateV2(a.doc);
    addItem(a, "a2", "Flour", "Pantry & Baking");
    const u2 = Y.encodeStateAsUpdateV2(a.doc);

    // deliver out of order and twice
    Y.applyUpdateV2(b.doc, u2);
    Y.applyUpdateV2(b.doc, u1);
    Y.applyUpdateV2(b.doc, u2);

    expect(b.items.size).toBe(2);
    expect(snapshot(b)).toEqual(snapshot(a));
  });
});
