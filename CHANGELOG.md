# Changelog

All notable Firefox/Zen Browser release changes are documented here.

## [1.4.11] - 2026-07-27

### Fixed

- The search-box animation now replays when the user returns to the Zen Tab page while the search input retains focus.

## [1.4.10] - 2026-07-27

### Improved

- After a folder finishes closing, its homepage folder icon continues with the existing squash-and-bounce animation without opening a website.

## [1.4.9] - 2026-07-26

### Fixed

- Search input focus now retries when the new-tab page becomes visible, is restored from the page cache, or receives window focus. This covers Zen/Firefox startup timing where the initial hidden-page focus attempts were previously skipped.

## [1.4.8] - 2026-07-26

### Added

- Added a short squash-and-bounce launch animation to website icons. Navigation starts immediately after the first animation frame is painted.

### Fixed

- The search field now reliably receives input focus when a new-tab page opens.
- Folder closing now keeps the homepage blur visible for 210 ms, ending 100 ms after the 110 ms folder-panel motion.

## [1.4.7] - 2026-07-22

### Improved

- Refined the centered folder opening and closing transition while retaining the blurred homepage background.
- Reduced startup and folder-transition flicker for the wallpaper, search box, and saved icons.
- Improved favicon selection and local caching, including custom URL and local-image icon sources.
- Improved search-engine presentation, local history suggestions, and adjustable search layout controls.
- Improved GitHub Gist backup/restore handling, bilingual settings, and the quick-add current-page shortcut.

### Changed

- The Firefox release is now version `1.4.7` and continues to require Firefox 142 or later.
- Project licensing is now PolyForm Noncommercial License 1.0.0; commercial rights are not granted by the repository license.
