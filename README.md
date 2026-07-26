# Zen Tab — Firefox / Zen Browser

<p align="center">
  A local-first, glassmorphism new-tab extension for Firefox and Zen Browser.
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README_zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.4.11-6f42c1" alt="Version 1.4.11">
  <img src="https://img.shields.io/badge/Firefox%20%2F%20Zen-142%2B-f97316" alt="Firefox and Zen Browser">
  <img src="https://img.shields.io/badge/license-PolyForm%20NC%201.0.0-8b1e3f" alt="PolyForm Noncommercial License 1.0.0">
</p>

## Overview

Zen Tab replaces the browser new-tab page with a customizable homepage. It keeps bookmarks, folders, icons, visual settings, search history, and optional GitHub backups under the user's control. The extension is designed to work offline for normal homepage use; network access is used only when a selected feature needs it, such as loading a favicon, running a web search, or synchronizing a GitHub Gist.

## Highlights

| Area | Included capabilities |
| --- | --- |
| Search | Built-in Google, Bing, DuckDuckGo, Baidu, and Bilibili engines; custom engines; local matching and history suggestions; adjustable search-box dimensions and engine icon size |
| Bookmarks | Add, edit, delete, drag, reorder, and group websites into folders; configurable number of icons per row |
| Icons | Automatic favicon matching, website `/favicon.ico`, custom URL icons, local-image icons, local caching, high-resolution bundled search-engine icons |
| Folders | Folder previews, drag-and-drop management, centered glass panel, and source-to-center open/close animation |
| Appearance | Wallpaper, wallpaper blur, logo, browser tab icon, glass theme, icon opacity/blur/size, and independent vertical offsets for logo, search, and bookmark regions |
| Backup | Local JSON export/import plus optional private GitHub Gist backup and restore, including large backup chunking |
| Productivity | `Alt+Shift+F` adds the current page with a default icon; Chinese and English UI switching |

## Features

### Search

- Choose one of the bundled search engines or add a custom engine.
- Resize the search box and its engine icon in Settings.
- Show up to ten local matches from saved searches, bookmarks, URLs, and folders.
- Disable suggestions entirely when a clean input-only search box is preferred.
- Store search history locally; clear it at any time from Settings.

### Bookmarks, folders, and icons

- Create links and folders directly from the homepage.
- Drag links to reorder them, create folders, or move items into and out of folders.
- Open folders in a centered panel; the panel expands from the clicked folder and collapses back to it.
- Choose an icon source per website:
  - automatic favicon matching;
  - the website's `/favicon.ico`;
  - a custom icon URL; or
  - a local image file.
- Local icon files up to 5 MB are converted to a compact WebP image with a maximum dimension of 256 px before storage. They are included in exports and optional GitHub backups.
- Automatic favicons are cached locally to reduce network loads and visual flicker.

### Appearance and layout

- Use a wallpaper, adjust its blur, and change the logo or browser-tab icon.
- Choose light, dark, or transparent glass styling for icon containers.
- Control icon container size, opacity, blur, and icons per row.
- Move the logo, search box, and bookmark area independently along the vertical axis.
- Hide the logo when a minimal layout is preferred.
- Switch the interface between Simplified Chinese and English.

### Backup and synchronization

- Export all portable configuration to a JSON file.
- Import a backup on another machine or after reinstalling the extension.
- Optionally connect a GitHub token with Gists access to create a private backup Gist.
- GitHub backup includes bookmarks, folders, custom icons, search engines, search history, settings, wallpaper, and logo. Large payloads are split into Gist files and automatically reassembled during restore.
- The GitHub token remains in local extension storage and is never written into the backup Gist or exported JSON.

### Quick add shortcut

- Default shortcut: `Alt+Shift+F` on Windows/Linux and `Command+Shift+F` on macOS.
- The shortcut asks for a name and then saves the current tab URL with the current default icon style.
- Firefox and Zen Browser can change the shortcut directly from Zen Tab settings.

## Browser support

| Browser | Extension format | Notes |
| --- | --- | --- |
| Firefox | Manifest V3 | Requires Firefox 142 or later |
| Zen Browser | Firefox-compatible Manifest V3 | Verified with Zen Browser 1.21.8b |

This is the Firefox/Zen source snapshot. It includes the Firefox manifest and uses the Firefox-compatible background-script registration; build output is ready for Firefox or Zen Browser only.

## Quick start

### Prerequisites

- Node.js `^20.19.0` or `>=22.12.0`
- npm

### Install dependencies

```bash
npm install
```

### Run the development server

```bash
npm run dev
```

### Lint and build

```bash
npm run lint
npm run build
```

`npm run build` creates `dist/` for Firefox and Zen Browser. `npm run build:firefox` is available as an explicit equivalent.

## Load an unpacked build

1. Run `npm run build`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on**.
4. Select `dist/manifest.json`.

Temporary add-ons are removed when the browser restarts unless they are packaged and signed through the normal Firefox extension-distribution flow.

## Typical use

1. Open a new tab and use **Add** to create a website shortcut.
2. Right-click a shortcut to edit its title, URL, icon source, and per-icon style overrides.
3. Drag one shortcut over another to create a folder; click the folder to manage its contents.
4. Open **Style** to change wallpaper, icon layout, search settings, language, and backup options.
5. Optionally configure GitHub Gist synchronization after confirming that the private-backup workflow meets your needs.

## GitHub Gist backup

Zen Tab uses a private Gist named around the Zen Tab backup configuration. To enable synchronization:

1. Create a GitHub access token with the minimum Gists read/write permission required by your account type.
2. In Zen Tab Settings, open **GitHub Cloud Sync** and connect the token.
3. Use **Upload Current Configuration** to create or update the private Gist.
4. On another machine, connect the same GitHub account and choose **Restore from GitHub**.

Treat the token as a password. Revoke it from GitHub immediately if it is exposed.

## Data, privacy, and network behavior

### Local data

Zen Tab stores settings and user configuration in browser extension storage, with IndexedDB/local storage used as compatible local mirrors where appropriate. Typical data includes bookmarks, folders, custom icons, selected search engine, local search history, wallpaper, logo, and UI preferences.

### Network requests

Zen Tab does not include analytics or telemetry. Network requests occur only for feature-driven purposes:

| Action | Possible destination |
| --- | --- |
| Submit a search | The search engine selected by the user |
| Resolve automatic/custom favicons | The target website and, when used as a fallback, Google Favicon service |
| GitHub backup or restore | GitHub Gist and raw Gist endpoints after the user connects and triggers sync |

Local search suggestions are generated from data already stored on the device; no search suggestion request is sent to a third party.

### Extension permissions

| Permission | Why it is used |
| --- | --- |
| `storage`, `unlimitedStorage` | Save homepage configuration, local icons, cache, and backup state |
| `tabs`, `activeTab`, `scripting` | Read the current tab for the quick-add shortcut and add it to Zen Tab |
| `<all_urls>` host access | Fetch website favicons and open user-configured web destinations |

Review browser permission prompts before installing any build.

## Backup, restore, and migration

Use **Settings → Data Backup & Restore** to export a portable JSON backup before testing a temporary build, changing profiles, or moving to another computer.

Firefox and Zen Browser isolate extension storage by extension identity. If a previous store build still contains your data, export it from that build first. The repository includes `scripts/export-legacy-data.js` for the legacy migration path described in the in-app documentation.

## Project structure

```text
src/
  components/            React UI components
  assets/                Bundled logos and search-engine icons
  App.tsx                Homepage composition and state coordination
  storage.ts             Browser/local storage abstraction
  backup.ts              Import/export and restore validation
  githubSync.ts          Private Gist synchronization
  favicon-bootstrap.ts   Cached favicon bootstrap logic
public/
  background.js          Extension background logic and favicon cache worker
  boot.js / boot.css     Early startup rendering helpers
manifests/
  firefox.json           Firefox/Zen Manifest V3 definition
scripts/
  prepare-manifest.mjs   Copies the correct manifest into a build output
  export-legacy-data.js  Legacy data-export helper
```

## Development guidelines

- Keep Firefox and Zen Browser behavior aligned unless a platform API requires a documented difference.
- Use the `extensionApi.ts` abstraction instead of directly assuming either `browser.*` or `chrome.*` APIs.
- Keep user content local by default; document every new network request and permission.
- Test the Firefox/Zen build after changes that touch extension APIs, storage, keyboard shortcuts, or manifests.
- Avoid committing generated builds, dependency directories, tokens, exports containing personal data, or private backup files.

## Contributing

Contributions are welcome for bug reports, accessibility improvements, localization, documentation, tests, and focused features.

1. Fork the repository and create a descriptive branch.
2. Make a focused change with clear commit messages.
3. Run `npm run lint` and the relevant build command.
4. Describe browser coverage and any data-migration impact in the pull request.
5. Never include tokens, private Gists, personal exports, or browser-profile data in an issue or pull request.

## Responsible use and project policy

Zen Tab is published primarily for learning, research, personal customization, and community collaboration.

- Do not use this project to violate laws, infringe privacy, obtain unauthorized access, distribute malware, or misrepresent another person's identity or data.
- Do not present unofficial or modified builds as an official Zen Tab release.
- Do not use the project name, logo, screenshots, or maintainers' identity in misleading commercial marketing or imply endorsement.
- The maintainers do not provide a warranty, hosted service, or security guarantee for self-built extensions.

These are project-use and provenance expectations. They do not replace applicable law, browser-store rules, or third-party service terms.

## License

This project is released under the [PolyForm Noncommercial License 1.0.0](./LICENSE).

Zen Tab is source-available rather than OSI-open-source. You may use, study, modify, and distribute it only for **noncommercial purposes** under the full license terms. Personal learning, research, and hobby use are permitted examples; the license also defines permitted uses for certain nonprofit, educational, public-interest, and government organizations.

Commercial rights are not granted by this repository license. Do not sell, monetize, bundle the software into a paid product or service, operate a commercial offering with it, or otherwise use it commercially without a separate written license from the copyright holder. Recipients must also receive the license terms and required copyright notice.

The full legal terms are in [LICENSE](./LICENSE); the authoritative upstream text is published by the [PolyForm Project](https://polyformproject.org/licenses/noncommercial/1.0.0/). This summary is informational only and does not replace the license.

## Disclaimer

This software is provided "as is", without warranty of any kind. You are responsible for reviewing code, permissions, backups, and third-party service terms before use. This README is informational and is not legal advice.

## Built with

- React
- TypeScript
- Vite
- Manifest V3 browser extension APIs
- localForage
- dnd kit
