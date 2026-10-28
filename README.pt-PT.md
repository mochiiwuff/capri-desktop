**Português (Portugal)** · [Português (Brasil)](README.pt-BR.md) · [English](README.md) · [Español](README.es.md) · [Français](README.fr.md) · [Русский](README.ru.md)

# Capri

A Capri, o constructo *Project Capricorn* de *Cyberpunk: Edgerunners*, vive no ambiente de trabalho e acompanha o que os teus assistentes de programação estão a fazer: Claude Code, Codex e Antigravity. Teletransporta-se, reage às tarefas, avisa quando precisa da tua autorização e celebra quando termina.

![A Capri a anunciar que uma tarefa terminou](docs/done.png)

## O que faz

- Acompanha eventos do Claude Code, Codex, Antigravity e OpenCode através das respetivas integrações.
- Mostra atividade, pedidos de autorização, erros e resumos no ambiente de trabalho.
- Permite conversar por texto ou voz. A transcrição de voz usa Whisper localmente no PC.
- Pode pesquisar na Web, consultar notas do Obsidian e controlar uma janela dedicada do Brave.
- Tem animações, sons e comentários visuais de jogo opcionais.

## Instalação rápida — Windows

1. Descarrega o instalador mais recente na página [Releases](https://github.com/mochiiwuff/capri-desktop/releases).
2. Instala e inicia a Capri.
3. Escolhe a integração no menu da personagem e reinicia o assistente de programação para carregar os hooks.
4. Para falar com a Capri, escolhe um modelo no menu **Modelo de IA**. Os fornecedores online precisam de uma chave API; o Ollama funciona localmente.

## Executar a partir do código

Requer Node.js 20 ou superior.

```bash
git clone https://github.com/mochiiwuff/capri-desktop.git
cd capri-desktop
npm install
npm run dev
```

Para criar o instalador Windows, executa `npm run dist`. Para executar a demonstração sem ligar um assistente, usa `npm run demo`.

## Voz, ecrã e privacidade

- A transcrição de voz é feita no PC com Whisper; o áudio não é enviado para um serviço de voz online.
- O envio de capturas de ecrã para um modelo na nuvem requer autorização separada. Desativado por predefinição.
- O modo de comentários de jogo é opcional e desligado por predefinição.
- A integração do Brave usa uma extensão local. O conteúdo de páginas e resultados de pesquisa é tratado como dado não fiável.
- Consulta [O que sai do teu PC](README.md#what-leaves-your-machine) para conhecer os dados enviados por cada integração.

## Testes e desenvolvimento

```bash
npm test
npm run test:voice
npm run test:browser
npm run test:evolution
```

O acompanhamento de janelas está disponível apenas no Windows. No macOS e Linux, a Capri continua a flutuar e a animar no ambiente de trabalho.

## Documentação completa

O [README em inglês](README.md) e o [README em francês](README.fr.md) incluem os detalhes das integrações, opções, sons, segurança, perguntas frequentes, arte e arquitetura.

## Créditos e direitos

A Capri é uma personagem de fã inspirada em *Cyberpunk: Edgerunners*. Este projeto não é oficial nem afiliado à CD PROJEKT RED. Consulta a secção de créditos e direitos no [README principal](README.md#credits-and-rights).
