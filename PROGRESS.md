# Progresso da evolução da Capri

## Estado desta etapa

- **Branch:** `feature/capri-autonomous-learning`; backup local preservado em `backup/pre-capri-autonomous-learning-20261110`.
- **Base remota conhecida:** `origin/feature/capri-autonomous-learning` em `c9858d1`; antes desta etapa, a branch local estava 9 commits à frente. O push anterior falhou por falta de autenticação interativa.
- **Implementado nesta etapa:** reconexão Discord com backoff exponencial limitado, cancelamento em desconexão manual, parada após credenciais rejeitadas e controles contra corrida durante conexão.
- **Implementado nesta etapa:** WhatsApp Cloud API opt-in, credenciais cifradas via `safeStorage`, configuração guiada pela bandeja em cinco idiomas, serviço HTTP restrito a loopback, verificação do desafio Meta, HMAC do corpo bruto, limite de payload, allowlist de números e roteamento do conjunto fechado de comandos existente.
- **Documentação:** `docs/WHATSAPP.md` explica credenciais oficiais, proxy HTTPS externo e limitações da janela/template; arquitetura, backlog e changelog atualizados.
- **Testes da etapa:** `npm run test:messaging` passou (20/20); `node --test tests/*.test.js tests/*.test.mjs` passou (68/68); sintaxe, `package.json` e `git diff --check` passaram.

## Bloqueios e limites

- WhatsApp e Discord ainda não foram testados com contas reais; WhatsApp requer um proxy HTTPS público configurado pelo usuário. Capri não abre portas públicas nem cria túnel.
- Respostas WhatsApp são apenas a comandos recebidos; mensagens proativas e templates aprovados não estão implementados.
- Não há notificações espontâneas, atualização automática, execução remota arbitrária ou publicação autônoma.
- O push depende de autenticação GitHub disponível. Preservar commits locais e verificar o SHA remoto após qualquer tentativa; nunca enviar à `main` nem force-push.
- A privacidade de conteúdo sensível usa heurísticas, sem garantia de classificar todo conteúdo.

## Próximo passo exato

1. Fazer commit descritivo desta etapa na branch de feature; registrar o SHA.
2. Tentar push sem forçar e verificar o SHA remoto. Se a autenticação bloquear, manter o commit e registrar o bloqueio.
3. Continuar o próximo item do `TODO.md`: permissões por aplicativo e níveis de autorização no Windows, sem implementar coleta oculta.

## Recuperação

Ler este arquivo, `TODO.md`, `ARCHITECTURE.md` e `CHANGELOG.md`; verificar a branch e commits locais/remotos. Continuar somente em `feature/capri-autonomous-learning`; nunca enviar alterações à `main`.
