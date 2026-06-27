# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
