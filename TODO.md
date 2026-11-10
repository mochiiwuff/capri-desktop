# Continuação do desenvolvimento

## Concluído e presente no código

- [x] Inspecionar e documentar a arquitetura original; preservar o aplicativo Electron, a personagem, as memórias manuais, o histórico, os hooks e os assets.
- [x] Criar uma branch de backup local da `main` e continuar na branch `feature/capri-autonomous-learning`.
- [x] Aprendizado de conversa local, opcional e com revisão/aceite explícito; suporte a correção, remoção, expiração e deduplicação.
- [x] Excluir conteúdo sensível conhecido dos candidatos e evitar gravar turnos potencialmente sensíveis novos no histórico; os detectores são heurísticos.
- [x] Atividade do Windows opt-in baseada somente no processo em primeiro plano e duração aproximada, sem título, teclas, clipboard ou conteúdo.
- [x] Permissão e controles de pausa/revogação para observação de tela, com exclusões locais e capturas temporárias.
- [x] Painel remoto autenticado sob demanda, com controles limitados e acesso externo apenas por proxy Tailscale configurado pelo usuário.
- [x] Análise local delimitada, execução confirmada de testes e aplicação/reversão confirmadas de patches locais com backup, hash e journal.
- [x] Unificar consentimento e status entre controles da bandeja e controles remotos; exibir como aprendidas apenas as notas de conversa aceitas.
- [x] Fazer a limpeza de aprendizado remover notas aceitas e agregados de atividade, preservando memórias manuais, histórico e preferências.
- [x] Atualizar a arquitetura, o progresso e este backlog para refletir o estado real do código.

## Próximas etapas prioritárias

- [x] Executar testes completos e verificações de sintaxe; revisar a mesclagem e registrar o commit de integração (`4ad853b`).
- [ ] Autenticar o GitHub neste ambiente, enviar a branch para o fork e verificar o SHA remoto. O push de `ba346af` sem credenciais falhou; não enviar para `main`.
- [ ] Validar painel e controles em um Android autenticado na mesma tailnet; confirmar configuração e limites do Tailscale Serve.
- [x] Adicionar base isolada e testada para Discord Bot API/Gateway, WhatsApp Business Cloud API, allowlists, comandos restritos, horário silencioso, deduplicação, limites e verificação de assinatura webhook.
- [ ] Integrar os transportes Discord ao ciclo de vida IPC/tray; implementar configuração segura de token, usuário/canal autorizados, envio/recebimento e controles visíveis de conexão.
- [ ] Implementar servidor HTTPS/webhook WhatsApp com desafio de verificação, validação de assinatura sobre o corpo bruto e roteamento de mensagens autorizadas; documentar verificação empresarial e templates oficiais.
- [ ] Criar controles desktop para destinatários autorizados e preferências de comunicação; manter envio externo desativado por padrão e oferecer pausa/desconexão imediata.
- [ ] Acrescentar testes focados para limpeza de notas aceitas, consentimento global, pausa/retomada e preservação do fluxo original da Capri.
- [x] Documentar a instalação Windows/limites atuais e os pré-requisitos das integrações oficiais sem afirmar que já podem ser configuradas.
