// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ComponentType } from "react";

function installFakeWebxdc(): void {
  (globalThis.window as unknown as { webxdc: unknown }).webxdc = {
    selfAddr: "alice@example.com",
    selfName: "Alice",
    setUpdateListener: () => Promise.resolve(),
    sendUpdate: () => {},
  };
}

let App: ComponentType;
let store: typeof import("../src/store");

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
  App = (await import("../src/app/App")).App;
  store = await import("../src/store");
});

beforeEach(() => {
  store.importState(EMPTY);
  localStorage.clear();
});
afterEach(cleanup);

function add(name: string): void {
  const input = screen.getByPlaceholderText("Add an item…") as HTMLInputElement;
  fireEvent.change(input, { target: { value: name } });
  fireEvent.submit(input.closest("form")!);
}
function tap(el: Element): void {
  fireEvent.pointerDown(el);
  fireEvent.pointerUp(el);
}
function openSettings(): void {
  fireEvent.click(screen.getByLabelText("Settings"));
}
function clickText(text: string): void {
  fireEvent.click(screen.getByText(text));
}

describe("React app", () => {
  it("shows the empty state, then adds and auto-categorizes an item", () => {
    render(<App />);
    expect(document.querySelector(".empty")).not.toBeNull();
    add("Whole Milk");
    expect(screen.getByText("Whole Milk")).toBeTruthy();
    expect(screen.getByText("Dairy & Eggs")).toBeTruthy(); // section header
  });

  it("tapping a row toggles its checked state", () => {
    render(<App />);
    add("Apples");
    const row = document.querySelector(".row")!;
    expect(row.className).not.toContain("checked");
    tap(row);
    expect(document.querySelector(".row")!.className).toContain("checked");
  });

  it("who-added is hidden by default and revealed from Settings", () => {
    render(<App />);
    add("Milk");
    expect(document.querySelector(".row .who")).toBeNull();
    openSettings();
    clickText("Show who added items");
    expect(document.querySelector(".row .who")).not.toBeNull();
  });

  it("autocomplete datalist lists checked item names (feature E)", () => {
    render(<App />);
    add("Milk");
    tap(document.querySelector(".row")!); // check it
    const opts = [...document.querySelectorAll("#add-suggestions option")].map(
      (o) => o.getAttribute("value"),
    );
    expect(opts).toContain("Milk");
  });

  it("completed visibility modes from Settings (feature B)", () => {
    render(<App />);
    add("Bananas");

    // choose "Hide after restart" (session) then check the item
    openSettings();
    clickText("Hide after restart");
    clickText("Done");
    tap(document.querySelector(".row")!); // check this session
    // session mode: a just-checked item stays visible for correction
    expect(document.querySelector(".row.checked")).not.toBeNull();

    // switch to "Always hide" → the checked item disappears
    openSettings();
    clickText("Always hide");
    clickText("Done");
    expect(document.querySelector(".row.checked")).toBeNull();
    expect(document.querySelector(".row")).toBeNull(); // nothing left
  });

  it("custom group: create via Manage, appears in the item move menu (feature C)", () => {
    vi.useFakeTimers();
    try {
      render(<App />);
      add("Gizmo"); // → Other

      // create a custom group via Manage aisles
      fireEvent.click(screen.getByText("Aisles"));
      fireEvent.change(screen.getByPlaceholderText("New group name"), {
        target: { value: "Garage" },
      });
      fireEvent.click(document.querySelector(".add-group button")!); // "Add"
      expect(store.customAisles()).toContain("Garage");
      clickText("Done");

      // open the item menu via its ⋮ button, then go to the move list
      fireEvent.click(document.querySelector(".row .item-menu-btn")!);
      fireEvent.click(screen.getByText(/Move to aisle…/));
      // the custom group is offered as a destination
      const target = screen.getByText("Garage");
      fireEvent.click(target);
      const item = store.allItems().find((i) => i.name === "Gizmo")!;
      expect(item.category).toBe("Garage");
    } finally {
      vi.useRealTimers();
    }
  });

  it("custom group: delete moves its items back to Other (feature C)", () => {
    (window as unknown as { confirm: () => boolean }).confirm = () => true;
    render(<App />);
    store.addCustomAisle("Garage");
    add("Gizmo");
    const item = store.allItems().find((i) => i.name === "Gizmo")!;
    act(() => store.recategorize(item.id, "Garage"));

    fireEvent.click(screen.getByText("Aisles"));
    fireEvent.click(screen.getByLabelText("Delete group"));
    expect(store.customAisles()).not.toContain("Garage");
    expect(store.allItems().find((i) => i.id === item.id)!.category).toBe(
      "Other",
    );
  });

  it("switching language localizes the UI", () => {
    render(<App />);
    add("Apples");
    openSettings();
    clickText("Deutsch");
    expect(screen.getByText("Einkaufsliste")).toBeTruthy(); // h1
    expect(screen.getByText("Obst & Gemüse")).toBeTruthy(); // Produce label
  });
});
