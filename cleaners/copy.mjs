/** Labels de sistema alinhados à terminologia de cada plataforma (pt-BR). */

export function isDarwin() {
  return process.platform === 'darwin';
}

/** Desktop → Mesa (macOS) / Área de Trabalho (Windows) */
export function desktopLabel() {
  return isDarwin() ? 'Mesa' : 'Área de Trabalho';
}

/** Trash → Lixo (macOS) / Lixeira (Windows) */
export function trashLabel() {
  return isDarwin() ? 'Lixo' : 'Lixeira';
}
