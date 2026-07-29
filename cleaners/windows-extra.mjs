import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  dirSize,
  emptyDirContents,
  formatBytes,
  runCommand,
  userPaths,
} from './measure.mjs';

function browserCacheRoots() {
  const { local } = userPaths();
  return [
    path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
    path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Code Cache'),
    path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
    path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Code Cache'),
    path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cache'),
  ];
}

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

async function measureRecycleBin() {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$sum = 0
Get-ChildItem -LiteralPath 'C:\\$Recycle.Bin' -Force -Recurse -File -ErrorAction SilentlyContinue |
  ForEach-Object { $sum += $_.Length }
[uint64]$sum
`.trim();
  const { ok, stdout } = await runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);
  if (!ok) return 0;
  const n = Number(String(stdout).trim());
  return Number.isFinite(n) ? n : 0;
}

async function cleanRecycleBin(onLog) {
  onLog('Esvaziando a Lixeira...');
  const before = await measureRecycleBin();
  const { ok, stderr } = await runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'Clear-RecycleBin -Force -ErrorAction SilentlyContinue',
  ]);
  if (!ok && stderr) onLog(`Aviso Lixeira: ${stderr.trim()}`);
  const after = await measureRecycleBin();
  const freed = Math.max(0, before - after);
  onLog(`Lixeira: ~${formatBytes(freed)}`);
  return {
    id: 'recycleBin',
    ok: true,
    freedBytesApprox: freed || before,
    detail: `Lixeira ~${formatBytes(freed || before)}`,
  };
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

async function cleanThumbnails(onLog) {
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

function updateDownloadPath() {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'SoftwareDistribution', 'Download');
}

function deliveryOptPaths() {
  const { local } = userPaths();
  return [
    path.join(process.env.SystemRoot || 'C:\\Windows', 'SoftwareDistribution', 'DeliveryOptimization', 'Cache'),
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

async function measureFirefoxCaches() {
  const root = path.join(userPaths().local, 'Mozilla', 'Firefox', 'Profiles');
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  try {
    const profiles = await fsp.readdir(root, { withFileTypes: true });
    for (const p of profiles) {
      if (!p.isDirectory()) continue;
      total += await dirSize(path.join(root, p.name, 'cache2'));
      total += await dirSize(path.join(root, p.name, 'startupCache'));
    }
  } catch {
    return total;
  }
  return total;
}

async function cleanFirefoxCaches(onLog) {
  const root = path.join(userPaths().local, 'Mozilla', 'Firefox', 'Profiles');
  if (!fs.existsSync(root)) return 0;
  let freed = 0;
  try {
    const profiles = await fsp.readdir(root, { withFileTypes: true });
    for (const p of profiles) {
      if (!p.isDirectory()) continue;
      freed += await emptyDirContents(path.join(root, p.name, 'cache2'), onLog);
      freed += await emptyDirContents(path.join(root, p.name, 'startupCache'), onLog);
    }
  } catch {
    // ignore
  }
  return freed;
}

export async function measureWindowsExtras() {
  const { local } = userPaths();
  const [recycleBin, thumbnails, updateCache, deliveryOpt, crashDumps, browserCache, shaderCache] =
    await Promise.all([
      measureRecycleBin(),
      measureThumbnails(),
      dirSize(updateDownloadPath()),
      sumPaths(deliveryOptPaths()),
      sumPaths(crashDumpPaths()),
      (async () => (await sumPaths(browserCacheRoots())) + (await measureFirefoxCaches()))(),
      dirSize(path.join(local, 'D3DSCache')),
    ]);

  return {
    recycleBin,
    thumbnails,
    updateCache,
    deliveryOpt,
    crashDumps,
    browserCache,
    shaderCache,
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

export async function cleanCrashDumps(onLog) {
  onLog('Limpando relatórios de falhas...');
  const freed = await emptyMany(crashDumpPaths(), onLog);
  return {
    id: 'crashDumps',
    ok: true,
    freedBytesApprox: freed,
    detail: `Relatórios de falhas ~${formatBytes(freed)}`,
  };
}

export async function cleanBrowserCache(onLog) {
  onLog('Limpando cache de navegadores...');
  let freed = await emptyMany(browserCacheRoots(), onLog);
  freed += await cleanFirefoxCaches(onLog);
  return {
    id: 'browserCache',
    ok: true,
    freedBytesApprox: freed,
    detail: `Cache de navegadores ~${formatBytes(freed)}`,
  };
}

export async function cleanShaderCache(onLog) {
  const target = path.join(userPaths().local, 'D3DSCache');
  onLog(`Limpando cache de shaders: ${target}`);
  const freed = await emptyDirContents(target, onLog);
  return {
    id: 'shaderCache',
    ok: true,
    freedBytesApprox: freed,
    detail: `Cache de shaders ~${formatBytes(freed)}`,
  };
}

export {
  cleanRecycleBin,
  cleanThumbnails,
};
