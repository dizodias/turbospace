const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const PORT = Number(process.env.PORT || 3860);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const isDarwin = process.platform === 'darwin';
const isWin = process.platform === 'win32';

let serverProcess = null;
let mainWindow = null;
let serverExitInfo = null;

function startServer() {
  serverProcess = spawn(process.execPath, [path.join(ROOT, 'index.mjs')], {
    cwd: ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', LIMPEZA_NO_BROWSER: '1' },
    windowsHide: true,
  });

  serverProcess.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  serverProcess.on('exit', (code) => {
    serverExitInfo = { code };
    serverProcess = null;
  });
}

function stopServer() {
  if (!serverProcess) return;
  const proc = serverProcess;
  serverProcess = null;
  try {
    if (isWin) {
      spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { windowsHide: true });
    } else {
      proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // already dead
        }
      }, 2000);
    }
  } catch {
    // já encerrado
  }
}

function pingServer() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}/api/status`, { timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer({ timeoutMs = 20000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pingServer()) return true;
    if (serverExitInfo && serverExitInfo.code !== 0) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function emitMaximized() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('window:maximized', mainWindow.isMaximized());
}

function createWindow() {
  const iconPath = isWin
    ? path.join(ROOT, 'build', 'icon.ico')
    : path.join(ROOT, 'build', 'icon.png');

  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const opts = {
    width: 480,
    height: 560,
    minWidth: 440,
    minHeight: 420,
    show: false,
    frame: false,
    thickFrame: false,
    transparent: !isDarwin,
    backgroundColor: isDarwin ? '#F5F5F7' : '#00000000',
    hasShadow: isDarwin,
    resizable: false,
    maximizable: true,
    fullscreenable: true,
    titleBarStyle: isDarwin ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isDarwin ? { x: 16, y: 14 } : undefined,
    autoHideMenuBar: true,
    title: 'TurboSpace',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  };

  mainWindow = new BrowserWindow(opts);

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.on('maximize', emitMaximized);
  mainWindow.on('unmaximize', emitMaximized);
  mainWindow.on('enter-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized', true);
    }
  });
  mainWindow.on('leave-full-screen', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized', mainWindow.isMaximized());
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(BASE_URL)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow.webContents.reload();
      event.preventDefault();
    }
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.loadURL(BASE_URL);
}

ipcMain.handle('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});

ipcMain.handle('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:isMaximized', () => {
  return Boolean(mainWindow && mainWindow.isMaximized());
});

ipcMain.handle('window:setBootMode', (_event, enabled) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (isWin) {
    try {
      mainWindow.setBackgroundMaterial('none');
    } catch {
      // ignore
    }
  }
  try {
    mainWindow.setBackgroundColor(isDarwin ? '#F5F5F7' : '#00000000');
  } catch {
    // ignore
  }
  if (enabled) {
    mainWindow.setResizable(false);
    mainWindow.setMinimumSize(440, 420);
    mainWindow.setSize(480, 560, true);
    mainWindow.center();
  } else {
    mainWindow.setResizable(true);
    mainWindow.setMinimumSize(900, 620);
    mainWindow.setSize(1180, 860, true);
    mainWindow.center();
  }
  return true;
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    if (isDarwin) {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
          { role: 'editMenu' },
          { role: 'windowMenu' },
        ])
      );
    } else {
      Menu.setApplicationMenu(null);
    }

    startServer();

    const ready = await waitForServer();
    if (!ready) {
      dialog.showErrorBox(
        'TurboSpace',
        `Não foi possível iniciar o servidor em ${BASE_URL}.\n\n` +
          'A porta pode estar ocupada por outro programa. ' +
          'Feche-o ou defina outra porta com a variável PORT.'
      );
      app.quit();
      return;
    }

    createWindow();
  });

  app.on('window-all-closed', () => {
    stopServer();
    if (!isDarwin) app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && !mainWindow) {
      createWindow();
    }
  });

  app.on('before-quit', stopServer);
  process.on('exit', stopServer);
}
