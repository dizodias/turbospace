import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { dirSize, emptyDirContents, formatBytes, userPaths } from '../measure.mjs';

/**
 * Caches regeneráveis de ferramentas de IA (editores, apps desktop, CLIs e
 * navegadores de agentes).
 *
 * Regra de segurança: só entram aqui subpastas de cache conhecidas, nunca a
 * pasta inteira do app. Histórico de chats, configurações, credenciais,
 * extensões e modelos baixados ficam de fora de propósito — por exemplo
 * Cursor/User/globalStorage/state.vscdb (chats do Cursor), ~/.claude/projects
 * (sessões do Claude Code) e %LOCALAPPDATA%/Claude-Data (dados do Claude, cujo
 * README pede para não apagar).
 */

/** Subpastas de cache do Chromium/Electron que o app recria sozinho. */
const CHROMIUM_CACHE_DIRS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GraphiteDawnCache',
  'GrShaderCache',
  'ShaderCache',
  path.join('Service Worker', 'CacheStorage'),
  path.join('Service Worker', 'ScriptCache'),
];

/** Extras de apps Electron baseados no VS Code (Cursor, Windsurf...). */
const ELECTRON_APP_EXTRA_DIRS = [
  'CachedData', // bytecode V8 compilado por versão do app
  'CachedExtensionVSIXs', // instaladores de extensões já instaladas
  'logs',
  path.join('Crashpad', 'reports'),
];

function existing(paths) {
  return paths.filter((p) => p && fs.existsSync(p));
}

async function subdirs(root) {
  try {
    const entries = await fsp.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name));
  } catch {
    return [];
  }
}

/** Caches de um app Electron: raiz + Partitions/* (webviews/navegador embutido). */
async function electronAppCaches(root) {
  if (!root || !fs.existsSync(root)) return [];
  const out = [
    ...CHROMIUM_CACHE_DIRS.map((d) => path.join(root, d)),
    ...ELECTRON_APP_EXTRA_DIRS.map((d) => path.join(root, d)),
  ];
  for (const part of await subdirs(path.join(root, 'Partitions'))) {
    out.push(...CHROMIUM_CACHE_DIRS.map((d) => path.join(part, d)));
  }
  return existing(out);
}

/** Caches de um perfil de navegador Chromium (raiz + Default/Profile N). */
async function chromiumProfileCaches(root) {
  if (!root || !fs.existsSync(root)) return [];
  const out = CHROMIUM_CACHE_DIRS.map((d) => path.join(root, d));
  for (const dir of await subdirs(root)) {
    const name = path.basename(dir);
    if (name === 'Default' || /^Profile \d+$/.test(name)) {
      out.push(...CHROMIUM_CACHE_DIRS.map((d) => path.join(dir, d)));
    }
  }
  return existing(out);
}

function appDataDir(name) {
  const { appData } = userPaths();
  return appData ? path.join(appData, name) : null;
}

function macCache(name) {
  const { caches } = userPaths();
  return process.platform === 'darwin' && caches ? path.join(caches, name) : null;
}

function winLocal(...parts) {
  const { local } = userPaths();
  return process.platform === 'win32' ? path.join(local, ...parts) : null;
}

async function cursorPaths() {
  const { home } = userPaths();
  return existing([
    ...(await electronAppCaches(appDataDir('Cursor'))),
    path.join(home, '.cursor', 'browser-logs'),
    winLocal('cursor-compile-cache'),
    winLocal('cursor-updater'),
    macCache('com.todesktop.230313mzl4w4u92'),
    macCache('com.todesktop.230313mzl4w4u92.ShipIt'),
  ]);
}

async function claudePaths() {
  const { home, logs } = userPaths();
  return existing([
    // Claude desktop
    ...(await electronAppCaches(appDataDir('Claude'))),
    winLocal('Claude', 'logs'),
    process.platform === 'darwin' && logs ? path.join(logs, 'Claude') : null,
    macCache('com.anthropic.claudefordesktop'),
    macCache('com.anthropic.claudefordesktop.ShipIt'),
    // Claude Code (CLI)
    path.join(home, '.claude', 'cache'),
    winLocal('claude-cli-nodejs', 'Cache'),
    macCache('claude-cli-nodejs'),
  ]);
}

const OTHER_EDITORS = [
  { dir: 'Code', macIds: ['com.microsoft.VSCode.ShipIt'] }, // VS Code + Copilot
  { dir: 'Code - Insiders', macIds: ['com.microsoft.VSCodeInsiders.ShipIt'] },
  { dir: 'Windsurf', macIds: ['com.exafunction.windsurf', 'com.exafunction.windsurf.ShipIt'] },
  { dir: 'Trae', macIds: [] },
  { dir: 'Kiro', macIds: [] },
  { dir: 'Antigravity', macIds: [] },
];

async function editorPaths() {
  const out = [];
  for (const ed of OTHER_EDITORS) {
    out.push(...(await electronAppCaches(appDataDir(ed.dir))));
    out.push(...ed.macIds.map(macCache));
  }
  return existing(out);
}

async function agentPaths() {
  const { home, local } = userPaths();
  const out = [
    // Navegador usado pelo Gemini/Antigravity para agentes
    ...(await chromiumProfileCaches(path.join(home, '.gemini', 'antigravity-browser-profile'))),
    path.join(home, '.codex', 'log'),
    macCache('com.openai.chat'),
    macCache('com.openai.codex'),
  ];
  // Perfis persistentes do Playwright MCP (navegador controlado por agentes)
  const mcpRoot =
    process.platform === 'darwin'
      ? macCache('ms-playwright-mcp')
      : path.join(local, 'ms-playwright-mcp');
  for (const profile of await subdirs(mcpRoot)) {
    out.push(...(await chromiumProfileCaches(profile)));
  }
  return existing(out);
}

/** Remove caminhos que estão dentro de outro já listado (evita contar 2x). */
function dedupeNested(paths) {
  const sorted = [...new Set(paths.map((p) => path.resolve(p)))].sort(
    (a, b) => a.length - b.length
  );
  const kept = [];
  for (const p of sorted) {
    if (!kept.some((k) => p.startsWith(k + path.sep))) kept.push(p);
  }
  return kept;
}

async function measurePaths(resolver) {
  let total = 0;
  for (const p of dedupeNested(await resolver())) total += await dirSize(p);
  return total;
}

function makeCleaner(id, label, resolver) {
  return async function clean(onLog) {
    onLog(`Limpando caches de IA: ${label}...`);
    const paths = dedupeNested(await resolver());
    if (!paths.length) {
      onLog(`${label}: nenhum cache encontrado`);
      return { id, ok: true, freedBytesApprox: 0, detail: `${label}: nada a limpar` };
    }
    let freed = 0;
    for (const p of paths) freed += await emptyDirContents(p, onLog);
    return {
      id,
      ok: true,
      freedBytesApprox: freed,
      detail: `${label} ~${formatBytes(freed)} (feche o app para liberar arquivos em uso)`,
    };
  };
}

export const measureAiCursor = () => measurePaths(cursorPaths);
export const measureAiClaude = () => measurePaths(claudePaths);
export const measureAiEditors = () => measurePaths(editorPaths);
export const measureAiAgents = () => measurePaths(agentPaths);

export const cleanAiCursor = makeCleaner('aiCursor', 'Cursor', cursorPaths);
export const cleanAiClaude = makeCleaner('aiClaude', 'Claude', claudePaths);
export const cleanAiEditors = makeCleaner('aiEditors', 'Editores com IA', editorPaths);
export const cleanAiAgents = makeCleaner('aiAgents', 'Agentes e CLIs de IA', agentPaths);
