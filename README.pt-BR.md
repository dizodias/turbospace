# TurboSpace

> Limpador de desktop para Windows — TEMP, Prefetch, Docker, Gradle/Android, npm/pip, caches de navegador e mais.

**Autoria:** [Dizodias Digital Engineering](https://dizodias.com)

[English](README.md)

---

## Recursos

- Limpa `%TEMP%` do usuário, `C:\Windows\Temp` e Prefetch
- Docker prune (`docker system prune -af`, volumes preservados)
- Caches do Gradle e do Android SDK (AVDs não são removidos)
- Limpeza de cache do npm e do pip
- Lixo no Desktop (`.tmp`, `.log`, `.bak`, `.old`) e seleção de arquivos grandes
- Extras do Windows: Lixeira, miniaturas, cache de navegador, dumps, Delivery Optimization, shader cache, cache do Windows Update
- Janela nativa Electron (sem depender do navegador)
- `.exe` portátil com elevação para Administrador

## Requisitos

| Modo | Requisitos |
|------|------------|
| Desenvolvimento | Windows 10/11 (x64), [Node.js](https://nodejs.org/) 18+, privilégios de Administrador |
| Portátil | Apenas Windows 10/11 (x64) — não precisa instalar Node.js |

## Início rápido (desenvolvimento)

```bash
npm install
npm start
```

Ou dê duplo clique em `Iniciar.bat` (solicita Administrador e abre o Electron a partir do código-fonte).

Uma tela de carregamento curta aparece e, em seguida, a interface com Analisar / Limpar.

## Build portátil

```bash
npm run dist
```

Saída: `dist/TurboSpace-Portatil.exe`

1. Execute o arquivo e aceite o aviso do UAC.
2. Clique em **Analisar**, marque os alvos e use **Limpar selecionados**.
3. O `.exe` é autossuficiente — pode ir para pen drive ou outro PC.

## Modo servidor (sem janela)

```bash
npm run server
```

Acesse `http://127.0.0.1:3860`. Para trocar a porta:

```bash
set PORT=3861
```

## Estrutura do projeto

```
TurboSpace/
├── build/           # Ícones do app (icon.ico / icon.png)
├── cleaners/        # Rotinas de limpeza (TEMP, Docker, npm, etc.)
├── electron/        # Processo principal + preload do Electron
├── public/          # Interface (HTML, i18n, assets, Tailwind)
├── index.mjs        # API HTTP local (porta padrão 3860)
├── Iniciar.bat      # Launcher de desenvolvimento (elevado)
├── package.json
└── README.md
```

| Parte | Caminho |
|-------|---------|
| Janela do app | `electron/main.cjs` |
| Servidor HTTP local | `index.mjs` |
| Interface | `public/index.html` |
| Módulos de limpeza | `cleaners/*.mjs` |
| Ícones de empacotamento | `build/icon.ico` |

O `electron/main.cjs` sobe o servidor como processo filho, espera a porta responder e só então exibe a janela. Ao fechar a janela, o servidor é encerrado.

## Alvos de limpeza

| Alvo | Ação |
|------|------|
| TEMP do usuário | Esvazia `%TEMP%` |
| Windows Temp | Esvazia `C:\Windows\Temp` |
| Prefetch | Esvazia `C:\Windows\Prefetch` |
| Docker | `docker system prune -af` (sem volumes) |
| Gradle | Remove `%USERPROFILE%\.gradle\caches` |
| Android | Limpa caches do SDK (mantém AVDs) |
| npm / pip | Limpa caches das ferramentas |
| Desktop | Remove extensões de lixo + arquivos grandes opcionais |
| Extras do Windows | Lixeira, miniaturas, caches de navegador/shader/update, etc. |

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm start` | Executa o app Electron |
| `npm run server` | Somente o servidor HTTP |
| `npm run dist` | Gera o executável portátil para Windows |

## Licença

ISC — © Dizodias Digital Engineering
