# Changelog

## Não lançado

- Reconciliada a branch de desenvolvimento com os recursos já implementados na `main` da cópia de trabalho: aprendizado por atividade, controles de privacidade de tela, painel remoto e autoaperfeiçoamento local delimitado.
- Unificado o controle de consentimento: aprendizado de conversa e atividade começam desligados e o controle de aprendizado da bandeja também governa os controles remotos de pausa/retomada.
- Removida a ingestão automática de conversa sem revisão; somente notas aceitas pela pessoa aparecem como fatos aprendidos nos painéis.
- Limpar aprendizado também remove notas de conversa aceitas, sem apagar memórias manuais ou histórico de chat.
- Atualizada a documentação de arquitetura, progresso e prioridades com os recursos existentes e as integrações ainda pendentes.
- Discord e WhatsApp Business Cloud API ainda não estão implementados.

## Trabalho anterior nesta branch

- Documentada a arquitetura original da Capri e os pontos de extensão.
- Adicionado aprendizado local e opcional de conversa com declarações explícitas, classificação, revisão antes de aceitar, correção, duplicatas, expiração e remoção.
- Adicionadas salvaguardas heurísticas contra salvar conteúdo sensível e contra persistir turnos novos potencialmente sensíveis no histórico.
