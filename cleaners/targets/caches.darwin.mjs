import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  dirSize,
  emptyDirContents,
  formatBytes,
  removePathRecursive,
  userPaths,
} from '../measure.mjs';

const REPORT_EXTS = new Set(['.crash', '.ips', '.spin']);
const REPORT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function allowlistPaths() {
  const p = userPaths();
  const root = p.libraryCaches;
  if (!root) return [];
  return (p.appCacheAllowlist || []).map((name) => path.join(root, name));
}

export async function measureAppCaches() {
  let total = 0;
  for (const dir of allowlistPaths()) {
    total += await dirSize(dir);
  }
  return total;
}

export async function cleanAppCaches(onLog) {
  onLog('Limpando caches de apps (whitelist)...');
  let freed = 0;
  for (const dir of allowlistPaths()) {
    if (!fs.existsSync(dir)) continue;
    freed += await emptyDirContents(dir, onLog);
  }
  return {
    id: 'appCaches',
    ok: true,
    freedBytesApprox: freed,
    detail: `Caches de apps ~${formatBytes(freed)}`,
  };
}

export async function measureDiagnosticReports() {
  const root = userPaths().diagnosticReports;
  if (!root || !fs.existsSync(root)) return 0;
  let total = 0;
  const cutoff = Date.now() - REPORT_MAX_AGE_MS;
  try {
    const entries = await fsp.readdir(root, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!REPORT_EXTS.has(ext)) continue;
      const full = path.join(root, ent.name);
      try {
        const st = await fsp.stat(full);
        if (st.mtimeMs <= cutoff) total += st.size;
      } catch {
        // skip
      }
    }
  } catch {
    return 0;
  }
  return total;
}

export async function cleanDiagnosticReports(onLog) {
  const root = userPaths().diagnosticReports;
  onLog(`Limpando DiagnosticReports antigos (>7 dias): ${root}`);
  if (!root || !fs.existsSync(root)) {
    return { id: 'crashDumps', ok: true, freedBytesApprox: 0, detail: 'DiagnosticReports ~0 B' };
  }
  let freed = 0;
  const cutoff = Date.now() - REPORT_MAX_AGE_MS;
  try {
    const entries = await fsp.readdir(root, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!REPORT_EXTS.has(ext)) continue;
      const full = path.join(root, ent.name);
      try {
        const st = await fsp.stat(full);
        if (st.mtimeMs > cutoff) continue;
        await fsp.unlink(full);
        freed += st.size;
      } catch {
        // skip
      }
    }
  } catch (err) {
    onLog(`Falha DiagnosticReports: ${err.message}`);
  }
  onLog(`DiagnosticReports: ~${formatBytes(freed)}`);
  return {
    id: 'crashDumps',
    ok: true,
    freedBytesApprox: freed,
    detail: `DiagnosticReports ~${formatBytes(freed)}`,
  };
}

export async function measureXcodeDerivedData() {
  const root = userPaths().xcodeDerivedData;
  return root ? dirSize(root) : 0;
}

export async function cleanXcodeDerivedData(onLog) {
  const root = userPaths().xcodeDerivedData;
  if (!root) {
    return {
      id: 'xcodeDerivedData',
      ok: false,
      freedBytesApprox: 0,
      detail: 'DerivedData não aplicável',
    };
  }
  onLog(`Limpando Xcode DerivedData: ${root}`);
  const freed = await removePathRecursive(root, onLog);
  return {
    id: 'xcodeDerivedData',
    ok: true,
    freedBytesApprox: freed,
    detail: `Xcode DerivedData ~${formatBytes(freed)}`,
  };
}
