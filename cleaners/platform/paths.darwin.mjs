import path from 'node:path';
import os from 'node:os';

export function userPaths() {
  const home = os.homedir();
  const tmp = process.env.TMPDIR || os.tmpdir() || '/tmp';
  const libraryCaches = path.join(home, 'Library', 'Caches');
  return {
    home,
    local: path.join(home, 'Library'),
    temp: tmp,
    desktop: path.join(home, 'Desktop'),
    winTemp: null,
    prefetch: null,
    trash: path.join(home, '.Trash'),
    libraryCaches,
    diagnosticReports: path.join(home, 'Library', 'Logs', 'DiagnosticReports'),
    xcodeDerivedData: path.join(home, 'Library', 'Developer', 'Xcode', 'DerivedData'),
    gradleCaches: path.join(home, '.gradle', 'caches'),
    androidSdk: path.join(home, 'Library', 'Android', 'sdk'),
    npmCache: path.join(home, '.npm'),
    pipCache: path.join(libraryCaches, 'pip'),
    browsers: {
      chrome: path.join(libraryCaches, 'Google', 'Chrome'),
      edge: path.join(libraryCaches, 'Microsoft Edge'),
      brave: path.join(libraryCaches, 'BraveSoftware', 'Brave-Browser'),
      firefox: path.join(libraryCaches, 'Firefox'),
    },
    appCacheAllowlist: [
      'com.spotify.client',
      'com.tinyspeck.slackmacgap',
      'com.hnc.Discord',
      'us.zoom.xos',
      'com.microsoft.teams2',
      'com.microsoft.VSCode',
      'com.apple.dt.Xcode',
    ],
    shaderCache: null,
  };
}
