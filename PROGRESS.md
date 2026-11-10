# Progresso da evolução da Capri

## Estado desta etapa

- **Branch:** `feature/capri-autonomous-learning`; backup local preservado em `backup/pre-capri-autonomous-learning-20261110`.
- **Commit mais recente:** `824a390` — `feat: add shared privacy app exclusions`.
- **Commit funcional desta etapa:** `1c3a77c` — `feat: add WhatsApp webhook and Discord reconnect`.
- **Commit de privacidade por app:** `76b4b7d` — `feat: add per-app activity learning exclusions`.
- **Commit de progresso:** `f2ef58f` registra os testes e o marco funcional.
- **GitHub:** push de `824a390d77da09c597d4da1775adddec996c4ede` tentado sem force e falhou com `Cannot prompt because user interactivity has been disabled`. A referência remota confirmada continua em `c9858d19feab87ceb8a302eef236335610bc3dcd`; a branch local está 15 commits à frente e permanece preservada.
- **Implementado nesta etapa:** reconexão Discord com backoff exponencial limitado, cancelamento em desconexão manual, parada após credenciais rejeitadas e controles contra corrida durante conexão.
- **Implementado nesta etapa:** WhatsApp Cloud API opt-in, credenciais cifradas via `safeStorage`, configuração guiada pela bandeja em cinco idiomas, serviço HTTP restrito a loopback, verificação do desafio Meta, HMAC do corpo bruto, limite de payload, allowlist de números e roteamento do conjunto fechado de comandos existente.
- **Avanço desta continuação:** lista global de apps excluídos da observação de tela e do aprendizado de atividade; tela cancela captura ativa se a janela atual passar a ser bloqueada. Corrigidos também o IPC de normalização da lista de exclusão de atividade e os textos localizados do guia.
- **Commit funcional atual:** `d48e5aa` — `feat: add global privacy pause controls`.
- **Commit de permissões de observação:** `171aa58` — `feat: add per-app observation permissions`.
- **Commit de autorização de interação:** `4b0b57a` — `fix: require explicit authorization for page closing`.
- **Commit mais recente:** `fdb05c1` — `test: verify explicit page-close authorization`.
- **Avanço atual:** pausa global de privacidade, com indicação de estado no tooltip/menu do tray (incluindo captura manual em andamento) e pausa/retomada pelo painel remoto. Cancela capturas e imagens temporárias, impede aprendizado enquanto pausado e preserva as opções individuais para retomada.
- **Implementado nesta continuação:** listas separadas de aplicativos autorizados para análise de tela e aprendizado de atividade, com nomes de processo exatos, edição pela bandeja em cinco idiomas e falha fechada para configuração inválida. Consentimento global e exclusões continuam prevalecendo; lista vazia preserva o escopo compatível anterior.
- **Segurança de interação:** fechamento automático de páginas de outras IAs foi desativado por padrão e a autorização anterior implícita de versões antigas não é preservada; a pessoa precisa habilitar a opção explicitamente na bandeja. Fechamento solicitado de apps segue com confirmação e force-close com uma segunda.
- **Controle de fechamento por app:** lista opcional de processos permitidos, editável pelo tray em cinco idiomas; o processo principal bloqueia apps fora da lista na ação individual e no modo jogo. O modo jogo informa quais apps ficaram bloqueados.
- **Documentação:** `docs/WHATSAPP.md` explica credenciais oficiais, proxy HTTPS externo e limitações da janela/template; arquitetura, backlog e changelog atualizados.
- **Testes:** suíte completa passou (74/74); sintaxe dos arquivos alterados e `git diff --check` também passaram.

## Bloqueios e limites

- WhatsApp e Discord ainda não foram testados com contas reais; WhatsApp requer um proxy HTTPS público configurado pelo usuário. Capri não abre portas públicas nem cria túnel.
- Respostas WhatsApp são apenas a comandos recebidos; mensagens proativas e templates aprovados não estão implementados.
- Não há notificações espontâneas, atualização automática, execução remota arbitrária ou publicação autônoma.
- Push mais recente de `fdb05c11d1fbf39581fd9f18f553d9436947d8c7` falhou: `Cannot prompt because user interactivity has been disabled`. Remoto confirmado permanece `c9858d19feab87ceb8a302eef236335610bc3dcd`; branch local está 21 commits à frente e está preservada. Não enviar à `main` nem usar force-push.
- A privacidade de conteúdo sensível usa heurísticas, sem garantia de classificar todo conteúdo.

## Próximo passo exato

1. Extrair o dispatcher autorizado comum das integrações Discord/WhatsApp e adicionar testes de compatibilidade das permissões, sem permitir execução remota arbitrária.

## Recuperação

Ler este arquivo, `TODO.md`, `ARCHITECTURE.md` e `CHANGELOG.md`; verificar a branch e commits locais/remotos. Continuar somente em `feature/capri-autonomous-learning`; nunca enviar alterações à `main`.
