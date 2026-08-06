import { userPaths as winPaths } from './paths.win.mjs';
import { userPaths as darwinPaths } from './paths.darwin.mjs';
import * as drivesWin from './drives.win.mjs';
import * as drivesDarwin from './drives.darwin.mjs';
import { isAdmin as isAdminWin } from './privilege.win.mjs';
import { isAdmin as isAdminDarwin } from './privilege.darwin.mjs';
import * as commandsWin from './commands.win.mjs';
import * as commandsDarwin from './commands.darwin.mjs';
import { getSystemInfo as getSystemInfoWin } from './system.win.mjs';
import { getSystemInfo as getSystemInfoDarwin } from './system.darwin.mjs';

const isDarwin = process.platform === 'darwin';
const isWin = process.platform === 'win32';

const drives = isDarwin ? drivesDarwin : drivesWin;
const commands = isDarwin ? commandsDarwin : isWin ? commandsWin : commandsDarwin;

export function userPaths() {
  if (isDarwin) return darwinPaths();
  return winPaths();
}

export const normalizeVolume = drives.normalizeVolume;
export const normalizeDrive = drives.normalizeDrive;
export const getDriveFreeBytes = drives.getDriveFreeBytes;
export const listLogicalDrives = drives.listLogicalDrives;
export const defaultVolumeId = drives.defaultVolumeId;

export async function isAdmin() {
  if (isDarwin) return isAdminDarwin();
  if (isWin) return isAdminWin();
  return false;
}

export const commandExists = commands.commandExists;
export const openBrowser = commands.openBrowser;

export async function getSystemInfo() {
  if (isDarwin) return getSystemInfoDarwin();
  if (isWin) return getSystemInfoWin();
  // Fallback for other platforms
  const { fallbackInfo } = await import('./system.darwin.mjs');
  return fallbackInfo();
}

export function platformId() {
  return process.platform;
}
