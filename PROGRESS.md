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
- **Documentação:** `docs/WHATSAPP.md` explica credenciais oficiais, proxy HTTPS externo e limitações da janela/template; arquitetura, backlog e changelog atualizados.
- **Testes:** suíte completa antes deste ajuste passou (69/69); após as exclusões globais, passou (70/70). Verificações de sintaxe, `problems` do editor e `git diff --check` passaram.

## Bloqueios e limites

- WhatsApp e Discord ainda não foram testados com contas reais; WhatsApp requer um proxy HTTPS público configurado pelo usuário. Capri não abre portas públicas nem cria túnel.
- Respostas WhatsApp são apenas a comandos recebidos; mensagens proativas e templates aprovados não estão implementados.
- Não há notificações espontâneas, atualização automática, execução remota arbitrária ou publicação autônoma.
- O push depende de autenticação GitHub disponível. Preservar commits locais e verificar o SHA remoto após qualquer tentativa; nunca enviar à `main` nem force-push.
- A privacidade de conteúdo sensível usa heurísticas, sem garantia de classificar todo conteúdo.

## Próximo passo exato

1. Habilitar autenticação GitHub não interativa e publicar a branch de feature sem force-push; confirmar o SHA remoto.
2. Continuar permissões por modalidade e níveis de autorização no Windows, sem implementar coleta oculta.

## Recuperação

Ler este arquivo, `TODO.md`, `ARCHITECTURE.md` e `CHANGELOG.md`; verificar a branch e commits locais/remotos. Continuar somente em `feature/capri-autonomous-learning`; nunca enviar alterações à `main`.
