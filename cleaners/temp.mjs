import { emptyDirContents, formatBytes, userPaths } from './measure.mjs';

export async function measureTempTargets() {
  const p = userPaths();
  const { dirSize } = await import('./measure.mjs');
  return {
    userTemp: await dirSize(p.temp),
    winTemp: await dirSize(p.winTemp),
    prefetch: await dirSize(p.prefetch),
  };
}

export async function cleanUserTemp(onLog) {
  const p = userPaths();
  onLog(`Limpando TEMP do usuário: ${p.temp}`);
  const freed = await emptyDirContents(p.temp, onLog);
  return {
    id: 'userTemp',
    ok: true,
    freedBytesApprox: freed,
    detail: `TEMP usuário ~${formatBytes(freed)}`,
  };
}

export async function cleanWinTemp(onLog) {
  const p = userPaths();
  onLog(`Limpando TEMP do Windows: ${p.winTemp}`);
  const freed = await emptyDirContents(p.winTemp, onLog);
  return {
    id: 'winTemp',
    ok: true,
    freedBytesApprox: freed,
    detail: `Windows Temp ~${formatBytes(freed)}`,
  };
}

export async function cleanPrefetch(onLog) {
  const p = userPaths();
  onLog(`Limpando Prefetch: ${p.prefetch}`);
  const freed = await emptyDirContents(p.prefetch, onLog);
  return {
    id: 'prefetch',
    ok: true,
    freedBytesApprox: freed,
    detail: `Prefetch ~${formatBytes(freed)}`,
  };
}
