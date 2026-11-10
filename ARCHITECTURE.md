# Arquitetura da Capri

## Visão geral

A Capri é um aplicativo Electron que combina:

- uma camada de desktop (`src/main/main.js`) para o ciclo de vida do app, janelas, sistema, teclado e IPC;
- um renderer (`src/renderer/js/*.js`) que desenha e anima a personagem, o painel, o chat e os contextos do sistema;
- módulos de configuração e memória (`src/main/config.js`, `src/main/learning.js`);
- hooks de agentes de código (`hooks/*.js`, `scripts/install-*.js`) para observar Claude Code, Codex e Antigravity;
- integrações com IA local (Ollama), com telas e com aplicativos do Windows.

## Fluxo principal

1. `main.js` inicia o app, cria a sobreposição, registra IPC e configura a tray/menu.
2. O renderer (`app.js`) carrega os assets visuais e cria os objetos: `Capri`, `Panel`, `Voice`, `Brain`, `Guide`, `Chat`, etc.
3. O `Brain` ouve eventos vindos dos hooks de Claude/Codex/Antigravity e transforma esses eventos em ações da personagem.
4. O `Chat` conversa com o provedor de IA selecionado e armazena o histórico local em `memory.json`.
5. O `config.json` e a memória local guardam Estado de sessão e preferências persistentes.

## Integradores de evolução

- `src/main/config.js`: estado persistente do app.
- `src/main/learning.js`: módulo novo de memória comportamental local, orientado a fatos e preferências extraídos da conversa.
- `src/main/activity.js`: estatísticas opcionais de atividade, desativadas até consentimento explícito no menu da bandeja. Registra apenas nomes de processos e estimativas de duração, nunca títulos de janelas.
- `src/renderer/js/chat.js`: ponto de entrada para aprendizado por conversas.
- `src/renderer/js/memory-view.js`: formata a memória para o painel existente sem alterar seu estado; o comando do menu abre a visualização e oferece exclusão confirmada.
- `src/main/remote-control.js` e `src/renderer/remote/`: painel web responsivo e API autenticada para estado, memória autorizada e controles de pausa.

## Privacidade da atividade

- O rastreio de aplicativos começa desligado e só pode ser ativado/desativado no menu da bandeja.
- O watcher fornece o nome do processo em primeiro plano; títulos de janela são usados apenas internamente para os comportamentos existentes e não entram na memória de atividade.
- A duração é acumulada em amostras de 15 segundos enquanto o recurso está ativado. Pausar interrompe novas gravações sem apagar o histórico existente.
- A observação de tela segue uma autorização separada, validada também no processo principal antes de capturar.
- Exclusões de aplicativos e termos de título são comparadas localmente; os títulos não são enviados ao renderer nem persistidos. A captura em memória é removida depois da análise, revogação ou expiração.
- O painel exibe um indicador durante a análise e oferece interrupção; a bandeja permite pausar/retomar ou revogar a autorização, exigindo nova confirmação para reativar.
- O painel remoto só inicia após ação explícita no menu e escuta exclusivamente em `127.0.0.1`; autentica com token aleatório de 256 bits no fragmento da URL, exige Bearer, valida `Origin`/`Host`, aplica CSP e desativa cache. Não expõe histórico do chat nem credenciais de provedores.
- A conexão direta pela LAN permanece desativada. Para Android, o painel aceita somente um proxy local com host Tailscale `*.ts.net` e origem HTTPS correspondente; o link privado mantém o token no fragmento e pode ser copiado após informar o endereço do Tailscale Serve. O endereço deve estar acessível apenas à tailnet privada. A Capri não configura nem inicia o Tailscale.
- No Windows, obtenha a porta local exibida na barra de endereço do painel e configure o proxy com `tailscale serve --bg http://127.0.0.1:<porta>`; `tailscale serve status` informa o endereço HTTPS para gerar o link Android. O Android deve estar autenticado na mesma tailnet. A validação ponta a ponta requer esses dispositivos e ainda está pendente.
- O painel fornece `/api/report`, com contagens e até cinco apps de maior uso, sem fatos de conversa brutos; `/api/notifications` lista até 20 ações remotas recentes. Notificações ficam apenas em memória durante a vida do servidor, são autenticadas e atualizadas no painel a cada 30 segundos. Não há push em segundo plano nem envio a serviços externos.
- O menu da bandeja oferece revisão local somente de leitura do manifesto, documentação, backlog e inventário dos testes. A execução dos testes exige confirmação explícita e usa `node --test` com arquivos `.test.js` diretamente em `tests/`, sem shell, timeout de dois minutos e saída limitada. Alterações propostas seguem um fluxo separado, limitado a patches revisáveis e reversíveis; análise semântica mais profunda e geração automática de propostas permanecem pendentes.
- A análise da fonte percorre no máximo 200 arquivos JavaScript em `src/` (sem seguir links simbólicos), verifica sintaxe com `node --check`, resolve imports relativos estáticos usuais, aponta ciclos e módulos inalcançáveis a partir dos pontos de entrada conhecidos (`package.json.main`, preload e scripts HTML), além de comentários TODO/FIXME/XXX/HACK. Ciclos e candidatos inalcançáveis são itens para revisão: imports dinâmicos, eventos e referências indiretas podem não aparecer. Limita tamanho de arquivo, profundidade, diretórios, tempo e saída; não executa código-fonte, não verifica pacotes externos e não substitui lint ou análise semântica.
- Os resultados de sintaxe, imports não resolvidos, ciclos, marcadores de manutenção e módulos não alcançáveis também geram próximos passos locais agrupados, citando até três evidências por categoria. São orientações de investigação, não diagnósticos semânticos nem correções; em especial, não se recomenda excluir módulos apenas por falta de referência estática. As sugestões são localizadas e aparecem junto dos achados existentes na análise da bandeja.
- Após a confirmação para executar os testes, somente o resumo do resultado, contagens e horário é persistido em `userData/self-improvement-test-history.json`. O arquivo retém até 20 execuções e é atualizado por gravação temporária + rename; saída completa dos testes não é persistida. Uma transição da execução anterior aprovada para a atual falha é sinalizada como regressão, enquanto transição falha→aprovada é sinalizada como melhoria.
- Propostas de alteração podem ser carregadas como JSON local (`relativePath`, `expectedSha256`, `content`; o hash é SHA-256 hexadecimal do conteúdo atual). O menu mostra o diff completo e pede confirmação antes de escrever; são aceitos somente arquivos UTF-8 existentes até 64 KiB dentro de `src/`, sem links simbólicos e com hash atual correspondente. A cópia original e o journal ficam em `userData/self-improvement/`; o journal guarda ID, caminho relativo, data e hashes, com limite de 50 operações. Aplicações e reversões são serializadas por journal no processo principal para impedir atualizações concorrentes perdidas e revalidam os hashes após a fila. “Desfazer última alteração” também exige confirmação e só restaura se o hash atual ainda for exatamente o aplicado. Exclusão, mudanças fora de `src/` e execução de comandos não fazem parte deste fluxo; patches não são gerados automaticamente nem acessíveis pelo controle remoto.

## Compatibilidade

- Mantém a identidade visual e os comportamentos da Capri original.
- Faz aprendizado em memória local, sem alterar a lógica dos hooks do Claude/Codex.
- O sistema novo é complementar: ele não substitui a memória do chat nem os módulos existentes.
