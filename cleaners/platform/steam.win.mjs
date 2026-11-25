import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { runCommand, userPaths } from '../measure.mjs';

/**
 * Localiza a instalação do Steam: registro HKCU\Software\Valve\Steam → SteamPath,
 * com fallback em C:\Program Files (x86)\Steam.
 * @returns {Promise<string|null>}
 */
export async function steamRoot() {
  if (process.platform !== 'win32') return null;
  const r = await runCommand('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], {
    timeoutMs: 10000,
  });
  const m = r.ok ? r.stdout.match(/SteamPath\s+REG_\w+\s+(.+)/i) : null;
  const fromReg = m ? path.normalize(m[1].trim()) : null;
  if (fromReg && fs.existsSync(fromReg)) return fromReg;
  const fallback = userPaths().steamDefault;
  return fallback && fs.existsSync(fallback) ? fallback : null;
}

/**
 * Bibliotecas do Steam (pasta principal + extras de steamapps\libraryfolders.vdf).
 * Cada item é a raiz da biblioteca; os jogos ficam em <raiz>\steamapps.
 * @returns {Promise<string[]>}
 */
export async function steamLibraries() {
  const root = await steamRoot();
  if (!root) return [];
  const libs = [root];
  try {
    const vdf = await fsp.readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"((?:[^"\\]|\\.)*)"/gi)) {
      libs.push(path.normalize(m[1].replace(/\\\\/g, '\\')));
    }
  } catch {
    // sem libraryfolders.vdf: só a pasta principal
  }
  const seen = new Set();
  return libs.filter((p) => {
    const key = p.toLowerCase().replace(/[\\/]+$/, '');
    if (seen.has(key) || !fs.existsSync(p)) return false;
    seen.add(key);
    return true;
  });
}
