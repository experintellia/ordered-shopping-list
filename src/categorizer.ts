import {
  Category,
  DEFAULT_LANGUAGE,
  FALLBACK_CATEGORY,
  LANGUAGES,
  LanguagePack,
} from "./categories";

/**
 * Normalize a raw item name into a stable key used for keyword matching and as
 * the override key. Lowercase, trim, collapse internal whitespace, and apply a
 * naive singularization so "tomatoes"/"tomato" share one override entry.
 */
export function normalize(raw: string): string {
  const base = raw.toLowerCase().trim().replace(/\s+/g, " ");
  return singularize(base);
}

// Naive English singularizer applied to the final word of the phrase. Good
// enough for grocery items; not meant to be linguistically complete.
function singularize(s: string): string {
  if (s.length < 4) return s;
  const words = s.split(" ");
  const last = words[words.length - 1];
  let sing = last;
  if (/(ses|zes|ches|shes|xes)$/.test(last)) {
    sing = last.slice(0, -2);
  } else if (/ies$/.test(last) && last.length > 4) {
    sing = last.slice(0, -3) + "y";
  } else if (/oes$/.test(last)) {
    sing = last.slice(0, -2);
  } else if (/[^s]s$/.test(last) && !/(ss|us|is)$/.test(last)) {
    sing = last.slice(0, -1);
  }
  words[words.length - 1] = sing;
  return words.join(" ");
}

// Precompute, per language, a list of [keyword, category] pairs sorted by
// descending keyword length so more specific keywords win (e.g. "ice cream"
// beats "ice", "frozen pizza" beats "pizza").
const keywordIndexCache = new Map<string, [string, Category][]>();

function keywordIndex(lang: string): [string, Category][] {
  const cached = keywordIndexCache.get(lang);
  if (cached) return cached;
  const pack: LanguagePack = LANGUAGES[lang] ?? LANGUAGES[DEFAULT_LANGUAGE];
  const pairs: [string, Category][] = [];
  for (const category of Object.keys(pack) as Category[]) {
    for (const keyword of pack[category]) {
      pairs.push([keyword, category]);
    }
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  keywordIndexCache.set(lang, pairs);
  return pairs;
}

/**
 * Resolve a category for a raw item name. Resolution order:
 *   1. a shared manual override for the normalized name;
 *   2. keyword/substring match against the language table (longest first);
 *   3. fallback to "Other".
 */
export function categorize(
  rawName: string,
  overrides: Map<string, string> | { get(k: string): string | undefined },
  lang: string = DEFAULT_LANGUAGE,
): Category {
  const key = normalize(rawName);

  const override = overrides.get(key);
  if (override) return override as Category;

  for (const [keyword, category] of keywordIndex(lang)) {
    if (key.includes(keyword)) return category;
  }

  return FALLBACK_CATEGORY;
}
