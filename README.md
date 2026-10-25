**English** · [Français](README.fr.md)

# Capri

Capri, the *Project Capricorn* construct from Cyberpunk: Edgerunners season 2, lives on your desktop
and tells you what **Claude Code or Codex** is up to. She teleports, glitches, comments on every action,
comes to find you when your agent needs your permission, and loses it when the job is done.

![Capri telling you Claude is done](docs/done.png)

![Teleport, frame by frame](docs/teleport.png)

## What she does

- **While Claude works**: a ticker over her head shows the current action
  (`EDITS gigs.ts`, `RUNS npm test`, `GREPS "paginate"`…) and she sheds little data glyphs.
  When Claude runs a command or goes on the web, red sparks fly off her fingers; sitting on a window,
  she jacks into it and the lightning runs along its edge.
- **When Claude needs you** (permission, question): she teleports next to your mouse, mane bristling, and won't let it go.
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

She only catches the mouse on her actual body (pixel-precise): the rest of the screen works as usual.

- **Click** her: she tells you where Claude is at.
- **Drag** her: move her around.
- **Click** the panel: it closes.
- **Ctrl+Alt+C**: she puts herself away (into her biochip, like in the show) and all that's left of her is her mask,
  eyes shut, in the bottom-left corner. Her eyes only open when Claude needs you. Click the mask (or Ctrl+Alt+C again)
  to bring her back.
- **Tray icon** (next to the clock): teleport, look at the satellite, demo, size, sound, screen, wander, possess your windows,
  language, start with Windows, hooks.

She speaks **French or English and picks the language of your system** on her own. You can force one from the tray menu.

## Install

### Windows

Download **`Capri-Setup-x.y.z.exe`** from the [latest release](https://github.com/mochiiwuff/capri-desktop/releases/latest)
and run it. It installs for your user only (no admin rights), adds a desktop shortcut and starts Capri.
The installer isn't signed, so Windows SmartScreen may say "Windows protected your PC": click **More info**,
then **Run anyway**.

### From the source

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/mochiiwuff/capri-desktop.git
cd capri-desktop
npm install
npm start
```

### Hook her up to Claude Code

Click Capri's tray icon, then **Install Claude Code hooks**. Or from the command line:

```bash
npm run hooks:install
```

This adds a hook to `~/.claude/settings.json` (a backup is written next to it, your existing hooks are kept).
Restart your Claude Code sessions afterwards. To remove it: `npm run hooks:uninstall`.

The hooks run `async`: they never slow Claude down, and when Capri isn't running they do nothing.

### Hook her up to Codex

Capri can also watch **local Codex sessions**, alongside Claude Code. Use a Codex
version with [lifecycle hooks](https://learn.chatgpt.com/docs/hooks) enabled.
Click the tray icon, then **Install Codex hooks**, or run:

```bash
npm run hooks:codex:install
```

This adds hooks to `~/.codex/hooks.json` (`%USERPROFILE%\.codex\hooks.json` on
Windows), or `$CODEX_HOME/hooks.json` when set. Existing hooks are preserved and
an existing file is backed up before changes. Start a new local Codex session,
then **review and trust the hooks** using `/hooks` in the Codex CLI. Installation
does not bypass Codex's hook trust or approval settings.

Capri reacts to prompts, tool activity, approval requests, failed commands,
subagents, compaction, completion and interruption. She can show the final answer
when Codex supplies it. Patch events send filenames only, never patch contents;
up to 128 affected paths per action are counted. Hosted tools such as built-in web
search do not emit local tool hooks, so they won't appear in the ticker. Cloud
sessions are not supported by this local adapter. It does not need an API key.

Tool and progress hooks run in the background. Session start/end, prompt, stop
and interrupt hooks run synchronously with a two-second timeout so a short CLI
session cannot cancel its own completion notification. The adapter is silent,
exits successfully when Capri is closed, and never makes an
approval decision. Do not move the clone after installation; reinstall the hooks
if the app or Node executable moves. A packaged app uses its own Electron runtime.

```bash
npm run hooks:codex:status
npm run hooks:codex:uninstall
```

To check a contribution, run `npm test` (Node's built-in test runner; no extra test
dependencies). For a live check, start Capri and a fresh trusted local Codex chat:
submit a prompt, run a command, edit two files with `apply_patch`, run a failing
command, trigger an approval request, then finish a turn. Check the ticker, file
count, error and approval animations, and final answer. Interrupt another turn:
Capri should stop working without celebrating. Close Capri and verify Codex still
works. Claude hooks remain separately installable with `npm run hooks:install`.

### Try it without Claude

```bash
npm run demo
```

Replays a fake session from start to finish (reads, a web fetch, a subagent, writes, a failing test, a permission
prompt, the end), then shows everything she does on her own, a line before each trick: the other minds in her,
zapping your pointer, the whole satellite sequence, possessing a window (a little terminal opens for her, then closes
under her and she falls), sleeping down to her mask, and putting herself away in the bottom-left corner.
It's also in the tray menu.

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

## What leaves your machine

Nothing. The hook only keeps what the display needs (tool name, file path, command, the start of your prompt,
Claude's last message up to 6,000 characters so she can show it to you, all truncated) and sends it to `127.0.0.1` only.
Your file contents are never sent: for a write, only its size goes through.

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
tools/build-cutins.py    cuts the cut-ins and the panel portraits out of frames of the show
src/main/                Electron: full-screen transparent click-through window, tray, local HTTP bridge
  windows.js / .ps1      where the other windows are (Windows only), so she can sit on them
src/renderer/js/
  sprite.js              WebGL shader: head tilt, mane flare, sitting, smears, afterimages, colors, glitch
  acting.js              the exposure sheets: every move, drawing by drawing
  capri.js               the character: stances, teleport, sitting, peeking, falling, drag, sleep
  fx.js                  shards, light columns, bolts, glyphs, speed lines, shockwaves, the satellite and the red light, possessed windows, the cut-ins
  panel.js               the "transmission" panel and the ticker
  brain.js               turns Claude events into lines and actions
  lines.js               what she says (FR / EN)
  chip.js                her mask: while she sleeps, and bottom left when you put her away
  voice.js               the sounds
```

To hack on it: `npm run dev` turns on debug routes on the bridge (`/debug/capture` saves a frame of the window to `captures/`,
`/debug/testwin` opens test windows she can sit on, one per name, `/debug/mouse` moves and clicks a stand-in pointer
over Capri's window, without touching the real one).
`npm run dist` builds the Windows installer in `dist/`.

## Credits and rights

Capri / Project Capricorn, Cyberpunk and Cyberpunk: Edgerunners belong to CD PROJEKT RED, Studio Trigger and Netflix.
This is a non-commercial fan project with no affiliation. The character images in `assets/capri/` come from frames of
the show and a fan-made cut-out; they are **not** covered by the code's MIT license.
If a rights holder wants them removed, open an issue.

Fonts: Chakra Petch and JetBrains Mono, under the SIL Open Font License, via Fontsource.
