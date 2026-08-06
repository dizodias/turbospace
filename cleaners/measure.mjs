import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export { formatBytes } from './format.mjs';

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

export async function removePathRecursive(target, onLog) {
  if (!target || !fs.existsSync(target)) {
    onLog?.(`Pulando (não existe): ${target}`);
    return 0;
  }
  const before = await dirSize(target);
  try {
    await fsp.rm(target, { recursive: true, force: true, maxRetries: 2 });
    onLog?.(`Removido: ${target} (~${formatBytes(before)})`);
    return before;
  } catch (err) {
    let freed = 0;
    try {
      const entries = await fsp.readdir(target, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(target, ent.name);
        try {
          const size = ent.isDirectory() ? await dirSize(full) : (await fsp.stat(full)).size;
          await fsp.rm(full, { recursive: true, force: true, maxRetries: 1 });
          freed += size;
        } catch {
          // file in use
        }
      }
      onLog?.(`Parcial em ${target}: ~${formatBytes(freed)} (${err.message})`);
      return freed;
    } catch (err2) {
      onLog?.(`Falha em ${target}: ${err2.message}`);
      return 0;
    }
  }
}

export async function emptyDirContents(dir, onLog) {
  if (!dir || !fs.existsSync(dir)) {
    onLog?.(`Pulando (não existe): ${dir}`);
    return 0;
  }
  let freed = 0;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    onLog?.(`Sem acesso a ${dir}: ${err.message}`);
    return 0;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    try {
      const size = ent.isDirectory() ? await dirSize(full) : (await fsp.stat(full)).size;
      await fsp.rm(full, { recursive: true, force: true, maxRetries: 1 });
      freed += size;
    } catch {
      // locked
    }
  }
  onLog?.(`Esvaziado ${dir}: ~${formatBytes(freed)}`);
  return freed;
}
