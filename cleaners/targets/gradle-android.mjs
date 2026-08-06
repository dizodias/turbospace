import path from 'node:path';
import {
  dirSize,
  formatBytes,
  removePathRecursive,
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
