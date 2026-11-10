# TODO

## Fase 1 — Memória contextual

- [x] Revisar a arquitetura e integrar pontos de extensão.
- [x] Criar base de aprendizado por conversas.
- [x] Expandir fatos para rotinas e projetos recorrentes.
- [x] Expor e permitir apagar os dados de aprendizado em um painel de observação.

## Fase 2 — Atividades do Windows

- [x] Monitorar aplicativos usados e duração de uso.
- [x] Registrar contexto de trabalho e rotina.
- [x] Respeitar consentimento explícito e permitir pausa.

## Fase 3 — Contexto de tela

- [x] Implementar autorização explícita de observação.
- [x] Adicionar indicador visual, pausa/retomada e revogação da autorização.
- [x] Configurar exclusões por aplicativo e termos de título, verificados localmente antes da captura; não persistir capturas brutas.

## Fase 4 — Controle remoto mobile

- [x] Definir camada web autenticada.
- [x] Expor estado, memória autorizada e recursos de pausa.
- [x] Permitir proxy HTTPS do Tailscale Serve sem tirar o listener de `127.0.0.1`.
- [x] Gerar link Android com token privado, restrito a endereços HTTPS `*.ts.net`.
- [ ] Validar conexão ponta a ponta em um Android autenticado na mesma tailnet.
- [x] Exibir feed autenticado das ações remotas recentes e relatório agregado de status/atividade.
- [ ] Validar notificações e relatório no Android; push em segundo plano não está incluído.

## Fase 5 — Autoaperfeiçoamento

- [x] Registrar pendências, validações e regressões conhecidas neste backlog.
- [x] Revisar localmente o manifesto, a documentação, as tarefas pendentes e o inventário de testes em modo somente leitura.
- [x] Executar os testes locais existentes somente após confirmação explícita, sem shell e com limite de tempo/saída.
- [x] Verificar sintaxe JavaScript com Node e localizar TODO/FIXME/XXX/HACK nos comentários, exibindo arquivo e linha; análise local limitada a `src/`, sem executar o código.
- [x] Verificar imports `require`/`import`/`export` relativos e relatar destinos ausentes com arquivo, linha e trecho; não resolve imports dinâmicos ou pacotes externos.
- [x] Identificar componentes com ciclos de imports relativos e mostrar as arestas/linhas como itens para revisão, sem classificá-los automaticamente como bugs.
- [x] Localizar módulos não alcançáveis pelos imports estáticos a partir dos pontos de entrada conhecidos; são candidatos para checar referências dinâmicas, não confirmações de código morto.
- [x] Agrupar resultados em próximos passos acionáveis com evidência de arquivo/linha; manter ciclos e módulos inalcançáveis como candidatos, sem gerar ou aplicar correções.
- [ ] Ampliar a análise para sugestões semânticas de bugs com evidências; as verificações atuais não são um linter nem uma análise semântica completa.
- [x] Aplicar proposta local JSON somente após exibir o diff e confirmar; limitar a um arquivo existente em `src/`, validar SHA-256, salvar backup e journal antes/depois da mudança.
- [x] Permitir desfazer a última proposta somente após exibir diff de reversão e confirmar; recusar rollback se o arquivo divergir do hash aplicado.
- [x] Não suportar exclusão, comandos arbitrários ou mudanças remotas no fluxo de autoaperfeiçoamento.
- [ ] Gerar propostas de patch revisáveis a partir das recomendações; por enquanto a análise sugere investigações, mas não inventa conteúdo de código.

## Backlog de validação e regressões

- [ ] Validar painel, relatório e feed em Android na mesma tailnet.
- [ ] Confirmar proxy do Tailscale Serve e origem HTTPS em uma instalação real do Windows.
- [x] Definir armazenamento local limitado para resumos de execuções de teste (resultado, contagens e data; até 20 execuções).
- [x] Comparar execuções consecutivas de testes e sinalizar mudança de sucesso para falha após confirmação explícita para rodar.
- [x] Definir journal separado de alterações e backups locais, sem persistir a saída dos testes no journal.
- [x] Serializar aplicações e reversões concorrentes no processo para evitar gravações perdidas no journal e propostas repetidas com hash já desatualizado.
