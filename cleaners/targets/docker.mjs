import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { commandExists, formatBytes, isAdmin, runCommand, userPaths } from '../measure.mjs';

/** Discos virtuais do Docker Desktop (WSL 2) que existem nesta máquina. */
function dockerDisks() {
  return (userPaths().dockerDisks || []).filter((p) => fs.existsSync(p));
}

function fileSize(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

/** Tamanho real ocupado pelos VHDX do Docker (não é o que o prune libera). */
export async function dockerDiskBytes() {
  return dockerDisks().reduce((sum, p) => sum + fileSize(p), 0);
}

export async function measureDocker() {
  const has = await commandExists('docker');
  const diskBytes = await dockerDiskBytes();
  if (!has) return { available: false, bytes: 0, diskBytes };
  return { available: true, bytes: null, diskBytes };
}

export async function cleanDocker(onLog) {
  const has = await commandExists('docker');
  if (!has) {
    onLog('Docker não instalado — pulando');
    return {
      id: 'docker',
      ok: false,
      freedBytesApprox: 0,
      detail: 'Docker não instalado',
    };
  }
  onLog('Executando: docker system prune -af (sem volumes)');
  const r = await runCommand('docker', ['system', 'prune', '-af'], { timeoutMs: 300000 });
  if (!r.ok) {
    onLog(`Docker prune falhou: ${r.stderr || r.stdout}`);
    return {
      id: 'docker',
      ok: false,
      freedBytesApprox: 0,
      detail: r.stderr || r.stdout || 'falha',
    };
  }
  const out = (r.stdout || '').trim();
  if (out) onLog(out.split('\n').slice(-5).join(' | '));
  let freed = 0;
  const m = out.match(/reclaimed space:\s*([\d.]+)\s*([KMGT]?B)/i);
  if (m) {
    const n = Number(m[1]);
    const u = m[2].toUpperCase();
    const mult =
      u === 'B' ? 1 : u === 'KB' ? 1024 : u === 'MB' ? 1024 ** 2 : u === 'GB' ? 1024 ** 3 : 1024 ** 4;
    freed = Math.round(n * mult);
  }
  onLog(`Docker prune OK (~${formatBytes(freed)})`);
  if (dockerDisks().length) {
    onLog('O prune libera espaço dentro do disco virtual; para devolver ao Windows, use "Compactar disco do Docker".');
  }
  return {
    id: 'docker',
    ok: true,
    freedBytesApprox: freed,
    detail: `Docker prune ~${formatBytes(freed)}`,
  };
}

/*
 * Compactação do VHDX (alvo dockerCompact, só Windows, desmarcado por padrão).
 * Receita da documentação do WSL: fechar o Docker Desktop, wsl --shutdown e
 * diskpart "compact vdisk" com o disco anexado como somente leitura.
 * Nenhum dado é apagado: só o espaço vazio dentro do VHDX volta para o Windows.
 */

async function processRunning(image) {
  const r = await runCommand('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], {
    timeoutMs: 20000,
  });
  return r.ok && r.stdout.toLowerCase().includes(`"${image.toLowerCase()}"`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function stopDockerDesktop(onLog) {
  if (!(await processRunning('Docker Desktop.exe'))) return;
  onLog('Fechando o Docker Desktop...');
  await runCommand('docker', ['desktop', 'stop'], { timeoutMs: 180000 });
  for (let i = 0; i < 10 && (await processRunning('Docker Desktop.exe')); i++) await wait(1000);
  if (await processRunning('Docker Desktop.exe')) {
    await runCommand('taskkill', ['/IM', 'Docker Desktop.exe', '/T', '/F'], { timeoutMs: 30000 });
    await wait(2000);
  }
}

async function runDiskpart(lines) {
  const script = path.join(os.tmpdir(), `turbospace-diskpart-${process.pid}-${Date.now()}.txt`);
  await fsp.writeFile(script, lines.join('\r\n') + '\r\n', 'utf8');
  try {
    return await runCommand('diskpart', ['/s', script], { timeoutMs: 1800000 });
  } finally {
    await fsp.rm(script, { force: true }).catch(() => {});
  }
}

async function compactVhdx(vhdx, onLog) {
  const before = fileSize(vhdx);
  onLog(`Compactando ${vhdx} (${formatBytes(before)})... pode levar vários minutos`);
  const r = await runDiskpart([
    `select vdisk file="${vhdx}"`,
    'attach vdisk readonly',
    'compact vdisk',
    'detach vdisk',
    'exit',
  ]);
  if (!r.ok) {
    // garante que o disco não fique anexado se o compact falhar no meio
    await runDiskpart([`select vdisk file="${vhdx}"`, 'detach vdisk', 'exit']);
    const msg = (r.stdout || r.stderr || '').trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' | ');
    onLog(`Falha ao compactar ${vhdx}: ${msg || `código ${r.code}`} (o disco pode estar em uso)`);
    return { ok: false, freed: 0 };
  }
  const after = fileSize(vhdx);
  const freed = Math.max(0, before - after);
  onLog(`Compactado: ${formatBytes(before)} → ${formatBytes(after)} (~${formatBytes(freed)})`);
  return { ok: true, freed };
}

export async function measureDockerCompact() {
  // espaço vazio dentro do VHDX só é conhecido na hora; null = "tamanho na limpeza"
  return dockerDisks().length ? null : 0;
}

export async function cleanDockerCompact(onLog) {
  const disks = dockerDisks();
  if (!disks.length) {
    onLog('Disco virtual do Docker não encontrado — pulando');
    return { id: 'dockerCompact', ok: true, freedBytesApprox: 0, detail: 'Disco do Docker não encontrado' };
  }
  if (!(await isAdmin())) {
    onLog('Compactar o disco do Docker exige administrador — pulando');
    return {
      id: 'dockerCompact',
      ok: false,
      freedBytesApprox: 0,
      detail: 'Compactação do Docker exige administrador',
    };
  }
  await stopDockerDesktop(onLog);
  onLog('Executando: wsl --shutdown');
  const sh = await runCommand('wsl', ['--shutdown'], { timeoutMs: 120000 });
  if (!sh.ok) {
    onLog(`wsl --shutdown falhou: ${(sh.stderr || sh.stdout || '').trim()}`);
    return { id: 'dockerCompact', ok: false, freedBytesApprox: 0, detail: 'wsl --shutdown falhou' };
  }
  await wait(3000);
  let freed = 0;
  let ok = true;
  for (const vhdx of disks) {
    const r = await compactVhdx(vhdx, onLog);
    freed += r.freed;
    ok = ok && r.ok;
  }
  onLog('Abra o Docker Desktop de novo quando precisar.');
  return {
    id: 'dockerCompact',
    ok,
    freedBytesApprox: freed,
    detail: `Disco do Docker compactado ~${formatBytes(freed)}`,
  };
}
