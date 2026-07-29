import { commandExists, formatBytes, runCommand } from './measure.mjs';

export async function measureDocker() {
  const has = await commandExists('docker');
  if (!has) return { available: false, bytes: 0 };
  const r = await runCommand('docker', ['system', 'df', '--format', '{{.Size}}'], {
    timeoutMs: 30000,
  });
  // Fallback: rough unknown — UI shows "Docker instalado"
  return { available: true, bytes: r.ok ? 0 : 0, raw: r.stdout.trim() };
}

export async function getDockerReclaimable(onLog) {
  const has = await commandExists('docker');
  if (!has) {
    onLog?.('Docker não encontrado no PATH');
    return 0;
  }
  const r = await runCommand('docker', ['system', 'df'], { timeoutMs: 45000 });
  if (!r.ok) {
    onLog?.(`docker system df falhou: ${r.stderr || r.stdout}`);
    return 0;
  }
  onLog?.(r.stdout.trim().split('\n').slice(0, 8).join(' | '));
  // Parse "Reclaimable" column if present is hard; return 0 and rely on free-space delta
  return 0;
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
  // Try to parse "Total reclaimed space: X"
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
