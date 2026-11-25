import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/**
 * Mostra um arquivo/pasta no Explorer (Windows) ou Finder (macOS).
 * Só abre caminhos absolutos que existem; nunca executa o alvo.
 * @returns {boolean}
 */
export function revealPath(target) {
  if (!target || !path.isAbsolute(target) || !fs.existsSync(target)) return false;
  const full = path.resolve(target);
  let isDir = false;
  try {
    isDir = fs.statSync(full).isDirectory();
  } catch {
    return false;
  }
  try {
    if (process.platform === 'win32') {
      // explorer.exe tem parsing próprio: argumento verbatim com aspas só no caminho
      const args = isDir ? [`"${full}"`] : [`/select,"${full}"`];
      spawn('explorer.exe', args, { detached: true, windowsHide: false, windowsVerbatimArguments: true }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', isDir ? [full] : ['-R', full], { detached: true }).unref();
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
