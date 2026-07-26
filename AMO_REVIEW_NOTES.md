# AMO Review Notes — Zen Tab 1.4.9

## Build and source code

- Manifest: Manifest V3
- Add-on ID: `zentab@yourdomain.com`
- Minimum Firefox version: 142
- Runtime used for this build: Node.js 22.22.2 and npm

To reproduce the submitted build from this source package:

```bash
npm ci
npm run lint
npm run build
```

The unpacked extension is generated in `dist/`, including `manifest.json` and `LICENSE`; upload the ZIP/XPI made from the contents of that directory. The source package intentionally excludes `node_modules/`, generated `dist/` directories, and release archives.

Vite reports that `boot.js` and `boot.css` remain runtime assets during the build. This is expected: both files are intentionally served from `public/` and are present in the generated `dist/` directory.

## Functional review path

1. Open a new tab to load Zen Tab.
2. Add or edit a website shortcut, then open it.
3. Drag shortcuts to reorder them or create a folder; open and close that folder.
4. Search with a bundled engine, or enable/disable local suggestions in Settings.
5. Optionally test **Alt+Shift+F** on a normal web page to add the current tab.
6. Optional GitHub Gist backup requires a user-supplied token; no account or test credentials are needed for ordinary functionality.

## Permissions and network behavior

- `storage` and `unlimitedStorage`: save user configuration, local icons, and cache.
- `tabs`, `activeTab`, and `scripting`: read the active tab when the user invokes the quick-add shortcut.
- `<all_urls>` host access: resolve user-selected website favicons and open user-configured destinations.
- Zen Tab has no analytics or telemetry. Network requests are feature-driven only: a submitted search goes to the selected engine; favicon resolution may contact the website or Google Favicon service as a fallback; GitHub traffic occurs only after a user connects a token and starts a backup or restore.

## Data collection

The manifest declares no required data collection. Homepage configuration, icons, history, and optional GitHub token remain in local extension storage unless the user explicitly exports data or initiates GitHub Gist synchronization.

## License

Zen Tab is source-available under the PolyForm Noncommercial License 1.0.0. Commercial rights are not granted by this repository license.
