# Progresso da evolução da Capri

## Estado desta etapa

- **Branch:** `feature/capri-autonomous-learning`; backup local preservado em `backup/pre-capri-autonomous-learning-20261110`.
- **Commit funcional desta etapa:** `1c3a77c` — `feat: add WhatsApp webhook and Discord reconnect`.
- **Commit de privacidade por app:** `76b4b7d` — `feat: add per-app activity learning exclusions`.
- **Commit de progresso:** `f2ef58f` registra os testes e o marco funcional.
- **GitHub:** último push tentado sem force falhou com `Cannot prompt because user interactivity has been disabled`. A última confirmação remota foi `c9858d19feab87ceb8a302eef236335610bc3dcd`; novos commits locais foram feitos depois, e devem ser enviados após autenticação. O branch local permanece preservado.
- **Implementado nesta etapa:** reconexão Discord com backoff exponencial limitado, cancelamento em desconexão manual, parada após credenciais rejeitadas e controles contra corrida durante conexão.
- **Implementado nesta etapa:** WhatsApp Cloud API opt-in, credenciais cifradas via `safeStorage`, configuração guiada pela bandeja em cinco idiomas, serviço HTTP restrito a loopback, verificação do desafio Meta, HMAC do corpo bruto, limite de payload, allowlist de números e roteamento do conjunto fechado de comandos existente.
- **Avanço seguinte:** lista de exclusão de processos para aprendizado de atividade, editável pelo menu e aplicada antes de registrar cada amostra; não lê títulos de janela.
- **Documentação:** `docs/WHATSAPP.md` explica credenciais oficiais, proxy HTTPS externo e limitações da janela/template; arquitetura, backlog e changelog atualizados.
- **Testes:** `npm run test:messaging` passou (20/20); após adicionar exclusões por processo, `node --test tests/*.test.js tests/*.test.mjs` passou (69/69); verificações de sintaxe e `git diff --check` passaram.

## Bloqueios e limites

- WhatsApp e Discord ainda não foram testados com contas reais; WhatsApp requer um proxy HTTPS público configurado pelo usuário. Capri não abre portas públicas nem cria túnel.
- Respostas WhatsApp são apenas a comandos recebidos; mensagens proativas e templates aprovados não estão implementados.
- Não há notificações espontâneas, atualização automática, execução remota arbitrária ou publicação autônoma.
- O push depende de autenticação GitHub disponível. Preservar commits locais e verificar o SHA remoto após qualquer tentativa; nunca enviar à `main` nem force-push.
- A privacidade de conteúdo sensível usa heurísticas, sem garantia de classificar todo conteúdo.

## Próximo passo exato

1. Autenticar o GitHub e publicar a branch de feature sem force-push; confirmar o SHA remoto.
2. Continuar o próximo item do `TODO.md`: permissões granulares por modalidade e níveis de autorização no Windows, sem implementar coleta oculta.

## Recuperação

Ler este arquivo, `TODO.md`, `ARCHITECTURE.md` e `CHANGELOG.md`; verificar a branch e commits locais/remotos. Continuar somente em `feature/capri-autonomous-learning`; nunca enviar alterações à `main`.
