import { describe, expect, it } from "vitest";
import { categorize, normalize } from "../src/categorizer";

const noOverrides = new Map<string, string>();

describe("normalize", () => {
  it("lowercases and trims", () => {
    expect(normalize("  Whole Milk  ")).toBe("whole milk");
  });
  it("collapses whitespace", () => {
    expect(normalize("red   bell    pepper")).toBe("red bell pepper");
  });
  it("naively singularizes the last word", () => {
    expect(normalize("tomatoes")).toBe("tomato");
    expect(normalize("apples")).toBe("apple");
    expect(normalize("berries")).toBe("berry");
    expect(normalize("dishes")).toBe("dish");
  });
  it("does not mangle short or already-singular words", () => {
    expect(normalize("gas")).toBe("gas");
    expect(normalize("milk")).toBe("milk");
  });
});

describe("categorize (keyword matching)", () => {
  it("matches a substring keyword", () => {
    expect(categorize("organic whole milk", noOverrides)).toBe("Dairy & Eggs");
  });
  it("categorizes produce", () => {
    expect(categorize("Bananas", noOverrides)).toBe("Produce");
    expect(categorize("baby spinach", noOverrides)).toBe("Produce");
  });
  it("categorizes meat & seafood", () => {
    expect(categorize("chicken breast", noOverrides)).toBe("Meat & Seafood");
    expect(categorize("salmon fillet", noOverrides)).toBe("Meat & Seafood");
  });
  it("prefers the more specific (longer) keyword", () => {
    // "ice cream" (Frozen) must win over "ice" (Frozen) and "cream" (Dairy)
    expect(categorize("vanilla ice cream", noOverrides)).toBe("Frozen");
    // "frozen pizza" beats generic
    expect(categorize("frozen pizza", noOverrides)).toBe("Frozen");
  });
  it("falls back to Other for unknown items", () => {
    expect(categorize("xyzzy widget", noOverrides)).toBe("Other");
  });
});

describe("categorize (German language pack)", () => {
  it("matches German grocery keywords to the canonical (English) category", () => {
    expect(categorize("Vollmilch", noOverrides, "de")).toBe("Dairy & Eggs");
    expect(categorize("Bananen", noOverrides, "de")).toBe("Produce");
    expect(categorize("Hähnchenbrust", noOverrides, "de")).toBe(
      "Meat & Seafood",
    );
    expect(categorize("Brötchen", noOverrides, "de")).toBe("Bakery");
    expect(categorize("Mineralwasser", noOverrides, "de")).toBe("Beverages");
    expect(categorize("Spülmittel", noOverrides, "de")).toBe("Household");
  });
  it("falls back to Other for unknown German items", () => {
    expect(categorize("Quxbar", noOverrides, "de")).toBe("Other");
  });
  it("an override (shared, language-neutral key) still wins in German", () => {
    const overrides = new Map<string, string>([["vollmilch", "Beverages"]]);
    expect(categorize("Vollmilch", overrides, "de")).toBe("Beverages");
  });
});

describe("categorize (override precedence)", () => {
  it("an override beats keyword matching", () => {
    const overrides = new Map<string, string>([["milk", "Beverages"]]);
    // 'milk' would normally be Dairy & Eggs
    expect(categorize("milk", overrides)).toBe("Beverages");
  });
  it("override is keyed by normalized name (plural/case insensitive)", () => {
    const overrides = new Map<string, string>([["tomato", "Pantry & Baking"]]);
    expect(categorize("Tomatoes", overrides)).toBe("Pantry & Baking");
  });
});
