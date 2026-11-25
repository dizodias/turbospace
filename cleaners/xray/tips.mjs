import fs from 'node:fs';
import { spawn } from 'node:child_process';
import {
  dirSize,
  formatBytes,
  getDriveFreeBytes,
  getSystemInfo,
  isAdmin,
  userPaths,
} from '../measure.mjs';

/**
 * Dicas do Raio-X que não são exclusão direta: limite do cache de shaders da
 * NVIDIA, limpeza de componentes do Windows (DISM) e arquivo de hibernação.
 */

function systemDrive() {
  return (process.env.SystemDrive || 'C:').toUpperCase();
}

/**
 * Tamanho de um arquivo de sistema na raiz do disco do Windows (hiberfil.sys,
 * pagefile.sys). stat() falha com EPERM porque o Windows mantém esses arquivos
 * abertos, então o tamanho vem da listagem do diretório.
 * @returns {Promise<number|null>} null se não existe
 */
export function systemRootFileBytes(name) {
  if (!/^[\w.-]+$/.test(name)) return Promise.resolve(null);
  const script = `([System.IO.DirectoryInfo]'${systemDrive()}\\').EnumerateFiles('${name}') | ForEach-Object { $_.Length }`;
  return new Promise((resolve) => {
    let out = '';
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
    });
    const timer = setTimeout(() => child.kill(), 20000);
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const n = Number(out.trim());
      resolve(Number.isFinite(n) && n > 0 ? n : null);
    });
  });
}

const hiberfilBytes = () => systemRootFileBytes('hiberfil.sys');

async function nvidiaInfo() {
  const dirs = (userPaths().shaderCaches || []).filter((p) => /[\\/]NVIDIA[\\/]/i.test(p));
  let cacheBytes = 0;
  for (const d of dirs) cacheBytes += await dirSize(d);
  let gpu = '';
  try {
    gpu = (await getSystemInfo())?.gpu || '';
  } catch {
    // sem info de GPU: decide só pelas pastas de cache
  }
  const hasNvidia = /nvidia/i.test(gpu) || dirs.some((d) => fs.existsSync(d));
  return { hasNvidia, cacheBytes };
}

export async function systemTips() {
  if (process.platform !== 'win32') return { tips: [] };
  const [nvidia, hiber, admin] = await Promise.all([nvidiaInfo(), hiberfilBytes(), isAdmin()]);
  const tips = [];
  if (nvidia.hasNvidia) tips.push({ id: 'nvidia', cacheBytes: nvidia.cacheBytes });
  tips.push({ id: 'dism', admin });
  if (hiber) tips.push({ id: 'hiberfil', bytes: hiber, drive: systemDrive() });
  return { tips };
}

/**
 * DISM /Online /Cleanup-Image /StartComponentCleanup: remove versões antigas de
 * componentes do Windows (WinSxS) já substituídas por atualizações.
 * /English deixa a saída em ASCII (o padrão sai no codepage OEM).
 */
export async function runDismCleanup(onLog) {
  if (process.platform !== 'win32') return { ok: false, freedBytes: 0, detail: 'Só no Windows' };
  if (!(await isAdmin())) {
    onLog('DISM exige administrador: abra o TurboSpace como administrador.');
    return { ok: false, freedBytes: 0, detail: 'DISM exige administrador' };
  }
  const drive = systemDrive();
  const before = await getDriveFreeBytes(drive);
  onLog('Executando: DISM /Online /Cleanup-Image /StartComponentCleanup (pode levar de 5 a 15 min)');
  const code = await new Promise((resolve) => {
    const child = spawn(
      'dism.exe',
      ['/Online', '/Cleanup-Image', '/StartComponentCleanup', '/English'],
      { windowsHide: true }
    );
    let lastPct = -10;
    let buf = '';
    const handle = (chunk) => {
      buf += chunk.toString('latin1');
      const parts = buf.split(/[\r\n]+/);
      buf = parts.pop();
      for (const raw of parts) {
        const line = raw.trim();
        if (!line) continue;
        const m = line.match(/(\d+(?:\.\d+)?)%/);
        if (m) {
          const pct = Math.floor(Number(m[1]));
          if (pct >= lastPct + 10 || pct === 100) {
            lastPct = pct;
            onLog(`DISM: ${pct}%`);
          }
        } else if (/error|completed|success/i.test(line)) {
          onLog(`DISM: ${line}`);
        }
      }
    };
    child.stdout.on('data', handle);
    child.stderr.on('data', handle);
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignora
      }
    }, 60 * 60 * 1000);
    child.on('error', (err) => {
      clearTimeout(timer);
      onLog(`DISM não pôde ser iniciado: ${err.message}`);
      resolve(-1);
    });
    child.on('close', (c) => {
      clearTimeout(timer);
      resolve(c ?? -1);
    });
  });
  const after = await getDriveFreeBytes(drive);
  const freedBytes = Math.max(0, (after || 0) - (before || 0));
  const ok = code === 0;
  onLog(
    ok
      ? `DISM concluído: ~${formatBytes(freedBytes)} liberados em ${drive}`
      : `DISM terminou com código ${code}`
  );
  return { ok, freedBytes, detail: ok ? `DISM ~${formatBytes(freedBytes)}` : `DISM código ${code}` };
}
