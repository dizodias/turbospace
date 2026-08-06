window.TurboI18n = (function () {
  /** @type {'win32'|'darwin'} */
  let currentPlatform = 'win32';

  const LOADING = {
    'pt-BR': {
      shared: [
        'Aquecendo as turbinas de antimatéria...',
        'Sugando node_modules para o vácuo sideral...',
        'Cozinhando 99,1% de espaço puro...',
        'Abduzindo baleias de contêineres do Docker...',
        'Ejetando caches do Gradle pela escotilha...',
        'Vaporizando arquivos .bak com propulsores de íons...',
        'Confinando pacotes do npm em um buraco negro...',
        'Calibrando o acelerador de gigabytes...',
        'Expurgando arquivos de log para a zona fantasma...',
        'Abastecendo a turbina com dependências mortas...',
        'Desintegrando o lixo do Android SDK a laser...',
        'Compactando o vácuo existencial do disco...',
        'Lançando arquivos .tmp na órbita do sol...',
        'Cristalizando bytes na cor azul...',
        'Desmaterializando caches gigantescos do pip...',
        'Redirecionando a exaustão da turbina para o disco...',
        'Chamando o Saul para renegociar os inodes do sistema...',
        'Derretendo barris de dados residuais...',
        'Acionando o modo turbo-vácuo galáctico...',
        'Esfregando o disco com química de alta precisão...',
        'Varrendo detritos espaciais das pastas temporárias...',
        'Neutralizando a radiação magnética de arquivos pesados...',
        'Engarrafando o hiper-espaço recém-descoberto...',
        'Triturando dependências órfãs nas pás da turbina...',
        'Convertendo megabytes inúteis em combustível de foguete...',
        'Sendo aquele que bate na porta dos pacotes desatualizados...',
        'Despachando lixo intergaláctico na surdina...',
        'Sublimando caches esquecidos pela gravidade...',
        'Aplicando empuxo reverso nas tralhas do npm...',
        'Digerindo imagens fantasmas do Docker no reator...',
        'Otimizando a velocidade de dobra do SSD...',
        'Evaporando o histórico de builds que não deram certo...',
        'Pulverizando variáveis mortas em nanossegundos...',
        'Acelerando partículas de espaço livre...',
        'Magnetizando os restos mortais do Python...',
        'Dissolvendo os escombros do Gradle com ácido...',
        'Encolhendo buracos negros criados por instaladores antigos...',
        'Sifonando o espaço livre do multiverso...',
        'Ligando a ignição do propulsor de desinfecção de dados...',
        'Polindo a câmara de combustão do disco local...',
        'Canalizando a força G para expulsar arquivos pesados...',
      ],
      win32: [
        'Aspirando a poeira cósmica da pasta Temp...',
        'Transformando o Prefetch em matéria escura...',
        'Desfragmentando asteroides na Área de Trabalho...',
        'Destruindo evidências na lixeira cósmica...',
        'Exilando logs do Windows para as luas de Júpiter...',
        'Limpando a cena do crime do Windows Temp...',
        'Expulsando poeira alienígena da placa-mãe...',
        'Lançando um laboratório móvel para purificar o disco C:...',
        'Drenando o pântano radioativo do Prefetch...',
      ],
      darwin: [
        'Aspirando a poeira cósmica do $TMPDIR...',
        'Desfragmentando asteroides na Mesa...',
        'Destruindo evidências no Lixo cósmico...',
        'Exilando DiagnosticReports para as luas de Júpiter...',
        'Vaporizando DerivedData do Xcode na escotilha...',
        'Expulsando poeira alienígena da placa lógica...',
        'Lançando um laboratório móvel para purificar o Macintosh HD...',
        'Drenando o pântano radioativo de ~/Library/Caches...',
        'Polindo caches selecionados em Library...',
      ],
    },
    'en-US': {
      shared: [
        'Warming up antimatter turbines...',
        'Sucking node_modules into the cosmic vacuum...',
        'Cooking 99.1% pure disk space...',
        'Abducting Docker container whales...',
        'Ejecting Gradle caches through the airlock...',
        'Vaporizing .bak files with ion thrusters...',
        'Confining npm packages in a black hole...',
        'Calibrating the gigabyte accelerator...',
        'Purging log files into the phantom zone...',
        'Fueling the turbine with dead dependencies...',
        'Disintegrating Android SDK trash with lasers...',
        'Compacting the existential vacuum of the disk...',
        "Launching .tmp files into the sun's orbit...",
        'Crystallizing bytes in blue...',
        'Dematerializing gigantic pip caches...',
        'Redirecting turbine exhaust to the disk...',
        "Calling Saul to renegotiate the system's inodes...",
        'Melting barrels of residual data...',
        'Engaging galactic turbo-vacuum mode...',
        'Scrubbing the drive with high-precision chemistry...',
        'Sweeping space debris from temporary folders...',
        'Neutralizing magnetic radiation from heavy files...',
        'Bottling newly discovered hyper-space...',
        'Shredding orphan dependencies in the turbine blades...',
        'Converting useless megabytes into rocket fuel...',
        'Being the one who knocks on outdated packages...',
        'Quietly dispatching intergalactic trash...',
        'Sublimating caches forgotten by gravity...',
        'Applying reverse thrust to npm junk...',
        'Digesting phantom Docker images in the reactor...',
        "Optimizing the SSD's warp speed...",
        'Evaporating the history of failed builds...',
        'Pulverizing dead variables in nanoseconds...',
        'Accelerating free space particles...',
        'Magnetizing the mortal remains of Python...',
        'Dissolving the rubble of Gradle with acid...',
        'Shrinking black holes created by old installers...',
        'Siphoning free space from the multiverse...',
        'Igniting the data disinfection thruster...',
        'Polishing the combustion chamber of the local disk...',
        'Channeling G-force to expel heavy files...',
      ],
      win32: [
        'Vacuuming cosmic dust from the Temp folder...',
        'Transforming Prefetch into dark matter...',
        'Defragmenting asteroids on the Desktop...',
        'Destroying evidence in the cosmic recycle bin...',
        'Exiling Windows logs to the moons of Jupiter...',
        'Cleaning the Windows Temp crime scene...',
        'Expelling alien dust from the motherboard...',
        'Launching a mobile lab to purify the C: drive...',
        'Draining the radioactive swamp of Prefetch...',
      ],
      darwin: [
        'Vacuuming cosmic dust from $TMPDIR...',
        'Defragmenting asteroids on the Desktop...',
        'Destroying evidence in the cosmic Trash...',
        'Exiling DiagnosticReports to the moons of Jupiter...',
        'Vaporizing Xcode DerivedData through the airlock...',
        'Expelling alien dust from the logic board...',
        'Launching a mobile lab to purify Macintosh HD...',
        'Draining the radioactive swamp of ~/Library/Caches...',
        'Polishing allowlisted Library caches...',
      ],
    },
  };

  /**
   * Base copy (Windows-oriented defaults where terms diverge).
   * Darwin overlays in PLATFORM_OVERLAYS replace Mac-specific wording.
   */
  const STRINGS = {
    'pt-BR': {
      tagline: 'Libere espaço do computador com poucos cliques',
      themeTitle: 'Alternar tema',
      langTitle: 'Idioma: Português (Brasil)',
      langShort: 'PT',
      statusIdle: 'Pronto',
      statusAnalyzing: 'Analisando',
      statusCleaning: 'Limpando',
      statusOk: 'Concluído',
      statusError: 'Erro',
      cleanLabel: 'O que limpar',
      cleanSummaryEmpty: 'Escolha as áreas para liberar espaço',
      cleanSummaryOne: '1 opção marcada',
      cleanSummaryMany: '{n} opções marcadas',
      selectSafe: 'Marcar seguros',
      activity: 'Atividade',
      logLines: '{n} linha{s}',
      clear: 'Limpar',
      freeSpace: 'Espaço livre no disco {drive}',
      waiting: 'Aguardando',
      reclaim: 'Espaço a liberar',
      reclaimNote: 'Com base na sua seleção',
      step1: '1. Clique em',
      step1Strong: 'Analisar',
      step2: '2. Escolha o que deseja limpar',
      step3: '3. Clique em',
      step3Strong: 'Limpar espaço',
      analyze: 'Analisar',
      cleanSpace: 'Limpar espaço',
      cleanNeedAnalyze: 'Analise o espaço antes de limpar',
      cleanNeedSelect: 'Selecione ao menos uma opção',
      cleanReady: 'Limpar o espaço selecionado',
      specs: 'Minhas especificações',
      cpu: 'Processador',
      memory: 'Memória',
      gpu: 'Placa de vídeo',
      storage: 'Armazenamento',
      modalTitle: 'Confirmar limpeza avançada',
      modalBodyBefore: 'Isso remove conteúdos ',
      modalBodyStrong: 'não usados',
      modalBodyAfter: ' do ambiente de containers. Seus projetos e dados importantes não são afetados. Continuar?',
      cancel: 'Cancelar',
      confirm: 'Confirmar',
      none: 'Nenhum',
      selectedOne: '1 selecionado',
      selectedMany: '{n} selecionados',
      attention: 'atenção',
      largeFilesTitle: 'Arquivos grandes na Área de Trabalho',
      refresh: 'Atualizar',
      loading: 'Carregando...',
      noLargeFiles: 'Nenhum arquivo grande encontrado',
      sizePrefix: 'Tamanho:',
      reclaimZeroNote: 'Nada mensurável na seleção atual',
      reclaimSelect: 'Selecione o que deseja limpar',
      reclaimVariable: 'Variável',
      reclaimVariableNote: 'Inclui limpeza de containers (tamanho definido na hora)',
      reclaimEstimatePlus: 'Estimativa da seleção + limpeza de containers',
      reclaimEstimate: 'Estimativa com base na sua seleção atual',
      noSelection: 'Nenhuma opção selecionada.',
      cleanCancelled: 'Limpeza cancelada.',
      winMin: 'Minimizar',
      winMax: 'Maximizar',
      winClose: 'Fechar',
      splashCredit: 'a dizodias digital engineering software',
      bootLangTitle: 'Escolha o idioma',
      bootLangHint: 'Como você prefere usar o TurboSpace?',
      bootLangPt: 'Português (Brasil)',
      bootLangEn: 'English (US)',
      bootRemember: 'Lembrar minha escolha',
      bootContinue: 'Continuar',
      bootModeTitle: 'Como deseja começar?',
      bootModeHint: 'Você pode analisar o computador agora ou só abrir o app.',
      bootModeAnalyze: 'Inicializar e analisar',
      bootModeAnalyzeHint: 'Mede o espaço liberável enquanto o app carrega',
      bootModeOpen: 'Apenas abrir',
      bootModeOpenHint: 'Entra direto na interface, sem analisar agora',
      bootDriveTitle: 'Escolha o disco',
      bootDriveHint: 'Qual disco deseja analisar?',
      bootDriveFree: '{free} livres de {total}',
      bootBack: 'Voltar',
      bootStart: 'Começar',
      groups: {
        temp: {
          title: 'Arquivos temporários',
          summary: 'Pastas temporárias do usuário e do sistema',
          items: {
            userTemp: {
              label: 'Temporários do seu usuário',
              hint: 'Arquivos temporários da sua conta (%TEMP%)',
            },
            winTemp: {
              label: 'Temporários do Windows',
              hint: 'Pasta C:\\Windows\\Temp do sistema',
            },
            prefetch: {
              label: 'Cache de abertura de programas',
              hint: 'Dados do Prefetch usados para abrir apps mais rápido',
            },
          },
        },
        system: {
          title: 'Limpeza do sistema',
          summary: 'Lixeira, caches seguros e relatórios',
          items: {
            recycleBin: {
              label: 'Lixeira',
              hint: 'Esvazia itens já excluídos que ainda ocupam espaço',
            },
            trash: {
              label: 'Lixeira',
              hint: 'Esvazia a Lixeira',
            },
            thumbnails: {
              label: 'Cache de miniaturas',
              hint: 'Miniaturas de pastas e fotos; são recriadas sozinhas',
            },
            updateCache: {
              label: 'Downloads de atualizações',
              hint: 'Pacotes antigos de atualização do Windows',
            },
            deliveryOpt: {
              label: 'Cache de atualizações em rede',
              hint: 'Arquivos da Otimização de Entrega usados para compartilhar updates',
            },
            crashDumps: {
              label: 'Relatórios de falhas',
              hint: 'Minidumps e Relatórios de Erros do Windows (WER)',
            },
            browserCache: {
              label: 'Cache de navegadores',
              hint: 'Chrome, Edge, Brave e Firefox (sites podem carregar um pouco mais lento depois)',
            },
            shaderCache: {
              label: 'Cache de gráficos/jogos',
              hint: 'Shaders do DirectX; jogos recriam na próxima execução',
            },
            appCaches: {
              label: 'Caches de apps',
              hint: 'Caches selecionados em ~/Library/Caches',
            },
          },
        },
        dev: {
          title: 'Ferramentas de desenvolvimento',
          summary: 'Caches de programação que podem ser regenerados',
          items: {
            xcodeDerivedData: {
              label: 'Xcode DerivedData',
              hint: 'Dados intermediários de builds do Xcode',
            },
            gradle: {
              label: 'Cache de compilação Java',
              hint: 'Arquivos de build que podem ser baixados de novo',
            },
            android: {
              label: 'Cache do Android Studio',
              hint: 'Caches do SDK Android',
            },
            npm: {
              label: 'Cache de pacotes JavaScript',
              hint: 'Cache do gerenciador de pacotes Node',
            },
            pip: {
              label: 'Cache de pacotes Python',
              hint: 'Cache do gerenciador de pacotes Python',
            },
            docker: {
              label: 'Limpeza de containers',
              hint: 'Remove imagens e containers não usados',
            },
          },
        },
        desktop: {
          title: 'Área de Trabalho',
          summary: 'Arquivos residuais e arquivos grandes na Área de Trabalho',
          items: {
            desktopJunk: {
              label: 'Arquivos residuais',
              hint: 'Extensões .tmp, .log, .bak e .old',
            },
          },
        },
      },
    },
    'en-US': {
      tagline: 'Free up computer space in a few clicks',
      themeTitle: 'Toggle theme',
      langTitle: 'Language: English (US)',
      langShort: 'EN',
      statusIdle: 'Ready',
      statusAnalyzing: 'Analyzing',
      statusCleaning: 'Cleaning',
      statusOk: 'Done',
      statusError: 'Error',
      cleanLabel: 'What to clean',
      cleanSummaryEmpty: 'Choose areas to free up space',
      cleanSummaryOne: '1 option selected',
      cleanSummaryMany: '{n} options selected',
      selectSafe: 'Select safe',
      activity: 'Activity',
      logLines: '{n} line{s}',
      clear: 'Clear',
      freeSpace: 'Free space on drive {drive}',
      waiting: 'Waiting',
      reclaim: 'Space to free',
      reclaimNote: 'Based on your selection',
      step1: '1. Click',
      step1Strong: 'Analyze',
      step2: '2. Choose what to clean',
      step3: '3. Click',
      step3Strong: 'Free space',
      analyze: 'Analyze',
      cleanSpace: 'Free space',
      cleanNeedAnalyze: 'Analyze space before cleaning',
      cleanNeedSelect: 'Select at least one option',
      cleanReady: 'Clean the selected space',
      specs: 'My specifications',
      cpu: 'Processor',
      memory: 'Memory',
      gpu: 'Graphics card',
      storage: 'Storage',
      modalTitle: 'Confirm advanced cleanup',
      modalBodyBefore: 'This removes ',
      modalBodyStrong: 'unused',
      modalBodyAfter:
        ' content from the container environment. Your projects and important data are not affected. Continue?',
      cancel: 'Cancel',
      confirm: 'Confirm',
      none: 'None',
      selectedOne: '1 selected',
      selectedMany: '{n} selected',
      attention: 'caution',
      largeFilesTitle: 'Large files on the Desktop',
      refresh: 'Refresh',
      loading: 'Loading...',
      noLargeFiles: 'No large files found',
      sizePrefix: 'Size:',
      reclaimZeroNote: 'Nothing measurable in the current selection',
      reclaimSelect: 'Select what you want to clean',
      reclaimVariable: 'Variable',
      reclaimVariableNote: 'Includes container cleanup (size determined at runtime)',
      reclaimEstimatePlus: 'Selection estimate + container cleanup',
      reclaimEstimate: 'Estimate based on your current selection',
      noSelection: 'No option selected.',
      cleanCancelled: 'Cleanup cancelled.',
      winMin: 'Minimize',
      winMax: 'Maximize',
      winClose: 'Close',
      splashCredit: 'a dizodias digital engineering software',
      bootLangTitle: 'Choose your language',
      bootLangHint: 'How would you like to use TurboSpace?',
      bootLangPt: 'Português (Brasil)',
      bootLangEn: 'English (US)',
      bootRemember: 'Remember my choice',
      bootContinue: 'Continue',
      bootModeTitle: 'How do you want to start?',
      bootModeHint: 'You can analyze your computer now or just open the app.',
      bootModeAnalyze: 'Initialize and analyze',
      bootModeAnalyzeHint: 'Measures reclaimable space while the app loads',
      bootModeOpen: 'Just open',
      bootModeOpenHint: 'Go straight to the interface without analyzing now',
      bootDriveTitle: 'Choose a drive',
      bootDriveHint: 'Which drive do you want to analyze?',
      bootDriveFree: '{free} free of {total}',
      bootBack: 'Back',
      bootStart: 'Start',
      groups: {
        temp: {
          title: 'Temporary files',
          summary: 'User and system temporary folders',
          items: {
            userTemp: {
              label: 'Your user temp files',
              hint: 'Temporary files from your account (%TEMP%)',
            },
            winTemp: {
              label: 'Windows temp files',
              hint: 'System temporary folder (C:\\Windows\\Temp)',
            },
            prefetch: {
              label: 'App launch cache',
              hint: 'Prefetch data used to open apps faster',
            },
          },
        },
        system: {
          title: 'System cleanup',
          summary: 'Recycle Bin, safe caches and reports',
          items: {
            recycleBin: {
              label: 'Recycle Bin',
              hint: 'Empties already deleted items that still use space',
            },
            trash: {
              label: 'Trash',
              hint: 'Empties the Trash',
            },
            thumbnails: {
              label: 'Thumbnail cache',
              hint: 'Folder and photo thumbnails; recreated automatically',
            },
            updateCache: {
              label: 'Update downloads',
              hint: 'Old Windows update packages',
            },
            deliveryOpt: {
              label: 'Delivery Optimization cache',
              hint: 'Files used to share updates on the network',
            },
            crashDumps: {
              label: 'Crash reports',
              hint: 'Windows minidumps and Error Reporting (WER) files',
            },
            browserCache: {
              label: 'Browser cache',
              hint: 'Chrome, Edge, Brave and Firefox (sites may load a bit slower afterward)',
            },
            shaderCache: {
              label: 'Graphics/game cache',
              hint: 'DirectX shaders; games recreate them next launch',
            },
            appCaches: {
              label: 'App caches',
              hint: 'Allowlisted caches in ~/Library/Caches',
            },
          },
        },
        dev: {
          title: 'Developer tools',
          summary: 'Programming caches that can be regenerated',
          items: {
            xcodeDerivedData: {
              label: 'Xcode DerivedData',
              hint: 'Intermediate Xcode build data',
            },
            gradle: {
              label: 'Java build cache',
              hint: 'Build files that can be downloaded again',
            },
            android: {
              label: 'Android Studio cache',
              hint: 'Android SDK caches',
            },
            npm: {
              label: 'JavaScript package cache',
              hint: 'Node package manager cache',
            },
            pip: {
              label: 'Python package cache',
              hint: 'Python package manager cache',
            },
            docker: {
              label: 'Container cleanup',
              hint: 'Removes unused images and containers',
            },
          },
        },
        desktop: {
          title: 'Desktop',
          summary: 'Junk files and large files on the Desktop',
          items: {
            desktopJunk: {
              label: 'Residual files',
              hint: '.tmp, .log, .bak and .old extensions',
            },
          },
        },
      },
    },
  };

  /**
   * Apple terminology overlays (pt-BR: Mesa, Lixo, Gráficos, volume…).
   * @see https://support.apple.com/pt-br/guide/mac-help/cpmh0038/mac
   */
  const PLATFORM_OVERLAYS = {
    'pt-BR': {
      darwin: {
        freeSpace: 'Espaço livre em {drive}',
        gpu: 'Gráficos',
        largeFilesTitle: 'Arquivos grandes na Mesa',
        bootDriveTitle: 'Escolha o volume',
        bootDriveHint: 'Qual volume deseja analisar?',
        bootModeHint: 'Você pode analisar o Mac agora ou só abrir o app.',
        groups: {
          temp: {
            summary: 'Pasta temporária da sua conta',
            items: {
              userTemp: {
                label: 'Arquivos temporários',
                hint: 'Pasta temporária da sua conta ($TMPDIR)',
              },
            },
          },
          system: {
            summary: 'Lixo, caches seguros e relatórios',
            items: {
              trash: {
                label: 'Lixo',
                hint: 'Esvazia o Lixo do Mac (~/.Trash)',
              },
              crashDumps: {
                label: 'Relatórios de diagnóstico',
                hint: 'DiagnosticReports com mais de 7 dias',
              },
              browserCache: {
                label: 'Cache de navegadores',
                hint: 'Chrome, Edge, Brave e Firefox (sites podem carregar um pouco mais lento depois)',
              },
              appCaches: {
                label: 'Caches de apps',
                hint: 'Caches selecionados em ~/Library/Caches (Spotify, Slack, Discord, Zoom, Teams, VS Code, Xcode)',
              },
            },
          },
          desktop: {
            title: 'Mesa',
            summary: 'Arquivos residuais e arquivos grandes na Mesa',
            items: {
              desktopJunk: {
                label: 'Arquivos residuais',
                hint: 'Extensões .tmp, .log, .bak e .old na Mesa',
              },
            },
          },
        },
      },
      win32: {
        // Base STRINGS already use Windows terminology.
      },
    },
    'en-US': {
      darwin: {
        freeSpace: 'Free space on {drive}',
        gpu: 'Graphics',
        bootDriveTitle: 'Choose a volume',
        bootDriveHint: 'Which volume do you want to analyze?',
        bootModeHint: 'You can analyze your Mac now or just open the app.',
        groups: {
          temp: {
            summary: 'Your account temporary folder',
            items: {
              userTemp: {
                label: 'Temporary files',
                hint: 'Temporary files from your account ($TMPDIR)',
              },
            },
          },
          system: {
            summary: 'Trash, safe caches and reports',
            items: {
              trash: {
                label: 'Trash',
                hint: 'Empties the Mac Trash (~/.Trash)',
              },
              crashDumps: {
                label: 'Diagnostic reports',
                hint: 'DiagnosticReports older than 7 days',
              },
              appCaches: {
                label: 'App caches',
                hint: 'Allowlisted ~/Library/Caches (Spotify, Slack, Discord, Zoom, Teams, VS Code, Xcode)',
              },
            },
          },
          desktop: {
            title: 'Desktop',
            summary: 'Junk files and large files on the Desktop',
          },
        },
      },
      win32: {},
    },
  };

  const GROUP_META = [
    { id: 'temp', open: true, items: ['userTemp', 'winTemp', 'prefetch'] },
    {
      id: 'system',
      open: false,
      items: [
        'recycleBin',
        'trash',
        'thumbnails',
        'updateCache',
        'deliveryOpt',
        'crashDumps',
        'browserCache',
        'shaderCache',
        'appCaches',
      ],
    },
    {
      id: 'dev',
      open: false,
      items: ['xcodeDerivedData', 'gradle', 'android', 'npm', 'pip', 'docker'],
      warn: { docker: true },
    },
    { id: 'desktop', open: false, items: ['desktopJunk'], largeFiles: true },
  ];

  function deepMerge(base, overlay) {
    if (!overlay || typeof overlay !== 'object') return base;
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        out[key] &&
        typeof out[key] === 'object' &&
        !Array.isArray(out[key])
      ) {
        out[key] = deepMerge(out[key], value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  function getLocale() {
    const saved = localStorage.getItem('turbospace-lang');
    if (saved === 'en-US' || saved === 'pt-BR') return saved;
    return 'pt-BR';
  }

  function setLocale(locale) {
    const next = locale === 'en-US' ? 'en-US' : 'pt-BR';
    localStorage.setItem('turbospace-lang', next);
    document.documentElement.setAttribute('lang', next);
    return next;
  }

  function getPlatform() {
    return currentPlatform;
  }

  function setPlatform(platform) {
    currentPlatform = platform === 'darwin' ? 'darwin' : 'win32';
    return currentPlatform;
  }

  function resolvedStrings() {
    const locale = getLocale();
    const base = STRINGS[locale] || STRINGS['pt-BR'];
    const overlay = PLATFORM_OVERLAYS[locale]?.[currentPlatform];
    return overlay && Object.keys(overlay).length ? deepMerge(base, overlay) : base;
  }

  function t(key, vars) {
    const bundle = resolvedStrings();
    let text = bundle[key] ?? STRINGS['pt-BR'][key] ?? key;
    if (typeof text !== 'string') text = String(key);
    if (vars) {
      text = text.replace('{n}', String(vars.n ?? ''));
      text = text.replace('{s}', vars.n === 1 ? '' : 's');
      text = text.replace('{drive}', String(vars.drive ?? (currentPlatform === 'darwin' ? 'Macintosh HD' : 'C:')));
      text = text.replace('{free}', String(vars.free ?? ''));
      text = text.replace('{total}', String(vars.total ?? ''));
    }
    return text;
  }

  function statusLabels() {
    return {
      idle: t('statusIdle'),
      analyzing: t('statusAnalyzing'),
      cleaning: t('statusCleaning'),
      ok: t('statusOk'),
      error: t('statusError'),
    };
  }

  /**
   * @param {string[]|null} allowedIds — se informado, filtra itens (ex.: resposta de /api/targets)
   */
  function buildGroups(allowedIds = null) {
    const g = resolvedStrings().groups;
    const allow = allowedIds ? new Set(allowedIds) : null;
    return GROUP_META.map((meta) => {
      const src = g[meta.id];
      if (!src) return null;
      const items = meta.items
        .filter((id) => !allow || allow.has(id))
        .filter((id) => src.items[id])
        .map((id) => ({
          id,
          label: src.items[id].label,
          hint: src.items[id].hint,
          safe: id !== 'docker',
          warn: !!(meta.warn && meta.warn[id]),
        }));
      if (!items.length) return null;
      return {
        id: meta.id,
        title: src.title,
        summary: src.summary,
        open: meta.open,
        largeFiles: !!meta.largeFiles,
        items,
      };
    }).filter(Boolean);
  }

  function shouldAskLanguage() {
    return localStorage.getItem('turbospace-lang-remember') !== '1';
  }

  function rememberLanguage(enabled) {
    if (enabled) localStorage.setItem('turbospace-lang-remember', '1');
    else localStorage.removeItem('turbospace-lang-remember');
  }

  function loadingMessages() {
    const locale = getLocale();
    const pack = LOADING[locale] || LOADING['pt-BR'];
    return [...(pack.shared || []), ...(pack[currentPlatform] || pack.win32 || [])];
  }

  function pickLoadingSequence(count = 4) {
    const pool = [...loadingMessages()];
    const picked = [];
    while (picked.length < count && pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(i, 1)[0]);
    }
    return picked;
  }

  // Prefer Electron preload platform when available at load time.
  if (typeof window !== 'undefined' && window.turboWindow?.platform) {
    setPlatform(window.turboWindow.platform);
  }

  return {
    getLocale,
    setLocale,
    getPlatform,
    setPlatform,
    t,
    statusLabels,
    buildGroups,
    pickLoadingSequence,
    shouldAskLanguage,
    rememberLanguage,
    LOADING,
    STRINGS,
    PLATFORM_OVERLAYS,
  };
})();
