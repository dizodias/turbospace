import { trashLabel } from '../copy.mjs';
import {
  dirSize,
  emptyDirContents,
  formatBytes,
  runCommand,
  userPaths,
} from '../measure.mjs';

async function measureRecycleBin() {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$sum = 0
Get-ChildItem -LiteralPath 'C:\\$Recycle.Bin' -Force -Recurse -File -ErrorAction SilentlyContinue |
  ForEach-Object { $sum += $_.Length }
[uint64]$sum
`.trim();
  const { ok, stdout } = await runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);
  if (!ok) return 0;
  const n = Number(String(stdout).trim());
  return Number.isFinite(n) ? n : 0;
}

export async function measureTrash() {
  if (process.platform === 'darwin') {
    const trash = userPaths().trash;
    return trash ? dirSize(trash) : 0;
  }
  return measureRecycleBin();
}

export async function cleanRecycleBin(onLog) {
  onLog('Esvaziando a Lixeira...');
  const before = await measureRecycleBin();
  const { ok, stderr } = await runCommand('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    'Clear-RecycleBin -Force -ErrorAction SilentlyContinue',
  ]);
  if (!ok && stderr) onLog(`Aviso Lixeira: ${stderr.trim()}`);
  const after = await measureRecycleBin();
  const freed = Math.max(0, before - after);
  onLog(`Lixeira: ~${formatBytes(freed)}`);
  return {
    id: 'recycleBin',
    ok: true,
    freedBytesApprox: freed || before,
    detail: `Lixeira ~${formatBytes(freed || before)}`,
  };
}

export async function cleanTrash(onLog) {
  const trash = userPaths().trash;
  const name = trashLabel();
  if (!trash) {
    return { id: 'trash', ok: false, freedBytesApprox: 0, detail: `${name} não encontrado` };
  }
  onLog(`Esvaziando o ${name}: ${trash}`);
  const freed = await emptyDirContents(trash, onLog);
  return {
    id: 'trash',
    ok: true,
    freedBytesApprox: freed,
    detail: `${name} ~${formatBytes(freed)}`,
  };
}
