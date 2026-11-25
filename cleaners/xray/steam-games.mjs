import fsp from 'node:fs/promises';
import path from 'node:path';
import { listLogicalDrives, openBrowser } from '../measure.mjs';
import { steamLibraries } from '../platform/steam.win.mjs';

/** Pacotes do próprio Steam que não são jogos (não faz sentido desinstalar daqui). */
const NOT_GAMES = new Set(['228980']); // Steamworks Common Redistributables

/** Lê as chaves de primeiro nível de um appmanifest_*.acf. */
function parseManifest(text) {
  const out = {};
  for (const m of text.matchAll(/^\t"([^"]+)"\t+"((?:[^"\\]|\\.)*)"\s*$/gm)) {
    out[m[1]] = m[2].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
  }
  return out;
}

function driveOf(p) {
  if (process.platform === 'win32') {
    const m = /^([A-Za-z]):/.exec(p);
    return m ? `${m[1].toUpperCase()}:` : null;
  }
  return '/';
}

/**
 * Jogos instalados em todas as bibliotecas do Steam, com tamanho e último uso,
 * e os discos que teriam espaço para recebê-los.
 */
export async function listSteamGames() {
  const libraries = await steamLibraries();
  const games = [];
  for (const lib of libraries) {
    const apps = path.join(lib, 'steamapps');
    let names = [];
    try {
      names = (await fsp.readdir(apps)).filter((n) => /^appmanifest_\d+\.acf$/i.test(n));
    } catch {
      continue;
    }
    for (const n of names) {
      try {
        const m = parseManifest(await fsp.readFile(path.join(apps, n), 'utf8'));
        if (!m.appid || NOT_GAMES.has(m.appid)) continue;
        games.push({
          appid: m.appid,
          name: m.name || `App ${m.appid}`,
          sizeOnDisk: Number(m.SizeOnDisk) || 0,
          lastPlayed: Number(m.LastPlayed) ? Number(m.LastPlayed) * 1000 : null,
          library: lib,
          drive: driveOf(lib),
          installDir: m.installdir ? path.join(apps, 'common', m.installdir) : null,
        });
      } catch {
        // manifesto ilegível: pula o jogo
      }
    }
  }
  games.sort((a, b) => b.sizeOnDisk - a.sizeOnDisk);

  const libraryDrives = new Set(libraries.map(driveOf).filter(Boolean));
  let drives = [];
  try {
    drives = (await listLogicalDrives()).map((d) => ({
      id: d.id,
      label: d.label || d.id,
      freeBytes: d.freeBytes || 0,
      hasLibrary: libraryDrives.has(driveOf(d.mountPoint || d.id)),
    }));
  } catch {
    // sem lista de discos: a UI só não sugere destino
  }
  return { installed: libraries.length > 0, libraries, games, drives };
}

function validAppId(appid) {
  return /^\d{1,10}$/.test(String(appid || ''));
}

/** Abre a desinstalação no próprio Steam, que pede confirmação. */
export function openSteamUninstall(appid) {
  if (!validAppId(appid)) return false;
  openBrowser(`steam://uninstall/${appid}`);
  return true;
}

/** Abre as Configurações do Steam (o Armazenamento fica ali) para mover o jogo. */
export function openSteamStorage() {
  openBrowser('steam://settings/downloads');
  return true;
}
