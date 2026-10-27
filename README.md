**English** · [Français](README.fr.md)

# Capri

Capri, the *Project Capricorn* construct from Cyberpunk: Edgerunners season 2, lives on your desktop
and tells you what your coding AI is up to: **Claude Code**, **Codex** or **Antigravity**. She teleports,
glitches, comments on every action, comes to find you when it needs your permission, and loses it when the job is done.

![Capri telling you Claude is done](docs/done.png)

![Teleport, frame by frame](docs/teleport.png)

## What she does

- **When she starts**: she grabs your screen. Its edges crackle red, her left hand slams onto its edge, then her
  right, her arms reach in along them as she hauls herself up, and her face hits the glass (a white flash, an ink
  one, her colours apart, the screen shaking). She looks around, blinks, opens her mouth wide on "hi" (a tag pops
  by her face, her name typed under it), lets go of the right edge to wave at you with her clawed hand, grabs it
  again, glances at where she's going, and lets go: her arms break into shards from her hands in, and her head
  crouches and dives down to her spot, where her body unfolds from her face.

  ![Her intro: her hands on the edges, her face hitting the glass, the wave, holding on again](docs/intro.png)

- **While Claude works**: a ticker over her head shows the current action
  (`EDITS gigs.ts`, `RUNS npm test`, `GREPS "paginate"`…) and she sheds little data glyphs.
  When Claude runs a command or goes on the web, red sparks fly off her fingers; sitting on a window,
  she jacks into it and the lightning runs along its edge.
- **When Claude goes quiet mid-task** (thinking it over, or a slow local model): after 15 seconds the ticker turns
  violet and counts the seconds (`THINKING… 45 s`), and she keeps herself busy (a spin, a look around, the satellite
  once). After 40 seconds she says something about it; after two minutes she tells you nothing's stuck.
- **When Claude needs you** (permission, question): she teleports next to your mouse, mane bristling, and won't let it go.
  If you're on another window, she goes to Claude's window instead and points at it with her finger (a dashed line,
  brackets on its corners, `CLAUDE` on a tag): that's where the question is. She stops once you've answered.
- **When a command fails**: red impact frame, she gets knocked back, heavy glitch, and the error line that actually matters.
- **When it's done**: she teleports to the middle of the screen and goes into her victory sequence:
  a wind-up with her mane pulled in, a stretched smear frame, then arms flung up and mane exploding under
  manga speed lines and a shockwave, a manic laugh with an anime cut-in of her grin. Once she's back down,
  the summary (`12 actions · 3 files changed · 2m 14s`) and Claude's last sentence.
- **When Claude answers and you're on another window**: she shows you its whole answer, in a wider panel that
  scrolls (paragraphs, lists and code kept). It goes away when you're back on Claude's window, or when you click it.
  Claude's window is the one you typed your prompt in. Windows only, like the window tracking.
- **The rest of the time**: she floats, her mane sways and sheds shards, she drifts from one corner to another,
  turns around and cocks her head when your mouse comes near (or, little menace, zaps it with red lightning and a sly grin),
  looks up at the satellite, and falls asleep after 10 quiet minutes.
- **When she sleeps**: she dozes a while, then her mane and her body come apart and all that's left is what she is at
  heart in the show, her green mask and her eyes, floating where she was, eyes shut. Now and then she cracks one open.
  Bring your mouse close (or let Claude start again) and her blue eyes snap open and she comes back together around it.
- **The satellite**: the big sequence, kept for moments that matter. The first time of the day, a little while after
  Claude finishes a long job (8 minutes or more, or 50 actions), or whenever you like from the tray menu.
  The white specks of her mane lift off as a constellation, line up into a road from her fingers to the satellite,
  she coils up, and the red light goes up to it. It answers her, twinkling twice.

![Victory: the key pose, then the laugh and the cut-in](docs/victory.png)

![The satellite: her stars, the road, the red light, the answer](docs/star.png)

### She gets around

- **She sits on your windows**: perched on the top edge of a window, legs dangling and kicking one after the other.
  She rides along when you move the window, and falls off when you close, minimize or cover it.
  While Claude works she settles on the window in front if she can.
- **She peeks in from the edges of the screen**: half hidden on the left or right, or hanging upside down from the top.
  She's shy: get your mouse close and she ducks away to another edge.
- **She falls**: stretched, mane blown up, accelerating, then a big squash and a shower of shards when she lands.
  On the way down, a window ledge can catch her.
- **Drop her on a window**: drag her and let go with her hips on a window's top edge, she sits there.
  Let go anywhere else and she falls.
- **She possesses your windows**, like in the show where she slips into bodies and systems: now and then she dives
  into the window she's sitting on. Red lightning races round its frame, slices of it glitch, and the window looks
  at you with her eyes and her zigzag grin, more eyes opening all over it, every pupil on your pointer, and she laughs.
  Then she comes out of another window. Nothing is drawn over the windows in front of it, and the window's contents
  are never read: it's just drawn over, for two seconds. If it bothers you, untick *Possess my windows* in the tray menu.
- **Little flourishes**: a full spin with afterimages, a hop, looking left and right, the cocked head,
  and the other minds in her (her green and red copies) pulling away from her, hanging there, and snapping back in.

![Sitting on a window](docs/sit.png)

![Peeking in from the edges](docs/peek.png)

![Possessing a window: the dive, the hit, the window full of eyes](docs/possess.png)

![Asleep down to her mask, waking up, and put away bottom left](docs/sleep.png)

Window tracking is Windows-only for now (a tiny PowerShell helper reads window positions, no titles, no contents).
On macOS and Linux she still floats, peeks, falls and wanders.

### She shows you around

**How does it work?** in her menu: she asks what to show you, then takes you there and points at it. Her head snaps
to it, she coils up leaning away, then strikes: her construct arm shoots out at it to twice its length, red lightning
off her fingertip, a reticle slams onto it with two of her eyes opening on its corners, and a close-up of her eyes cuts
in. Then she holds it while she explains, a wire of data running from her finger to it: now and then she jabs at it,
or glances back at you. When she's done, the wire reels back into her finger and the arm snaps back.

![The strike, and the hold while she explains](docs/point.png)

- **Where's my icon?** She goes down by the clock and points at her tray icon, or at the **^** when Windows hides it.
- **Where's Claude?** She points at Claude's window: the one you typed your last prompt in.
- **Claude's folder**: she opens `~/.claude` in Explorer with `settings.json` selected, points at the window, and
  explains what her hook in there is and how to take it out.
- **Plug me into Claude**: her hooks in one click. It's also her welcome the first time she starts. Next to it,
  **Free with Ollama** runs Claude Code (or Codex) through Ollama for you: her hooks go in, Ollama gets installed if it
  isn't, and a window opens on `ollama launch claude`, where you pick a model.
- **Talk to me**: see "Talk to her" below.

She pulls faces while she talks: eight expressions, all frames of her from the show (watching, turned away, the fang
grin, eyes gone round, looking right at you, laughing with her mouth wide open, all her eyes at once, the zigzag grin).
Each message picks the one that fits, and her portrait glitches from one face to the next.

![Pointing at Claude's window during a permission prompt, and at her tray icon](docs/guide.png)

![Her eight faces](docs/faces.png)

### Her mission report

**Mission report** in her menu: a card of what Claude got through today, made to be screenshotted. Tasks finished in
big, then actions, files changed and errors, the longest mission and its project, prompts, approvals and projects. The
numbers count up. **Copy image** puts a picture of the card on your clipboard, on its own dark plate, ready to paste
anywhere. In the evening (after 6 pm), after a real day's work (3 tasks or more), she brings it to you once, on her
own. The demo doesn't count, and it stays on your PC, one day at a time.

### Talk to her

**Talk to her** in her menu (or the **Talk to me** button when you click her and nothing's going on): you type in her
panel and she answers in character. She knows what Claude is doing and what it got done today. She answers in writing
(or out loud: see "Talk to her out loud"), in her own language. Enter sends, Esc closes.

The first time, she sets it up with you, with buttons, no terminal:

- **On my PC** (free, nothing leaves your machine): she installs [Ollama](https://ollama.com) for you (with winget,
  Windows' own installer), wakes it up, and downloads a model while a bar fills up: gemma3 (3.3 GB, better in languages
  other than English) or llama3.2 (2 GB, for smaller PCs). On a tiny model (1B and under) she warns you it may talk
  nonsense and offers a better one.
- **Online, no account**: Pollinations, nothing to set up.
- **I have a key**: Groq or Gemini (both have a free tier), OpenRouter, OpenAI, Mistral or DeepSeek. You paste your
  key in her panel and she checks it. It's kept on your PC, encrypted with your Windows account, and only ever sent to
  that service.

Her menu › **AI model** lets you switch later: **Set it up with her…**, or straight to a service and a model, LM Studio
(`:1234`), llama.cpp or vLLM (`:8080`), any OpenAI-compatible server (**API key or address…**), or **Claude Code**
itself: your messages go to `claude -p` in the folder you pick, continuing one conversation, and her hooks show what it
does. In that last one, permission mode `default` only lets it read (nobody is there to say yes); `acceptEdits` lets it
edit files without asking. **Forget our conversations** clears what she remembers of your chats.

**It's AI.** Her replies are written by the model, not by the show's writers: it's a fan version of her, and the chat
panel says so every time.

**What she can do on your PC** (Windows), when you ask her in the chat:

- **Open an app or a game**: anything in your Start menu (Store apps like Spotify included), your Steam and Epic
  games ("open Spotify", "launch Brawlhalla"). Named in your own words, it opens right away; if only her AI came up
  with it, you get a button first.
- **Music**: "pause", "next", "louder", "mute"… press the media keys, so it works with Spotify and most players, right
  as you send it. "Put Daft Punk on Spotify" opens Spotify on a search for it (the app if you have it, else the site).
- **A website**: always behind a button showing where it goes.
- **Close an app** ("close AM Music", "can you shut Discord down?"): a button with the app's name, and nothing happens
  until you click it. She closes it the way its own close button does, so it can still ask you to save. If it only
  hid in the tray, she offers **Force quit**, again only on your click (unsaved work is lost then). She never closes
  Windows' own pieces, Claude, Ollama or herself. Out loud, you confirm by saying "yes".

She can also look at your screen when you ask, and talk with you out loud: see below. Nothing else: never your files.

### Straight from your words (Windows)

Ask her in her chat, or out loud: she gets the simple requests right away and does them herself, in all five of her languages, without
going through the AI (it's instant, and works even with a tiny model). For anything else, the model can ask for one
of these itself, but only when your message asked for something. Several at once works too: "set the volume to 30 and
open YouTube".

| You say | She does | Her reaction |
|---|---|---|
| "open YouTube", "go to reddit.com" | opens the page in your browser (or the app of that name, if you have it) | she flings her arm at the screen, red lightning off her fingers |
| "open a web page", "open the browser" | opens your browser | the same |
| "open my mail", "open my inbox" | your mail: Gmail, Outlook (web) or the Outlook / Mail app, picked in her menu › **My mail** | the same |
| "launch Spotify", "start Notepad", "launch Brawlhalla" | launches the app or the game (Start menu, Steam, Epic) | the same, at the taskbar |
| "search for pancake recipes", "search lofi girl on YouTube" | a Google search (or YouTube, Wikipedia, Maps, Images) | the same |
| "pause", "resume the music", "next song", "previous" | drives whatever's playing (Spotify, your browser, AM Music… anything Windows' media flyout sees) | she goes quiet with her head down, dances, or swipes the air |
| "what's this song?" | tells you the title and the artist | she leans in to listen |
| "play some Daft Punk" | looks it up in Spotify if it's installed, else on YouTube Music | she dances |
| "volume 30", "turn it up", "a bit quieter", "all the way up", "mute" | the PC's volume | a volume bar by her head; arms thrown up to turn it up, hands pushed down to turn it down |
| "turn Spotify down", "Discord volume to 20" | that app's slider in Windows' volume mixer | the same, with the app's name |

If she can't find an app or a site by the name you said, she tells you and offers to look it up on the web (a button,
or "yes" out loud).

What she never does: touch your files, your settings or your messages. An app is only launched if it's in your Start
menu (or a Steam / Epic game), and a page only opens over `http(s)`.

And without asking her anything:
- **The wheel** over her turns the volume (a bar shows by her head), **a middle click** pauses or resumes your music.
- **While your music plays**, she dances to it now and then (notes float off her mane), and sometimes says something
  about a new song. Her menu › **Move to my music** to calm her down.

### She looks at your screen (when you ask)

"Look at my screen", "what do you see?", or her menu › **Look at my screen**: her head snaps up, a close-up of her eyes,
a red line runs down the whole screen and its corners lock on, then she tells you what she sees and comments on it,
in character.

- **Your permission first.** By default she asks every time (**Always**, **Just this once**, **No**, or "yes" out
  loud). Her menu › **See my screen when I ask** lets her look without asking. She never looks on her own, unless you
  turn on the option below.
- **Glances of her own** (off by default): her menu › **Comment on my screen now and then**. Every 6 to 12 minutes, at
  a quiet moment (no chat open, nothing on screen, Claude idle, her awake), she glances at your screen and says one
  short thing about it in a "PEEK" bubble. She stays vague about anything that looks private and tries not to repeat
  herself. The same single picture, the same local model, nothing saved.
- **One picture**, of the screen she's on, taken when you ask, without her on it, handed to the local model and then
  thrown away. Nothing is saved.
- **It needs a model that sees** pictures, in Ollama (whatever answers her chat, Gemini or Claude Code included): `ollama pull gemma3` (about 3 GB; `llava`, `qwen2.5vl`, `minicpm-v`… work
  too). She finds it on her own; her menu › **Model that sees (Ollama)** to pick another. If your chat model sees
  pictures already, she uses it.

### Talk to her out loud

Her menu › **Talk to her out loud**, **Ctrl+Alt+V** from anywhere, or the **VOICE** button in her chat: she listens
(arcs of sound around her head, green while it's you talking), answers you **out loud**, then listens again.
Everything she can do works out loud too: "turn it down", "open YouTube", "look at my screen", and "yes" to confirm.
"Bye" or "stop", Ctrl+Alt+V or ✕ to end it; if you say nothing, she asks if you're still there, then turns the mic
off. You can still type meanwhile.

- **Her ears**: [Whisper](https://github.com/openai/whisper), a speech recognition model running **on your PC** (on
  the graphics card when there is one, through [transformers.js](https://github.com/huggingface/transformers.js)). The
  first time, she asks before downloading it from Hugging Face (about 210 MB, once). Her menu › **Her voice** ›
  **Speech recognition**: *tiny* (fastest), *base* (default), *small* (more accurate, heavier).
- **Her voice**: picked in her menu › **Her voice**, and **Read her typed answers out loud** if you want to hear her
  when you type, too.
  - **Capri's voice**: her real voice, a neural voice ([Piper](https://github.com/rhasspy/piper)) running on your PC
    and made *hers*: small, sweet and a little whispered, with the chorus of minds in her, dead stops as if her
    processor froze, a word stuttering like a scratched CD, older voices rising under hers, and saturated "Hihi!" /
    "Oops!" cut off by static. Her menu › **Her voice** › **Her glitches**: *Light*, *Creepy doll* (default),
    *Unstable construct*. The first time, she asks before downloading the voice (about 63 MB) and eSpeak-NG (18 MB,
    which reads the text for the voice): once, then it all happens on your PC. No Piper woman's voice in Portuguese:
    there, she keeps Windows'.
  - **One of Windows' own voices** (Zira, David, Mark in English…), nothing to install. It's also the one she uses
    while her own isn't there yet.
- **The microphone** is only on during a spoken conversation, and off while she talks (so she doesn't hear herself).
  Your voice never leaves your PC. If it doesn't work: Windows Settings › Privacy › Microphone › let desktop apps use it.

### Make her yours

Right-click her › **Make her yours…** (or "Make me yours" in her guide), one panel at a time, each one skippable:

- **What she calls you.** She uses it now and then, and comes online with it ("Capri online. Hi, Max.").
- **How she is**, in your words ("more teasing, and talk to me about Night City"): her chat follows it. She stays Capri.
- **Lines of yours**, that she says now and then with hers when you click her. Write `{name}` in one and she puts
  your name there.
- **Things to remember** (your favorite game, your cat, D…): her chat keeps them in mind.

In her chat, "call me Léa" and "remember that my cat is called Neko" work too. All of it stays in her settings on
your PC.

She only catches the mouse on her actual body (pixel-precise): the rest of the screen works as usual.

- **Click** her: she tells you where Claude is at (nothing going on: a **Talk to me** button, to chat with her).
- **Drag** her: move her around.
- **Wheel** over her: the volume. **Middle click**: play / pause.
- **Ctrl+Alt+V**: a spoken conversation (and Ctrl+Alt+V again to end it).
- **Click** the panel: it closes.
- **Ctrl+Alt+C**: she puts herself away (into her biochip, like in the show) and all that's left of her is her mask,
  eyes shut, in the bottom-left corner. Her eyes only open when Claude needs you. Click the mask (or Ctrl+Alt+C again)
  to bring her back.
- **Her menu**: right-click her (it's also on her tray icon, next to the clock): teleport, look at the satellite, demo,
  how it works, mission report, talk to her, talk to her out loud, look at my screen, size, sound, screen, AI model,
  see my screen, comment on my screen, model that sees, her voice, move to my music, my mail, wander, possess your windows, language, start with
  Windows, hooks.

She speaks **French, English, Spanish, Brazilian Portuguese and Russian**, and picks the language of your system on her
own. You can choose another one in her menu.

## Install

### Quick start (Windows, no coding)

1. Download **`Capri-Setup-x.y.z.exe`** from the [latest release](https://github.com/mochiiwuff/capri-desktop/releases/latest)
   and run it. It installs for your user only (no admin rights), adds a desktop shortcut and starts Capri.
   You don't need Node.js or anything else.
2. The installer isn't signed (a code-signing certificate costs money), so Windows SmartScreen may say
   "Windows protected your PC": click **More info**, then **Run anyway**.
3. Capri shows up and introduces herself. Click **Plug me in**: that connects her to Claude Code.
4. Close Claude Code completely and open it again (it reads its hooks when a session starts). As soon as Claude does
   something, she tells you **"I can see Claude!"**: that's how you know it worked.

Her menu: **right-click her**. It's also on her tray icon, which Windows 11 often hides behind the **^** next to the clock.

### What's Claude Code? Do I need it?

[Claude Code](https://code.claude.com/docs/en/quickstart) is Anthropic's coding assistant: in a terminal, in VS Code,
or in the Code tab of the Claude app. It needs a paid Claude plan (Pro or higher) or an API account. Capri only watches
it: no API key, and nothing to pay for Capri herself.

Without Claude Code she still lives on your desktop: she floats, sits on your windows, looks at the satellite, falls
asleep. You can just leave her there.

### From the source (macOS, Linux, developers)

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/mochiiwuff/capri-desktop.git
cd capri-desktop
npm install
npm start
```

Keep that terminal open while she runs. Not tested on macOS or Linux yet: she should start, but the window tricks
(sitting on your windows, possessing them, showing Claude's answer when you're elsewhere) are Windows-only, and on Linux
the transparent overlay works best on X11 (Wayland can struggle with click-through windows).

### Hook her up to Claude Code by hand

Right-click Capri, then **Install Claude Code hooks**. Or from the command line:

```bash
npm run hooks:install
```

This adds a hook to `~/.claude/settings.json` (a backup is written next to it, your existing hooks are kept).
Restart your Claude Code sessions afterwards. To remove it: `npm run hooks:uninstall`.

The hooks run `async`: they never slow Claude down, and when Capri isn't running they do nothing.

### Codex or Antigravity instead of Claude Code

Right-click her › **Watch** › **Codex** or **Antigravity**. She says hi and offers to plug herself in, like she does
for Claude Code. Then:

- **Codex**: restart it and trust her hooks when it asks. They go in `~/.codex/hooks.json`. Her hook for Codex needs
  [Node.js](https://nodejs.org) 20 or newer on your PATH.
- **Antigravity**: start a new conversation. Her hooks go in `~/.gemini/config/hooks.json`.

She follows one of them at a time, the one picked in her menu, and her lines, her guide and her chat use its name.
She only watches: when Codex or Antigravity asks for approval, you still answer it there. From the command line:
`npm run hooks:codex:install` or `npm run hooks:agy:install` (`:uninstall` to remove them), and `npm run test:hooks`
runs the tests of both adapters. **Watch** › **Nothing, just keep me company**: she stops talking about any of them.

### Try it without Claude

```bash
npm run demo
```

Replays a fake session from start to finish (reads, a web fetch, a subagent, writes, a failing test, a permission
prompt, the end), then shows everything she does on her own, a line before each trick: the other minds in her,
zapping your pointer, the whole satellite sequence, possessing a window (a little terminal opens for her, then closes
under her and she falls), sleeping down to her mask, and putting herself away in the bottom-left corner.
It's also in the tray menu, in her language; from the command line it's in English, or add one: `npm run demo -- fr`
(or `es`, `pt`, `ru`).

## Sounds

Every sound is synthesized live (Web Audio), nothing copyrighted ships with the repo.
You can drop your own files in the custom sounds folder (tray › Sound › *Open custom sounds folder*),
named like this (`.mp3`, `.wav`, `.ogg` or `.m4a`):

| File | When |
|---|---|
| `teleport-out` | she vanishes |
| `teleport-in` | she reappears |
| `done` | Claude is done |
| `alert` | Claude is waiting for your permission |
| `error` | a command failed |
| `hello` | a session starts |
| `star` | she looks up at the satellite |
| `land` | she lands after a fall |
| `rise` | the launch into her victory pose, the red light going up |
| `bolt` | her red lightning |
| `charge` | charging up before the red light goes up |
| `possess` | the window she took over laughs |
| `blip` | every syllable while she talks |
| `tick` | a quiet reminder |

## Is it safe?

- All of the code is right here. The installer is built from it with `npm run dist`; you can build your own.
- Nothing leaves your PC (see below): she only talks to Claude Code through a hook on `127.0.0.1`.
- What she changes on your system: the hook in `~/.claude/settings.json` (a backup is written first, and you can remove
  it from her menu), and a startup entry only if you tick "Start with Windows". She uninstalls like any app, from
  Windows Settings › Apps.
- What she can do when you ask: the music, the volume, launching a Start menu app, opening a web page or a search,
  closing an app (after your click or your "yes"), looking at your screen (with your permission). Nothing else: not
  your files, your settings or your messages. A small PowerShell script (`src/main/system.ps1`, read it) does these
  for her.
- The SmartScreen warning comes from the installer not being signed, not from anything it does.

## FAQ

- **Mac, Linux?** No installer yet, but you can run her from the source (see above).
- **Phone, Android?** No, she needs a desktop.
- **Other assistants?** Claude Code, Codex and Antigravity: her menu › **Watch**. Cursor, Windsurf and Gemini CLI: not yet.
- **Ollama?** Two ways. Claude Code running on a local model through Ollama (`ollama launch claude`): she sees it like
  any Claude Code, it's just slower, and her ticker counts the seconds while it thinks. And she can chat with you
  through Ollama herself: see "Talk to her".
- **She barely moves, her intro just fades in and out.** Windows has its animations turned off (Settings ›
  Accessibility › Visual effects › Animation effects), and she follows it. Her menu › **Animations** › **Full** makes
  her move anyway; the first time, she asks.
- **A black screen behind her.** Some PCs show her see-through window black (often NVIDIA cards with FXAA, MFAA or
  HDR on; other overlay apps like Desktop Mate do it too there). Right-click her, or her icon by the clock › **Display**
  › **OpenGL**: she restarts drawn another way. Still black? **Without the graphics card**, which costs a bit more CPU.
  Turning off FXAA and MFAA in the NVIDIA Control Panel can fix it as well.
- **Can I turn her off?** Ctrl+Alt+C puts her away, **Quit** in her menu closes her. Claude Code works exactly the same
  without her.
- **She only floats around and says idle things.** That's normal until Claude Code does something. If it never reacts,
  check her menu says "Claude Code hooks: installed", then close Claude Code completely and open it again.

## What leaves your machine

Nothing. The hook only keeps what the display needs (tool name, file path, command, the start of your prompt,
Claude's last message up to 6,000 characters so she can show it to you, all truncated) and sends it to `127.0.0.1` only.
Your file contents are never sent: for a write, only its size goes through.

Her chat goes to Ollama on your PC (`127.0.0.1:11434`, or `OLLAMA_HOST`) with what she knows of the moment (the
project's name, Claude's last action, today's counts). Her mission log stays in her own storage on your PC.

When you ask her to look at your screen, the picture goes to that same local Ollama, for that one answer, and is then
thrown away. In a spoken conversation, your voice is turned into words on your PC (Whisper) and never sent or saved.
The only connections out are the ones you ask for: the one-time download of the Whisper model from Hugging Face, the
one of her voice (Hugging Face for the Piper voice, jsDelivr for eSpeak-NG, each at a fixed version and checked
against its fingerprint before it's kept), always after you said yes, and the pages or searches she opens in your
browser.

## Art direction

The goal: she should feel like she stepped out of the anime, not like a widget.

- **Cel animation**: her body is redrawn 12 times a second ("on twos") like anime, 24 during teleports.
  Every drawing has a slight *boil* (the wobble of a line redrawn by hand).
- **Frame by frame, pose to pose**: nothing is tweened. Each move is an exposure sheet (`acting.js`):
  key drawings held for a few frames, an anticipation the other way, a smear frame with multiples of
  the head, an overshoot, holds. Her idle float is four drawings, not a sine wave.
- **She acts with her head and her mane**, like in the show: the cocked head, the shards bristling or
  blowing wide, the manic laugh with the head shaking on every drawing, the slump when she sleeps.
  The cut-out is rigged so her head tilts around the neck, her mane flares unevenly around a rigid face,
  and her thighs fold (foreshortened, seen from the front) so she can sit with her lower legs swinging.
- **Squash and stretch, afterimages**: the flat cut-out squashes to a sliver to turn around, stretches when
  she falls, flattens when she lands, and splits into green and red copies (the other minds in her) when she spins or laughs.
- **The satellite**, after the season's ending, where she points at the light in the sky and wonders if they
  could make it up there: a point of light crosses the top of the screen, slowly. Most of the time she just looks,
  reaches, it twinkles, she sighs. The first time of the day, and a little while after a long Claude job, it's the
  whole sequence, in five beats (and nothing distracts her meanwhile, not even your pointer):
  1. **Hush**: she freezes, and the white specks of her mane lift off into a constellation over her.
  2. **The reach**: she reaches out (the drawings bunch up as the hand gets there) and her stars line up into a road
     from her fingertips to the satellite.
  3. **Anticipation**: she coils up, the arm pulls back a little, sparks crawl in her hand, cut-in on her eyes.
  4. **The red light goes up**: a heavy tapering bolt races up in three drawings, the first one in negative (an impact
     frame), the stars light up as it passes, speed lines on the satellite, and she's lifted with it.
  5. **The answer**: the bolt snaps and the pieces fall. A beat of silence, then the satellite twinkles twice.
     Her stars come home, her mane flares bright for a moment, and her hand drops with a sigh.
- **Her arms grow when she aims**: anime exaggeration, or a raised arm would get lost in her mane. It stretches
  along its length only (it stays as thin) and no longer gets bent by the head and the mane.
- **Both arms match**: the cut-out had one arm reaching and one hanging. The hanging one is removed
  (`tools/build-sprite.py`) and the shader draws the reaching arm mirrored in its place, so both hands are the
  same claws and both arms can act. Where an arm crosses her body or her mane it gets a violet line, so it reads.
- **Her texture**: the red mane is pushed back to the show's hot red and covered in twinkling white specks.
  Shards come loose from it and drift away.
- **The violet offset**: like in the anime, a misregistered violet copy under her, under the panel, under the shards.
- **"Relic" glitch**: shifted horizontal slices and RGB split, in the spirit of Johnny Silverhand's appearances.
- **Teleport**: charge, shards, collapse into a line, and where she was, a black slit with a red line in it,
  like in the show. A red column of light to the sky, a bolt to the destination, her pieces (mane shards and the
  green stars of her eyes) spiralling back in, back with two *impact frames*.
- **Her intro**: a close-up of her, cut out so your desktop shows around her mane (`tools/build-intro.py`), in six
  drawings swapped like cels (at rest, her mouth ajar, half open and wide open for "hi", her hand tilted one way and
  the other for the wave, on threes), and everything else is animation on top: impact frames (her as a flat white then ink silhouette), an RGB split that
  settles, screen shake, the line boiling on twos, her eyes redrawn over the picture's so they can look around and
  blink, the camera creeping in, the tag slamming on. Never a straight edge of the picture on screen: it shows
  through jagged cuts that move (her arms from the sides in, then breaking off from the hands in, then just her
  head for the dive, with afterimages and her zigzag).
- **Cut-ins**: close-ups of her taken from the show, pushed in, with speed lines: her grin or her laugh after a
  finished job, all her eyes when Claude is waiting on you, her eyes right before the red light, her sideways look
  after zapping your pointer. Her face in the panel changes with what she's saying, too.
- **Her mask**: a vector drawing after the show (and the "Capri Wink Face"), on its own small canvas, only redrawn
  while on screen: the green slab of a face, the hooked spike, the white fang, the blue almond eyes,
  and the eyes shut as chevrons while she sleeps.
- **Type**: Chakra Petch (bevelled cuts, like her shards) + JetBrains Mono for data.

If Windows is set to "Show animations: off", she sticks to fades.

## How it's built

```
hooks/capri-hook.js      run by Claude Code, reads the event on stdin and posts it to the app
scripts/install-hooks.js adds / removes the hook in ~/.claude/settings.json
tools/build-sprite.py    rebuilds the sprite from the original cut-out (Python + Pillow, only if you change it)
tools/build-cutins.py    cuts the cut-ins and her faces out of frames of the show
tools/build-intro.py     cuts her intro's close-ups out of their background, all the same way
src/main/                Electron: full-screen transparent click-through window, tray, local HTTP bridge
  windows.js / .ps1      where the other windows are (Windows only), so she can sit on them
  ollama.js              her chat: the local model, through Ollama
  apps.js                closing an app you asked her to close (after your click)
  system.js / .ps1       her hands on the PC: music, volume (the PC's or an app's), Start menu apps, web pages
  sight.js               a picture of your screen, when you ask her to look
src/renderer/js/
  sprite.js              WebGL shader: head tilt, mane flare, sitting, smears, afterimages, colors, glitch
  acting.js              the exposure sheets: every move, drawing by drawing
  capri.js               the character: stances, teleport, sitting, peeking, falling, drag, sleep
  fx.js                  shards, light columns, bolts, glyphs, speed lines, shockwaves, the satellite and the red light, possessed windows, the cut-ins, her intro
  panel.js               the "transmission" panel, her faces, and the ticker
  guide.js               her guide: the tutorials, going to things and pointing at them
  brain.js               turns Claude events into lines and actions
  mission.js             today's mission log, for her report card
  chat.js                talking to her: the conversation, who she is, her answers coming in, the spoken conversation
  commands.js            what you ask her to do, read straight from your words (5 languages, no AI)
  powers.js              doing it: music, volume, apps, the web, with the reaction that fits; the wheel, the middle click, dancing to your music
  ears.js                her ears: the microphone, telling when you talk, and Whisper (ears-worker.js, ears-worklet.js)
  speech.js              her voice: her own (speech-worker.js: eSpeak-NG then Piper, voicefx.js: her effects), or a Windows one
  lines.js               what she says (FR / EN / ES / PT / RU)
  chip.js                her mask: while she sleeps, and bottom left when you put her away
  voice.js               the sounds
```

To hack on it: `npm run dev` turns on debug routes on the bridge (`/debug/capture` saves a frame of the window to `captures/`,
`/debug/testwin` opens test windows she can sit on, one per name, `/debug/mouse` moves and clicks a stand-in pointer
over Capri's window, without touching the real one, `/debug/type` types in her chat, `/debug/command` with
`{"name":"heard","text":"…"}` acts as if she had heard it out loud, `{"name":"glance"}` makes her glance at the screen now).
If an installed Capri is already running, run the dev one next to it with its own data folder and port:
`CAPRI_PORT=47899 npx electron . --dev --user-data-dir=<a folder>`.
`npm run dist` builds the Windows installer in `dist/`.

## Credits and rights

Capri / Project Capricorn, Cyberpunk and Cyberpunk: Edgerunners belong to CD PROJEKT RED, Studio Trigger and Netflix.
This is a non-commercial fan project with no affiliation. The character images in `assets/capri/` come from frames of
the show, a fan-made cut-out and fan art (her intro's close-ups); they are **not** covered by the code's MIT license.
If a rights holder wants them removed, open an issue.

Fonts: Chakra Petch and JetBrains Mono, under the SIL Open Font License, via Fontsource.

Her voice (downloaded when you ask, never bundled with Capri): the [Piper](https://github.com/rhasspy/piper) voices
*siwis* (French, CC-BY 4.0, SIWIS, University of Edinburgh), *amy* (English, Mycroft's Mimic 3 voices), *sharvard*
(Spanish, CC-BY 3.0, University of Edinburgh) and *irina* (Russian, RHVoice, licence not stated), and
[eSpeak-NG](https://github.com/espeak-ng/espeak-ng) (GPL-3.0). Her voice is designed from what's known of the
character, not copied from an actress's.

