import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Raio-X: mapa de uso do disco.
 *
 * Árvore compacta (mesmo formato nos dois scanners):
 *   { n: nome, s: bytes, f: arquivos, o?: bytes em itens pequenos agrupados,
 *     e?: pastas sem acesso, k?: filhos (maiores primeiro), t?: 1 se arquivo }
 * A raiz tem n = caminho completo. Só entram itens >= minBytes (no máximo
 * maxKids por pasta); o resto é somado em "o". Reparse points/symlinks são
 * pulados, então nada é contado duas vezes.
 */

const SCANNER_CS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'TurboScan.cs');
const MAX_KIDS = 60;

function psQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

/** Scanner nativo (Windows): C# compilado pelo PowerShell via Add-Type. */
function scanNativeWin(root, minBytes, onProgress) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), `turbospace-xray-${process.pid}-${Date.now()}.json`);
    const command = [
      '$ErrorActionPreference = "Stop"',
      `Add-Type -Path ${psQuote(SCANNER_CS)}`,
      `[TurboScan]::Run(${psQuote(root)}, ${Math.round(minBytes)}, ${MAX_KIDS}, ${psQuote(out)})`,
    ].join('; ');
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true }
    );
    let stderr = '';
    let buf = '';
    child.stderr.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        const m = line.match(/^P (\d+) (\d+)$/);
        if (m) onProgress?.({ dirs: Number(m[1]), bytes: Number(m[2]) });
        else if (line) stderr += line + '\n';
      }
    });
    child.stdout.on('data', () => {});
    child.on('error', reject);
    child.on('close', async (code) => {
      try {
        if (code !== 0) throw new Error(stderr.trim() || `scanner saiu com código ${code}`);
        resolve(JSON.parse(await fsp.readFile(out, 'utf8')));
      } catch (err) {
        reject(err);
      } finally {
        fsp.rm(out, { force: true }).catch(() => {});
      }
    });
  });
}

/** Scanner em Node (macOS e fallback): não sai do volume da raiz, como du -x. */
async function scanNode(root, minBytes, onProgress) {
  let rootDev = null;
  try {
    rootDev = (await fsp.lstat(root)).dev;
  } catch {
    // raiz inacessível: devolve árvore vazia com erro
  }
  let dirs = 0;
  let total = 0;
  let last = Date.now();

  async function scanDir(dir, name) {
    const node = { n: name, s: 0, f: 0, o: 0, e: 0, k: [] };
    dirs += 1;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      node.e += 1;
      return node;
    }
    for (const ent of entries) {
      if (ent.isSymbolicLink()) continue;
      const full = path.join(dir, ent.name);
      try {
        if (ent.isDirectory()) {
          if (rootDev != null && (await fsp.lstat(full)).dev !== rootDev) continue;
          const c = await scanDir(full, ent.name);
          node.s += c.s;
          node.f += c.f;
          node.e += c.e || 0;
          node.k.push(c);
        } else if (ent.isFile()) {
          const size = (await fsp.lstat(full)).size;
          node.s += size;
          node.f += 1;
          total += size;
          if (size >= minBytes) node.k.push({ n: ent.name, s: size, t: 1 });
          else node.o += size;
        }
      } catch {
        node.e += 1;
      }
    }
    node.k.sort((a, b) => b.s - a.s);
    const keep = [];
    for (const c of node.k) {
      if (keep.length < MAX_KIDS && c.s >= minBytes) keep.push(c);
      else node.o += c.s;
    }
    node.k = keep;
    if (!node.k.length) delete node.k;
    if (!node.o) delete node.o;
    if (!node.e) delete node.e;
    if (Date.now() - last >= 500) {
      last = Date.now();
      onProgress?.({ dirs, bytes: total });
    }
    return node;
  }

  const tree = await scanDir(root, root);
  onProgress?.({ dirs, bytes: total });
  return tree;
}

/** Limite padrão: raiz de disco agrupa itens < 32 MB; pastas comuns, < 1 MB. */
export function defaultMinBytes(root) {
  const isDriveRoot = /^[A-Za-z]:\\?$/.test(root) || root === '/';
  return isDriveRoot ? 32 * 1024 ** 2 : 1024 ** 2;
}

/**
 * @param {string} root pasta ou raiz de disco
 * @param {{ minBytes?: number, onProgress?: (p: {dirs: number, bytes: number}) => void, onLog?: (s: string) => void }} opts
 */
export async function scanDisk(root, { minBytes, onProgress, onLog } = {}) {
  if (/^[A-Za-z]:$/.test(root)) root = `${root}\\`;
  if (!path.isAbsolute(root)) throw new Error(`Caminho precisa ser absoluto: ${root}`);
  const target = path.resolve(root);
  if (!fs.existsSync(target)) throw new Error(`Pasta não encontrada: ${target}`);
  const min = Math.max(64 * 1024, Number(minBytes) || defaultMinBytes(target));
  const started = Date.now();
  let tree;
  let engine = 'node';
  if (process.platform === 'win32') {
    try {
      tree = await scanNativeWin(target, min, onProgress);
      engine = 'native';
    } catch (err) {
      onLog?.(`Scanner nativo falhou (${err.message.split('\n')[0]}); usando o scanner em Node, mais lento...`);
    }
  }
  if (!tree) tree = await scanNode(target, min, onProgress);
  return { root: target, tree, minBytes: min, engine, elapsedMs: Date.now() - started };
}
