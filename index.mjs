import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  commandExists,
  defaultVolumeId,
  formatBytes,
  getDriveFreeBytes,
  getSystemInfo,
  isAdmin,
  listLogicalDrives,
  normalizeVolume,
  openBrowser as platformOpenBrowser,
  platformId,
  userPaths,
} from './cleaners/measure.mjs';
import { desktopLabel } from './cleaners/copy.mjs';
import {
  analyzeSelected,
  cleanSelected,
  groupsFor,
  targetIdsFor,
  targetsFor,
} from './cleaners/targets/registry.mjs';
import {
  deleteDesktopPaths,
  listLargeDesktopFiles,
} from './cleaners/targets/desktop.mjs';

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
  volume: defaultVolumeId(),
  /** @deprecated use volume */
  get drive() {
    return this.volume;
  },
  set drive(v) {
    this.volume = v;
  },
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
  broadcast('status', { ...state, drive: state.volume, volume: state.volume });
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
  platformOpenBrowser(url);
}

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

function resolveVolumeId(raw) {
  return normalizeVolume(raw || state.volume || defaultVolumeId());
}

async function analyzeTargets(targets) {
  const sizes = await analyzeSelected(targets, logLine);
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
  const volume = state.volume || defaultVolumeId();
  const freeBefore = await getDriveFreeBytes(volume);
  logLine(`Espaço livre ${volume} antes: ${formatBytes(freeBefore)}`);

  const results = await cleanSelected(selected, logLine);

  if (desktopPaths?.length) {
    const desk = desktopLabel();
    logLine('—');
    logLine(`>>> Removendo arquivos grandes selecionados na ${desk}`);
    try {
      const result = await deleteDesktopPaths(desktopPaths, logLine);
      results.push(result);
      logLine(`<<< ${result.detail}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logLine(`ERRO arquivos grandes (${desk}): ${msg}`, 'stderr');
    }
  }

  const freeAfter = await getDriveFreeBytes(volume);
  const delta = Math.max(0, freeAfter - freeBefore);
  const sumApprox = results.reduce((a, r) => a + (r.freedBytesApprox || 0), 0);
  logLine('—');
  logLine(`Espaço livre ${volume} depois: ${formatBytes(freeAfter)}`);
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
    drive: volume,
    volume,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    const volume = state.volume || defaultVolumeId();
    const [admin, freeBytes, docker, npm, pip, system] = await Promise.all([
      isAdmin(),
      getDriveFreeBytes(volume),
      commandExists('docker'),
      commandExists('npm'),
      commandExists('pip'),
      loadSystemInfo(),
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        status: state.status,
        lastMessage: state.lastMessage,
        busy: state.busy,
        drive: volume,
        volume,
        platform: platformId(),
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

  if (req.method === 'GET' && url.pathname === '/api/targets') {
    const platform = platformId();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        platform,
        targetIds: targetIdsFor(platform),
        groups: groupsFor(platform),
        targets: targetsFor(platform).map((t) => ({
          id: t.id,
          group: t.group,
          platforms: t.platforms,
        })),
      })
    );
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/drives') {
    try {
      const drives = await listLogicalDrives();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          drives,
          drive: state.volume,
          volume: state.volume,
        })
      );
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
    state.volume = resolveVolumeId(body.volume || body.drive);
    const freeBytes = await getDriveFreeBytes(state.volume);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        drive: state.volume,
        volume: state.volume,
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
    sendSse(res, 'status', { ...state, drive: state.volume, volume: state.volume });
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
      if (body.volume || body.drive) {
        state.volume = resolveVolumeId(body.volume || body.drive);
      }
      const sizes = await analyzeTargets(body.targets);
      const freeBytes = await getDriveFreeBytes(state.volume);
      logLine('Análise concluída.');
      setStatus('ok', 'Análise concluída');
      broadcast('analyze', {
        sizes,
        freeBytes,
        freeLabel: formatBytes(freeBytes),
        drive: state.volume,
        volume: state.volume,
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
  console.log(`[TurboSpace] ${url} (${platformId()})`);
  openBrowser(url);
});
