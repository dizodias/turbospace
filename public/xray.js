/*
 * Aba Raio-X: mapa do disco com drill-down.
 * Carregado depois do script principal do index.html e reaproveita os helpers
 * globais dele (t, I18n, formatBytesClient, escapeHtml, selectedVolume,
 * volumeDisplay, platform). Tudo aqui é só leitura: nada é apagado.
 */
(() => {
  const ICONS = {
    dir: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    file: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    other: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>',
    reveal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  };

  const X = {
    tab: 'clean',
    tree: null,
    /** caminho de nós da raiz até a pasta aberta */
    stack: [],
    scanning: false,
    scannedOnce: false,
    lastResult: null,
    progress: null,
    error: '',
  };
  window.TurboXray = X;

  const $ = (id) => document.getElementById(id);
  const sep = () => (platform === 'darwin' ? '/' : '\\');

  function joinPath(base, name) {
    return /[\\/]$/.test(base) ? base + name : base + sep() + name;
  }

  function stackPath(depth = X.stack.length - 1) {
    let p = X.stack[0].n;
    for (let i = 1; i <= depth; i++) p = joinPath(p, X.stack[i].n);
    return p;
  }

  async function post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return r.json();
  }

  function reveal(p) {
    post('/api/xray/reveal', { path: p }).catch(() => {});
  }

  /* ---------- abas ---------- */

  function setTab(tab) {
    X.tab = tab === 'xray' ? 'xray' : 'clean';
    $('cleanView').classList.toggle('is-hidden', X.tab !== 'clean');
    $('xrayView').classList.toggle('is-hidden', X.tab !== 'xray');
    for (const b of document.querySelectorAll('#mainTabs .tab')) {
      const on = b.dataset.tab === X.tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    }
    if (X.tab === 'xray' && !X.scannedOnce && !X.scanning) scan();
    window.dispatchEvent(new CustomEvent('turbospace-tab', { detail: X.tab }));
  }

  /* ---------- varredura ---------- */

  async function scan({ path, minBytes, graftDepth } = {}) {
    if (X.scanning) return;
    X.scanning = true;
    X.scannedOnce = true;
    X.error = '';
    X.progress = null;
    renderAside();
    renderMap();
    try {
      const body = {};
      if (path) body.path = path;
      else if (platform === 'win32') body.path = selectedVolume;
      if (minBytes) body.minBytes = minBytes;
      const res = await post('/api/xray/scan', body);
      if (!res.ok) throw new Error(res.error || 'erro');
      if (graftDepth != null && X.stack.length > graftDepth) {
        // pasta detalhada: troca só aquele nó, mantendo nome e o caminho aberto
        const node = X.stack[graftDepth];
        const name = node.n;
        for (const k of Object.keys(node)) delete node[k];
        Object.assign(node, res.tree, { n: name });
        X.stack = X.stack.slice(0, graftDepth + 1);
      } else {
        X.tree = res.tree;
        X.stack = [res.tree];
        X.lastResult = res;
      }
    } catch (err) {
      X.error = err.message || String(err);
    } finally {
      X.scanning = false;
      X.progress = null;
      renderAside();
      renderMap();
    }
  }

  function listenProgress() {
    try {
      const es = new EventSource('/api/events');
      es.addEventListener('xray-progress', (ev) => {
        try {
          X.progress = JSON.parse(ev.data);
          if (X.scanning) renderAside();
        } catch {
          // ignora evento malformado
        }
      });
    } catch {
      // sem SSE: só não mostra o progresso
    }
  }

  /* ---------- render ---------- */

  function renderAside() {
    const btn = $('btnXrayScan');
    btn.disabled = X.scanning;
    btn.textContent = X.tree ? t('xrayRescanBtn') : t('xrayScanBtn', { drive: volumeDisplay() });
    const status = $('xrayStatus');
    const total = $('xrayTotal');
    if (X.scanning) {
      const p = X.progress;
      status.textContent = t('xrayScanning', {
        dirs: p ? Number(p.dirs).toLocaleString(I18n.getLocale()) : '0',
        size: formatBytesClient(p ? p.bytes : 0),
      });
      status.style.color = 'var(--accent)';
      return;
    }
    status.style.color = '';
    if (X.error) {
      status.textContent = t('xrayError', { msg: X.error });
      status.style.color = 'var(--danger)';
    }
    const r = X.lastResult;
    if (!r) {
      total.textContent = '—';
      if (!X.error) status.textContent = t('xrayIdle');
      return;
    }
    total.textContent = formatBytesClient(r.tree.s);
    if (!X.error) {
      let line = t('xrayDone', {
        files: Number(r.tree.f || 0).toLocaleString(I18n.getLocale()),
        secs: (r.elapsedMs / 1000).toFixed(1),
      });
      if (r.tree.e) line += ` · ${t('xrayDenied', { n: r.tree.e })}`;
      status.textContent = line;
    }
  }

  function renderCrumbs() {
    const nav = $('xrayCrumbs');
    nav.innerHTML = '';
    X.stack.forEach((node, i) => {
      if (i > 0) {
        const s = document.createElement('span');
        s.className = 'sep';
        s.textContent = '›';
        nav.appendChild(s);
      }
      if (i === X.stack.length - 1) {
        const cur = document.createElement('span');
        cur.className = 'cur';
        cur.textContent = node.n;
        nav.appendChild(cur);
      } else {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = node.n;
        b.title = stackPath(i);
        b.addEventListener('click', () => {
          X.stack = X.stack.slice(0, i + 1);
          renderMap();
        });
        nav.appendChild(b);
      }
    });
  }

  function renderTools(node) {
    const tools = $('xrayTools');
    tools.innerHTML = '';
    if (!node) return;
    const add = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-link';
      b.textContent = label;
      b.disabled = X.scanning;
      b.addEventListener('click', fn);
      tools.appendChild(b);
    };
    add(t('xrayReveal'), () => reveal(stackPath()));
    // muito espaço em itens pequenos: dá para varrer só esta pasta com mais detalhe
    if (X.stack.length > 1 && node.o && node.o / Math.max(1, node.s) > 0.05) {
      const depth = X.stack.length - 1;
      add(t('xrayDeeper'), () =>
        scan({
          path: stackPath(),
          minBytes: Math.max(256 * 1024, Math.round(node.s / 2000)),
          graftDepth: depth,
        })
      );
    }
  }

  function row({ kind, name, size, parentSize, onOpen, onReveal }) {
    const el = document.createElement('div');
    el.className = `xray-row ${kind}`;
    el.setAttribute('role', 'listitem');
    const pct = parentSize > 0 ? (size / parentSize) * 100 : 0;
    el.innerHTML = `
      ${ICONS[kind === 'dir' ? 'dir' : kind === 'file' ? 'file' : 'other']}
      <span class="xray-name">
        <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
        <span class="xray-bar"><i style="width:${Math.max(0.5, Math.min(100, pct)).toFixed(2)}%"></i></span>
      </span>
      <span class="xray-size">${formatBytesClient(size)}</span>
      <span class="xray-pct">${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%</span>
      <span></span>
    `;
    if (onReveal) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'xray-act';
      b.title = t('xrayReveal');
      b.setAttribute('aria-label', `${t('xrayReveal')}: ${name}`);
      b.innerHTML = ICONS.reveal;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onReveal();
      });
      el.lastElementChild.replaceWith(b);
    }
    if (onOpen) {
      el.tabIndex = 0;
      el.addEventListener('click', onOpen);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      });
    }
    return el;
  }

  function renderMap() {
    const list = $('xrayList');
    list.innerHTML = '';
    if (!X.stack.length) {
      $('xrayCrumbs').innerHTML = '';
      renderTools(null);
      const p = document.createElement('p');
      p.className = 'xray-empty';
      p.textContent = X.scanning ? t('xrayScanning', { dirs: '…', size: '' }).replace(/,\s*$/, '') : t('xrayIdle');
      list.appendChild(p);
      return;
    }
    renderCrumbs();
    const node = X.stack[X.stack.length - 1];
    renderTools(node);
    const base = stackPath();
    for (const kid of node.k || []) {
      const full = joinPath(base, kid.n);
      list.appendChild(
        row({
          kind: kid.t ? 'file' : 'dir',
          name: kid.n,
          size: kid.s,
          parentSize: node.s,
          onOpen: kid.t
            ? null
            : () => {
                X.stack.push(kid);
                renderMap();
                $('xrayList').closest('.panel-body-scroll')?.scrollTo({ top: 0 });
              },
          onReveal: () => reveal(full),
        })
      );
    }
    if (node.o) {
      list.appendChild(row({ kind: 'other', name: t('xrayOther'), size: node.o, parentSize: node.s }));
    }
    if (!(node.k || []).length) {
      const p = document.createElement('p');
      p.className = 'xray-empty';
      p.textContent = t('xrayEmptyDir');
      list.prepend(p);
    }
  }

  function applyXrayI18n() {
    $('tabClean').textContent = t('tabClean');
    $('tabXray').textContent = t('tabXray');
    $('xrayMapTitle').textContent = t('xrayMapTitle');
    $('xrayMapHint').textContent = t('xrayMapHint');
    $('xrayLblTotal').textContent = t('xrayLblTotal');
    renderAside();
    renderMap();
    window.dispatchEvent(new Event('turbospace-xray-i18n'));
  }
  window.applyXrayI18n = applyXrayI18n;

  /* ---------- init ---------- */

  for (const b of document.querySelectorAll('#mainTabs .tab')) {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  }
  $('btnXrayScan').addEventListener('click', () => scan());
  listenProgress();
  applyXrayI18n();
})();
