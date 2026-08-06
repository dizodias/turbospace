# TurboSpace

> Limpador para **Windows** e **macOS** — temporários, caches, Docker, Gradle/Android, npm/pip e mais.

**Autoria:** [Dizodias Digital Engineering](https://dizodias.com)

[English](README.md)

---

## Recursos

### Compartilhados
- Limpeza de temp do usuário (`%TEMP%` / `$TMPDIR`)
- Docker prune (`docker system prune -af`, volumes preservados)
- Caches do Gradle e do Android SDK (AVDs não são removidos)
- Limpeza de cache do npm e do pip
- Resíduos na Área de Trabalho / Mesa (`.tmp`, `.log`, `.bak`, `.old`) e seleção de arquivos grandes
- Cache de navegadores
- Janela nativa Electron

### Windows
- `C:\Windows\Temp`, Prefetch, Lixeira, miniaturas, Delivery Optimization, cache do Windows Update, shaders DirectX, dumps
- `.exe` portátil com elevação para Administrador

### macOS
- Lixo (`~/.Trash`), caches selecionados em `~/Library/Caches`, DiagnosticReports (>7 dias), Xcode DerivedData
- Empacotamento DMG / ZIP (notarização Apple opcional)

## Requisitos

| Modo | Requisitos |
|------|------------|
| Desenvolvimento (Windows) | Windows 10/11 (x64), [Node.js](https://nodejs.org/) 18+, Administrador recomendado |
| Desenvolvimento (macOS) | macOS 12+, Node.js 18+ |
| Portátil Windows | Apenas Windows 10/11 (x64) |
| Build macOS | Host macOS para `npm run dist:mac` |

## Início rápido (desenvolvimento)

```bash
npm install
npm start
```

- **Windows:** duplo clique em `Iniciar.bat`.
- **macOS:** duplo clique em `Iniciar.command` (ou `chmod +x Iniciar.command` uma vez).

## Builds

```bash
npm run dist:win   # → dist/TurboSpace-Portatil.exe
npm run dist:mac   # → dist/*.dmg e *.zip (precisa de macOS)
```

### Abrir o DMG no Mac (sem conta Apple Developer)

Sem notarização, o Gatekeeper bloqueia o app na primeira vez. No DMG:

1. Arraste **TurboSpace** para **Aplicativos**.
2. Clique com o **botão direito** em **Abrir TurboSpace** → **Abrir**.
3. Confirme **Abrir** no aviso da Apple.

Notarização (opcional, remove esse aviso): defina `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e `APPLE_TEAM_ID` antes do `dist:mac`.

## Modo servidor (sem janela)

```bash
npm run server
```

Acesse `http://127.0.0.1:3860`. Porta alternativa: `PORT=3861`.

## Estrutura do projeto

```
TurboSpace/
├── build/                 # Ícones + entitlements macOS
├── cleaners/
│   ├── platform/          # paths/drives/privilege/system (win32 | darwin)
│   ├── targets/           # Catálogo de limpeza + registry
│   └── measure.mjs        # Helpers de FS compartilhados
├── electron/
├── public/
├── scripts/notarize.cjs
├── index.mjs
├── Iniciar.bat / Iniciar.command
└── package.json
```

## Alvos de limpeza

| Alvo | Windows | macOS |
|------|---------|-------|
| Temp do usuário | sim | sim |
| Windows Temp / Prefetch | sim | — |
| Lixeira / Lixo | Lixeira | Lixo |
| Cache de navegadores | sim | sim |
| Caches de apps | — | sim |
| Relatórios de falha / diagnóstico | sim | DiagnosticReports (>7d) |
| Xcode DerivedData | — | sim |
| Docker / Gradle / Android / npm / pip | sim | sim |
| Resíduos na Área de Trabalho / Mesa | sim | sim |

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm start` | App Electron |
| `npm run server` | Somente servidor HTTP |
| `npm run dist` / `dist:win` | Executável portátil Windows |
| `npm run dist:mac` | DMG + ZIP macOS |

## Licença

MIT — © 2026 Lucas Geisler Dias
