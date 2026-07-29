import { spawn } from 'node:child_process';
import os from 'node:os';
import { formatBytes } from './measure.mjs';

function runPowerShell(script, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true }
    );
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve({ ok: false, out, err: err || 'timeout' });
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, out, err: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, out, err });
    });
  });
}

function classifyDisk(busType, mediaType, name = '') {
  const bus = String(busType || '').toLowerCase();
  const media = String(mediaType || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (bus === 'nvme' || n.includes('nvme')) return 'NVMe';
  if (media === 'ssd' || bus === 'ssd' || n.includes('ssd')) return 'SSD';
  if (media === 'hdd' || media === 'unspecified' && (bus === 'sata' || bus === 'ata')) {
    if (media === 'hdd') return 'HD';
  }
  if (media === 'hdd') return 'HD';
  if (media.includes('ssd')) return 'SSD';
  if (n.includes('ssd')) return 'SSD';
  if (n.includes('hdd') || n.includes('hard')) return 'HD';
  return media === 'hdd' ? 'HD' : media ? media.toUpperCase() : 'Disco';
}

function isRealGpu(name) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  if (n.includes('microsoft basic')) return false;
  if (n.includes('remote desktop')) return false;
  if (n.includes('virtual') && n.includes('display')) return false;
  if (n.includes('microsoft remote')) return false;
  return true;
}

/** SMBIOSMemoryType → rótulo DDR (Win32_PhysicalMemory). */
function memoryTypeLabel(code) {
  const n = Number(code);
  const map = {
    20: 'DDR',
    21: 'DDR2',
    22: 'DDR2',
    24: 'DDR3',
    26: 'DDR4',
    34: 'DDR5',
  };
  return map[n] || null;
}

function fallbackInfo() {
  const cpus = os.cpus();
  const cpu = cpus[0]?.model?.trim() || '—';
  const memBytes = os.totalmem();
  return {
    cpu,
    memory: formatBytes(memBytes),
    memoryBytes: memBytes,
    memoryType: null,
    gpu: null,
    storage: [],
  };
}

/**
 * Lê CPU, RAM, GPU (se houver) e discos (NVMe/SSD/HD + tamanho).
 */
export async function getSystemInfo() {
  if (process.platform !== 'win32') {
    return fallbackInfo();
  }

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$mem = [uint64](Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
$memTypes = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object { $_.SMBIOSMemoryType } | Where-Object { $_ -and $_ -gt 0 })
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name } | Where-Object { $_ })
$disks = @()
try {
  $disks = @(Get-PhysicalDisk | ForEach-Object {
    [PSCustomObject]@{
      Name = $_.FriendlyName
      MediaType = $_.MediaType.ToString()
      BusType = $_.BusType.ToString()
      Size = [uint64]$_.Size
    }
  })
} catch {
  $disks = @(Get-CimInstance Win32_DiskDrive | ForEach-Object {
    [PSCustomObject]@{
      Name = $_.Model
      MediaType = $_.MediaType
      BusType = $_.InterfaceType
      Size = [uint64]$_.Size
    }
  })
}
@{
  cpu = $cpu
  memoryBytes = $mem
  memoryTypes = $memTypes
  gpus = $gpus
  disks = $disks
} | ConvertTo-Json -Compress -Depth 4
`.trim();

  const { ok, out } = await runPowerShell(script);
  if (!ok || !out.trim()) {
    return fallbackInfo();
  }

  try {
    const data = JSON.parse(out.trim());
    const memBytes = Number(data.memoryBytes) || os.totalmem();
    let rawMemTypes = data.memoryTypes;
    if (!Array.isArray(rawMemTypes)) {
      rawMemTypes = rawMemTypes != null ? [rawMemTypes] : [];
    }
    const memoryType =
      rawMemTypes.map(memoryTypeLabel).find(Boolean) || null;
    const gpuList = Array.isArray(data.gpus)
      ? data.gpus
      : data.gpus
        ? [data.gpus]
        : [];
    const gpu = gpuList.map((g) => String(g).trim()).filter(isRealGpu)[0] || null;

    let rawDisks = data.disks;
    if (!Array.isArray(rawDisks)) {
      rawDisks = rawDisks ? [rawDisks] : [];
    }

    const storage = rawDisks
      .map((d) => {
        const size = Number(d.Size) || 0;
        if (size <= 0) return null;
        const kind = classifyDisk(d.BusType, d.MediaType, d.Name);
        return {
          kind,
          sizeLabel: formatBytes(size),
          sizeBytes: size,
          name: d.Name || null,
          label: `${kind} ${formatBytes(size)}`,
        };
      })
      .filter(Boolean);

    return {
      cpu: String(data.cpu || os.cpus()[0]?.model || '—').trim(),
      memory: formatBytes(memBytes),
      memoryBytes: memBytes,
      memoryType,
      gpu,
      storage,
    };
  } catch {
    return fallbackInfo();
  }
}
