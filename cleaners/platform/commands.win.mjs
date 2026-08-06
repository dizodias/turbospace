import { spawn } from 'node:child_process';

export function commandExists(cmd) {
  return new Promise((resolve) => {
    const child = spawn(`where ${cmd}`, { windowsHide: true, shell: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

export function openBrowser(url) {
  spawn('cmd', ['/c', 'start', '', url], { windowsHide: true, detached: true }).unref();
}
