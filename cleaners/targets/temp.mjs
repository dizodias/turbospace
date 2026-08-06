import {
  dirSize,
  emptyDirContents,
  formatBytes,
  userPaths,
} from '../measure.mjs';

export async function measureTempTargets() {
  const p = userPaths();
  const result = {
    userTemp: await dirSize(p.temp),
  };
  if (process.platform === 'win32') {
    result.winTemp = await dirSize(p.winTemp);
    result.prefetch = await dirSize(p.prefetch);
  }
  return result;
}

export async function measureUserTemp() {
  return dirSize(userPaths().temp);
}

export async function measureWinTemp() {
  const p = userPaths();
  return p.winTemp ? dirSize(p.winTemp) : 0;
}

export async function measurePrefetch() {
  const p = userPaths();
  return p.prefetch ? dirSize(p.prefetch) : 0;
}

export async function cleanUserTemp(onLog) {
  const p = userPaths();
  const label = process.platform === 'darwin' ? 'temporários do usuário' : 'TEMP do usuário';
  onLog(`Limpando ${label}: ${p.temp}`);
  const freed = await emptyDirContents(p.temp, onLog);
  return {
    id: 'userTemp',
    ok: true,
    freedBytesApprox: freed,
    detail:
      process.platform === 'darwin'
        ? `Temporários ~${formatBytes(freed)}`
        : `TEMP usuário ~${formatBytes(freed)}`,
  };
}

export async function cleanWinTemp(onLog) {
  const p = userPaths();
  if (!p.winTemp) {
    return { id: 'winTemp', ok: false, freedBytesApprox: 0, detail: 'Não aplicável' };
  }
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
  if (!p.prefetch) {
    return { id: 'prefetch', ok: false, freedBytesApprox: 0, detail: 'Não aplicável' };
  }
  onLog(`Limpando Prefetch: ${p.prefetch}`);
  const freed = await emptyDirContents(p.prefetch, onLog);
  return {
    id: 'prefetch',
    ok: true,
    freedBytesApprox: freed,
    detail: `Prefetch ~${formatBytes(freed)}`,
  };
}
