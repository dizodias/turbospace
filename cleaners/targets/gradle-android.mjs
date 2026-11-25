import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  dirSize,
  formatBytes,
  inUseNote,
  removePathDetailed,
  removePathRecursive,
  runCommand,
  userPaths,
} from '../measure.mjs';

export async function measureGradleAndroid() {
  const p = userPaths();
  const sdk = p.androidSdk;
  const androidTargets = [
    path.join(sdk, '.temp'),
    path.join(sdk, 'caches'),
    path.join(sdk, '.downloadIntermediates'),
  ];
  let androidBytes = 0;
  for (const t of androidTargets) {
    androidBytes += await dirSize(t);
  }
  return {
    gradle: await dirSize(p.gradleCaches),
    android: androidBytes,
  };
}

export async function measureGradle() {
  return dirSize(userPaths().gradleCaches);
}

export async function measureAndroid() {
  const { android } = await measureGradleAndroid();
  return android;
}

export async function cleanGradle(onLog) {
  const p = userPaths();
  onLog(`Limpando Gradle caches: ${p.gradleCaches}`);
  const freed = await removePathRecursive(p.gradleCaches, onLog);
  return {
    id: 'gradle',
    ok: true,
    freedBytesApprox: freed,
    detail: `Gradle caches ~${formatBytes(freed)}`,
  };
}

export async function cleanAndroid(onLog) {
  const p = userPaths();
  const sdk = p.androidSdk;
  const targets = [
    path.join(sdk, '.temp'),
    path.join(sdk, 'caches'),
    path.join(sdk, '.downloadIntermediates'),
  ];
  onLog('Limpando caches Android SDK (sem AVDs/system-images)');
  let freed = 0;
  for (const t of targets) {
    freed += await removePathRecursive(t, onLog);
  }
  return {
    id: 'android',
    ok: true,
    freedBytesApprox: freed,
    detail: `Android caches ~${formatBytes(freed)}`,
  };
}

/*
 * Alvo androidEmulator (desmarcado por padrão): snapshots de quick boot e
 * system-images que nenhum AVD usa. Os AVDs em si nunca são apagados.
 */

/** Pastas .avd: as que estão na pasta de AVDs + as apontadas por path= nos <nome>.ini. */
async function avdDirs() {
  const home = userPaths().androidAvdHome;
  if (!home || !fs.existsSync(home)) return [];
  const found = new Map();
  const add = (p) => {
    if (p && fs.existsSync(p)) found.set(path.resolve(p).toLowerCase(), path.resolve(p));
  };
  let entries = [];
  try {
    entries = await fsp.readdir(home, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const ent of entries) {
    const full = path.join(home, ent.name);
    if (ent.isDirectory() && /\.avd$/i.test(ent.name)) add(full);
    if (ent.isFile() && /\.ini$/i.test(ent.name)) {
      try {
        const m = (await fsp.readFile(full, 'utf8')).match(/^path=(.+)$/m);
        if (m) add(m[1].trim());
      } catch {
        // .ini ilegível: a pasta .avd ainda entra pela listagem
      }
    }
  }
  return [...found.values()];
}

function normRel(p) {
  return p.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * System-images usadas (relativas ao SDK, normalizadas) pelos AVDs.
 * Devolve null se algum AVD não puder ser lido: nesse caso não apagamos imagem nenhuma.
 */
async function usedSystemImages(avds, sdk) {
  const used = new Set();
  for (const avd of avds) {
    let ini;
    try {
      ini = await fsp.readFile(path.join(avd, 'config.ini'), 'utf8');
    } catch {
      return null;
    }
    const dirs = [...ini.matchAll(/^image\.sysdir\.\d+\s*=\s*(.+)$/gm)].map((m) => m[1].trim());
    if (!dirs.length) return null;
    for (const d of dirs) {
      const rel = path.isAbsolute(d) ? path.relative(sdk, d) : d;
      used.add(normRel(rel));
    }
  }
  return used;
}

/** Todas as system-images instaladas: <sdk>/system-images/<api>/<tag>/<abi>. */
async function installedSystemImages(sdk) {
  const root = path.join(sdk, 'system-images');
  const out = [];
  const dirsOf = async (p) => {
    try {
      return (await fsp.readdir(p, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return [];
    }
  };
  for (const api of await dirsOf(root)) {
    for (const tag of await dirsOf(path.join(root, api))) {
      for (const abi of await dirsOf(path.join(root, api, tag))) {
        out.push({
          full: path.join(root, api, tag, abi),
          rel: normRel(path.join('system-images', api, tag, abi)),
        });
      }
    }
  }
  return out;
}

async function emulatorPlan() {
  const sdk = userPaths().androidSdk;
  const avds = await avdDirs();
  const snapshots = avds
    .map((avd) => path.join(avd, 'snapshots', 'default_boot'))
    .filter((p) => fs.existsSync(p));
  // Sem nenhum AVD encontrado (pasta de AVDs em outro lugar?), não dá para saber o que está
  // em uso: mantém todas as imagens.
  const used = avds.length ? await usedSystemImages(avds, sdk) : null;
  const unusedImages =
    used == null ? [] : (await installedSystemImages(sdk)).filter((img) => !used.has(img.rel));
  return { sdk, avds, snapshots, unusedImages, imagesSkipped: used == null };
}

/** Emulador aberto (qemu-system-* / emulator): não mexemos em nada. */
async function emulatorRunning() {
  const pattern = /^(qemu-system-[\w-]*|emulator[\w-]*)(\.exe)?$/i;
  if (process.platform === 'win32') {
    const r = await runCommand('tasklist', ['/FO', 'CSV', '/NH'], { timeoutMs: 20000 });
    if (!r.ok) return false;
    return r.stdout
      .split(/\r?\n/)
      .some((line) => pattern.test((line.match(/^"([^"]+)"/) || [])[1] || ''));
  }
  const r = await runCommand('ps', ['-axo', 'comm='], { timeoutMs: 20000 });
  if (!r.ok) return false;
  return r.stdout.split('\n').some((line) => pattern.test(path.basename(line.trim())));
}

export async function measureAndroidEmulator() {
  const plan = await emulatorPlan();
  let total = 0;
  for (const p of plan.snapshots) total += await dirSize(p);
  for (const img of plan.unusedImages) total += await dirSize(img.full);
  return total;
}

export async function cleanAndroidEmulator(onLog) {
  if (await emulatorRunning()) {
    onLog('Emulador Android aberto: nada foi apagado. Feche o emulador e rode de novo.');
    return {
      id: 'androidEmulator',
      ok: true,
      freedBytesApprox: 0,
      detail: 'Emulador Android aberto — pulado (feche e rode de novo)',
    };
  }
  const plan = await emulatorPlan();
  onLog(`AVDs encontrados: ${plan.avds.length} (os AVDs em si não são apagados)`);
  let freed = 0;
  let inUse = 0;
  for (const snap of plan.snapshots) {
    const r = await removePathDetailed(snap, onLog);
    freed += r.freed;
    inUse += r.inUse;
  }
  if (plan.imagesSkipped) {
    onLog(
      plan.avds.length
        ? 'Algum AVD não pôde ser lido (config.ini): system-images mantidas por segurança.'
        : 'Nenhum AVD encontrado: system-images mantidas por segurança.'
    );
  } else if (!plan.unusedImages.length) {
    onLog('Todas as system-images estão em uso por algum AVD.');
  }
  for (const img of plan.unusedImages) {
    onLog(`System-image sem nenhum AVD: ${img.rel}`);
    const r = await removePathDetailed(img.full, onLog);
    freed += r.freed;
    inUse += r.inUse;
    // remove <tag> e <api> se ficaram vazias
    for (const parent of [path.dirname(img.full), path.dirname(path.dirname(img.full))]) {
      try {
        await fsp.rmdir(parent);
      } catch {
        break;
      }
    }
  }
  return {
    id: 'androidEmulator',
    ok: true,
    freedBytesApprox: freed,
    detail: `Snapshots/imagens Android ~${formatBytes(freed)}${inUseNote(inUse)}`,
  };
}
