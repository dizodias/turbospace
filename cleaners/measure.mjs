import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export async function dirSize(root, { maxFiles = 200000 } = {}) {
  if (!root || !fs.existsSync(root)) return 0;
  let total = 0;
  let count = 0;
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      try {
        if (ent.isDirectory()) {
          stack.push(full);
        } else if (ent.isFile()) {
          const st = await fsp.stat(full);
          total += st.size;
          count += 1;
          if (count >= maxFiles) return total;
        }
      } catch {
        // skip locked / permission denied
      }
    }
  }
  return total;
}

export function normalizeDrive(drive = 'C:') {
  const letter = String(drive || 'C')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .charAt(0);
  return `${letter || 'C'}:`;
}

export async function getDriveFreeBytes(drive = 'C:') {
  const letter = normalizeDrive(drive).replace(':', '');
  return new Promise((resolve) => {
    const ps = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-PSDrive -Name '${letter}').Free`,
      ],
      { windowsHide: true }
    );
    let out = '';
    ps.stdout.on('data', (d) => {
      out += d.toString();
    });
    ps.on('close', () => {
      const n = Number(String(out).trim());
      resolve(Number.isFinite(n) ? n : 0);
    });
    ps.on('error', () => resolve(0));
  });
}

/**
 * Lista unidades locais (HD/SSD/NVMe) com espaço livre.
 */
export async function listLogicalDrives() {
  if (process.platform !== 'win32') {
    const free = await getDriveFreeBytes('C:');
    return [
      {
        letter: 'C:',
        name: 'System',
        kind: 'Disk',
        freeBytes: free,
        totalBytes: 0,
        freeLabel: formatBytes(free),
        totalLabel: '—',
      },
    ];
  }

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$items = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
  $letter = $_.DeviceID
  $kind = 'Disco'
  try {
    $dl = $letter.TrimEnd(':')
    $part = Get-Partition -DriveLetter $dl -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($part) {
      $disk = Get-Disk -Number $part.DiskNumber -ErrorAction SilentlyContinue
      if ($disk) {
        $bus = [string]$disk.BusType
        $media = [string]$disk.MediaType
        if ($bus -eq 'NVMe' -or $media -match 'NVMe') { $kind = 'NVMe' }
        elseif ($media -eq 'SSD' -or $bus -eq 'SSD' -or $media -match 'Solid') { $kind = 'SSD' }
        elseif ($media -eq 'HDD' -or $media -match 'Hard') { $kind = 'HD' }
        else { $kind = if ($bus) { $bus } else { 'Disco' } }
      }
    }
  } catch {}
  [PSCustomObject]@{
    letter = $letter
    name = $_.VolumeName
    kind = $kind
    freeBytes = [uint64]$_.FreeSpace
    totalBytes = [uint64]$_.Size
  }
})
$items | ConvertTo-Json -Compress -Depth 3
`.trim();

  return new Promise((resolve) => {
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    );
    let out = '';
    const timer = setTimeout(() => {
      try {
        ps.kill();
      } catch {
        // ignore
      }
      resolve([]);
    }, 12000);
    ps.stdout.on('data', (d) => {
      out += d.toString();
    });
    ps.on('error', () => {
      clearTimeout(timer);
      resolve([]);
    });
    ps.on('close', () => {
      clearTimeout(timer);
      try {
        const raw = JSON.parse(out.trim() || '[]');
        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
        resolve(
          list
            .map((d) => {
              const letter = normalizeDrive(d.letter);
              const freeBytes = Number(d.freeBytes) || 0;
              const totalBytes = Number(d.totalBytes) || 0;
              return {
                letter,
                name: d.name ? String(d.name) : '',
                kind: d.kind ? String(d.kind) : 'Disco',
                freeBytes,
                totalBytes,
                freeLabel: formatBytes(freeBytes),
                totalLabel: formatBytes(totalBytes),
              };
            })
            .filter((d) => d.letter)
        );
      } catch {
        resolve([]);
      }
    });
  });
}

export function commandExists(cmd) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const child = isWin
      ? spawn(`where ${cmd}`, { windowsHide: true, shell: true })
      : spawn('which', [cmd], { windowsHide: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

export function runCommand(command, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const quoted = (args || [])
      .map((a) => {
        const s = String(a);
        return /\s/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
      })
      .join(' ');
    const line = quoted ? `${command} ${quoted}` : command;
    const child = spawn(line, {
      windowsHide: true,
      shell: true,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve({ ok: false, code: -1, stdout, stderr: stderr || 'timeout' });
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, stdout, stderr: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code: code ?? -1, stdout, stderr });
    });
  });
}

export async function removePathRecursive(target, onLog) {
  if (!target || !fs.existsSync(target)) {
    onLog?.(`Pulando (não existe): ${target}`);
    return 0;
  }
  const before = await dirSize(target);
  try {
    await fsp.rm(target, { recursive: true, force: true, maxRetries: 2 });
    onLog?.(`Removido: ${target} (~${formatBytes(before)})`);
    return before;
  } catch (err) {
    // fallback: try emptying contents
    let freed = 0;
    try {
      const entries = await fsp.readdir(target, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(target, ent.name);
        try {
          const size = ent.isDirectory() ? await dirSize(full) : (await fsp.stat(full)).size;
          await fsp.rm(full, { recursive: true, force: true, maxRetries: 1 });
          freed += size;
        } catch {
          // file in use
        }
      }
      onLog?.(`Parcial em ${target}: ~${formatBytes(freed)} (${err.message})`);
      return freed;
    } catch (err2) {
      onLog?.(`Falha em ${target}: ${err2.message}`);
      return 0;
    }
  }
}

export async function emptyDirContents(dir, onLog) {
  if (!dir || !fs.existsSync(dir)) {
    onLog?.(`Pulando (não existe): ${dir}`);
    return 0;
  }
  let freed = 0;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    onLog?.(`Sem acesso a ${dir}: ${err.message}`);
    return 0;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    try {
      const size = ent.isDirectory() ? await dirSize(full) : (await fsp.stat(full)).size;
      await fsp.rm(full, { recursive: true, force: true, maxRetries: 1 });
      freed += size;
    } catch {
      // locked
    }
  }
  onLog?.(`Esvaziado ${dir}: ~${formatBytes(freed)}`);
  return freed;
}

export function userPaths() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const temp = process.env.TEMP || process.env.TMP || path.join(local, 'Temp');
  return {
    home,
    local,
    temp,
    desktop: path.join(home, 'Desktop'),
    winTemp: 'C:\\Windows\\Temp',
    prefetch: 'C:\\Windows\\Prefetch',
    gradleCaches: path.join(home, '.gradle', 'caches'),
    androidSdk: path.join(local, 'Android', 'Sdk'),
    npmCache: path.join(local, 'npm-cache'),
    pipCache: path.join(local, 'pip', 'Cache'),
  };
}

export async function isAdmin() {
  return new Promise((resolve) => {
    const child = spawn('net session', { windowsHide: true, shell: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}
