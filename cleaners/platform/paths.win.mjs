import path from 'node:path';
import os from 'node:os';

export function userPaths() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const temp = process.env.TEMP || process.env.TMP || path.join(local, 'Temp');
  return {
    home,
    local,
    temp,
    desktop: path.join(home, 'Desktop'),
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
    shaderCache: path.join(local, 'D3DSCache'),
  };
}
