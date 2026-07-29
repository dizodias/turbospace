import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import {
  commandExists,
  formatBytes,
  getDriveFreeBytes,
  isAdmin,
  listLogicalDrives,
  normalizeDrive,
  userPaths,
} from './cleaners/measure.mjs';
import {
  cleanPrefetch,
  cleanUserTemp,
  cleanWinTemp,
  measureTempTargets,
} from './cleaners/temp.mjs';
import { cleanDocker } from './cleaners/docker.mjs';
import {
  cleanAndroid,
  cleanGradle,
  measureGradleAndroid,
} from './cleaners/gradle-android.mjs';
import { cleanNpm, cleanPip, measureNpmPip } from './cleaners/npm-pip.mjs';
import {
  cleanDesktopJunk,
  deleteDesktopPaths,
  listLargeDesktopFiles,
  measureDesktopJunk,
} from './cleaners/desktop.mjs';
import { getSystemInfo } from './cleaners/system.mjs';
import {
  cleanBrowserCache,
  cleanCrashDumps,
  cleanDeliveryOpt,
  cleanRecycleBin,
  cleanShaderCache,
  cleanThumbnails,
  cleanUpdateCache,
  measureWindowsExtras,
} from './cleaners/windows-extra.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3860);

/** @type {Awaited<ReturnType<typeof getSystemInfo>> | null} */
let cachedSystemInfo = null;
let systemInfoPromise = null;

async function loadSystemInfo() {
  if (cachedSystemInfo) return cachedSystemInfo;
  if (!systemInfoPromise) {
    systemInfoPromise = getSystemInfo()
      .then((info) => {
        cachedSystemInfo = info;
        return info;
      })
      .finally(() => {
        systemInfoPromise = null;
      });
  }
  return systemInfoPromise;
}

// Pré-aquece em paralelo com o boot do servidor
loadSystemInfo().catch(() => {});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** @type {Set<import('node:http').ServerResponse>} */
const sseClients = new Set();

const state = {
  status: 'idle', // idle | analyzing | cleaning | ok | error
  lastMessage: 'Aguardando',
  busy: false,
  drive: 'C:',
};

/** @type {string[]} */
let sessionLogs = [];

function sendSse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const client of sseClients) {
    try {
      sendSse(client, event, data);
    } catch {
      sseClients.delete(client);
    }
  }
}

function setStatus(status, lastMessage) {
  state.status = status;
  state.lastMessage = lastMessage;
  broadcast('status', { ...state });
}

function logLine(line, stream = 'stdout') {
  const text = String(line);
  sessionLogs.push(text);
  if (sessionLogs.length > 2000) sessionLogs = sessionLogs.slice(-1500);
  broadcast('log', { line: text, stream, ts: Date.now() });
  console.log(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function openBrowser(url) {
  if (process.env.LIMPEZA_NO_BROWSER === '1') return;
  spawn('cmd', ['/c', 'start', '', url], { windowsHide: true, detached: true }).unref();
}

/** True when another TurboSpace instance already answers on this port. */
function probeExistingInstance(baseUrl) {
  return new Promise((resolve) => {
    const req = http.get(`${baseUrl}/api/status`, { timeout: 2000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(Boolean(json?.ok && typeof json.port === 'number'));
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

const TARGET_IDS = [
  'userTemp',
  'winTemp',
  'prefetch',
  'recycleBin',
  'thumbnails',
  'updateCache',
  'deliveryOpt',
  'crashDumps',
  'browserCache',
  'shaderCache',
  'docker',
  'gradle',
  'android',
  'npm',
  'pip',
  'desktopJunk',
];

async function analyzeTargets(targets) {
  const selected = new Set(targets?.length ? targets : TARGET_IDS);
  const sizes = {};
  const p = userPaths();

  if (selected.has('userTemp') || selected.has('winTemp') || selected.has('prefetch')) {
    logLine('Medindo arquivos temporários...');
    const t = await measureTempTargets();
    if (selected.has('userTemp')) sizes.userTemp = t.userTemp;
    if (selected.has('winTemp')) sizes.winTemp = t.winTemp;
    if (selected.has('prefetch')) sizes.prefetch = t.prefetch;
  }

  const extraIds = [
    'recycleBin',
    'thumbnails',
    'updateCache',
    'deliveryOpt',
    'crashDumps',
    'browserCache',
    'shaderCache',
  ];
  if (extraIds.some((id) => selected.has(id))) {
    logLine('Medindo lixeira, caches e resíduos do sistema...');
    const extra = await measureWindowsExtras();
    for (const id of extraIds) {
      if (selected.has(id)) sizes[id] = extra[id];
    }
  }

  if (selected.has('docker')) {
    logLine('Verificando limpeza de containers...');
    const has = await commandExists('docker');
    sizes.docker = has ? null : 0;
    if (!has) logLine('Ambiente de containers não encontrado');
  }

  if (selected.has('gradle') || selected.has('android')) {
    logLine('Medindo caches de desenvolvimento Java/Android...');
    const g = await measureGradleAndroid();
    if (selected.has('gradle')) sizes.gradle = g.gradle;
    if (selected.has('android')) sizes.android = g.android;
  }

  if (selected.has('npm') || selected.has('pip')) {
    logLine('Medindo caches de pacotes...');
    const n = await measureNpmPip();
    if (selected.has('npm')) sizes.npm = n.npm;
    if (selected.has('pip')) sizes.pip = n.pip;
  }

  if (selected.has('desktopJunk')) {
    logLine(`Medindo resíduos na Área de Trabalho...`);
    sizes.desktopJunk = await measureDesktopJunk();
  }

  const labeled = {};
  for (const [k, v] of Object.entries(sizes)) {
    labeled[k] = {
      bytes: v,
      label: v == null ? 'tamanho na limpeza' : formatBytes(v),
    };
  }
  return labeled;
}

async function runClean({ targets, desktopPaths }) {
  const selected = targets || [];
  const results = [];
  const drive = state.drive || 'C:';
  const freeBefore = await getDriveFreeBytes(drive);
  logLine(`Espaço livre ${drive} antes: ${formatBytes(freeBefore)}`);

  const runners = {
    userTemp: () => cleanUserTemp(logLine),
    winTemp: () => cleanWinTemp(logLine),
    prefetch: () => cleanPrefetch(logLine),
    recycleBin: () => cleanRecycleBin(logLine),
    thumbnails: () => cleanThumbnails(logLine),
    updateCache: () => cleanUpdateCache(logLine),
    deliveryOpt: () => cleanDeliveryOpt(logLine),
    crashDumps: () => cleanCrashDumps(logLine),
    browserCache: () => cleanBrowserCache(logLine),
    shaderCache: () => cleanShaderCache(logLine),
    docker: () => cleanDocker(logLine),
    gradle: () => cleanGradle(logLine),
    android: () => cleanAndroid(logLine),
    npm: () => cleanNpm(logLine),
    pip: () => cleanPip(logLine),
    desktopJunk: () => cleanDesktopJunk(logLine),
  };

  for (const id of selected) {
    const fn = runners[id];
    if (!fn) {
      logLine(`Alvo desconhecido: ${id}`, 'stderr');
      continue;
    }
    logLine(`—`);
    logLine(`>>> Iniciando: ${id}`);
    try {
      const result = await fn();
      results.push(result);
      logLine(`<<< ${result.detail || id} (${result.ok ? 'OK' : 'falha'})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLine(`ERRO em ${id}: ${msg}`, 'stderr');
      results.push({ id, ok: false, freedBytesApprox: 0, detail: msg });
    }
  }

  if (desktopPaths?.length) {
    logLine('—');
    logLine('>>> Removendo arquivos grandes selecionados no Desktop');
    try {
      const result = await deleteDesktopPaths(desktopPaths, logLine);
      results.push(result);
      logLine(`<<< ${result.detail}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLine(`ERRO Desktop grandes: ${msg}`, 'stderr');
    }
  }

  const freeAfter = await getDriveFreeBytes(drive);
  const delta = Math.max(0, freeAfter - freeBefore);
  const sumApprox = results.reduce((a, r) => a + (r.freedBytesApprox || 0), 0);
  logLine('—');
  logLine(`Espaço livre ${drive} depois: ${formatBytes(freeAfter)}`);
  logLine(`Liberados (delta disco): ~${formatBytes(delta)}`);
  logLine(`Soma estimada pelos cleaners: ~${formatBytes(sumApprox)}`);

  return {
    results,
    freeBefore,
    freeAfter,
    freedDelta: delta,
    freedApprox: sumApprox,
    freeBeforeLabel: formatBytes(freeBefore),
    freeAfterLabel: formatBytes(freeAfter),
    freedDeltaLabel: formatBytes(delta),
    drive,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // CORS not needed — same origin
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    const drive = state.drive || 'C:';
    const [admin, freeBytes, docker, npm, pip, system] = await Promise.all([
      isAdmin(),
      getDriveFreeBytes(drive),
      commandExists('docker'),
      commandExists('npm'),
      commandExists('pip'),
      loadSystemInfo(),
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        ...state,
        drive,
        admin,
        freeBytes,
        freeLabel: formatBytes(freeBytes),
        tools: { docker, npm, pip },
        system,
        paths: userPaths(),
        port: PORT,
      })
    );
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/drives') {
    try {
      const drives = await listLogicalDrives();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, drives, drive: state.drive }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/drive') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'JSON inválido' }));
      return;
    }
    state.drive = normalizeDrive(body.drive || 'C:');
    const freeBytes = await getDriveFreeBytes(state.drive);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        drive: state.drive,
        freeBytes,
        freeLabel: formatBytes(freeBytes),
      })
    );
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/system') {
    try {
      const system = await loadSystemInfo();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, system }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write('\n');
    sseClients.add(res);
    sendSse(res, 'status', { ...state });
    for (const line of sessionLogs.slice(-200)) {
      sendSse(res, 'log', { line, stream: 'stdout', ts: Date.now() });
    }
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/desktop/large') {
    try {
      const files = await listLargeDesktopFiles();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, files }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/analyze') {
    if (state.busy) {
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Operação em andamento' }));
      return;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'JSON inválido' }));
      return;
    }

    state.busy = true;
    setStatus('analyzing', 'Analisando...');
    sessionLogs = [];
    logLine('Iniciando análise de espaço...');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, started: true }));

    try {
      if (body.drive) state.drive = normalizeDrive(body.drive);
      const sizes = await analyzeTargets(body.targets);
      const freeBytes = await getDriveFreeBytes(state.drive);
      logLine('Análise concluída.');
      setStatus('ok', 'Análise concluída');
      broadcast('analyze', {
        sizes,
        freeBytes,
        freeLabel: formatBytes(freeBytes),
        drive: state.drive,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLine(`ERRO na análise: ${msg}`, 'stderr');
      setStatus('error', 'Falha na análise');
    } finally {
      state.busy = false;
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/clean') {
    if (state.busy) {
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Operação em andamento' }));
      return;
    }
    let body;
    try {
      body = await readBody(req);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'JSON inválido' }));
      return;
    }

    const targets = Array.isArray(body.targets) ? body.targets : [];
    const desktopPaths = Array.isArray(body.desktopPaths) ? body.desktopPaths : [];
    if (!targets.length && !desktopPaths.length) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Nenhum alvo selecionado' }));
      return;
    }

    state.busy = true;
    setStatus('cleaning', 'Limpando...');
    sessionLogs = [];
    logLine('Iniciando limpeza...');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, started: true }));

    try {
      const summary = await runClean({ targets, desktopPaths });
      logLine('Limpeza concluída!');
      setStatus('ok', `Liberados ~${summary.freedDeltaLabel}`);
      broadcast('clean', summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLine(`ERRO na limpeza: ${msg}`, 'stderr');
      setStatus('error', 'Falha na limpeza');
    } finally {
      state.busy = false;
    }
    return;
  }

  // static
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await fsp.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

const url = `http://127.0.0.1:${PORT}`;

server.on('error', async (err) => {
  if (err?.code === 'EADDRINUSE') {
    const ours = await probeExistingInstance(url);
    if (ours) {
      console.log(`[TurboSpace] Já em execução em ${url}`);
      console.log('Abrindo o navegador na instância existente...');
      openBrowser(url);
      process.exit(0);
    }
    console.error(`[TurboSpace] Porta ${PORT} ocupada por outro processo (EADDRINUSE).`);
    console.error('Feche o processo na porta ou use outra: set PORT=3861 && node index.mjs');
    process.exit(1);
  }
  console.error('[TurboSpace] Falha ao iniciar o servidor:', err);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[TurboSpace] ${url}`);
  openBrowser(url);
});
