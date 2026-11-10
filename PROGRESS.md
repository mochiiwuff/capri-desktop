# Progresso da evolução da Capri

## Estado atual

- **Branch:** `feature/capri-autonomous-learning`, criada localmente a partir da branch homônima já existente no fork.
- **Backup local:** branch `backup/pre-capri-autonomous-learning-20261110` aponta para a `main` local anterior à mesclagem.
- **Último commit local verificado:** `4ad853b` — `merge: integrate Capri learning and privacy features`.
- **Etapas existentes:** aprendizado revisado, atividade opcional, privacidade de tela, painel remoto, autoaperfeiçoamento local delimitado e primitivas testadas para APIs oficiais de mensagens.
- **Trabalho desta sessão:** bases isoladas Discord Bot API/Gateway e WhatsApp Business Cloud API; allowlist de usuários/canais, comandos limitados, quiet hours, deduplicação, rate limit, assinatura HMAC do webhook e documentação de requisitos.
- **Verificação:** `npm run test:messaging` passou (9/9); `node --test tests/*.test.js tests/*.test.mjs` passou (57/57); verificações de sintaxe, JSON e whitespace passaram.
- **Status da mesclagem:** resolvida, testada e commitada localmente. O push foi tentado, mas o Git não conseguiu solicitar credenciais neste ambiente (`unable to get password from user`); não alegar que a branch foi publicada.
- **Limite:** os adaptadores são funções isoladas, não são iniciados pelo Capri nem têm configuração/armazenamento de credenciais, webhook público ou UI; não há tráfego externo nem capacidade de comunicação habilitada nesta etapa.
- **Próximo passo exato:** integrar o Discord ao processo principal e ao assistente de configuração, com segredos protegidos por `safeStorage`, controles visíveis e teste via mocks; manter envio desligado por padrão. O webhook HTTPS/Cloud API do WhatsApp vem depois.

## Limites e trabalho pendente

- As regras de privacidade para conteúdo sensível são heurísticas; não classificam toda informação sensível com garantia.
- Testes presenciais de Android/Tailscale ainda dependem de um dispositivo autorizado.
- Discord e WhatsApp ainda não estão conectados ao aplicativo; configuração, credenciais, entrega, interface de pausa/desconexão e servidor de webhook permanecem pendentes.
- O autoaperfeiçoamento inspeciona, testa e aceita patches locais com confirmação; não é um ciclo autônomo que modifica o código ou publica no GitHub por conta própria.
- Confirmar o resultado de qualquer push consultando a referência remota; se falhar, preservar o commit local e registrar o bloqueio.

## Recuperação

Ler este arquivo, `TODO.md`, `ARCHITECTURE.md` e `CHANGELOG.md`; verificar a branch atual e os commits locais/remotos. Continuar apenas em `feature/capri-autonomous-learning`; nunca enviar alterações à `main`.
