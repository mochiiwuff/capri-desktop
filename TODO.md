# Capri — backlog de continuação

Este backlog combina o estado verificado do repositório com os requisitos adicionais enviados em
`Pasted text #1.txt`. Itens marcados como parciais não devem ser apresentados como completos.

## Concluído e presente no código

- [x] Preservar a aplicação Electron, a personagem, os assets, os hooks, as memórias manuais e o histórico originais.
- [x] Manter a branch de trabalho `feature/capri-autonomous-learning` e uma branch local de backup da `main`.
- [x] Aprendizado de conversa local, opcional e com revisão/aceite explícito; correção, remoção, expiração e deduplicação.
- [x] Aprendizado de atividade opt-in com metadados agregados de processo, sem títulos de janela, teclas ou clipboard.
- [x] Observação de tela sob consentimento, com pausa/revogação, exclusões locais e captura temporária.
- [x] Painel remoto autenticado e limitado; acesso externo depende de proxy Tailscale configurado pelo usuário.
- [x] Autoaperfeiçoamento local delimitado: análise, testes com confirmação e patches revisados, respaldados e reversíveis.
- [x] Discord opt-in: token cifrado via `safeStorage`, allowlists explícitas de usuários/canais, comandos fechados, respostas limitadas e desconexão no tray.
- [x] Implementar webhook local WhatsApp Business com desafio, HMAC, limite de payload, allowlist e roteamento restrito; bind somente loopback.
- [x] Guardar segredos WhatsApp com `safeStorage` e fornecer conexão/desconexão via IPC; serviço fica opt-in e não abre portas públicas.
- [x] Criar configuração guiada WhatsApp na bandeja e documentar o proxy HTTPS; a Meta exige endpoint alcançável pelo usuário.
- [ ] Validar WhatsApp e Discord com contas autorizadas reais; mocks não comprovam a integração externa.
- [x] Atualizar documentação do estado atual sem afirmar que integrações não testadas estão prontas.

## Parcial — completar antes de declarar o recurso pronto

- [ ] Discord: validar autenticação e mensagens com um bot/servidor real autorizado; testes atuais usam mocks.
- [x] Discord: reconexão automática com backoff limitado, cancelamento em parada e tratamento sem retry para credenciais rejeitadas; validar com conta real continua pendente.
- [ ] Discord: painel de preferências de notificações, destinatários e quiet hours; entrega proativa só após opt-in e com limites/deduplicação.
- [ ] Discord: compartilhar o dispatcher/núcleo autorizado da Capri para perguntas úteis, sem transformar comandos remotos em execução irrestrita de tarefas. `memory` continua sem enviar conteúdo privado.
- [ ] Windows: consolidar o que já existe (janela ativa, lista de apps, captura autorizada, abrir/fechar e ações disponíveis) com teste ponta a ponta e confirmação por risco.
- [ ] Empacotamento: a configuração do `electron-builder` já declara NSIS e atalhos, mas ainda falta gerar e testar o instalador em ambiente Windows limpo; o nome solicitado é `Capri-Setup.exe`.

## Prioridade 1 — completar as integrações de mensagens

- [x] Implementar reconexão Discord com backoff e testá-la em interrupções, falhas de autenticação e encerramento durante conexão; validação com rede/conta real continua pendente.
- [x] Implementar webhook local WhatsApp Business Cloud API com desafio, assinatura HMAC, allowlist e roteamento de comandos autorizados; o HTTPS público deve ser encaminhado pelo usuário.
- [x] Implementar respostas a comandos recebidos pela Cloud API oficial e documentar a janela de atendimento; templates aprovados e mensagens iniciadas pela empresa não são implementados.
- [x] Criar configuração segura WhatsApp (tokens/segredos em `safeStorage` quando suportado), conexão/desconexão, porta local e allowlist.
- [ ] Integrar Discord e WhatsApp a um núcleo comum de comandos/memória/permissões, sem compartilhar conteúdo do computador ou memória sem autorização específica.
- [ ] Adicionar preferências para quiet hours, limites por hora, deduplicação e pausa global de comunicação.
- [ ] Testar integrações com serviços reais somente quando o usuário fornecer contas/credenciais autorizadas; marcar ausência de validação como **PENDENTE DE VALIDAÇÃO EXTERNA**.

## Prioridade 2 — percepção e interação autorizadas no Windows

- [x] Adicionar lista de processos excluídos do aprendizado de atividade, preservando as exclusões de app/título já existentes para análise de tela.
- [x] Adicionar lista global de processos excluídos tanto da análise de tela como do aprendizado de atividade.
- [x] Permitir limitar análise de tela e aprendizado de atividade a listas separadas de apps autorizados; lista vazia preserva o consentimento global anterior para compatibilidade.
- [ ] Completar permissões granulares por aplicativo para cada modalidade de observação e interação no Windows; listas autorizadas individuais já limitam tela e atividade, mas ações de interação ainda não têm escopo configurável por app.
- [x] Mostrar no tooltip/menu do tray quando aprendizado/observação estão ativos e oferecer interrupção imediata e pausa global que cancela capturas e preserva as permissões individuais.
- [ ] Avaliar APIs oficiais de acessibilidade/UI Automation para identificar controles visíveis; usar captura/OCR somente com consentimento explícito. Não implementar keylogging, leitura oculta, extração de sessões/tokens ou vigilância de clipboard.
- [ ] Permitir resumir mensagens visíveis em apps que o usuário autorizou, separando conversas e mantendo o escopo do conteúdo limitado ao que foi permitido.
- [ ] Preparar respostas sem enviá-las automaticamente; exigir confirmação antes de enviar/publicar, excluir, comprar/pagar, alterar configurações importantes ou executar ações sensíveis/irreversíveis.
- [ ] Desenvolver níveis de autorização observação, assistida e autonomia limitada; autonomia apenas para ações de baixo risco previamente autorizadas.
- [ ] Adicionar verificação observável do resultado de ações e registro local mínimo de ações relevantes, sem salvar conteúdo sensível desnecessário.
- [ ] Integrar contexto de apps/projetos à memória existente apenas após autorização e revisão; distinguir fatos confirmados de inferências e permitir correção/exclusão.
- [ ] Testar permissões negadas, apps bloqueados, janelas privadas/sensíveis, mudança de foco, interrupção e retomada.

## Prioridade 3 — instalador, atualização e distribuição Windows

- [ ] Gerar o instalador NSIS para Windows 10/11 com o nome final `Capri-Setup.exe`, dependências incluídas e atalhos do Menu Iniciar/área de trabalho.
- [ ] Validar instalação, inicialização, opção de iniciar com Windows, preservação de configurações/memórias e desinstalação em ambiente limpo sem VS Code/ambiente de desenvolvimento.
- [ ] Avaliar versão portátil sem comprometer armazenamento seguro de segredos nem persistência dos dados.
- [ ] Implementar verificação de atualização que apenas informe o usuário; exigir autorização antes de baixar/instalar e preservar dados locais.
- [ ] Projetar recuperação/rollback de versão e testar atualização e desinstalação sem apagar dados pessoais inadvertidamente.
- [ ] Publicar instalador em GitHub Releases somente após testes, revisão e autorização explícita; nunca publicar credenciais ou dados privados.

## Prioridade 4 — testes, auditoria e entrega

- [ ] Expandir testes de consentimento, pausa/retomada, limpeza de notas aceitas, persistência após reiniciar e preservação do fluxo original.
- [ ] Adicionar testes de integração para falhas de rede/reconexão, negação de permissões, recebimento/envio com mocks e regras de autorização.
- [ ] Executar testes reais de Discord/WhatsApp quando disponíveis e registrar dependências externas como pendentes, sem simular aprovação.
- [ ] Fazer regressão funcional da personagem, interface, animações, voz, memória, hooks e funções originais em Windows.
- [ ] Auditar instalador, permissões, armazenamento de dados e ausência de credenciais embutidas.
- [ ] Gerar `FINAL_AUDIT.md` ao concluir a implementação, com estados APROVADO/PARCIAL/PENDENTE/REPROVADO, resultados reais, limitações, compatibilidade, caminho e SHA-256 do instalador, versão e commit.
- [ ] Validar o painel remoto em Android/dispositivo autorizado e Tailscale Serve; isso permanece pendente de acesso ao dispositivo/conta.

## Bloqueios de publicação e continuidade

- [ ] Autenticar o GitHub e publicar a branch apenas em `feature/capri-autonomous-learning`; verificar o SHA remoto após o push. Nunca enviar para `main` nem force-push.
- [ ] No último estado conferido, `origin/feature/capri-autonomous-learning` permanece em `c9858d1`; os commits locais `8b7b6de` e `9f056cb` ainda não foram publicados.
- [ ] Depois de cada etapa, atualizar `PROGRESS.md`, `CHANGELOG.md`, `ARCHITECTURE.md` e este backlog; registrar o próximo passo verificável.
