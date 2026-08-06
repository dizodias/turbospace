import { spawn } from 'node:child_process';

export async function isAdmin() {
  return new Promise((resolve) => {
    const child = spawn('net session', { windowsHide: true, shell: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}
