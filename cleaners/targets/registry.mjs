import { commandExists } from '../measure.mjs';
import {
  cleanPrefetch,
  cleanUserTemp,
  cleanWinTemp,
  measurePrefetch,
  measureUserTemp,
  measureWinTemp,
} from './temp.mjs';
import { cleanRecycleBin, cleanTrash, measureTrash } from './trash.mjs';
import { cleanBrowserCache, measureBrowserCache } from './browsers.mjs';
import {
  cleanCrashDumpsWin,
  cleanDeliveryOpt,
  cleanShaderCache,
  cleanThumbnails,
  cleanUpdateCache,
  measureCrashDumpsWin,
  measureDeliveryOpt,
  measureShaderCache,
  measureThumbnailsSize,
  measureUpdateCache,
} from './windows-system.mjs';
import {
  cleanAppCaches,
  cleanDiagnosticReports,
  cleanXcodeDerivedData,
  measureAppCaches,
  measureDiagnosticReports,
  measureXcodeDerivedData,
} from './caches.darwin.mjs';
import { cleanDocker, measureDocker } from './docker.mjs';
import {
  cleanAndroid,
  cleanGradle,
  measureAndroid,
  measureGradle,
} from './gradle-android.mjs';
import { cleanNpm, cleanPip, measureNpm, measurePip } from './npm-pip.mjs';
import { cleanDesktopJunk, measureDesktopJunk } from './desktop.mjs';

/**
 * @typedef {{
 *   id: string,
 *   platforms: string[],
 *   group: string,
 *   measure: () => Promise<number|null>,
 *   clean: (onLog: (line: string) => void) => Promise<object>,
 * }} TargetDef
 */

/** @type {TargetDef[]} */
export const TARGETS = [
  {
    id: 'userTemp',
    platforms: ['win32', 'darwin'],
    group: 'temp',
    measure: measureUserTemp,
    clean: cleanUserTemp,
  },
  {
    id: 'winTemp',
    platforms: ['win32'],
    group: 'temp',
    measure: measureWinTemp,
    clean: cleanWinTemp,
  },
  {
    id: 'prefetch',
    platforms: ['win32'],
    group: 'temp',
    measure: measurePrefetch,
    clean: cleanPrefetch,
  },
  {
    id: 'recycleBin',
    platforms: ['win32'],
    group: 'system',
    measure: measureTrash,
    clean: cleanRecycleBin,
  },
  {
    id: 'trash',
    platforms: ['darwin'],
    group: 'system',
    measure: measureTrash,
    clean: cleanTrash,
  },
  {
    id: 'thumbnails',
    platforms: ['win32'],
    group: 'system',
    measure: measureThumbnailsSize,
    clean: cleanThumbnails,
  },
  {
    id: 'updateCache',
    platforms: ['win32'],
    group: 'system',
    measure: measureUpdateCache,
    clean: cleanUpdateCache,
  },
  {
    id: 'deliveryOpt',
    platforms: ['win32'],
    group: 'system',
    measure: measureDeliveryOpt,
    clean: cleanDeliveryOpt,
  },
  {
    id: 'crashDumps',
    platforms: ['win32', 'darwin'],
    group: 'system',
    measure: async () =>
      process.platform === 'darwin' ? measureDiagnosticReports() : measureCrashDumpsWin(),
    clean: async (onLog) =>
      process.platform === 'darwin' ? cleanDiagnosticReports(onLog) : cleanCrashDumpsWin(onLog),
  },
  {
    id: 'browserCache',
    platforms: ['win32', 'darwin'],
    group: 'system',
    measure: measureBrowserCache,
    clean: cleanBrowserCache,
  },
  {
    id: 'shaderCache',
    platforms: ['win32'],
    group: 'system',
    measure: measureShaderCache,
    clean: cleanShaderCache,
  },
  {
    id: 'appCaches',
    platforms: ['darwin'],
    group: 'system',
    measure: measureAppCaches,
    clean: cleanAppCaches,
  },
  {
    id: 'xcodeDerivedData',
    platforms: ['darwin'],
    group: 'dev',
    measure: measureXcodeDerivedData,
    clean: cleanXcodeDerivedData,
  },
  {
    id: 'docker',
    platforms: ['win32', 'darwin'],
    group: 'dev',
    measure: async () => {
      const info = await measureDocker();
      return info.available ? null : 0;
    },
    clean: cleanDocker,
  },
  {
    id: 'gradle',
    platforms: ['win32', 'darwin'],
    group: 'dev',
    measure: measureGradle,
    clean: cleanGradle,
  },
  {
    id: 'android',
    platforms: ['win32', 'darwin'],
    group: 'dev',
    measure: measureAndroid,
    clean: cleanAndroid,
  },
  {
    id: 'npm',
    platforms: ['win32', 'darwin'],
    group: 'dev',
    measure: measureNpm,
    clean: cleanNpm,
  },
  {
    id: 'pip',
    platforms: ['win32', 'darwin'],
    group: 'dev',
    measure: measurePip,
    clean: cleanPip,
  },
  {
    id: 'desktopJunk',
    platforms: ['win32', 'darwin'],
    group: 'desktop',
    measure: measureDesktopJunk,
    clean: cleanDesktopJunk,
  },
];

const GROUP_ORDER = ['temp', 'system', 'dev', 'desktop'];

export function targetsFor(platform = process.platform) {
  return TARGETS.filter((t) => t.platforms.includes(platform));
}

export function targetIdsFor(platform = process.platform) {
  return targetsFor(platform).map((t) => t.id);
}

export function findTarget(id, platform = process.platform) {
  return targetsFor(platform).find((t) => t.id === id) || null;
}

export function groupsFor(platform = process.platform) {
  const list = targetsFor(platform);
  const byGroup = new Map();
  for (const t of list) {
    if (!byGroup.has(t.group)) byGroup.set(t.group, []);
    byGroup.get(t.group).push(t.id);
  }
  return GROUP_ORDER.filter((g) => byGroup.has(g)).map((id) => ({
    id,
    items: byGroup.get(id),
    open: id === 'temp',
    largeFiles: id === 'desktop',
    warn: id === 'dev' ? { docker: true } : undefined,
  }));
}

export async function analyzeSelected(selectedIds, onLog) {
  const platform = process.platform;
  const available = targetsFor(platform);
  const selected = new Set(
    selectedIds?.length ? selectedIds : available.map((t) => t.id)
  );
  const sizes = {};

  const tempIds = ['userTemp', 'winTemp', 'prefetch'].filter((id) => selected.has(id));
  if (tempIds.length) onLog?.('Medindo arquivos temporários...');

  const systemIds = [
    'recycleBin',
    'trash',
    'thumbnails',
    'updateCache',
    'deliveryOpt',
    'crashDumps',
    'browserCache',
    'shaderCache',
    'appCaches',
  ].filter((id) => selected.has(id));
  if (systemIds.length) onLog?.('Medindo lixeira, caches e resíduos do sistema...');

  if (selected.has('docker')) onLog?.('Verificando limpeza de containers...');
  if (selected.has('gradle') || selected.has('android') || selected.has('xcodeDerivedData')) {
    onLog?.('Medindo caches de desenvolvimento...');
  }
  if (selected.has('npm') || selected.has('pip')) onLog?.('Medindo caches de pacotes...');
  if (selected.has('desktopJunk')) onLog?.('Medindo resíduos na Área de Trabalho...');

  for (const t of available) {
    if (!selected.has(t.id)) continue;
    try {
      if (t.id === 'docker') {
        const has = await commandExists('docker');
        sizes.docker = has ? null : 0;
        if (!has) onLog?.('Ambiente de containers não encontrado');
        continue;
      }
      sizes[t.id] = await t.measure();
    } catch (err) {
      onLog?.(`Falha ao medir ${t.id}: ${err.message}`);
      sizes[t.id] = 0;
    }
  }

  return sizes;
}

export async function cleanSelected(selectedIds, onLog) {
  const results = [];
  const platform = process.platform;
  for (const id of selectedIds || []) {
    const t = findTarget(id, platform);
    if (!t) {
      onLog?.(`Alvo desconhecido: ${id}`);
      continue;
    }
    onLog?.('—');
    onLog?.(`>>> Iniciando: ${id}`);
    try {
      const result = await t.clean(onLog);
      results.push(result);
      onLog?.(`<<< ${result.detail || id} (${result.ok ? 'OK' : 'falha'})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog?.(`ERRO em ${id}: ${msg}`);
      results.push({ id, ok: false, freedBytesApprox: 0, detail: msg });
    }
  }
  return results;
}
