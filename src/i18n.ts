import { CATEGORIES, Category } from "./categories";

// Supported UI languages. The categorizer keyword packs live in categories.ts
// and are keyed by the same codes.
export type Lang = "en" | "de";
export type LangPref = "auto" | Lang;

const LANG_KEY = "grocery.lang";

export function getLangPref(): LangPref {
  const v = localStorage.getItem(LANG_KEY);
  return v === "en" || v === "de" || v === "auto" ? v : "auto";
}

export function setLangPref(p: LangPref): void {
  localStorage.setItem(LANG_KEY, p);
}

/** Resolve the effective language: an explicit choice, or auto-detect from the
 *  browser locale (defaults to English). */
export function resolveLang(pref: LangPref = getLangPref()): Lang {
  if (pref === "en" || pref === "de") return pref;
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("de") ? "de" : "en";
}

type UIStrings = Record<string, string>;

const en: UIStrings = {
  app_title: "Groceries",
  add_placeholder: "Add an item…",
  add_button: "Add",
  view_list: "List",
  view_columns: "Columns",
  header_aisles: "Aisles",
  header_settings: "Settings",
  empty_title: "Your list is empty.",
  empty_subtitle: "Add something below to get started.",
  menu_move: "Move to aisle…",
  menu_rename: "Rename",
  menu_delete: "Delete",
  sheet_move_label: "Move to aisle",
  manage_title: "Manage aisles",
  manage_subtitle:
    "Drag to reorder the store layout. Empty aisles are hidden in views.",
  done: "Done",
  rename_prompt: "Rename item",
  empty_suffix: "(empty)",
  settings_title: "Settings",
  settings_show_who: "Show who added items",
  settings_language: "Language",
  lang_auto: "Automatic",
  lang_en: "English",
  lang_de: "Deutsch",
  settings_completed: "Completed items",
  settings_display: "Display",
  completed_show: "Always show",
  completed_session: "Hide after restart",
  completed_hide: "Always hide",
  manage_new_group: "New group name",
  manage_add_group: "Add",
  delete_group_confirm: "Delete this group? Its items move to Other.",
  settings_data: "Data",
  data_export: "Export list…",
  data_import: "Import list…",
  export_title: "Export list",
  export_hint: "Copy this, or download it as a file.",
  export_copy: "Copy to clipboard",
  export_copied: "Copied!",
  export_download: "Download .json",
  import_title: "Import list",
  import_hint:
    "Paste exported data or choose a file. This replaces the current list for everyone.",
  import_file: "Choose file…",
  import_apply: "Replace list",
  import_invalid: "Could not read that data.",
};

// German UI strings. Filled from the de localization data; any missing key
// falls back to English via t().
const de: UIStrings = {
  app_title: "Einkaufsliste",
  add_placeholder: "Artikel hinzufügen…",
  add_button: "Hinzufügen",
  view_list: "Liste",
  view_columns: "Spalten",
  header_aisles: "Gänge",
  header_settings: "Einstellungen",
  empty_title: "Deine Liste ist leer.",
  empty_subtitle: "Füge unten etwas hinzu, um zu beginnen.",
  menu_move: "In Gang verschieben…",
  menu_rename: "Umbenennen",
  menu_delete: "Löschen",
  sheet_move_label: "In Gang verschieben",
  manage_title: "Gänge verwalten",
  manage_subtitle:
    "Ziehen, um die Reihenfolge zu ändern. Leere Gänge werden ausgeblendet.",
  done: "Fertig",
  rename_prompt: "Artikel umbenennen",
  empty_suffix: "(leer)",
  settings_title: "Einstellungen",
  settings_show_who: "Zeigen, wer hinzugefügt hat",
  settings_language: "Sprache",
  lang_auto: "Automatisch",
  lang_en: "Englisch",
  lang_de: "Deutsch",
  settings_completed: "Erledigte Artikel",
  settings_display: "Anzeige",
  completed_show: "Immer anzeigen",
  completed_session: "Nach Neustart ausblenden",
  completed_hide: "Immer ausblenden",
  manage_new_group: "Name der neuen Gruppe",
  manage_add_group: "Hinzufügen",
  delete_group_confirm:
    "Diese Gruppe löschen? Ihre Artikel wandern nach Sonstiges.",
  settings_data: "Daten",
  data_export: "Liste exportieren…",
  data_import: "Liste importieren…",
  export_title: "Liste exportieren",
  export_hint: "Kopiere dies oder lade es als Datei herunter.",
  export_copy: "In Zwischenablage kopieren",
  export_copied: "Kopiert!",
  export_download: ".json herunterladen",
  import_title: "Liste importieren",
  import_hint:
    "Exportierte Daten einfügen oder Datei wählen. Dies ersetzt die aktuelle Liste für alle.",
  import_file: "Datei wählen…",
  import_apply: "Liste ersetzen",
  import_invalid: "Diese Daten konnten nicht gelesen werden.",
};

const UI: Record<Lang, UIStrings> = { en, de };

export function t(key: string, lang: Lang = resolveLang()): string {
  return UI[lang][key] ?? en[key] ?? key;
}

// Localized aisle/category display names. The canonical category keys are the
// English names, so the English label is the key itself.
const deCategoryLabels: Record<Category, string> = {
  Produce: "Obst & Gemüse",
  Bakery: "Backwaren",
  "Meat & Seafood": "Fleisch & Fisch",
  "Dairy & Eggs": "Milchprodukte & Eier",
  Frozen: "Tiefkühlkost",
  "Pantry & Baking": "Vorrat & Backen",
  Beverages: "Getränke",
  Snacks: "Snacks & Süßes",
  Household: "Haushalt",
  "Personal Care": "Körperpflege",
  Other: "Sonstiges",
};

// Accepts any aisle string: built-in category keys are localized; custom group
// names (not in the table) display verbatim.
export function categoryLabel(cat: string, lang: Lang = resolveLang()): string {
  if (lang === "de")
    return (deCategoryLabels as Record<string, string>)[cat] ?? cat;
  return cat;
}

// Re-exported so callers can iterate categories without importing categories.ts.
export { CATEGORIES };
