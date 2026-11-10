# Progresso da evolução da Capri

## Estado atual

- **Branch:** `feature/capri-autonomous-learning`, criada localmente a partir da branch homônima já existente no fork.
- **Backup local:** branch `backup/pre-capri-autonomous-learning-20261110` aponta para a `main` local anterior à mesclagem.
- **Último commit funcional verificado:** `ba346af` — `feat: add tested messaging transport foundations`; a integração Discord desta etapa aguarda checkpoint local.
- **Etapas existentes:** aprendizado revisado, atividade opcional, privacidade de tela, painel remoto, autoaperfeiçoamento local delimitado, transportes oficiais e comandos Discord autorizados.
- **Trabalho desta sessão:** configuração guiada e secreta do Discord, token cifrado com `safeStorage`, allowlists de usuários/canais, conexão Gateway/Bot API, comandos autorizados, desconexão no tray e limites/antirrepetição. Documentação do WhatsApp mantida como não integrado.
- **Verificação:** `npm run test:messaging` passou (12/12); `node --test tests/*.test.js tests/*.test.mjs` passou (60/60); verificações de sintaxe e `git diff --check` passaram.
- **Status do GitHub:** o push anterior falhou por falta de credenciais (`unable to get password from user`). A integração Discord ainda não foi publicada; confirmar SHA remoto depois de uma tentativa autenticada e nunca enviar para `main`.
- **Limites:** a conexão Discord usa mocks nos testes; não foi possível validar com uma aplicação/bot real. O Gateway ainda não reconecta automaticamente após queda de rede. Não há notificações espontâneas, UI de quiet hours ou endpoint público de WhatsApp. O autoaperfeiçoamento permanece local e requer revisão/confirmação.
- **Próximo passo exato:** implementar WhatsApp Business Cloud com webhook HTTPS verificável e allowlist de remetentes, ou melhorar reconexão/preferências do Discord antes de habilitar notificações. Teste Android/Tailscale segue dependente de dispositivo autorizado e o push exige autenticação GitHub disponível.

## Limites e trabalho pendente

- As regras de privacidade para conteúdo sensível são heurísticas; não classificam toda informação sensível com garantia.
- Testes presenciais de Android/Tailscale ainda dependem de um dispositivo autorizado.
- Discord pode ser configurado e conectado após opt-in, mas requer teste com credenciais reais; reconexão automática e notificações proativas permanecem pendentes. WhatsApp continua sem configuração integrada ou webhook.
- O autoaperfeiçoamento inspeciona, testa e aceita patches locais com confirmação; não é um ciclo autônomo que modifica o código ou publica no GitHub por conta própria.
- Confirmar o resultado de qualquer push consultando a referência remota; se falhar, preservar o commit local e registrar o bloqueio.

## Recuperação

Ler este arquivo, `TODO.md`, `ARCHITECTURE.md` e `CHANGELOG.md`; verificar a branch atual e os commits locais/remotos. Continuar apenas em `feature/capri-autonomous-learning`; nunca enviar alterações à `main`.
