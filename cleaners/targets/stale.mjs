import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { dirSize, formatBytes, userPaths } from '../measure.mjs';

/**
 * Sugestões de exclusão: arquivos grandes sem uso há N dias e repositórios git
 * parados há N dias nas pastas escolhidas pelo usuário.
 *
 * A exclusão só aceita caminhos devolvidos pela última varredura (lastScan),
 * então a API nunca apaga um caminho arbitrário enviado pelo cliente.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DEPTH = 8;
const MAX_ENTRIES = 300000;
const MAX_FILES_RESULT = 300;
const MAX_REPOS_RESULT = 200;
const MAX_REPO_WALK_FILES = 100000;

/** Pastas que nunca são varridas (sistema, apps, lixeira). */
const SKIP_DIRS = new Set([
  'node_modules',
  '$recycle.bin',
  'system volume information',
  'appdata',
  'library',
  'applications',
  '.trash',
]);

/** Pastas regeneráveis dentro de repositórios (dependências e builds). */
const ARTIFACT_DIRS = new Set([
  'node_modules',
  'bower_components',
  '.pnpm-store',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.angular',
  '.turbo',
  '.parcel-cache',
  '.vite',
  '.cache',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  'target', // Rust / Maven
  '.gradle',
  '.dart_tool',
  'Pods',
  'DerivedData',
  '.expo',
]);

/** Pastas de build que só contam se houver um manifesto de projeto ao lado. */
const ARTIFACT_NEEDS_MANIFEST = new Set(['build', 'out', 'target', 'dist']);
const MANIFESTS = [
  'package.json',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'pyproject.toml',
  'setup.py',
  'pubspec.yaml',
  'CMakeLists.txt',
  'go.mod',
  'tsconfig.json',
];

/** @type {{ files: Map<string, object>, repos: Map<string, object> } | null} */
let lastScan = null;

function isHiddenName(name) {
  return name.startsWith('.');
}

/** "Último uso" conservador: o mais recente entre modificação, acesso e criação. */
function lastUsedMs(st) {
  return Math.max(st.mtimeMs || 0, st.atimeMs || 0, st.birthtimeMs || 0);
}

function isRepoDir(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

function hasManifest(dir) {
  return MANIFESTS.some((m) => fs.existsSync(path.join(dir, m)));
}

function git(cwd, args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      if (err) resolve({ ok: false, out: '' });
      else resolve({ ok: true, out: String(stdout) });
    });
  });
}

/** Avisos de risco antes de apagar o repo inteiro. */
async function repoGitStatus(repo) {
  const status = await git(repo, ['status', '--porcelain']);
  if (!status.ok) return { checked: false };
  const dirty = status.out.trim().length > 0;
  const remotes = await git(repo, ['remote']);
  const hasRemote = remotes.ok && remotes.out.trim().length > 0;
  let unpushed = 0;
  let noUpstream = false;
  if (hasRemote) {
    const ahead = await git(repo, ['rev-list', '--count', '@{u}..HEAD']);
    if (ahead.ok) unpushed = Number(ahead.out.trim()) || 0;
    else noUpstream = true;
  }
  return { checked: true, dirty, hasRemote, unpushed, noUpstream };
}

/**
 * Percorre o repo (sem .git e sem artefatos) para achar a modificação mais
 * recente e o tamanho do código; mede artefatos e .git à parte.
 */
async function inspectRepo(repo) {
  let newest = 0;
  let sourceBytes = 0;
  let walked = 0;
  const artifacts = [];
  const stack = [repo];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const dirHasManifest = entries.some((e) => e.isFile() && MANIFESTS.includes(e.name));
    for (const ent of entries) {
      if (ent.isSymbolicLink()) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === '.git') continue;
        if (ARTIFACT_DIRS.has(ent.name)) {
          const needsManifest = ARTIFACT_NEEDS_MANIFEST.has(ent.name);
          if (!needsManifest || dirHasManifest) {
            artifacts.push(full);
            continue;
          }
        }
        // Repos aninhados (submódulos/clones dentro do repo) contam como parte dele.
        stack.push(full);
      } else if (ent.isFile() && walked < MAX_REPO_WALK_FILES) {
        walked += 1;
        try {
          const st = await fsp.stat(full);
          sourceBytes += st.size;
          if (st.mtimeMs > newest) newest = st.mtimeMs;
        } catch {
          // ignore
        }
      }
    }
  }

  const artifactList = [];
  let artifactBytes = 0;
  for (const a of artifacts) {
    const size = await dirSize(a);
    if (size <= 0) continue;
    artifactBytes += size;
    artifactList.push({ path: a, size });
  }
  const gitBytes = await dirSize(path.join(repo, '.git'));
  return {
    newest,
    sourceBytes,
    gitBytes,
    artifactBytes,
    artifacts: artifactList,
    totalBytes: sourceBytes + gitBytes + artifactBytes,
  };
}

/** Remove raízes que estão dentro de outra raiz já listada. */
function normalizeRoots(roots) {
  const resolved = [
    ...new Set(
      roots
        .filter((r) => typeof r === 'string' && r.trim())
        .map((r) => path.resolve(r.trim()))
        .filter((r) => fs.existsSync(r))
    ),
  ].sort((a, b) => a.length - b.length);
  const out = [];
  for (const r of resolved) {
    if (!out.some((k) => r === k || r.startsWith(k + path.sep))) out.push(r);
  }
  return out;
}

/** Bloqueia varrer a raiz do disco ou a home inteira (devagar e arriscado). */
function isForbiddenRoot(root) {
  const { home } = userPaths();
  const parsed = path.parse(root);
  return root === parsed.root || path.resolve(root) === path.resolve(home);
}

export function defaultStaleRoots() {
  const p = userPaths();
  return [
    { id: 'downloads', path: p.downloads },
    { id: 'desktop', path: p.desktop },
    { id: 'documents', path: p.documents },
  ].filter((r) => r.path && fs.existsSync(r.path));
}

/**
 * @param {{ roots: string[], days?: number, minFileBytes?: number }} opts
 */
export async function scanStale({ roots, days = 180, minFileBytes = 50 * 1024 * 1024 }, onLog) {
  const cutoff = Date.now() - Math.max(1, Number(days) || 180) * DAY_MS;
  const minBytes = Math.max(0, Number(minFileBytes) || 0);
  const scanRoots = normalizeRoots(roots || []);
  const files = [];
  const repoDirs = [];
  let entriesSeen = 0;
  let truncated = false;

  for (const root of scanRoots) {
    if (isForbiddenRoot(root)) {
      onLog?.(`Pasta ignorada (raiz do disco ou pasta pessoal inteira): ${root}`);
      continue;
    }
    onLog?.(`Varrendo ${root}...`);
    if (isRepoDir(root)) {
      repoDirs.push(root);
      continue;
    }
    const stack = [{ dir: root, depth: 0 }];
    while (stack.length) {
      const { dir, depth } = stack.pop();
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        entriesSeen += 1;
        if (entriesSeen > MAX_ENTRIES) {
          truncated = true;
          break;
        }
        if (ent.isSymbolicLink()) continue; // inclui junctions do Windows
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (isHiddenName(ent.name) || SKIP_DIRS.has(ent.name.toLowerCase())) continue;
          if (isRepoDir(full)) {
            repoDirs.push(full);
            continue;
          }
          if (depth < MAX_DEPTH) stack.push({ dir: full, depth: depth + 1 });
        } else if (ent.isFile()) {
          if (isHiddenName(ent.name) || ent.name.toLowerCase() === 'desktop.ini') continue;
          try {
            const st = await fsp.stat(full);
            if (st.size < minBytes) continue;
            const used = lastUsedMs(st);
            if (used > cutoff) continue;
            files.push({
              path: full,
              name: path.relative(root, full) || ent.name,
              root,
              size: st.size,
              sizeLabel: formatBytes(st.size),
              lastUsed: used,
              idleDays: Math.floor((Date.now() - used) / DAY_MS),
            });
          } catch {
            // ignore
          }
        }
      }
      if (truncated) break;
    }
    if (truncated) {
      onLog?.(`Limite de ${MAX_ENTRIES} itens atingido — resultados parciais`);
      break;
    }
  }

  onLog?.(`${repoDirs.length} repositório(s) encontrado(s), verificando atividade...`);
  const repos = [];
  for (const repo of repoDirs) {
    const info = await inspectRepo(repo);
    if (!info.newest || info.newest > cutoff) continue;
    const gitInfo = await repoGitStatus(repo);
    const root = scanRoots.find((r) => repo === r || repo.startsWith(r + path.sep)) || repo;
    repos.push({
      path: repo,
      name: path.relative(path.dirname(root), repo) || path.basename(repo),
      lastActivity: info.newest,
      idleDays: Math.floor((Date.now() - info.newest) / DAY_MS),
      totalBytes: info.totalBytes,
      totalLabel: formatBytes(info.totalBytes),
      artifactBytes: info.artifactBytes,
      artifactLabel: formatBytes(info.artifactBytes),
      artifacts: info.artifacts,
      git: gitInfo,
    });
  }

  files.sort((a, b) => b.size - a.size);
  repos.sort((a, b) => b.totalBytes - a.totalBytes);
  const filesOut = files.slice(0, MAX_FILES_RESULT);
  const reposOut = repos.slice(0, MAX_REPOS_RESULT);

  lastScan = {
    files: new Map(filesOut.map((f) => [path.resolve(f.path), f])),
    repos: new Map(reposOut.map((r) => [path.resolve(r.path), r])),
  };

  onLog?.(
    `Itens antigos: ${filesOut.length} arquivo(s) e ${reposOut.length} repositório(s) sem uso há ${days}+ dias`
  );

  return {
    files: filesOut,
    // O cliente não precisa da lista de artefatos, só do total.
    repos: reposOut.map(({ artifacts, ...r }) => ({
      ...r,
      artifactNames: [...new Set(artifacts.map((a) => path.basename(a.path)))],
    })),
    roots: scanRoots,
    truncated,
    days,
    minFileBytes: minBytes,
  };
}

/**
 * @param {{ files?: string[], repos?: { path: string, mode: 'artifacts'|'full' }[] }} sel
 */
export async function deleteStale(sel, onLog) {
  let freed = 0;
  let removed = 0;
  if (!lastScan) {
    onLog('Nenhuma varredura de itens antigos — refaça a busca antes de excluir');
    return { id: 'stale', ok: false, freedBytesApprox: 0, detail: 'sem varredura' };
  }

  for (const raw of sel.files || []) {
    const full = path.resolve(String(raw));
    const known = lastScan.files.get(full);
    if (!known) {
      onLog(`Recusado (não veio da varredura): ${full}`);
      continue;
    }
    try {
      const st = await fsp.stat(full);
      if (lastUsedMs(st) > known.lastUsed + 1000) {
        onLog(`Pulado (usado após a varredura): ${full}`);
        continue;
      }
      await fsp.unlink(full);
      freed += st.size;
      removed += 1;
      lastScan.files.delete(full);
      onLog(`Excluído: ${full} (${formatBytes(st.size)})`);
    } catch (err) {
      onLog(`Falha ao excluir ${full}: ${err.message}`);
    }
  }

  for (const item of sel.repos || []) {
    const full = path.resolve(String(item?.path || ''));
    const known = lastScan.repos.get(full);
    if (!known) {
      onLog(`Recusado (não veio da varredura): ${full}`);
      continue;
    }
    if (item.mode === 'full') {
      try {
        const size = await dirSize(full);
        await fsp.rm(full, { recursive: true, force: true, maxRetries: 2 });
        freed += size;
        removed += 1;
        lastScan.repos.delete(full);
        onLog(`Repositório excluído: ${full} (~${formatBytes(size)})`);
      } catch (err) {
        onLog(`Falha ao excluir repositório ${full}: ${err.message}`);
      }
    } else {
      let repoFreed = 0;
      for (const a of known.artifacts) {
        try {
          const size = await dirSize(a.path);
          await fsp.rm(a.path, { recursive: true, force: true, maxRetries: 2 });
          repoFreed += size;
        } catch (err) {
          onLog(`Falha em ${a.path}: ${err.message}`);
        }
      }
      freed += repoFreed;
      removed += 1;
      lastScan.repos.delete(full);
      onLog(`Dependências/builds removidos de ${full} (~${formatBytes(repoFreed)})`);
    }
  }

  onLog(`Itens antigos: ${removed} item(ns), ~${formatBytes(freed)}`);
  return {
    id: 'stale',
    ok: true,
    freedBytesApprox: freed,
    detail: `${removed} item(ns) antigos ~${formatBytes(freed)}`,
  };
}
