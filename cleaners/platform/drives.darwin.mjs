import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { formatBytes } from '../format.mjs';

export function normalizeVolume(id = '/') {
  const raw = String(id || '/').trim();
  if (!raw || raw === '/' || raw.toLowerCase() === 'macintosh hd') return '/';
  // Accept /Volumes/Name
  if (raw.startsWith('/')) return raw.replace(/\/+$/, '') || '/';
  return `/Volumes/${raw}`;
}

/** @deprecated Use normalizeVolume */
export function normalizeDrive(drive = '/') {
  return normalizeVolume(drive);
}

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

async function volumeLabelForMount(mountPoint) {
  if (mountPoint === '/') {
    const { ok, out } = await runCmd('diskutil', ['info', '-plist', '/']);
    if (ok && out.includes('<key>VolumeName</key>')) {
      const m = out.match(/<key>VolumeName<\/key>\s*<string>([^<]*)<\/string>/);
      if (m?.[1]) return m[1];
    }
    return 'Macintosh HD';
  }
  const parts = mountPoint.split('/').filter(Boolean);
  return parts[parts.length - 1] || mountPoint;
}

async function freeBytesAt(mountPoint) {
  try {
    if (typeof fs.statfs === 'function') {
      const st = await fs.promises.statfs(mountPoint);
      const bsize = Number(st.bsize) || Number(st.bsize) || 0;
      const bavail = Number(st.bavail) || 0;
      if (bsize && bavail) return bsize * bavail;
    }
  } catch {
    // fall through
  }
  const { ok, out } = await runCmd('df', ['-kP', mountPoint]);
  if (!ok) return 0;
  const lines = out.trim().split('\n');
  if (lines.length < 2) return 0;
  const cols = lines[1].trim().split(/\s+/);
  const availKb = Number(cols[3]);
  return Number.isFinite(availKb) ? availKb * 1024 : 0;
}

async function totalBytesAt(mountPoint) {
  try {
    if (typeof fs.statfs === 'function') {
      const st = await fs.promises.statfs(mountPoint);
      const bsize = Number(st.bsize) || 0;
      const blocks = Number(st.blocks) || 0;
      if (bsize && blocks) return bsize * blocks;
    }
  } catch {
    // fall through
  }
  const { ok, out } = await runCmd('df', ['-kP', mountPoint]);
  if (!ok) return 0;
  const lines = out.trim().split('\n');
  if (lines.length < 2) return 0;
  const cols = lines[1].trim().split(/\s+/);
  const totalKb = Number(cols[1]);
  return Number.isFinite(totalKb) ? totalKb * 1024 : 0;
}

export async function getDriveFreeBytes(volumeId = '/') {
  const mount = normalizeVolume(volumeId);
  return freeBytesAt(mount);
}

/**
 * Lista volumes locais montados (/ e /Volumes/* em /dev/disk*).
 */
export async function listLogicalDrives() {
  const { ok, out } = await runCmd('df', ['-kP'], 10000);
  if (!ok) {
    const freeBytes = await freeBytesAt('/');
    const totalBytes = await totalBytesAt('/');
    const label = await volumeLabelForMount('/');
    return [
      {
        id: '/',
        label,
        mountPoint: '/',
        letter: '/',
        name: label,
        kind: 'Disk',
        freeBytes,
        totalBytes,
        freeLabel: formatBytes(freeBytes),
        totalLabel: totalBytes ? formatBytes(totalBytes) : '—',
      },
    ];
  }

  const lines = out.trim().split('\n').slice(1);
  const seen = new Set();
  const results = [];

  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 6) continue;
    const fsName = cols[0];
    const mountPoint = cols.slice(5).join(' ');
    if (!fsName.startsWith('/dev/disk')) continue;
    if (!mountPoint.startsWith('/')) continue;
    // Skip system synthetic mounts that are not user volumes
    if (
      mountPoint.startsWith('/System/Volumes/') ||
      mountPoint === '/private/var/vm' ||
      mountPoint.startsWith('/Volumes/com.apple.')
    ) {
      continue;
    }
    // Prefer root and /Volumes/*
    if (mountPoint !== '/' && !mountPoint.startsWith('/Volumes/')) continue;
    if (seen.has(mountPoint)) continue;
    seen.add(mountPoint);

    const availKb = Number(cols[3]) || 0;
    const totalKb = Number(cols[1]) || 0;
    const freeBytes = availKb * 1024;
    const totalBytes = totalKb * 1024;
    const label = await volumeLabelForMount(mountPoint);
    results.push({
      id: mountPoint,
      label,
      mountPoint,
      letter: mountPoint,
      name: label,
      kind: 'Disk',
      freeBytes,
      totalBytes,
      freeLabel: formatBytes(freeBytes),
      totalLabel: formatBytes(totalBytes),
    });
  }

  if (!results.length) {
    const freeBytes = await freeBytesAt('/');
    const totalBytes = await totalBytesAt('/');
    const label = await volumeLabelForMount('/');
    results.push({
      id: '/',
      label,
      mountPoint: '/',
      letter: '/',
      name: label,
      kind: 'Disk',
      freeBytes,
      totalBytes,
      freeLabel: formatBytes(freeBytes),
      totalLabel: totalBytes ? formatBytes(totalBytes) : '—',
    });
  }

  // Ensure / comes first
  results.sort((a, b) => {
    if (a.id === '/') return -1;
    if (b.id === '/') return 1;
    return a.label.localeCompare(b.label);
  });

  return results;
}

export function defaultVolumeId() {
  return '/';
}
