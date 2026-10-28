**Português (Brasil)** · [Português (Portugal)](README.pt-PT.md) · [English](README.md) · [Español](README.es.md) · [Français](README.fr.md) · [Русский](README.ru.md)

# Capri

A Capri, o constructo *Project Capricorn* de *Cyberpunk: Edgerunners*, vive na área de trabalho e acompanha o que seus assistentes de programação estão fazendo: Claude Code, Codex e Antigravity. Ela se teletransporta, reage às tarefas, avisa quando precisa da sua autorização e comemora quando termina.

![Capri avisando que uma tarefa terminou](docs/done.png)

## O que ela faz

- Acompanha eventos do Claude Code, Codex, Antigravity e OpenCode pelas integrações correspondentes.
- Mostra atividades, pedidos de autorização, erros e resumos na área de trabalho.
- Permite conversar por texto ou voz. A transcrição de voz usa Whisper localmente no PC.
- Pode pesquisar na Web, consultar notas do Obsidian e controlar uma janela dedicada do Brave.
- Tem animações, sons e comentários visuais de gameplay opcionais.

## Instalação rápida — Windows

1. Baixe o instalador mais recente na página de [Releases](https://github.com/mochiiwuff/capri-desktop/releases).
2. Instale e inicie a Capri.
3. Escolha a integração no menu da personagem e reinicie o assistente de programação para carregar os hooks.
4. Para conversar com a Capri, escolha um modelo no menu **Modelo de IA**. Provedores online precisam de uma chave de API; o Ollama funciona localmente.

## Executar a partir do código

Requer Node.js 20 ou superior.

```bash
git clone https://github.com/mochiiwuff/capri-desktop.git
cd capri-desktop
npm install
npm run dev
```

Para criar o instalador do Windows, execute `npm run dist`. Para testar a demonstração sem conectar um assistente, use `npm run demo`.

## Voz, tela e privacidade

- A transcrição de voz é feita no PC com Whisper; o áudio não é enviado a um serviço de voz online.
- O envio de capturas de tela para um modelo na nuvem exige autorização separada e vem desativado por padrão.
- O modo de comentários de gameplay é opcional e vem desligado por padrão.
- A integração do Brave usa uma extensão local. O conteúdo de páginas e resultados de busca é tratado como dado não confiável.
- Consulte [O que sai do seu PC](README.md#what-leaves-your-machine) para saber quais dados cada integração envia.

## Testes e desenvolvimento

```bash
npm test
npm run test:voice
npm run test:browser
npm run test:evolution
```

O acompanhamento de janelas está disponível apenas no Windows. No macOS e Linux, a Capri continua flutuando e animando na área de trabalho.

## Documentação completa

O [README em inglês](README.md) e o [README em francês](README.fr.md) trazem os detalhes das integrações, opções, sons, segurança, perguntas frequentes, arte e arquitetura.

## Créditos e direitos

A Capri é uma personagem de fã inspirada em *Cyberpunk: Edgerunners*. Este projeto não é oficial nem afiliado à CD PROJEKT RED. Consulte a seção de créditos e direitos no [README principal](README.md#credits-and-rights).
