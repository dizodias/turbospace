# TurboSpace

> Desktop cleaner for Windows — TEMP, Prefetch, Docker, Gradle/Android, npm/pip, browser caches, and more.

**Author:** [Dizodias Digital Engineering](https://dizodias.com)

[Português (Brasil)](README.pt-BR.md)

---

## Features

- Clean user `%TEMP%`, `C:\Windows\Temp`, and Prefetch
- Docker prune (`docker system prune -af`, volumes kept)
- Gradle and Android SDK caches (AVDs are not removed)
- npm and pip cache cleanup
- Desktop junk (`.tmp`, `.log`, `.bak`, `.old`) and large-file selection
- Extra Windows targets: Recycle Bin, thumbnails, browser cache, crash dumps, Delivery Optimization, shader cache, Windows Update cache
- Native Electron window (no browser required)
- Portable `.exe` with Administrator elevation

## Requirements

| Mode | Requirements |
|------|----------------|
| Development | Windows 10/11 (x64), [Node.js](https://nodejs.org/) 18+, Administrator privileges |
| Portable | Windows 10/11 (x64) only — no Node.js install needed |

## Quick start (development)

```bash
npm install
npm start
```

Or double-click `Iniciar.bat` (requests Administrator and launches Electron from source).

A short splash screen appears, then the main UI with Analyze / Clean actions.

## Portable build

```bash
npm run dist
```

Output: `dist/TurboSpace-Portatil.exe`

1. Run the executable and accept the UAC prompt.
2. Click **Analyze**, select targets, then **Clean selected**.
3. Copy the `.exe` anywhere (USB drive, another PC) — it is self-contained.

## Server-only mode (no window)

```bash
npm run server
```

Open `http://127.0.0.1:3860`. Change port with:

```bash
set PORT=3861
```

## Project structure

```
TurboSpace/
├── build/           # App icons (icon.ico / icon.png)
├── cleaners/        # Cleanup routines (TEMP, Docker, npm, etc.)
├── electron/        # Electron main + preload
├── public/          # UI (HTML, i18n, assets, Tailwind)
├── index.mjs        # Local HTTP API (default port 3860)
├── Iniciar.bat      # Dev launcher (elevated)
├── package.json
└── README.md
```

| Piece | Path |
|-------|------|
| App window | `electron/main.cjs` |
| Local HTTP server | `index.mjs` |
| UI | `public/index.html` |
| Cleanup modules | `cleaners/*.mjs` |
| Packaging icons | `build/icon.ico` |

`electron/main.cjs` starts the server as a child process, waits until the port responds, then shows the window. Closing the window stops the server.

## Cleanup targets

| Target | Action |
|--------|--------|
| User TEMP | Empties `%TEMP%` |
| Windows Temp | Empties `C:\Windows\Temp` |
| Prefetch | Empties `C:\Windows\Prefetch` |
| Docker | `docker system prune -af` (no volumes) |
| Gradle | Removes `%USERPROFILE%\.gradle\caches` |
| Android | Clears SDK caches (keeps AVDs) |
| npm / pip | Clears tool caches |
| Desktop | Removes junk extensions + optional large files |
| Windows extras | Recycle Bin, thumbnails, browser/shader/update caches, etc. |

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run Electron app |
| `npm run server` | HTTP server only |
| `npm run dist` | Build portable Windows executable |

## License

MIT — © 2026 Lucas Geisler Dias
