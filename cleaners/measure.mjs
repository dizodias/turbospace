import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { formatBytes } from './format.mjs';

export { formatBytes };

export {
  userPaths,
  normalizeVolume,
  normalizeDrive,
  getDriveFreeBytes,
  listLogicalDrives,
  defaultVolumeId,
  isAdmin,
  commandExists,
  openBrowser,
  getSystemInfo,
  platformId,
} from './platform/index.mjs';

export async function dirSize(root, { maxFiles = 200000 } = {}) {
  if (!root || !fs.existsSync(root)) return 0;
  let total = 0;
  let count = 0;
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      try {
        if (ent.isDirectory()) {
          stack.push(full);
        } else if (ent.isFile()) {
          const st = await fsp.stat(full);
          total += st.size;
          count += 1;
          if (count >= maxFiles) return total;
        }
      } catch {
        // skip locked / permission denied
      }
    }
  }
  return total;
}

export function runCommand(command, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const quoted = (args || [])
      .map((a) => {
        const s = String(a);
        return /\s/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
      })
      .join(' ');
    const line = quoted ? `${command} ${quoted}` : command;
    const child = spawn(line, {
      windowsHide: true,
      shell: true,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve({ ok: false, code: -1, stdout, stderr: stderr || 'timeout' });
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout, stderr: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code: code ?? -1, stdout, stderr });
    });
  });
}

/**
 * Remove um arquivo ou pasta tolerando arquivos em uso: apaga tudo o que der e
 * conta quantos arquivos ficaram (bloqueados por um app aberto, sem permissão...).
 * Links simbólicos/junctions são removidos como link, sem seguir o destino.
 * @returns {Promise<{ freed: number, inUse: number }>}
 */
async function removeTolerant(full, isDir) {
  if (!isDir) {
    let size = 0;
    try {
      size = (await fsp.lstat(full)).size;
    } catch {
      return { freed: 0, inUse: 0 };
    }
    try {
      await fsp.rm(full, { force: true, maxRetries: 1 });
      return { freed: size, inUse: 0 };
    } catch {
      return { freed: 0, inUse: 1 };
    }
  }
  const size = await dirSize(full);
  try {
    await fsp.rm(full, { recursive: true, force: true, maxRetries: 1 });
    return { freed: size, inUse: 0 };
  } catch {
    // algum arquivo em uso: desce item a item para apagar o resto
  }
  let entries;
  try {
    entries = await fsp.readdir(full, { withFileTypes: true });
  } catch {
    return { freed: 0, inUse: 1 };
  }
  let inUse = 0;
  for (const ent of entries) {
    inUse += (await removeTolerant(path.join(full, ent.name), ent.isDirectory())).inUse;
  }
  try {
    await fsp.rmdir(full);
  } catch {
    // ainda tem arquivo em uso dentro
  }
  // o rm recursivo pode ter apagado parte antes de falhar: mede o que sobrou
  const remaining = await dirSize(full);
  return { freed: Math.max(0, size - remaining), inUse };
}

/** Sufixo padrão de log para arquivos que não puderam ser apagados. */
export function inUseNote(inUse) {
  if (!inUse) return '';
  return inUse === 1
    ? ' — 1 arquivo em uso, feche o app e rode de novo'
    : ` — ${inUse} arquivos em uso, feche o app e rode de novo`;
}

/**
 * Remove a pasta inteira (ou arquivo).
 * @returns {Promise<{ freed: number, inUse: number }>}
 */
export async function removePathDetailed(target, onLog) {
  if (!target || !fs.existsSync(target)) {
    onLog?.(`Pulando (não existe): ${target}`);
    return { freed: 0, inUse: 0 };
  }
  let isDir = false;
  try {
    isDir = (await fsp.lstat(target)).isDirectory();
  } catch (err) {
    onLog?.(`Falha em ${target}: ${err.message}`);
    return { freed: 0, inUse: 0 };
  }
  const r = await removeTolerant(target, isDir);
  onLog?.(
    r.inUse
      ? `Parcial em ${target}: ~${formatBytes(r.freed)}${inUseNote(r.inUse)}`
      : `Removido: ${target} (~${formatBytes(r.freed)})`
  );
  return r;
}

export async function removePathRecursive(target, onLog) {
  return (await removePathDetailed(target, onLog)).freed;
}

/**
 * Esvazia a pasta mantendo a própria pasta.
 * @returns {Promise<{ freed: number, inUse: number }>}
 */
export async function emptyDirContentsDetailed(dir, onLog) {
  if (!dir || !fs.existsSync(dir)) {
    onLog?.(`Pulando (não existe): ${dir}`);
    return { freed: 0, inUse: 0 };
  }
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    onLog?.(`Sem acesso a ${dir}: ${err.message}`);
    return { freed: 0, inUse: 0 };
  }
  let freed = 0;
  let inUse = 0;
  for (const ent of entries) {
    const r = await removeTolerant(path.join(dir, ent.name), ent.isDirectory());
    freed += r.freed;
    inUse += r.inUse;
  }
  onLog?.(`Esvaziado ${dir}: ~${formatBytes(freed)}${inUseNote(inUse)}`);
  return { freed, inUse };
}

export async function emptyDirContents(dir, onLog) {
  return (await emptyDirContentsDetailed(dir, onLog)).freed;
}
