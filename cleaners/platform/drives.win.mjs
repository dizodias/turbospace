import { spawn } from 'node:child_process';
import { formatBytes } from '../format.mjs';

export function normalizeVolume(id = 'C:') {
  const letter = String(id || 'C')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .charAt(0);
  return `${letter || 'C'}:`;
}

/** @deprecated Use normalizeVolume */
export function normalizeDrive(drive = 'C:') {
  return normalizeVolume(drive);
}

export async function getDriveFreeBytes(volumeId = 'C:') {
  const letter = normalizeVolume(volumeId).replace(':', '');
  return new Promise((resolve) => {
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-Command', `(Get-PSDrive -Name '${letter}').Free`],
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
 * Contrato unificado: id, label, mountPoint, kind, freeBytes, totalBytes, freeLabel, totalLabel
 * Mantém `letter` e `name` por compatibilidade com a UI atual.
 */
export async function listLogicalDrives() {
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
              const id = normalizeVolume(d.letter);
              const freeBytes = Number(d.freeBytes) || 0;
              const totalBytes = Number(d.totalBytes) || 0;
              const name = d.name ? String(d.name) : '';
              return {
                id,
                label: name ? `${id} (${name})` : id,
                mountPoint: `${id}\\`,
                letter: id,
                name,
                kind: d.kind ? String(d.kind) : 'Disco',
                freeBytes,
                totalBytes,
                freeLabel: formatBytes(freeBytes),
                totalLabel: formatBytes(totalBytes),
              };
            })
            .filter((d) => d.id)
        );
      } catch {
        resolve([]);
      }
    });
  });
}

export function defaultVolumeId() {
  return 'C:';
}
