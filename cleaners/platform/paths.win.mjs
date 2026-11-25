import path from 'node:path';
import os from 'node:os';

export function userPaths() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const temp = process.env.TEMP || process.env.TMP || path.join(local, 'Temp');
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  return {
    home,
    local,
    appData,
    temp,
    desktop: path.join(home, 'Desktop'),
    downloads: path.join(home, 'Downloads'),
    documents: path.join(home, 'Documents'),
    caches: null,
    logs: null,
    winTemp: 'C:\\Windows\\Temp',
    prefetch: 'C:\\Windows\\Prefetch',
    trash: null,
    libraryCaches: null,
    diagnosticReports: null,
    xcodeDerivedData: null,
    gradleCaches: path.join(home, '.gradle', 'caches'),
    androidSdk: path.join(local, 'Android', 'Sdk'),
    npmCache: path.join(local, 'npm-cache'),
    pipCache: path.join(local, 'pip', 'Cache'),
    browsers: {
      chromeCache: path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
      chromeCodeCache: path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Code Cache'),
      edgeCache: path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
      edgeCodeCache: path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Code Cache'),
      braveCache: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache'),
      firefoxProfiles: path.join(local, 'Mozilla', 'Firefox', 'Profiles'),
    },
    appCacheAllowlist: [],
    /** Caches de shaders de GPU (DirectX, NVIDIA, AMD, Intel); o Steam é resolvido em steam.win.mjs. */
    shaderCaches: [
      path.join(local, 'D3DSCache'),
      path.join(local, 'NVIDIA', 'DXCache'),
      path.join(local, 'NVIDIA', 'GLCache'),
      path.join(home, 'AppData', 'LocalLow', 'NVIDIA', 'DXCache'),
      path.join(local, 'AMD', 'DxCache'),
      path.join(local, 'AMD', 'DxcCache'),
      path.join(local, 'AMD', 'VkCache'),
      path.join(local, 'AMD', 'GLCache'),
      path.join(local, 'Intel', 'ShaderCache'),
    ],
    /** Modelos/binários baixados por ferramentas de IA e automação (rebaixados sob demanda). */
    aiModelCaches: [
      path.join(home, '.cache', 'huggingface', 'hub'),
      path.join(home, '.cache', 'whisper'),
      path.join(home, '.cache', 'puppeteer'),
      path.join(local, 'ms-playwright'),
    ],
    /** Pasta onde apps Electron (electron-updater) criam <app>-updater com instaladores baixados. */
    appUpdaterRoot: local,
    steamDefault: path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam'),
  };
}
