import { spawn } from 'node:child_process';

export function commandExists(cmd) {
  return new Promise((resolve) => {
    const child = spawn('which', [cmd], { windowsHide: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

export function openBrowser(url) {
  spawn('open', [url], { detached: true }).unref();
}
