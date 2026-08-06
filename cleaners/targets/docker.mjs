import { commandExists, formatBytes, runCommand } from '../measure.mjs';

export async function measureDocker() {
  const has = await commandExists('docker');
  if (!has) return { available: false, bytes: 0 };
  return { available: true, bytes: null };
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
  return {
    id: 'docker',
    ok: true,
    freedBytesApprox: freed,
    detail: `Docker prune ~${formatBytes(freed)}`,
  };
}
