import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { dirSize, formatBytes, userPaths } from '../measure.mjs';

const JUNK_EXTS = new Set(['.tmp', '.log', '.bak', '.old']);
const LARGE_THRESHOLD = 100 * 1024 * 1024; // 100 MB

function isUnderDesktop(filePath, desktop) {
  const resolved = path.resolve(filePath);
  const desk = path.resolve(desktop);
  return resolved === desk || resolved.startsWith(desk + path.sep);
}

export async function measureDesktopJunk() {
  const { desktop } = userPaths();
  if (!fs.existsSync(desktop)) return 0;
  let total = 0;
  let entries;
  try {
    entries = await fsp.readdir(desktop, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!JUNK_EXTS.has(ext)) continue;
    try {
      const st = await fsp.stat(path.join(desktop, ent.name));
      total += st.size;
    } catch {
      // skip
    }
  }
  return total;
}

/** Root files + one level into subfolders (files only). */
export async function listLargeDesktopFiles() {
  const { desktop } = userPaths();
  const results = [];
  if (!fs.existsSync(desktop)) return results;

  async function considerFile(full, name) {
    try {
      const st = await fsp.stat(full);
      if (!st.isFile() || st.size < LARGE_THRESHOLD) return;
      results.push({
        path: full,
        name,
        size: st.size,
        sizeLabel: formatBytes(st.size),
      });
    } catch {
      // skip
    }
  }

  let entries;
  try {
    entries = await fsp.readdir(desktop, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const ent of entries) {
    const full = path.join(desktop, ent.name);
    if (ent.isFile()) {
      await considerFile(full, ent.name);
    } else if (ent.isDirectory()) {
      let children;
      try {
        children = await fsp.readdir(full, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const child of children) {
        if (!child.isFile()) continue;
        await considerFile(path.join(full, child.name), path.join(ent.name, child.name));
      }
    }
  }

  results.sort((a, b) => b.size - a.size);
  return results;
}

export async function cleanDesktopJunk(onLog) {
  const { desktop } = userPaths();
  onLog(`Limpando lixo por extensão no Desktop (${[...JUNK_EXTS].join(', ')})`);
  if (!fs.existsSync(desktop)) {
    return { id: 'desktopJunk', ok: false, freedBytesApprox: 0, detail: 'Desktop não encontrado' };
  }
  let freed = 0;
  let removed = 0;
  let entries;
  try {
    entries = await fsp.readdir(desktop, { withFileTypes: true });
  } catch (err) {
    onLog(`Sem acesso ao Desktop: ${err.message}`);
    return { id: 'desktopJunk', ok: false, freedBytesApprox: 0, detail: err.message };
  }
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!JUNK_EXTS.has(ext)) continue;
    const full = path.join(desktop, ent.name);
    try {
      const st = await fsp.stat(full);
      await fsp.unlink(full);
      freed += st.size;
      removed += 1;
      onLog(`Removido: ${ent.name} (${formatBytes(st.size)})`);
    } catch (err) {
      onLog(`Falha em ${ent.name}: ${err.message}`);
    }
  }
  onLog(`Desktop lixo: ${removed} arquivo(s), ~${formatBytes(freed)}`);
  return {
    id: 'desktopJunk',
    ok: true,
    freedBytesApprox: freed,
    detail: `${removed} arquivos ~${formatBytes(freed)}`,
  };
}

export async function deleteDesktopPaths(paths, onLog) {
  const { desktop } = userPaths();
  let freed = 0;
  let removed = 0;
  for (const raw of paths || []) {
    const full = path.resolve(String(raw));
    if (!isUnderDesktop(full, desktop)) {
      onLog(`Recusado (fora do Desktop): ${full}`);
      continue;
    }
    if (!fs.existsSync(full)) {
      onLog(`Já não existe: ${full}`);
      continue;
    }
    try {
      const st = await fsp.stat(full);
      const size = st.isDirectory() ? await dirSize(full) : st.size;
      await fsp.rm(full, { recursive: false, force: true });
      freed += size;
      removed += 1;
      onLog(`Removido arquivo grande: ${path.basename(full)} (~${formatBytes(size)})`);
    } catch (err) {
      onLog(`Falha ao remover ${full}: ${err.message}`);
    }
  }
  return {
    id: 'desktopLarge',
    ok: true,
    freedBytesApprox: freed,
    detail: `${removed} arquivo(s) ~${formatBytes(freed)}`,
  };
}
