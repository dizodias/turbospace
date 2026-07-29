import {
  commandExists,
  dirSize,
  formatBytes,
  runCommand,
  userPaths,
} from './measure.mjs';

export async function measureNpmPip() {
  const p = userPaths();
  return {
    npm: await dirSize(p.npmCache),
    pip: await dirSize(p.pipCache),
  };
}

export async function cleanNpm(onLog) {
  const has = await commandExists('npm');
  if (!has) {
    onLog('npm não instalado — pulando');
    return {
      id: 'npm',
      ok: false,
      freedBytesApprox: 0,
      detail: 'npm não instalado',
    };
  }
  const p = userPaths();
  const before = await dirSize(p.npmCache);
  onLog('Executando: npm cache clean --force');
  const r = await runCommand('npm', ['cache', 'clean', '--force'], { timeoutMs: 120000 });
  if (!r.ok) {
    onLog(`npm cache clean falhou: ${r.stderr || r.stdout}`);
    return {
      id: 'npm',
      ok: false,
      freedBytesApprox: 0,
      detail: r.stderr || 'falha',
    };
  }
  const after = await dirSize(p.npmCache);
  const freed = Math.max(0, before - after);
  onLog(`npm cache limpo (~${formatBytes(freed)})`);
  return {
    id: 'npm',
    ok: true,
    freedBytesApprox: freed || before,
    detail: `npm cache ~${formatBytes(freed || before)}`,
  };
}

export async function cleanPip(onLog) {
  const has = await commandExists('pip');
  if (!has) {
    onLog('pip não instalado — pulando');
    return {
      id: 'pip',
      ok: false,
      freedBytesApprox: 0,
      detail: 'pip não instalado',
    };
  }
  const p = userPaths();
  const before = await dirSize(p.pipCache);
  onLog('Executando: pip cache purge');
  const r = await runCommand('pip', ['cache', 'purge'], { timeoutMs: 120000 });
  if (!r.ok) {
    onLog(`pip cache purge falhou: ${r.stderr || r.stdout}`);
    return {
      id: 'pip',
      ok: false,
      freedBytesApprox: 0,
      detail: r.stderr || 'falha',
    };
  }
  if (r.stdout) onLog(r.stdout.trim());
  const after = await dirSize(p.pipCache);
  const freed = Math.max(0, before - after);
  onLog(`pip cache limpo (~${formatBytes(freed)})`);
  return {
    id: 'pip',
    ok: true,
    freedBytesApprox: freed || before,
    detail: `pip cache ~${formatBytes(freed || before)}`,
  };
}
