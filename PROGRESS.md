# Progresso da evolução da Capri

## Etapa inicial concluída

- Revisão do repositório original e dos pontos de integração mais sensíveis.
- Identificação do fluxo principal: Electron + renderer + hooks + memória local.
- Criação de um módulo local de aprendizado comportamental para conversas.

## O que foi implementado

- `src/main/learning.js`: extração de fatos e preferências a partir da conversa do usuário.
- `src/main/config.js`: persistência do estado `learning` no config local.
- `src/preload.js` e `src/main/main.js`: IPC para ler e gravar o estado de aprendizado.
- `src/renderer/js/chat.js`: a conversa do usuário dispara ingestão automática de informações relevantes.
- `src/main/activity.js`: rastreio opcional de apps e rotinas, desligado por padrão e limitado a nomes de processos.
- `src/main/main.js`: coleta em amostras temporizadas de 15 segundos, apenas após ativação explícita no menu da bandeja.
- `src/main/windows.ps1`: fornece o nome do processo em primeiro plano sem expor títulos à memória de atividade.
- O item “Memória aprendida” no menu da bandeja mostra fatos, apps, duração aproximada e rotinas; a remoção de todo o aprendizado exige confirmação e preserva histórico de chat e configurações.
- Contexto de tela: captura manual/automática exige autorização, mostra um indicador durante a análise, pode ser interrompido, pausado ou ter a autorização revogada; apps e termos de título excluídos são verificados localmente antes de capturar/transmitir.
- Controle remoto: painel web responsivo autenticado com status, memórias autorizadas e ações limitadas para pausar/retomar aprendizado e observação. O listener permanece local e sob demanda; o app aceita proxy HTTPS do Tailscale Serve em `*.ts.net` e o painel compõe um link Android com token privado. O painel também mostra relatório agregado e feed em memória das ações remotas, sem push externo.
- Autoaperfeiçoamento inicial: a bandeja permite inspecionar documentação/backlog e inventário local em modo somente leitura, ou confirmar a execução dos testes locais com tempo e saída limitados. Nenhuma escrita ou exclusão automática é suportada.
- Análise estática inicial: verifica sintaxe Node, imports relativos estáticos, ciclos, módulos inalcançáveis das raízes conhecidas e comentários TODO/FIXME/XXX/HACK nos arquivos JavaScript de `src/`; ciclos e módulos não alcançados são candidatos para revisão manual, não defeitos confirmados.
- Comparação de execuções de teste: com confirmação prévia, grava localmente apenas resultado/contagens/data e retém até 20 execuções; a interface aponta mudanças entre execução aprovada e falha.
- Alterações reversíveis: o usuário pode selecionar uma proposta JSON local; a Capri exibe o diff e pede confirmação, restringe a escrita a um arquivo existente em `src/`, valida hash, cria backup/journal e oferece reversão confirmada com validação de integridade.
- Sugestões baseadas em evidências: os resultados da análise de sintaxe, imports, ciclos, marcadores e alcançabilidade viram passos de investigação localizados e associados a arquivos/linhas, sem correções automáticas ou conclusão de que candidatos estáticos são bugs.
- Concorrência do autoaperfeiçoamento: operações de aplicar/reverter são serializadas no processo por journal; o segundo patch concorrente revalida o hash e não sobrescreve uma aplicação anterior nem perde sua entrada no journal.

## Próximo passo

- Validar o acesso pelo Android com Capri e Tailscale instalados na mesma tailnet.
- Integrar geração de propostas às análises com evidências; atualmente só propostas preparadas localmente podem ser revisadas, e a ferramenta não as inventa automaticamente.
- Expandir a análise para encontrar bugs semânticos com evidências e, separadamente, avaliar geração de propostas de patch sem inventar correções inseguras; toda alteração continua limitada a revisão, confirmação e reversão locais.
