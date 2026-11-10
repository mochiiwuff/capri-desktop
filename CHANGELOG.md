# Changelog

## [Unreleased]

### Adicionado

- Módulo local de aprendizado comportamental para conversas.
- Persistência da memória evolutiva em `config.json`.
- Integração do aprendizado ao fluxo do chat da Capri.
- Documentação inicial de arquitetura e progresso.
- Aprendizado opcional por atividade do Windows, desligado por padrão, com nomes de processos e duração aproximada.
- Controle de consentimento no menu da bandeja; títulos de janelas não são armazenados como contexto de atividade.
- Painel de memória aprendida com fatos de conversa, uso de apps e rotinas, além de exclusão confirmada dos dados aprendidos.
- Controles de privacidade de tela com indicador durante análise, cancelamento, revogação e exclusões locais de aplicativos/termos antes da captura.
- Painel remoto responsivo e API autenticada em loopback para status, memória autorizada e controles de pausa/retomada; acesso LAN direto permanece desativado.
- Suporte a proxy HTTPS do Tailscale Serve e geração explícita de link Android privado; validação em dispositivo real ainda pendente.
- Relatório remoto agregado e feed de ações autenticados, retidos somente durante a sessão do servidor; sem push em segundo plano ou serviços externos.
- Revisão local de manifesto, documentação, backlog e inventário de testes em modo somente leitura; execução de testes requer confirmação e usa lista restrita, sem shell, com limites de tempo/saída.
- Análise JavaScript local com verificação de sintaxe, resolução de imports relativos estáticos e localização de marcadores de manutenção, com evidência por arquivo/linha e sem executar código ou transmitir fontes.
- A análise também sinaliza ciclos no grafo de imports relativos como itens de arquitetura a revisar, sem afirmar que sejam bugs.
- A análise lista módulos não alcançáveis a partir de raízes conhecidas por imports estáticos, como candidatos para revisão manual, sem presumir código morto.
- Resultados de análise agora incluem próximos passos acionáveis, agrupados por tipo e ancorados em até três evidências locais; ciclos e módulos inalcançáveis seguem sendo candidatos de revisão, sem correção automática.
- Comparação local de testes após confirmação: guarda apenas resumos, com retenção de 20 execuções, e sinaliza regressão ou melhoria entre resultados consecutivos.
- Aplicação e reversão de propostas JSON locais com diff e confirmação explícita, escopo restrito a um arquivo em `src/`, validação SHA-256, backup e journal local; sem exclusão ou execução arbitrária.
- Aplicações e reversões concorrentes de patches são serializadas por journal no processo, evitando atualizações perdidas e fazendo operações repetidas falharem na revalidação de hash/estado.

### Próximo

- Validar painel, relatório e feed em dispositivo Android na mesma tailnet.
- Análise semântica com sugestões de bugs/arquitetura baseadas em evidências; nenhuma alteração automática de arquivos está habilitada.
