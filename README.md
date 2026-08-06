# TurboSpace

> Desktop cleaner for **Windows** and **macOS** — temp files, caches, Docker, Gradle/Android, npm/pip, and more.

**Author:** [Dizodias Digital Engineering](https://dizodias.com)

[Português (Brasil)](README.pt-BR.md)

---

## Features

### Shared
- User temp cleanup (`%TEMP%` / `$TMPDIR`)
- Docker prune (`docker system prune -af`, volumes kept)
- Gradle and Android SDK caches (AVDs are not removed)
- npm and pip cache cleanup
- Desktop junk (`.tmp`, `.log`, `.bak`, `.old`) and large-file selection
- Browser cache cleanup
- Native Electron window

### Windows
- `C:\Windows\Temp`, Prefetch, Recycle Bin, thumbnails, Delivery Optimization, Windows Update cache, DirectX shader cache, crash dumps
- Portable `.exe` with Administrator elevation

### macOS
- Trash (`~/.Trash`), allowlisted `~/Library/Caches`, DiagnosticReports (>7 days), Xcode DerivedData
- DMG / ZIP packaging (optional Apple notarization)

## Requirements

| Mode | Requirements |
|------|----------------|
| Development (Windows) | Windows 10/11 (x64), [Node.js](https://nodejs.org/) 18+, Administrator recommended |
| Development (macOS) | macOS 12+, Node.js 18+ |
| Portable Windows | Windows 10/11 (x64) — no Node.js install needed |
| macOS build | macOS host to run `npm run dist:mac` |

## Quick start (development)

```bash
npm install
npm start
```

- **Windows:** double-click `Iniciar.bat` (requests Administrator).
- **macOS:** double-click `Iniciar.command` (or `chmod +x Iniciar.command` once, then open).

## Builds

```bash
npm run dist:win   # → dist/TurboSpace-Portatil.exe
npm run dist:mac   # → dist/*.dmg and *.zip (must run on macOS)
```

Notarization (optional): set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` before `dist:mac`.

## Server-only mode (no window)

```bash
npm run server
```

Open `http://127.0.0.1:3860`. Change port with `PORT=3861`.

## Project structure

```
TurboSpace/
├── build/                 # Icons + macOS entitlements
├── cleaners/
│   ├── platform/          # win32 / darwin paths, drives, privilege, system
│   ├── targets/           # Cleanup catalog + registry
│   └── measure.mjs        # Shared FS helpers
├── electron/              # Electron main + preload
├── public/                # UI (HTML, i18n, assets)
├── scripts/notarize.cjs   # Optional afterSign notarization
├── index.mjs              # Local HTTP API (port 3860)
├── Iniciar.bat / Iniciar.command
└── package.json
```

## Cleanup targets

| Target | Windows | macOS |
|--------|---------|-------|
| User temp | yes | yes |
| Windows Temp / Prefetch | yes | — |
| Recycle Bin / Trash | Recycle Bin | Trash |
| Browser cache | yes | yes |
| App caches (allowlist) | — | yes |
| Crash / Diagnostic reports | yes | yes (>7d) |
| Xcode DerivedData | — | yes |
| Docker / Gradle / Android / npm / pip | yes | yes |
| Desktop junk | yes | yes |

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Electron app |
| `npm run server` | HTTP server only |
| `npm run dist` / `dist:win` | Windows portable exe |
| `npm run dist:mac` | macOS DMG + ZIP |

## License

MIT — © 2026 Lucas Geisler Dias
