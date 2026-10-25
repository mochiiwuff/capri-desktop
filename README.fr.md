[English](README.md) · **Français**

# Capri

Capri, le construct du *Project Capricorn* (Cyberpunk: Edgerunners, saison 2), vit sur ton bureau
et te raconte ce que fait **Claude Code** : elle se téléporte, glitche, commente chaque action,
vient te chercher quand Claude attend ta permission et part en vrille quand la tâche est finie.

![Capri annonce que Claude a terminé](docs/done.png)

![Téléportation, image par image](docs/teleport.png)

## Ce qu'elle fait

- **Quand elle démarre** : son visage en grand en haut à droite de l'écran, image par image tiré de la série. Ses
  morceaux arrivent en spirale, elle devient une ligne rouge, la ligne se dédouble et s'ouvre sur elle comme un
  obturateur, l'image arrive avec ses couleurs décalées, puis son cadre se construit autour d'elle pendant que la
  caméra zoome. Elle ouvre la bouche et te dit hi. Puis elle rétrécit et plonge jusqu'à sa place en laissant des
  images d'elle derrière, et son corps se déplie depuis son visage.

  ![Son intro : l'ouverture, son cadre qui se construit, « hi », le plongeon](docs/intro.png)

- **Pendant que Claude bosse** : un ticker au-dessus d'elle affiche l'action en cours
  (`MODIFIE gigs.ts`, `EXÉCUTE npm test`, `CHERCHE "paginate"`…) et elle lâche des petits glyphes de données.
  Quand Claude lance une commande ou va sur le web, des étincelles rouges partent de ses doigts ; assise sur une fenêtre,
  elle se branche dessus et l'éclair court le long du bord.
- **Quand Claude a besoin de toi** (permission, question) : elle se téléporte à côté de ta souris, crinière hérissée, et insiste.
  Si tu es sur une autre fenêtre, elle va plutôt à côté de celle de Claude et la montre du doigt (une ligne en pointillés,
  des crochets sur ses coins, `CLAUDE` sur une étiquette) : c'est là qu'est la question. Elle arrête dès que tu as répondu.
- **Quand une commande plante** : image d'impact rouge, elle encaisse le coup, gros glitch, et la ligne d'erreur utile.
- **Quand c'est fini** : téléportation au milieu de l'écran puis sa séquence de victoire : elle prend son élan
  crinière ramassée, une image étirée (smear), puis bras jetés en l'air et crinière qui explose sous des lignes de
  vitesse façon manga et une onde de choc, un rire hystérique avec un cut-in de son sourire. Une fois redescendue,
  le résumé (`12 actions · 3 fichiers modifiés · 2 min 14`) et la dernière phrase de Claude.
- **Quand Claude te répond et que tu es sur une autre fenêtre** : elle t'affiche sa réponse en entier, dans un panneau
  plus large qui défile (paragraphes, listes et code gardés). Il s'en va quand tu reviens sur la fenêtre de Claude, ou
  quand tu cliques dessus. La fenêtre de Claude, c'est celle où tu as tapé ton message. Sous Windows, comme le suivi des fenêtres.
- **Le reste du temps** : elle flotte, sa crinière ondule et perd des éclats, elle se balade d'un coin à l'autre de l'écran,
  se retourne et penche la tête quand ta souris approche (ou, petite peste, lui envoie un éclair rouge avec un sourire en coin),
  lève les yeux vers le satellite, et s'endort si rien ne se passe pendant 10 minutes.
- **Quand elle dort** : elle somnole un moment, puis sa crinière et son corps se défont et il ne reste que ce qu'elle est
  au fond dans la série, son masque vert et ses yeux, qui flotte là où elle était, les yeux fermés. De temps en temps
  elle entrouvre un œil. Approche ta souris (ou que Claude reprenne) et ses yeux bleus s'ouvrent d'un coup, et elle se
  reforme autour.
- **Le satellite** : la grande séquence, gardée pour les vrais moments. La première fois de la journée, un peu après
  que Claude a fini une longue tâche (8 minutes ou plus, ou 50 actions), ou quand tu veux depuis le menu de l'icône.
  Les points blancs de sa crinière s'envolent en constellation, s'alignent en chemin entre ses doigts et le satellite,
  elle se ramasse, et la lumière rouge monte jusqu'à lui. Il lui répond en scintillant deux fois.

![Victoire : la pose clé, puis le rire et le cut-in](docs/victory.png)

![Le satellite : ses étoiles, le chemin, la lumière rouge, la réponse](docs/star.png)

### Elle bouge partout

- **Elle s'assoit sur tes fenêtres** : perchée sur le bord du haut d'une fenêtre, les jambes dans le vide qui balancent l'une après l'autre.
  Elle suit la fenêtre quand tu la déplaces, et tombe quand tu la fermes, la réduis ou la caches.
  Pendant que Claude travaille, elle s'installe sur la fenêtre au premier plan si elle peut.
- **Elle dépasse des bords de l'écran** : à moitié cachée à gauche ou à droite, ou la tête en bas depuis le haut.
  Elle est timide : approche ta souris et elle file se cacher sur un autre bord.
- **Elle tombe** : étirée, crinière soufflée vers le haut, de plus en plus vite, puis un gros écrasement et une gerbe d'éclats à l'atterrissage.
  En chemin, le rebord d'une fenêtre peut la rattraper.
- **Pose-la sur une fenêtre** : attrape-la et lâche-la avec les hanches sur le bord du haut d'une fenêtre, elle s'y assoit.
  Lâchée ailleurs, elle tombe.
- **Elle possède tes fenêtres**, comme dans la série où elle se glisse dans les corps et les systèmes : de temps en temps,
  elle plonge dans la fenêtre où elle est assise. Un éclair rouge fait le tour du cadre, des tranches glitchent,
  et la fenêtre te regarde avec ses yeux et son sourire en zigzag, d'autres yeux s'ouvrent partout, toutes les pupilles
  sur ta souris, et elle rit. Puis elle ressort d'une autre fenêtre. Rien n'est dessiné sur les fenêtres posées devant,
  et le contenu de la fenêtre n'est jamais lu : c'est juste dessiné par-dessus, deux secondes.
  Si ça te gêne, décoche *Posséder mes fenêtres* dans le menu de l'icône.
- **Petites fioritures** : un tour complet avec des images rémanentes, un saut, un regard à gauche puis à droite, la tête penchée,
  et ses autres esprits (ses copies verte et rouge) qui se détachent d'elle, flottent un instant et reviennent d'un coup.

![Assise sur une fenêtre](docs/sit.png)

![Elle dépasse des bords de l'écran](docs/peek.png)

![Elle possède une fenêtre : la plongée, l'impact, la fenêtre pleine d'yeux](docs/possess.png)

![Elle s'endort jusqu'à son masque, se réveille, et rangée en bas à gauche](docs/sleep.png)

Le suivi des fenêtres marche sous Windows (un petit script PowerShell lit la position des fenêtres, pas leurs titres ni leur contenu)
et sous GNOME (sa petite extension GNOME Shell fait pareil, voir [GNOME](#gnome-wayland-ou-x11)).
Sur macOS et les autres bureaux Linux, elle flotte, dépasse des bords, tombe et se balade quand même.

### Elle te fait visiter

**Comment ça marche ?** dans son menu : elle te demande ce qu'elle te montre, puis t'y emmène et le montre du doigt.
Sa tête se tourne d'un coup, elle prend son élan penchée en arrière, puis frappe : son bras de construct s'allonge
jusqu'au double vers la cible, un éclair rouge part de son doigt, un viseur claque dessus avec deux de ses yeux qui
s'ouvrent sur ses coins, et un gros plan sur ses yeux surgit. Ensuite elle tient la pose pendant qu'elle t'explique,
un fil de données entre son doigt et la cible : de temps en temps elle donne un petit coup de doigt, ou te jette un
regard. Quand elle a fini, le fil se ravale dans son doigt et le bras revient d'un coup sec.

![La frappe, puis la pose tenue pendant qu'elle explique](docs/point.png)

- **Où est mon icône ?** Elle descend près de l'horloge et pointe son icône, ou le **^** quand Windows la cache.
- **Où est Claude ?** Elle pointe la fenêtre de Claude : celle où tu as tapé ton dernier prompt.
- **Le dossier de Claude** : elle ouvre `~/.claude` dans l'Explorateur avec `settings.json` sélectionné, pointe la
  fenêtre, et t'explique ce qu'est son hook là-dedans et comment le retirer.
- **Me brancher à Claude** : ses hooks en un clic. C'est aussi son accueil la première fois qu'elle démarre.

Elle fait des têtes en parlant : huit expressions, toutes des images d'elle tirées de la série (elle observe, elle
détourne la tête, le sourire avec le croc, les yeux tout ronds, elle te regarde droit dans les yeux, le fou rire bouche
grande ouverte, tous ses yeux à la fois, le sourire en zigzag). Chaque message prend celle qui va avec, et son portrait
glitche d'une expression à l'autre.

![Elle pointe la fenêtre de Claude pendant une demande de permission, puis son icône](docs/guide.png)

![Ses huit expressions](docs/faces.png)

Elle n'attrape la souris que sur son corps (au pixel près) : tout le reste de l'écran reste utilisable normalement.

- **Clic** sur elle : elle te dit où en est Claude.
- **Glisser** : tu la déplaces.
- **Clic** sur le panneau : il se ferme.
- **Ctrl+Alt+C** : elle se range (dans son biochip, comme dans la série) et il ne reste d'elle que son masque, les yeux
  fermés, en bas à gauche de l'écran. Ses yeux ne s'ouvrent que quand Claude a besoin de toi. Clique sur le masque
  (ou refais Ctrl+Alt+C) pour la faire revenir.
- **Son menu** : clic droit sur elle (il est aussi sur son icône près de l'horloge) : téléporter, regarder le satellite,
  démo, comment ça marche, taille, son, écran, se balader, posséder tes fenêtres, langue, lancement au démarrage, hooks.

Elle parle **français, anglais, espagnol, portugais du Brésil et russe**, et choisit toute seule la langue de ton
système. Tu peux en choisir une autre dans son menu.

## Installation

### Démarrage rapide (Windows, sans coder)

1. Télécharge **`Capri-Setup-x.y.z.exe`** dans la [dernière release](https://github.com/mochiiwuff/capri-desktop/releases/latest)
   et lance-le. Il s'installe pour ton utilisateur seulement (pas besoin d'être administrateur), ajoute un raccourci
   sur le bureau et lance Capri. Pas besoin de Node.js ni de rien d'autre.
2. L'installeur n'est pas signé (un certificat de signature, c'est payant), donc Windows SmartScreen peut afficher
   « Windows a protégé votre ordinateur » : clique sur **Informations complémentaires**, puis **Exécuter quand même**.
3. Capri apparaît et se présente. Clique sur **Me brancher** : ça la connecte à Claude Code.
4. Ferme complètement Claude Code et rouvre-le (il lit ses hooks au début d'une session). Dès que Claude fait quelque
   chose, elle te dit **« Je vois Claude ! »** : c'est comme ça que tu sais que ça marche.

Son menu : **clic droit sur elle**. Il est aussi sur son icône, que Windows 11 cache souvent derrière le **^** à côté
de l'horloge.

### C'est quoi Claude Code ? Il le faut ?

[Claude Code](https://code.claude.com/docs/en/quickstart) est l'assistant de code d'Anthropic : dans un terminal, dans
VS Code, ou dans l'onglet Code de l'app Claude. Il faut un abonnement Claude payant (Pro ou plus) ou un compte API.
Capri ne fait que le regarder : pas de clé d'API, et rien à payer pour Capri elle-même.

Sans Claude Code, elle vit quand même sur ton bureau : elle flotte, s'assoit sur tes fenêtres, regarde le satellite,
s'endort. Tu peux juste la laisser là.

### Depuis le code (macOS, Linux, développeurs)

Il faut [Node.js](https://nodejs.org) 20 ou plus.

```bash
git clone https://github.com/mochiiwuff/capri-desktop.git
cd capri-desktop
npm install
npm start
```

Garde ce terminal ouvert tant qu'elle tourne. Pas encore testé sur macOS : elle devrait démarrer, mais les tours
avec les fenêtres (s'asseoir dessus, les posséder, t'afficher la réponse de Claude quand tu es ailleurs) ne marchent que
sous Windows et GNOME.

### GNOME (Wayland ou X11)

Sous Linux elle tourne toujours sous X11, via XWayland dans une session Wayland : Wayland ne laisse aucune fenêtre
rester devant, se placer ou laisser passer les clics. Elle relance une copie d'elle-même avec `--ozone-platform=x11` pour ça.

D'office, tu peux cliquer sur elle, la déplacer et faire un clic droit pour son menu. Pour le reste (s'asseoir sur tes
fenêtres, les posséder, voir ta souris approcher, Ctrl+Alt+C quand une appli Wayland a le focus), installe son
extension GNOME Shell, puis ferme ta session et reviens :

```bash
npm run gnome:install     # ou, depuis son menu : Installer l'assistant GNOME
```

Elle ne lui envoie que la position des fenêtres et de la souris, par un socket dans `$XDG_RUNTIME_DIR`. Ni titres, ni
contenu, et elle ne fait rien tant que Capri ne tourne pas. `npm run gnome:uninstall` la retire.

- GNOME n'affiche pas d'icônes de zone de notification sans l'extension
  [AppIndicator](https://extensions.gnome.org/extension/615/appindicator-support/). Clic droit sur elle : même menu.
- *Lancer au démarrage* écrit `~/.config/autostart/capri.desktop`.
- Lancée depuis le terminal de VS Code ? Il définit `ELECTRON_RUN_AS_NODE=1` : `env -u ELECTRON_RUN_AS_NODE npm start`.
- Sous NixOS, l'Electron téléchargé par npm ne se lance pas : `nix-shell -p electron --run 'electron .'`.
- `npm run dist:linux` construit une AppImage dans `dist/`.

### La brancher sur Claude Code à la main

Clic droit sur Capri, puis **Installer les hooks Claude Code**. Ou en ligne de commande :

```bash
npm run hooks:install
```

Ça ajoute un hook à `~/.claude/settings.json` (une sauvegarde est faite à côté, tes hooks existants sont gardés).
Relance tes sessions Claude Code ensuite. Pour retirer : `npm run hooks:uninstall`.

Les hooks sont lancés en `async` : ils ne ralentissent jamais Claude, et si Capri n'est pas lancée ils ne font rien.

### Tester sans Claude

```bash
npm run demo
```

Rejoue une fausse session complète (lecture, recherche web, sous-agent, écriture, test qui plante, demande de
permission, fin), puis montre tout ce qu'elle fait toute seule, une phrase avant chaque numéro : ses autres esprits,
l'éclair sur ta souris, la grande séquence du satellite, la possession d'une fenêtre (un petit terminal s'ouvre
pour elle, puis se ferme sous elle et elle tombe), le sommeil jusqu'à son masque, et le rangement en bas à gauche.
C'est aussi dans le menu de l'icône.

## Sons

Tous les sons sont synthétisés en direct (Web Audio), rien n'est fourni sous droits.
Tu peux mettre tes propres fichiers dans le dossier des sons perso (menu › Son › *Ouvrir le dossier des sons perso*),
avec ces noms (`.mp3`, `.wav`, `.ogg` ou `.m4a`) :

| Fichier | Quand |
|---|---|
| `teleport-out` | elle disparaît |
| `teleport-in` | elle réapparaît |
| `done` | Claude a fini |
| `alert` | Claude attend ta permission |
| `error` | une commande a planté |
| `hello` | une session démarre |
| `star` | elle regarde le satellite |
| `land` | elle atterrit après une chute |
| `rise` | l'élan de sa pose de victoire, la lumière rouge qui monte |
| `bolt` | ses éclairs rouges |
| `charge` | elle se charge avant d'envoyer la lumière rouge |
| `possess` | la fenêtre qu'elle possède rit |
| `blip` | chaque syllabe quand elle parle |
| `tick` | petit rappel discret |

## C'est sûr ?

- Tout le code est ici. L'installeur est fabriqué à partir de lui avec `npm run dist` ; tu peux fabriquer le tien.
- Rien ne quitte ton PC (voir plus bas) : elle ne parle à Claude Code que par un hook sur `127.0.0.1`.
- Ce qu'elle change sur ton système : le hook dans `~/.claude/settings.json` (une sauvegarde est faite avant, et tu peux
  le retirer depuis son menu), et une entrée au démarrage seulement si tu coches « Lancer au démarrage ». Elle se
  désinstalle comme n'importe quelle app, depuis Paramètres Windows › Applications.
- L'avertissement de SmartScreen vient du fait que l'installeur n'est pas signé, pas de ce qu'il fait.

## FAQ

- **Mac, Linux ?** Pas encore d'installeur, mais tu peux la lancer depuis le code (voir plus haut). Sous GNOME, voir [GNOME](#gnome-wayland-ou-x11).
- **Téléphone, Android ?** Non, il lui faut un ordinateur.
- **D'autres assistants (Codex, Cursor, Windsurf, Gemini…) ?** Seulement Claude Code pour l'instant.
- **Je peux l'éteindre ?** Ctrl+Alt+C la range, **Quitter** dans son menu la ferme. Claude Code marche exactement pareil
  sans elle.
- **Elle flotte et dit des petites phrases, mais rien d'autre.** C'est normal tant que Claude Code ne fait rien. S'il ne
  se passe jamais rien, vérifie que son menu indique « Hooks Claude Code : installés », puis ferme complètement Claude
  Code et rouvre-le.

## Ce qui part de ta machine

Rien. Le hook ne garde que ce qui sert à l'affichage (nom de l'outil, chemin du fichier, commande lancée,
début de ton prompt, dernier message de Claude jusqu'à 6 000 caractères pour pouvoir te l'afficher, le tout tronqué)
et l'envoie à `127.0.0.1` uniquement.
Le contenu de tes fichiers n'est jamais transmis : pour une écriture, seule sa taille passe.

## Direction artistique

Le but : qu'on ait l'impression qu'elle sort de l'anime, pas d'un widget.

- **Cel animation** : le corps est redessiné 12 fois par seconde (« on twos ») comme un anime,
  24 pendant les téléportations. Chaque dessin a un léger *boil* (le tremblement du trait redessiné à la main).
- **Image par image, pose à pose** : rien n'est interpolé. Chaque mouvement est une feuille d'exposition (`acting.js`) :
  des dessins clés tenus quelques images, une anticipation dans l'autre sens, une image de smear avec des copies
  de la tête, un dépassement, des temps de pause. Son flottement au repos, c'est quatre dessins, pas une sinusoïde.
- **Elle joue avec sa tête et sa crinière**, comme dans la série : la tête penchée, les éclats qui se hérissent
  ou explosent, le rire hystérique avec la tête qui tremble à chaque dessin, la tête qui tombe quand elle dort.
  La découpe est riggée : la tête pivote autour du cou, la crinière s'ouvre de façon irrégulière autour d'un visage qui reste rigide,
  et les cuisses se replient (en raccourci, vues de face) pour qu'elle puisse s'asseoir en balançant le bas des jambes.
- **Écrasement, étirement, images rémanentes** : la découpe plate s'écrase en lame pour se retourner, s'étire quand elle tombe,
  s'aplatit à l'atterrissage, et se dédouble en copies verte et rouge (les autres esprits en elle) quand elle tourne ou rit.
- **Le satellite**, d'après la fin de la saison, où elle montre la lumière dans le ciel en se demandant s'ils
  pourraient monter jusque-là : un point de lumière traverse lentement le haut de l'écran. La plupart du temps elle le regarde, tend la main, il scintille, elle soupire.
  La première fois de la journée, et un peu après une longue tâche de Claude, c'est la séquence complète, en cinq temps
  (et pendant ce temps rien ne la déconcentre, même pas ta souris) :
  1. **Le silence** : elle se fige, les points blancs de sa crinière s'envolent et forment une constellation au-dessus d'elle.
  2. **Le geste** : elle tend le bras (les dessins se resserrent à mesure que la main arrive) et ses étoiles s'alignent
     en chemin, du bout de ses doigts jusqu'au satellite.
  3. **L'anticipation** : elle se ramasse, le bras recule un peu, des étincelles rampent dans sa main, cut-in sur ses yeux.
  4. **La lumière rouge monte** : un gros éclair effilé file en trois dessins, le premier en négatif (une image d'impact),
     les étoiles s'allument à son passage, lignes de vitesse sur le satellite, et elle est soulevée avec.
  5. **La réponse** : l'éclair casse et ses morceaux tombent. Un temps de silence, puis le satellite scintille deux fois.
     Ses étoiles reviennent dans sa crinière, qui brille plus fort un instant, et sa main retombe dans un soupir.
- **Les bras s'allongent quand elle vise** : exagération d'anime, sinon un bras levé se perdrait dans sa crinière.
  Il s'étire dans sa longueur seulement (il reste aussi fin) et n'est plus tordu par la tête et la crinière.
- **Deux bras identiques** : la découpe avait un bras tendu et un bras qui pendait. Celui qui pendait est retiré
  (`tools/build-sprite.py`) et le shader dessine le bras tendu en miroir à sa place : les deux mains ont les mêmes griffes
  et les deux bras peuvent jouer. Quand un bras passe devant son corps ou sa crinière, il est cerné de violet pour rester lisible.
- **Sa texture** : la crinière rouge est remise au rouge de la série et couverte de points blancs qui scintillent.
  Des éclats s'en détachent et dérivent.
- **Le décalage violet** : comme dans l'anime, une copie violette décalée sous elle, sous le panneau, sous les éclats.
- **Glitch « relic »** : tranches horizontales décalées et séparation RGB, dans la lignée des apparitions de Johnny Silverhand.
- **Téléportation** : charge, éclats, effondrement en ligne, et là où elle était, une fente noire avec un trait rouge
  dedans, comme dans la série. Colonne de lumière rouge vers le ciel, éclair jusqu'à la destination, ses morceaux
  (éclats de crinière et étoiles vertes de ses yeux) qui reviennent en spirale, retour avec deux *impact frames*.
- **Son intro** : neuf images de la série jouées dans son portrait (le zoom sur son visage, sa bouche qui s'ouvre
  pour « hi »), tirées de la copie la plus nette de l'extrait, le grain du GIF lissé. Ça s'ouvre sur une ligne rouge
  dédoublée, avec un décalage RVB qui se resserre en s'ouvrant ; le bord flashe, puis son ombre violette, sa ligne
  rouge et son nom arrivent l'un après l'autre. L'étiquette claque avec des lignes de vitesse, puis un plongeon avec
  un étirement, des images rémanentes et son zigzag.
- **Cut-ins** : des gros plans d'elle tirés de la série, en poussée de caméra avec des lignes de vitesse : son sourire
  ou son rire après une tâche terminée, tous ses yeux quand Claude t'attend, ses yeux juste avant la lumière rouge,
  son regard en coin après un éclair sur ta souris. Le visage du panneau change aussi selon ce qu'elle dit.
- **Son masque** : dessiné en vecteurs d'après la série (et le visage « Capri Wink Face »), sur sa propre petite toile,
  redessiné seulement quand il est à l'écran : le masque vert, la mèche en crochet, le croc blanc, les
  yeux bleus en amande, et les yeux fermés en chevrons quand elle dort.
- **Typo** : Chakra Petch (coupes en biseau, comme ses éclats) + JetBrains Mono pour les données.

Si Windows est réglé sur « Afficher les animations : non », elle se contente de fondus.

## Comment c'est fait

```
hooks/capri-hook.js      lancé par Claude Code, lit l'événement sur stdin et le poste à l'app
scripts/install-hooks.js ajoute / retire le hook dans ~/.claude/settings.json
tools/build-sprite.py    reconstruit le sprite depuis la découpe d'origine (Python + Pillow, seulement si tu la changes)
tools/build-cutins.py    découpe les cut-ins, ses expressions et son intro dans des images de la série
src/main/                Electron : fenêtre transparente plein écran, clic à travers, tray, bridge HTTP local
  windows.js / .ps1      où sont les autres fenêtres (Windows, et GNOME via son extension), pour qu'elle s'assoie dessus
gnome/                   son extension GNOME Shell : position des fenêtres et de la souris, envoyées par un socket
scripts/gnome-extension.js l'installe / la retire
src/renderer/js/
  sprite.js              shader WebGL : tête, crinière, position assise, smears, images rémanentes, couleurs, glitch
  acting.js              les feuilles d'exposition : chaque mouvement, dessin par dessin
  capri.js               le personnage : postures, téléportation, assise, bords d'écran, chute, drag, sommeil
  fx.js                  éclats, colonnes de lumière, éclairs, glyphes, lignes de vitesse, ondes de choc, le satellite et la lumière rouge, les fenêtres possédées, les cut-ins, son intro
  panel.js               le panneau « transmission », ses expressions et le ticker
  guide.js               son guide : les tutos, aller jusqu'aux choses et les montrer du doigt
  brain.js               traduit les événements Claude en répliques et en actions
  lines.js               ce qu'elle dit (FR / EN / ES / PT / RU)
  chip.js                son masque : quand elle dort, et en bas à gauche quand tu la ranges
  voice.js               les sons
```

Pour bosser dessus : `npm run dev` active des routes de debug sur le bridge (`/debug/capture` enregistre une image de la fenêtre dans `captures/`,
`/debug/testwin` ouvre des fenêtres de test sur lesquelles elle peut s'asseoir, une par nom, `/debug/mouse` bouge et clique un pointeur
factice sur la fenêtre de Capri, sans toucher au vrai).
`npm run dist` fabrique l'installeur Windows dans `dist/`.

## Crédits et droits

Capri / Project Capricorn, Cyberpunk et Cyberpunk: Edgerunners appartiennent à CD PROJEKT RED, Studio Trigger et Netflix.
Projet de fan, non commercial, sans lien avec eux. Les images du personnage dans `assets/capri/` viennent d'images de la série
et d'une découpe faite par des fans ; elles ne sont **pas** couvertes par la licence MIT du code.
Si un ayant droit veut qu'elles soient retirées, ouvre une issue.

Polices : Chakra Petch et JetBrains Mono, sous licence SIL Open Font License, via Fontsource.
