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
- Adicionados testes HTTP locais para desafio, assinatura, remetentes autorizados, JSON inválido, limite de corpo e parada do serviço; nenhuma credencial real foi usada.

## Trabalho anterior nesta branch

- Documentada a arquitetura original da Capri e os pontos de extensão.
- Adicionado aprendizado local e opcional de conversa com declarações explícitas, classificação, revisão antes de aceitar, correção, duplicatas, expiração e remoção.
- Adicionadas salvaguardas heurísticas contra salvar conteúdo sensível e contra persistir turnos novos potencialmente sensíveis no histórico.
