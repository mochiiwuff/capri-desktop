# Progresso da evolução da Capri

## Estado desta etapa

- **Branch:** `feature/capri-autonomous-learning`; backup local preservado em `backup/pre-capri-autonomous-learning-20261110`.
- **Último commit funcional:** `1eaa863` — `refactor: share authorized messaging command handler`; a atualização de continuidade foi registrada em um commit documental posterior.
- **Commit funcional desta etapa:** `1c3a77c` — `feat: add WhatsApp webhook and Discord reconnect`.
- **Commit de privacidade por app:** `76b4b7d` — `feat: add per-app activity learning exclusions`.
- **Commit de progresso:** `f2ef58f` registra os testes e o marco funcional.
- **Referência remota confirmada:** `c9858d19feab87ceb8a302eef236335610bc3dcd`; pushes locais anteriores falharam por falta de autenticação interativa.
- **Implementado nesta etapa:** reconexão Discord com backoff exponencial limitado, cancelamento em desconexão manual, parada após credenciais rejeitadas e controles contra corrida durante conexão.
- **Implementado nesta etapa:** WhatsApp Cloud API opt-in, credenciais cifradas via `safeStorage`, configuração guiada pela bandeja em cinco idiomas, serviço HTTP restrito a loopback, verificação do desafio Meta, HMAC do corpo bruto, limite de payload, allowlist de números e roteamento do conjunto fechado de comandos existente.
- **Avanço desta continuação:** lista global de apps excluídos da observação de tela e do aprendizado de atividade; tela cancela captura ativa se a janela atual passar a ser bloqueada. Corrigidos também o IPC de normalização da lista de exclusão de atividade e os textos localizados do guia.
- **Commit funcional atual:** `d48e5aa` — `feat: add global privacy pause controls`.
- **Commit de permissões de observação:** `171aa58` — `feat: add per-app observation permissions`.
- **Commit de autorização de interação:** `4b0b57a` — `fix: require explicit authorization for page closing`.
- **Marco anterior:** `fdb05c1` — `test: verify explicit page-close authorization`.
- **Avanço atual:** pausa global de privacidade, com indicação de estado no tooltip/menu do tray (incluindo captura manual em andamento) e pausa/retomada pelo painel remoto. Cancela capturas e imagens temporárias, impede aprendizado enquanto pausado e preserva as opções individuais para retomada.
- **Implementado nesta continuação:** listas separadas de aplicativos autorizados para análise de tela e aprendizado de atividade, com nomes de processo exatos, edição pela bandeja em cinco idiomas e falha fechada para configuração inválida. Consentimento global e exclusões continuam prevalecendo; lista vazia preserva o escopo compatível anterior.
- **Segurança de interação:** fechamento automático de páginas de outras IAs foi desativado por padrão e a autorização anterior implícita de versões antigas não é preservada; a pessoa precisa habilitar a opção explicitamente na bandeja. Fechamento solicitado de apps segue com confirmação e force-close com uma segunda.
- **Controle de fechamento por app:** lista opcional de processos permitidos, editável pelo tray em cinco idiomas; o processo principal bloqueia apps fora da lista na ação individual e no modo jogo. O modo jogo informa quais apps ficaram bloqueados.
- **Dispatcher compartilhado:** Discord e WhatsApp usam o mesmo handler limitado para os sete comandos autorizados, com permissões por plataforma, limite e deduplicação comuns; `memory` retorna apenas contagens. Regressão cruzada passou nos testes dos dois serviços.
- **Notificações de desenvolvimento:** opt-in desligado por padrão; controles de ativação/pausa imediata e preferências de quiet hours/limite por hora no tray. As mensagens são textos fixos por evento, sem prompts, conversas, nomes de arquivos ou logs; Discord usa o último canal autorizado e WhatsApp o último remetente autorizado dentro da janela de 24 horas. Deduplicação serializada e histórico local com hash do identificador de sessão, sem armazenar o identificador.
- **Verificação desta etapa:** suíte completa aprovada, 85/85 testes; testes de destinatário Discord/WhatsApp, pausa, opt-in, quiet hours, limites, deduplicação, não persistência de conteúdo, update-check e localização. Sem conta real de Discord/Meta, portanto integração externa continua **PENDENTE DE VALIDAÇÃO EXTERNA**.
- **Commit funcional local:** `c10fef1` — `feat: add opt-in development notifications`; ainda não enviado ao GitHub.
- **Empacotamento:** `npm ci` e `npm run dist` concluíram com sucesso; artefato local `dist/Capri-Setup.exe` (126.044.991 bytes, SHA-256 `81783E5E3113C25A2942335DFC77CC23E52B07E4ED668A37106677761185BFCC`). Sem assinatura de código; não foi instalado nem validado em uma máquina Windows limpa.
- **Atualizações:** verificação manual informativa concluída: consulta somente a versão estável pública e abre a página oficial apenas após escolha do usuário. O endpoint GitHub respondeu com `v0.5.2`, igual à versão instalada; nenhum download/instalação automática.
- **Documentação:** `docs/WHATSAPP.md` explica credenciais oficiais, proxy HTTPS externo e limitações da janela/template; arquitetura, backlog e changelog atualizados.
- **Testes:** suíte completa passou (85/85); sintaxe dos arquivos alterados e `git diff --check` também passaram.

## Bloqueios e limites

- WhatsApp e Discord ainda não foram testados com contas reais; WhatsApp requer um proxy HTTPS público configurado pelo usuário. Capri não abre portas públicas nem cria túnel.
- Respostas WhatsApp são apenas a comandos recebidos; mensagens proativas e templates aprovados não estão implementados.
- Notificações de desenvolvimento permanecem desligadas até opt-in; update não executa código remoto, e não há execução remota arbitrária nem publicação autônoma.
- Pushes anteriores falharam com `Cannot prompt because user interactivity has been disabled`; os commits até `e7fba95` permanecem locais. A branch remota não foi atualizada; verificar o SHA remoto antes de tentar novamente. Nunca enviar à `main` nem usar force-push.
- A privacidade de conteúdo sensível usa heurísticas, sem garantia de classificar todo conteúdo.

## Próximo passo exato

1. Validar Discord/WhatsApp com contas autorizadas e instalar/testar `Capri-Setup.exe` em Windows limpo; sem contas ou VM/dispositivo limpo, manter esses itens como pendentes. Continuar a matriz de autorização/ações Windows sem adicionar leitura não autorizada de mensagens.

## Recuperação

Ler este arquivo, `TODO.md`, `ARCHITECTURE.md` e `CHANGELOG.md`; verificar a branch e commits locais/remotos. Continuar somente em `feature/capri-autonomous-learning`; nunca enviar alterações à `main`.
