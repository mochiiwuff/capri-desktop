# Changelog

## Não lançado

- Reconciliada a branch de desenvolvimento com os recursos já implementados na `main` da cópia de trabalho: aprendizado por atividade, controles de privacidade de tela, painel remoto e autoaperfeiçoamento local delimitado.
- Unificado o controle de consentimento: aprendizado de conversa e atividade começam desligados e o controle de aprendizado da bandeja também governa os controles remotos de pausa/retomada.
- Removida a ingestão automática de conversa sem revisão; somente notas aceitas pela pessoa aparecem como fatos aprendidos nos painéis.
- Limpar aprendizado também remove notas de conversa aceitas, sem apagar memórias manuais ou histórico de chat.
- Atualizada a documentação de arquitetura, progresso e prioridades com os recursos existentes e as integrações ainda pendentes.
- Discord e WhatsApp Business Cloud API ainda não estão implementados.
- Adicionadas primitivas sem conexão externa para Discord Bot API/Gateway e WhatsApp Cloud API: comandos fechados, autorização por usuário/canal, allowlist de menções Discord, validação de assinatura webhook WhatsApp, quiet hours, deduplicação e limites de envio.
- Documentados os pré-requisitos oficiais e deixado explícito que credenciais, UI, webhook público e entrega não estão conectados ao aplicativo.
- Integrado Discord ao app com configuração secreta, token protegido pelo `safeStorage` do Windows, allowlists explícitas, respostas apenas a comandos autorizados, limite/antirrepetição, estado no tray e desconexão imediata.
- Adicionadas ações Discord `status`, `pause`, `resume`, `memory`, `projects`, `report` e `update`; `memory` só expõe contagens, e `update` não executa código remoto.
- Mantida a integração desligada por padrão; o fluxo não envia notificações espontâneas. WhatsApp continua sem endpoint público ou configuração no app.
- Incorporados ao `TODO.md` os requisitos adicionais de automação/acessibilidade do Windows, níveis de autorização, núcleo compartilhado Discord/WhatsApp, instalador/atualizações e auditoria final; itens existentes foram distinguidos de trabalho parcial e pendente.
- Adicionada reconexão Discord com backoff exponencial limitado, cancelamento em desconexão manual e interrupção de tentativas após rejeição de credenciais; adicionados testes para queda transitória, cancelamento durante conexão e credenciais inválidas.
- Implementado webhook local WhatsApp Business opt-in com desafio Meta, validação HMAC do corpo bruto, limite de payload, allowlist de remetentes e comandos autorizados compartilhando o handler existente.
- Adicionada configuração IPC WhatsApp com segredos cifrados via `safeStorage`, início/parada explícitos e bind exclusivo em loopback; a recepção externa ainda exige proxy HTTPS configurado pelo usuário.
- Adicionado fluxo guiado multilíngue na bandeja para credenciais e allowlist WhatsApp, mais instruções de configuração da Meta e do proxy em `docs/WHATSAPP.md`.
- Adicionada lista local de exclusão por aplicativo para o aprendizado de atividade, editável pelo menu da Capri; os processos bloqueados são filtrados antes do registro e títulos de janela continuam fora desse fluxo.
- Adicionada lista global opt-in de exclusão de aplicativos, aplicada à análise de tela e ao aprendizado de atividade, com cancelamento de capturas em andamento quando necessário.
- Corrigidos o tratamento IPC da lista de exclusão de atividade e a localização dos textos do fluxo guiado, garantindo que as configurações sejam normalizadas e exibidas corretamente.
- Adicionada pausa global de privacidade: bloqueia aprendizado de conversa, atividade e análise de tela, cancela capturas pendentes sem apagar consentimentos individuais e mostra o estado no tray; o painel remoto autenticado também oferece pausa/retomada.
- Adicionadas listas de apps autorizados separadas para observação de tela e aprendizado de atividade; uma lista preenchida aplica correspondência exata de processos, enquanto exclusões e consentimento global continuam prevalecendo.
- Desativado por padrão o fechamento automático de páginas de outras IAs; valores legados não contam como autorização explícita e a opção precisa ser habilitada no menu da bandeja.
- Adicionados testes HTTP locais para desafio, assinatura, remetentes autorizados, JSON inválido, limite de corpo e parada do serviço; nenhuma credencial real foi usada.
- Adicionada lista opcional de processos autorizados para fechamento de apps, aplicada tanto à ação confirmada individual quanto ao fechamento pelo modo jogo; ações bloqueadas são informadas ao usuário e os textos estão localizados.
- Unificado e renomeado o dispatcher usado por Discord e WhatsApp, mantendo os comandos restritos, permissões por plataforma, respostas e limite/deduplicação compartilhados; adicionada regressão que comprova a política comum entre canais.
- Implementadas notificações de desenvolvimento explicitamente opcionais para Discord e WhatsApp: textos genéricos fixos por evento, destinatário limitado ao último canal/remetente autorizado, quiet hours, limite por hora, deduplicação serializada e pausa imediata. WhatsApp só envia durante a janela de atendimento de 24 horas. Preferências e mensagens localizadas em cinco idiomas; testes cobrem autorização, privacidade do histórico, limites, pausa e entrega mockada.
- Configurado o artefato NSIS como `Capri-Setup.exe`; a compilação local x64 terminou com sucesso. Instalação limpa, SmartScreen e assinatura de código ainda não foram validados.
- Adicionada verificação manual e somente informativa de releases estáveis do GitHub pelo tray; abrir a página oficial exige clique, sem download ou execução automática. Adicionados testes para comparação de versão, metadados inválidos e localização.

## Trabalho anterior nesta branch

- Documentada a arquitetura original da Capri e os pontos de extensão.
- Adicionado aprendizado local e opcional de conversa com declarações explícitas, classificação, revisão antes de aceitar, correção, duplicatas, expiração e remoção.
- Adicionadas salvaguardas heurísticas contra salvar conteúdo sensível e contra persistir turnos novos potencialmente sensíveis no histórico.
