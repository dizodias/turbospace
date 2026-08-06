import { spawn } from 'node:child_process';
import os from 'node:os';
import { formatBytes } from '../format.mjs';
import { listLogicalDrives } from './drives.darwin.mjs';

function runCmd(command, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let out = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      resolve({ ok: false, out: '' });
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, out: '' });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, out });
    });
  });
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

export async function getSystemInfo() {
  const memBytes = os.totalmem();
  let cpu = os.cpus()[0]?.model?.trim() || '—';

  const brand = await runCmd('sysctl', ['-n', 'machdep.cpu.brand_string']);
  if (brand.ok && brand.out.trim()) {
    cpu = brand.out.trim();
  }

  let gpu = null;
  const gp = await runCmd('system_profiler', ['SPDisplaysDataType', '-json'], 8000);
  if (gp.ok && gp.out.trim()) {
    try {
      const data = JSON.parse(gp.out);
      const displays = data?.SPDisplaysDataType;
      const list = Array.isArray(displays) ? displays : displays ? [displays] : [];
      const name =
        list[0]?.sppci_model ||
        list[0]?._name ||
        list[0]?.['spdisplays_device-id'] ||
        null;
      if (name) gpu = String(name);
    } catch {
      // ignore
    }
  }

  let storage = [];
  try {
    const drives = await listLogicalDrives();
    storage = drives.map((d) => ({
      kind: d.kind || 'Disk',
      sizeLabel: d.totalLabel,
      sizeBytes: d.totalBytes,
      name: d.name || d.label,
      label: `${d.kind || 'Disk'} ${d.totalLabel}`,
    }));
  } catch {
    storage = [];
  }

  return {
    cpu,
    memory: formatBytes(memBytes),
    memoryBytes: memBytes,
    memoryType: null,
    gpu,
    storage,
  };
}

export { fallbackInfo };
