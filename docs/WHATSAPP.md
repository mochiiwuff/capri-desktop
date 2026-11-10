# Configuração do WhatsApp Business Cloud API

A integração é opcional. Capri aceita somente comandos `/capri ...` de números explicitamente autorizados e
envia respostas pela Cloud API oficial. Não envia notificações espontâneas nem cria túnel ou listener público.

## Pré-requisitos

- Uma aplicação Meta com o produto WhatsApp configurado e um número habilitado para a Cloud API.
- O token de acesso, o `Phone Number ID` e o segredo do aplicativo Meta.
- Um token de verificação criado por você.
- Um endpoint HTTPS público configurado por você que encaminhe `GET` e `POST /webhook` para a porta local
  escolhida, em `127.0.0.1`. Capri não configura nem publica esse proxy.

## Configuração na Capri

1. Abra o menu da bandeja da Capri → **Mensagens externas** → **Configurar WhatsApp…**.
2. Informe o token de acesso, o segredo do app, o token de verificação, o `Phone Number ID`, os números
   internacionais autorizados (separados por vírgula) e a porta local.
3. Os três segredos são cifrados com o armazenamento seguro do Electron/Windows (`safeStorage`). Se o
   armazenamento seguro não estiver disponível, a configuração é recusada.
4. Configure seu proxy HTTPS para encaminhar o caminho `/webhook` à URL local indicada pela Capri. Use TLS
   válido, não exponha o listener local diretamente e limite o acesso ao proxy sempre que possível.
5. No painel Webhooks da Meta, informe a URL HTTPS pública terminada em `/webhook`, o mesmo token de
   verificação e assine o campo de mensagens. A Meta fará o desafio GET; Capri também verifica a assinatura
   HMAC-SHA256 de cada corpo POST.

O webhook local rejeita origens de bind que não sejam loopback, payloads acima de 256 KiB, assinaturas
inválidas, números fora da allowlist e mensagens que não sejam comandos suportados. A configuração pode ser
interrompida em **Mensagens externas** → **Desconectar WhatsApp**.

## Regras e limitações

- O app e o número devem cumprir os requisitos de elegibilidade, análise e verificação da Meta.
- Respostas a mensagens recebidas devem respeitar a janela de atendimento do WhatsApp. Mensagens iniciadas
  pela empresa fora dessa janela exigem templates aprovados; Capri não oferece envio proativo nem gerenciamento
  de templates.
- Os testes locais usam servidor e API simulados. A configuração, o proxy HTTPS e o fluxo ponta a ponta ainda
  precisam ser validados com uma conta Meta autorizada.
- Não compartilhe tokens. A configuração fica no processo principal e não é retornada à interface.
