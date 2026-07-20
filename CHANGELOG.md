# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-07-20

### Fixed

- Android: the add-field autocomplete rendered as a near-full-screen native
  popup covering the on-screen keyboard and the input, making typing
  impossible. The native `<datalist>` (broken in Android WebView) is replaced
  by an in-page suggestion list that opens upward from the add bar, filters as
  you type, and is capped at 6 entries.
- Suggestion taps are handled on pointerup (the Delta Chat WebView blurs the
  input before click, so clicks never landed), guarded so a drag ending on the
  list can't add anything.

### Changed

- Tapping a suggestion now adds the item directly and keeps the keyboard open,
  instead of only filling the input.
- CI installs with `npm ci` against the committed lockfile (previously
  `pnpm i` resolved fresh, breaking versions) and posts a preview `.xdc`
  download link as a sticky comment on pull requests.

## [0.3.0] - 2026-06-28

### Added

- Settings toggle "Notify chat on changes" (per device) to silence the webxdc
  info message posted into the chat on edits.

### Changed

- The chat info line now reads "… updated the grocery list" for an existing
  list, reserving "… started a shared grocery list" for a genuine first
  creation. The text is localized (en/de).

## [0.2.0] - 2026-06-27

### Fixed

- Correct `source_code_url` in the webxdc manifest — it pointed at a
  nonexistent Codeberg repo instead of the GitHub one.

### Changed

- Trimmed over-engineering: folded `usePrefBool` into `usePref`, dropped the
  dead `CATEGORIES` re-export, `DEFAULT_AISLES` alias, `nextTimestamp` helper,
  and unused `y-webxdc` type members.

### Added

- Prettier pre-commit hook (`.githooks/`, wired via the `prepare` script) so
  commits mirror CI's format check.
- CI now grants `contents: write` so the tagged release publishes the `.xdc`.

## [0.1.0] - 2026-06-27

### Added

- Initial release: shared grocery board (webxdc + Yjs) with list and columns
  views, automatic aisle categorization (English/German), custom groups,
  drag-to-reorder store layout, completed-item visibility modes, swipe-to-
  delete, and list import/export.
