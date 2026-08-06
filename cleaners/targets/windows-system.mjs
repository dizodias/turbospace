import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  dirSize,
  emptyDirContents,
  formatBytes,
  userPaths,
} from '../measure.mjs';

async function sumPaths(paths) {
  let total = 0;
  for (const p of paths) {
    total += await dirSize(p);
  }
  return total;
}

async function emptyMany(paths, onLog) {
  let freed = 0;
  for (const p of paths) {
    if (!p || !fs.existsSync(p)) continue;
    freed += await emptyDirContents(p, onLog);
  }
  return freed;
}

async function measureThumbnails() {
  const dir = path.join(userPaths().local, 'Microsoft', 'Windows', 'Explorer');
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  try {
    const entries = await fsp.readdir(dir);
    for (const name of entries) {
      if (!/^thumbcache_.*\.db$/i.test(name) && name.toLowerCase() !== 'iconcache.db') continue;
      try {
        total += (await fsp.stat(path.join(dir, name))).size;
      } catch {
        // skip
      }
    }
  } catch {
    return 0;
  }
  return total;
}

function updateDownloadPath() {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'SoftwareDistribution', 'Download');
}

function deliveryOptPaths() {
  const { local } = userPaths();
  return [
    path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'SoftwareDistribution',
      'DeliveryOptimization',
      'Cache'
    ),
    path.join(local, 'Microsoft', 'Windows', 'DeliveryOptimization', 'Cache'),
  ];
}

function crashDumpPaths() {
  const { local } = userPaths();
  return [
    path.join(local, 'CrashDumps'),
    path.join(process.env.SystemRoot || 'C:\\Windows', 'Minidump'),
    path.join(local, 'Microsoft', 'Windows', 'WER', 'ReportQueue'),
    path.join(local, 'Microsoft', 'Windows', 'WER', 'ReportArchive'),
  ];
}

export async function measureThumbnailsSize() {
  return measureThumbnails();
}

export async function measureUpdateCache() {
  return dirSize(updateDownloadPath());
}

export async function measureDeliveryOpt() {
  return sumPaths(deliveryOptPaths());
}

export async function measureCrashDumpsWin() {
  return sumPaths(crashDumpPaths());
}

export async function measureShaderCache() {
  const target = userPaths().shaderCache;
  return target ? dirSize(target) : 0;
}

export async function measureWindowsExtras() {
  const [thumbnails, updateCache, deliveryOpt, crashDumps, shaderCache] = await Promise.all([
    measureThumbnails(),
    dirSize(updateDownloadPath()),
    sumPaths(deliveryOptPaths()),
    sumPaths(crashDumpPaths()),
    measureShaderCache(),
  ]);
  return { thumbnails, updateCache, deliveryOpt, crashDumps, shaderCache };
}

export async function cleanThumbnails(onLog) {
  const dir = path.join(userPaths().local, 'Microsoft', 'Windows', 'Explorer');
  onLog(`Limpando cache de miniaturas: ${dir}`);
  let freed = 0;
  if (!fs.existsSync(dir)) {
    return { id: 'thumbnails', ok: true, freedBytesApprox: 0, detail: 'Miniaturas ~0 B' };
  }
  try {
    const entries = await fsp.readdir(dir);
    for (const name of entries) {
      if (!/^thumbcache_.*\.db$/i.test(name) && name.toLowerCase() !== 'iconcache.db') continue;
      const full = path.join(dir, name);
      try {
        const size = (await fsp.stat(full)).size;
        await fsp.rm(full, { force: true });
        freed += size;
      } catch {
        // arquivo em uso
      }
    }
  } catch (err) {
    onLog(`Falha miniaturas: ${err.message}`);
  }
  onLog(`Miniaturas: ~${formatBytes(freed)}`);
  return {
    id: 'thumbnails',
    ok: true,
    freedBytesApprox: freed,
    detail: `Miniaturas ~${formatBytes(freed)}`,
  };
}

export async function cleanUpdateCache(onLog) {
  const target = updateDownloadPath();
  onLog(`Limpando downloads de atualizações: ${target}`);
  const freed = await emptyDirContents(target, onLog);
  return {
    id: 'updateCache',
    ok: true,
    freedBytesApprox: freed,
    detail: `Atualizações Windows ~${formatBytes(freed)}`,
  };
}

export async function cleanDeliveryOpt(onLog) {
  onLog('Limpando cache de otimização de entrega...');
  const freed = await emptyMany(deliveryOptPaths(), onLog);
  return {
    id: 'deliveryOpt',
    ok: true,
    freedBytesApprox: freed,
    detail: `Otimização de entrega ~${formatBytes(freed)}`,
  };
}

export async function cleanCrashDumpsWin(onLog) {
  onLog('Limpando relatórios de falhas...');
  const freed = await emptyMany(crashDumpPaths(), onLog);
  return {
    id: 'crashDumps',
    ok: true,
    freedBytesApprox: freed,
    detail: `Relatórios de falhas ~${formatBytes(freed)}`,
  };
}

export async function cleanShaderCache(onLog) {
  const target = userPaths().shaderCache;
  if (!target) {
    return { id: 'shaderCache', ok: false, freedBytesApprox: 0, detail: 'Não aplicável' };
  }
  onLog(`Limpando cache de shaders: ${target}`);
  const freed = await emptyDirContents(target, onLog);
  return {
    id: 'shaderCache',
    ok: true,
    freedBytesApprox: freed,
    detail: `Cache de shaders ~${formatBytes(freed)}`,
  };
}
