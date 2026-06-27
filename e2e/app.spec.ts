import { Page, expect, test } from "@playwright/test";

// Each test gets an isolated browser context, so mockWebxdc starts from a clean
// shared state every time.

async function addItem(page: Page, name: string): Promise<void> {
  const input = page.getByPlaceholder("Add an item…");
  await input.fill(name);
  await input.press("Enter");
}

function row(page: Page, name: string) {
  return page.locator(".row", { hasText: name }).first();
}

// section header for a given aisle (the <h2> with the aisle name)
function sectionHeader(page: Page, aisle: string) {
  return page.locator("section.section h2 span", { hasText: aisle }).first();
}

// Long-press a node to open its context menu (mouse interactions emit pointer
// events in Chromium; the handler opens the menu after 500ms).
async function longPress(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element not visible for long-press");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Groceries");
  // The mockWebxdc emulator injects a fixed control panel (Reset / Add Peer) at
  // bottom-left with z-index:9999 that overlaps the app's add-bar and would
  // intercept pointer events. Hide it; it does not exist in a real messenger.
  await page.addStyleTag({
    content: 'div[style*="z-index: 9999"]{display:none !important}',
  });
});

test("shows the empty state on first load", async ({ page }) => {
  await expect(page.locator(".empty")).toBeVisible();
  await expect(page.locator(".empty")).toContainText("empty");
  await expect(page.locator("form.addbar")).toBeVisible();
});

test("adds items and auto-categorizes them into aisle sections", async ({
  page,
}) => {
  await addItem(page, "Whole Milk");
  await addItem(page, "Bananas");
  await addItem(page, "Chicken breast");
  await addItem(page, "Sourdough bread");

  await expect(sectionHeader(page, "Dairy & Eggs")).toBeVisible();
  await expect(sectionHeader(page, "Produce")).toBeVisible();
  await expect(sectionHeader(page, "Meat & Seafood")).toBeVisible();
  await expect(sectionHeader(page, "Bakery")).toBeVisible();

  // milk lands under Dairy & Eggs specifically
  const dairy = page
    .locator("section.section")
    .filter({ has: page.locator("h2 span", { hasText: "Dairy & Eggs" }) });
  await expect(dairy.locator(".row .name")).toHaveText(["Whole Milk"]);
});

test("tapping a row checks it (strike-through) and keeps its aisle", async ({
  page,
}) => {
  await addItem(page, "Whole Milk");
  const milk = row(page, "Whole Milk");
  await expect(milk).not.toHaveClass(/checked/);

  await milk.click();
  await expect(row(page, "Whole Milk")).toHaveClass(/checked/);
  // still under Dairy & Eggs after checking
  await expect(sectionHeader(page, "Dairy & Eggs")).toBeVisible();

  // tapping again unchecks
  await row(page, "Whole Milk").click();
  await expect(row(page, "Whole Milk")).not.toHaveClass(/checked/);
});

test("checked items sink below unchecked ones in the same aisle", async ({
  page,
}) => {
  await addItem(page, "Apples");
  await addItem(page, "Bananas");
  await row(page, "Apples").click(); // check the first one

  const produce = page
    .locator("section.section")
    .filter({ has: page.locator("h2 span", { hasText: "Produce" }) });
  // unchecked "Bananas" should now be above checked "Apples"
  await expect(produce.locator(".row .name")).toHaveText(["Bananas", "Apples"]);
});

test("long-press → move to aisle recategorizes and is remembered for that name", async ({
  page,
}) => {
  await addItem(page, "Pasta"); // → Pantry & Baking by keyword
  await expect(sectionHeader(page, "Pantry & Baking")).toBeVisible();

  await longPress(page, row(page, "Pasta"));
  await expect(page.locator(".sheet")).toBeVisible();
  await page.getByRole("button", { name: /Move to aisle/ }).click();
  await page.locator(".sheet button.action", { hasText: "Produce" }).click();

  // moved to Produce
  const produce = page
    .locator("section.section")
    .filter({ has: page.locator("h2 span", { hasText: "Produce" }) });
  await expect(
    produce.locator(".row .name", { hasText: "Pasta" }),
  ).toBeVisible();

  // override is remembered: delete it, then re-adding the same name lands in
  // Produce again — NOT its keyword-default aisle (Pantry & Baking)
  await longPress(page, row(page, "Pasta"));
  await page.getByRole("button", { name: /Delete/ }).click();
  await expect(page.locator(".row", { hasText: "Pasta" })).toHaveCount(0);

  await addItem(page, "Pasta");
  await expect(produce.locator(".row .name", { hasText: "Pasta" })).toHaveCount(
    1,
  );
  const pantry = page
    .locator("section.section")
    .filter({ has: page.locator("h2 span", { hasText: "Pantry & Baking" }) });
  await expect(pantry.locator(".row .name", { hasText: "Pasta" })).toHaveCount(
    0,
  );
});

test("long-press → rename updates the item", async ({ page }) => {
  await addItem(page, "Milk");
  page.once("dialog", (d) => d.accept("Oat Milk"));
  await longPress(page, row(page, "Milk"));
  await page.getByRole("button", { name: /Rename/ }).click();
  await expect(row(page, "Oat Milk")).toBeVisible();
});

test("long-press → delete removes the item", async ({ page }) => {
  await addItem(page, "Tomatoes");
  await longPress(page, row(page, "Tomatoes"));
  await page.getByRole("button", { name: /Delete/ }).click();
  await expect(page.locator(".row", { hasText: "Tomatoes" })).toHaveCount(0);
  await expect(page.locator(".empty")).toBeVisible();
});

test("adding the same item twice does not duplicate it (feature H)", async ({
  page,
}) => {
  await addItem(page, "bread");
  await addItem(page, "bread");
  await addItem(page, "bread");
  await expect(page.locator(".row", { hasText: "bread" })).toHaveCount(1);
});

test("re-adding a checked item brings it back unchecked (feature H)", async ({
  page,
}) => {
  await addItem(page, "Eggs");
  await row(page, "Eggs").click(); // check it
  await expect(row(page, "Eggs")).toHaveClass(/checked/);

  await addItem(page, "eggs"); // same name, different case
  await expect(row(page, "Eggs")).not.toHaveClass(/checked/);
  await expect(page.locator(".row", { hasText: "Eggs" })).toHaveCount(1);
});

test("swipe a row left to delete it (feature I)", async ({ page }) => {
  await addItem(page, "Tomatoes");
  const r = row(page, "Tomatoes");
  const b = await r.boundingBox();
  if (!b) throw new Error("row not laid out");
  const cy = b.y + b.height / 2;

  await page.mouse.move(b.x + b.width / 2, cy);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 60, cy, { steps: 4 }); // start swiping
  await page.mouse.move(b.x + 12, cy, { steps: 12 }); // past the delete threshold
  await page.mouse.up();

  await expect(page.locator(".row", { hasText: "Tomatoes" })).toHaveCount(0);
});

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".sheet-title")).toContainText("Settings");
}

test("there is no Clear button (clearing was removed)", async ({ page }) => {
  await addItem(page, "Apples");
  await expect(page.getByRole("button", { name: /Clear/ })).toHaveCount(0);
});

test("settings: 'Always hide' removes checked rows from the list (feature B)", async ({
  page,
}) => {
  await addItem(page, "Apples");
  await addItem(page, "Bananas");
  await row(page, "Apples").click(); // check Apples
  await expect(page.locator(".row.checked")).toHaveCount(1);

  await openSettings(page);
  await page.locator(".settings-row", { hasText: "Always hide" }).click();
  await page.locator(".sheet button.done").click();

  await expect(page.locator(".row.checked")).toHaveCount(0);
  await expect(row(page, "Bananas")).toBeVisible(); // unchecked stays
});

test("settings: 'Hide after restart' keeps just-checked items until reload (feature B)", async ({
  page,
}) => {
  await addItem(page, "Apples");

  await openSettings(page);
  await page
    .locator(".settings-row", { hasText: "Hide after restart" })
    .click();
  await page.locator(".sheet button.done").click();

  // check it this session → stays visible so a misclick can be corrected
  await row(page, "Apples").click();
  await expect(page.locator(".row.checked")).toHaveCount(1);

  // after closing & reopening the app, the previously-checked item is hidden
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Groceries");
  await expect(page.locator(".row")).toHaveCount(0);

  // ...but it still exists — switching to "Always show" brings it back checked,
  // proving it persisted across reload and was merely hidden by session reset.
  await openSettings(page);
  await page.locator(".settings-row", { hasText: "Always show" }).click();
  await page.locator(".sheet button.done").click();
  await expect(page.locator(".row.checked")).toHaveCount(1);
});

test("settings: who-added is hidden by default and can be shown", async ({
  page,
}) => {
  await addItem(page, "Apples");
  await expect(page.locator(".row .who")).toHaveCount(0); // hidden by default

  await openSettings(page);
  await page.locator(".settings-row", { hasText: "who" }).click();
  await page.locator(".sheet button.done").click();

  await expect(page.locator(".row .who")).toHaveCount(1);
});

test("settings: switching language localizes the UI and aisle names", async ({
  page,
}) => {
  await addItem(page, "Apples"); // Produce

  await openSettings(page);
  await page.locator(".settings-row", { hasText: "Deutsch" }).click();
  await page.locator(".sheet button.done").click();

  await expect(page.locator("h1")).toHaveText("Einkaufsliste");
  await expect(page.getByPlaceholder("Artikel hinzufügen…")).toBeVisible();
  await expect(page.locator("section.section h2 span").first()).toHaveText(
    "Obst & Gemüse",
  );
});

test("columns view: board + aisle switcher, switching scrolls columns, pref persists", async ({
  page,
}) => {
  await addItem(page, "Apples"); // Produce
  await addItem(page, "Milk"); // Dairy & Eggs

  await page.getByRole("button", { name: "Columns" }).click();
  await expect(page.locator(".board")).toBeVisible();
  await expect(page.locator(".aisle-switch")).toBeVisible();

  // first column (Produce) is active; tap the Dairy chip to page to it
  await expect(page.locator(".column h2").first()).toHaveText("Produce");
  await page.locator(".chip", { hasText: "Dairy & Eggs" }).click();
  await expect(page.locator(".chip.active")).toContainText("Dairy & Eggs");

  // a card in the board can be checked too
  const card = page.locator(".kcard", { hasText: "Milk" });
  await card.click();
  await expect(page.locator(".kcard", { hasText: "Milk" })).toHaveClass(
    /checked/,
  );

  // view preference persists across reload
  await page.reload();
  await expect(page.locator(".board")).toBeVisible();
});

// react-draggable engages on mouse events, which need a non-touch context to
// fire cleanly — run this one in a desktop profile and drive it with page.mouse.
test.describe("manage aisles (desktop)", () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: { width: 1280, height: 1400 },
  });

  test("drag-and-drop reorder moves a section to the top", async ({ page }) => {
    await addItem(page, "Apples"); // Produce (default first)
    await addItem(page, "Sourdough bread"); // Bakery (default second)
    await expect(page.locator("section.section h2 span").first()).toHaveText(
      "Produce",
    );

    await page.getByRole("button", { name: "Aisles" }).click();
    await expect(page.locator(".sheet-title")).toContainText("Manage aisles");
    await page.waitForTimeout(400); // let the bottom-sheet slide-up settle

    // drag Bakery's handle up above Produce (react-draggable, real mouse)
    const handle = page
      .locator(".manage-row", { hasText: "Bakery" })
      .locator(".drag-handle");
    await handle.hover();
    const h = await handle.boundingBox();
    if (!h) throw new Error("drag handle not laid out");
    const cx = h.x + h.width / 2;
    const cy = h.y + h.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 30, { steps: 6 });
    await page.mouse.move(cx, cy - 90, { steps: 12 });

    // a drop indicator shows where it would land while dragging
    await expect(page.locator(".drop-line")).toHaveCount(1);

    await page.mouse.up();

    // indicator clears after dropping, and the manage list reordered
    await expect(page.locator(".drop-line")).toHaveCount(0);
    await expect(page.locator(".manage-row").first()).toHaveAttribute(
      "data-cat",
      "Bakery",
    );

    await page.locator(".sheet button.done").click();
    await expect(page.locator("section.section h2 span").first()).toHaveText(
      "Bakery",
    );
  });

  test("drag a list row onto another aisle's section recategorizes it (feature F)", async ({
    page,
  }) => {
    await addItem(page, "Milk"); // Dairy & Eggs
    await addItem(page, "Apples"); // Produce

    const grip = row(page, "Milk").locator(".item-drag-handle");
    const produce = page.locator('.section[data-aisle="Produce"]');
    await grip.hover();
    const g = await grip.boundingBox();
    const ps = await produce.boundingBox();
    if (!g || !ps) throw new Error("not laid out");

    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(ps.x + ps.width / 2, ps.y + ps.height - 10, {
      steps: 16,
    });
    // the target section is highlighted while hovering
    await expect(produce).toHaveClass(/drop-target/);
    await page.mouse.up();

    // Milk now lives under Produce
    await expect(
      produce.locator(".row .name", { hasText: "Milk" }),
    ).toHaveCount(1);
  });

  test("drag a kanban card to another column recategorizes it (feature F)", async ({
    page,
  }) => {
    await addItem(page, "Milk"); // Dairy & Eggs
    await addItem(page, "Apples"); // Produce
    await page.getByRole("button", { name: "Columns" }).click();

    const grip = page
      .locator('.column[data-aisle="Dairy & Eggs"] .kcard', { hasText: "Milk" })
      .locator(".item-drag-handle");
    const produceCol = page.locator('.column[data-aisle="Produce"]');
    await grip.hover();
    const g = await grip.boundingBox();
    const pc = await produceCol.boundingBox();
    if (!g || !pc) throw new Error("not laid out");

    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(pc.x + pc.width / 2, pc.y + 60, { steps: 16 });
    await expect(produceCol).toHaveClass(/drop-target/);
    await page.mouse.up();

    await expect(
      produceCol.locator(".kcard .name", { hasText: "Milk" }),
    ).toHaveCount(1);
  });
});

test("default completed mode is 'Hide after restart' (feature D)", async ({
  page,
}) => {
  await openSettings(page);
  await expect(
    page
      .locator(".settings-row", { hasText: "Hide after restart" })
      .locator(".radio-tick"),
  ).toHaveCount(1);
});

test("custom group: create, move an item into it, then delete (feature C)", async ({
  page,
}) => {
  await addItem(page, "Garden Gnome"); // → Other

  // create a custom group
  await page.getByRole("button", { name: "Aisles" }).click();
  await page.getByPlaceholder("New group name").fill("Garage");
  await page.locator(".add-group button").click();
  await expect(
    page.locator(".manage-row", { hasText: "Garage" }),
  ).toBeVisible();
  await page.locator(".sheet button.done").click();

  // long-press the item → Move to aisle… → Garage
  await longPress(page, row(page, "Garden Gnome"));
  await page.getByRole("button", { name: /Move to aisle/ }).click();
  await page.locator(".sheet button.action", { hasText: "Garage" }).click();

  // it now lives under the custom group
  const garage = page
    .locator("section.section")
    .filter({ has: page.locator("h2 span", { hasText: "Garage" }) });
  await expect(garage.locator(".row .name")).toHaveText(["Garden Gnome"]);

  // delete the group → item falls back to Other
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Aisles" }).click();
  await page
    .locator(".manage-row", { hasText: "Garage" })
    .locator(".del-aisle")
    .click();
  await page.locator(".sheet button.done").click();

  const other = page
    .locator("section.section")
    .filter({ has: page.locator("h2 span", { hasText: "Other" }) });
  await expect(other.locator(".row .name")).toHaveText(["Garden Gnome"]);
});

test("export then import round-trips the full state (feature D)", async ({
  page,
}) => {
  await addItem(page, "Milk");
  await addItem(page, "Bread");

  // grab the exported JSON from the export sheet's textarea
  await openSettings(page);
  await page.locator(".settings-row", { hasText: "Export" }).click();
  const json = await page.locator("textarea.data-area").inputValue();
  expect(json).toContain("Milk");
  await page.locator(".sheet button.done").click(); // close export sheet

  // wipe the list
  await longPress(page, row(page, "Milk"));
  await page.getByRole("button", { name: /Delete/ }).click();
  await longPress(page, row(page, "Bread"));
  await page.getByRole("button", { name: /Delete/ }).click();
  await expect(page.locator(".row")).toHaveCount(0);

  // import the saved JSON back
  await openSettings(page);
  await page.locator(".settings-row", { hasText: "Import" }).click();
  await page.locator("textarea.data-area").fill(json);
  await page
    .locator(".sheet button.action", { hasText: "Replace list" })
    .click();

  await expect(row(page, "Milk")).toBeVisible();
  await expect(row(page, "Bread")).toBeVisible();
});

test("add field autocompletes from checked items (feature E)", async ({
  page,
}) => {
  await addItem(page, "Oat Milk");
  await row(page, "Oat Milk").click(); // check it → becomes a suggestion

  // the datalist backing the add input contains the checked item's name
  await expect(
    page.locator('datalist#add-suggestions option[value="Oat Milk"]'),
  ).toHaveCount(1);
  await expect(page.getByPlaceholder("Add an item…")).toHaveAttribute(
    "list",
    "add-suggestions",
  );
});
