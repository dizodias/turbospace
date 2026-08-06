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
    if (!p) continue;
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

function winBrowserRoots() {
  const b = userPaths().browsers || {};
  return [b.chromeCache, b.chromeCodeCache, b.edgeCache, b.edgeCodeCache, b.braveCache].filter(
    Boolean
  );
}

async function measureFirefoxWin() {
  const root = userPaths().browsers?.firefoxProfiles;
  if (!root || !fs.existsSync(root)) return 0;
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

async function cleanFirefoxWin(onLog) {
  const root = userPaths().browsers?.firefoxProfiles;
  if (!root || !fs.existsSync(root)) return 0;
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

function darwinBrowserRoots() {
  const b = userPaths().browsers || {};
  return [b.chrome, b.edge, b.brave, b.firefox].filter(Boolean);
}

export async function measureBrowserCache() {
  if (process.platform === 'darwin') {
    return sumPaths(darwinBrowserRoots());
  }
  return (await sumPaths(winBrowserRoots())) + (await measureFirefoxWin());
}

export async function cleanBrowserCache(onLog) {
  onLog('Limpando cache de navegadores...');
  let freed = 0;
  if (process.platform === 'darwin') {
    freed = await emptyMany(darwinBrowserRoots(), onLog);
  } else {
    freed = await emptyMany(winBrowserRoots(), onLog);
    freed += await cleanFirefoxWin(onLog);
  }
  return {
    id: 'browserCache',
    ok: true,
    freedBytesApprox: freed,
    detail: `Cache de navegadores ~${formatBytes(freed)}`,
  };
}
