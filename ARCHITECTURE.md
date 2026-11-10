# Arquitetura da Capri

## Visão geral

Capri é o aplicativo Electron existente, com um processo principal que integra Windows e serviços, um renderer que compõe a personagem e a interface, e módulos locais para configuração, chat e extensões. Esta branch amplia esses componentes; não substitui a personagem, os assets, os hooks ou o fluxo original do chat.

## Componentes originais

- `src/main/main.js`: ciclo de vida do Electron, bandeja, janelas, IPC, integrações com o Windows e operações locais.
- `src/main/config.js`: configurações persistidas em `userData/config.json`.
- `src/main/llm.js`, `src/main/ollama.js` e `src/main/setup.js`: seleção e configuração do provedor de chat. Chaves permanecem no processo principal.
- `src/main/bridge.js`, `hooks/` e `scripts/install-*.js`: eventos dos hooks existentes de Claude Code, Codex e Antigravity.
- `src/renderer/index.html` e `src/renderer/js/app.js`: entrada e composição da interface.
- `src/renderer/js/brain.js`, `mission.js`, `bond.js`, `chat.js`, `capri.js`, `acting.js`, `sprite.js` e `voice.js`: eventos, progresso, vínculo, chat e comportamento visual/sonoro da Capri.
- `src/renderer/js/custom.js`: nome, persona, falas e memórias adicionadas manualmente.
- `src/renderer/js/look.js`, `src/main/windows.js` e `src/main/windows.ps1`: contexto de tela autorizado e metadados do Windows.
- `assets/capri/`, `assets/icons/` e `docs/`: arte, ícones e imagens existentes.
- `src/main/memory.json` (sob `userData`): histórico e sessão do chat existentes, separados da configuração e das memórias manuais.

## Aprendizado, consentimento e dados

- `learningEnabled` começa desativado. A bandeja ativa/desativa propostas de aprendizado de conversa; cada nota só é gravada após a pessoa aceitar a proposta apresentada no chat.
- `src/renderer/js/learning.js` classifica declarações explícitas, rejeita padrões sensíveis conhecidos, evita duplicatas e oferece correção, remoção, expiração e limite de armazenamento. O classificador é heurístico e não garante detectar toda informação sensível.
- As notas aceitas ficam em `config.learningEntries`; a Capri as inclui no contexto do chat. Elas continuam separadas de `config.memories` e do histórico. A limpeza de aprendizado apaga notas aceitas e dados de atividade, mas preserva as memórias manuais, o histórico de chat e as configurações.
- A ingestão automática de frases em `config.learning.facts` não é acionada pelo chat. O painel local/remoto apresenta fatos de conversa aceitos, não propostas pendentes nem esse armazenamento legado.
- `activityLearning` começa desativado e exige ativação explícita na bandeja. `src/main/activity.js` mantém somente nome de processo, duração aproximada e contagens; não usa título, teclas, clipboard ou conteúdo de mensagens.
- A observação de tela usa uma permissão distinta, controles de pausa/revogação e verificações locais de listas de aplicativos e termos de título excluídos. Capturas ficam temporariamente em memória; não são armazenadas como memórias permanentes.
- `src/main/remote-control.js` serve o painel sob demanda em loopback, com token, validação de origem/host e controles restritos. O acesso pelo Android requer configuração separada do Tailscale Serve e verificação em dispositivo real; Capri não ativa nem configura a tailnet.
- `src/main/messaging.js` implementa os adaptadores oficiais Discord Bot API/Gateway e WhatsApp Business Cloud API, autorização por usuário/canal, assinatura HMAC do webhook WhatsApp, quiet hours e limites/deduplicação. `src/main/discord-service.js` liga o Discord ao ciclo de vida principal com reconexão exponencial limitada e parada após credenciais rejeitadas. `src/main/whatsapp-service.js` e `src/main/whatsapp-webhook.js` fornecem um webhook local opt-in; o renderer recebe apenas operações IPC específicas e a configuração nunca entrega segredos ou allowlists ao renderer.
- O Discord começa desligado. O token só é aceito quando `safeStorage` está disponível e é cifrado antes de ser guardado; falha ao decifrar impede a conexão. A configuração requer listas explícitas de usuários e canais. Só os comandos fechados `/capri <command>` e `!capri <command>` são processados; respostas têm limite por hora e supressão de repetição. Não há notificações espontâneas nem comandos remotos de edição/publicação de código. `pause` pausa aprendizado e observação de tela; `resume` reativa apenas o aprendizado de conversa, mantendo atividade e tela desligadas.
- WhatsApp aceita configuração IPC com segredos cifrados via `safeStorage`. O webhook vincula somente a `127.0.0.1`; receber eventos Meta pela internet exige proxy HTTPS configurado pelo usuário e encaminhado à porta local. Verifica o desafio Meta, a assinatura HMAC do corpo bruto, limita payload, aplica allowlist de remetentes e encaminha apenas comandos suportados pelo handler compartilhado. Capri não cria listener público nem túnel. Respostas usam a Cloud API oficial; notificações proativas e templates aprovados não estão integrados.

## Autoaperfeiçoamento e segurança operacional

- `src/main/self-improvement.js` inspeciona fontes/documentação localmente, executa análises estáticas delimitadas e testes selecionados após confirmação, e compara resumos de execuções.
- Propostas locais de alteração são exibidas para revisão e confirmação, restritas a arquivo existente em `src/`, verificadas por hash, respaldadas e reversíveis por journal. Aplicações concorrentes são serializadas.
- O fluxo atual não é desenvolvimento autônomo irrestrito: não executa comandos arbitrários, não publica alterações nem edita/exclui arquivos sem confirmação. Um fluxo isolado de Git com revisão, testes e autorização de publicação ainda é pendente.

## Fluxo resumido

```text
Hooks existentes ──loopback──> processo principal ──IPC──> Brain / painel
Chat ──> provedor configurado
Chat ──> classificador local ──> proposta visível ──aceite──> learningEntries
Metadados de processo ──consentimento separado──> agregados locais de atividade
Observação de tela ──permissão separada/exclusões locais──> captura temporária
Painel remoto autenticado ──loopback/proxy Tailscale configurado pelo usuário──> status/controles limitados
Comandos Discord autorizados ──token em safeStorage──> Gateway / Bot API oficial
Meta webhook ──proxy HTTPS do usuário──> loopback + allowlist/HMAC ──> Cloud API oficial
```

## Requisitos adicionados para futuras integrações

Os requisitos adicionais de controle do Windows, interação com mensagens, níveis de autorização e distribuição foram
incorporados ao backlog. O procedimento de configuração WhatsApp está em `docs/WHATSAPP.md`. Eles devem estender os módulos existentes, não substituí-los: percepção usa os pontos de
entrada `windows.js`, `look.js` e `activity.js`; ações de aplicativos passam por `apps.js`/`system.js`; permissões e
auditoria devem ser verificadas no processo principal antes de qualquer ação. Integrações de mensagens devem chamar
um dispatcher comum limitado, sem acesso a comandos arbitrários. Novos namespaces lógicos (perception,
accessibility, permissions, interaction e integrations) só devem virar módulos próprios quando houver uma
responsabilidade que não esteja coberta pelos módulos atuais.

Ainda não há automação geral por UI Automation, leitura integrada de mensagens em apps, envio remoto de mensagens
com confirmação, executor de tarefas remotas, atualização automática nem instalador validado em ambiente limpo.
O webhook WhatsApp está integrado localmente, mas requer credenciais e proxy HTTPS pelo usuário e não foi validado
com conta Meta real. O `electron-builder` já declara instalador NSIS e atalhos, mas a geração e validação do artefato
solicitado (`Capri-Setup.exe`) continuam pendentes.

## Compatibilidade e verificação

Novos dados são aditivos; o histórico, as memórias manuais, o personagem, os assets e os hooks originais são preservados. Os testes Node existentes estão em `tests/`; a suite completa deve ser executada após resolver alterações da branch.
