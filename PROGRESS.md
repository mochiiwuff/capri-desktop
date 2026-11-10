# Progresso da evolução da Capri

## Estado atual

- **Branch:** `feature/capri-autonomous-learning`, criada localmente a partir da branch homônima já existente no fork.
- **Backup local:** branch `backup/pre-capri-autonomous-learning-20261110` aponta para a `main` local anterior à mesclagem.
- **Etapas existentes:** aprendizado de conversa com revisão explícita, atividade opcional do Windows, privacidade de tela, painel remoto e ferramentas locais delimitadas de autoaperfeiçoamento.
- **Trabalho desta sessão:** mesclar as implementações de `main` na branch de desenvolvimento e tornar o consentimento uniforme; garantir que só notas de conversa aceitas apareçam como aprendizado; incluir notas aceitas na limpeza de aprendizado; consolidar a documentação e os próximos passos.
- **Verificação:** `node --test tests/*.test.js tests/*.test.mjs` passou: 48 testes, 0 falhas; `node --check` passou nos arquivos JavaScript alterados; `git diff --cached --check` passou sem conflitos pendentes.
- **Status da mesclagem:** resolvida e testada localmente; revisão final, commit e push ainda precisam ser concluídos.
- **Próximo passo exato:** revisar a mudança staged, criar o commit de merge em `feature/capri-autonomous-learning`, enviar apenas essa branch e verificar o SHA remoto.

## Limites e trabalho pendente

- As regras de privacidade para conteúdo sensível são heurísticas; não classificam toda informação sensível com garantia.
- Testes presenciais de Android/Tailscale ainda dependem de um dispositivo autorizado.
- Discord e WhatsApp Business Cloud API não foram implementados.
- O autoaperfeiçoamento inspeciona, testa e aceita patches locais com confirmação; não é um ciclo autônomo que modifica o código ou publica no GitHub por conta própria.
- Confirmar o resultado de qualquer push consultando a referência remota; se falhar, preservar o commit local e registrar o bloqueio.

## Recuperação

Ler este arquivo, `TODO.md`, `ARCHITECTURE.md` e `CHANGELOG.md`; verificar a branch atual e os commits locais/remotos. Continuar apenas em `feature/capri-autonomous-learning`; nunca enviar alterações à `main`.
