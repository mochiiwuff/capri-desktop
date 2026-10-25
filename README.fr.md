[English](README.md) · **Français**

# Capri

Capri, le construct du *Project Capricorn* (Cyberpunk: Edgerunners, saison 2), vit sur ton bureau
et te raconte ce que fait **Claude Code ou Codex** : elle se téléporte, glitche, commente chaque action,
vient te chercher quand ton agent attend ta permission et part en vrille quand la tâche est finie.

![Capri annonce que Claude a terminé](docs/done.png)

![Téléportation, image par image](docs/teleport.png)

## Ce qu'elle fait

- **Pendant que Claude bosse** : un ticker au-dessus d'elle affiche l'action en cours
  (`MODIFIE gigs.ts`, `EXÉCUTE npm test`, `CHERCHE "paginate"`…) et elle lâche des petits glyphes de données.
  Quand Claude lance une commande ou va sur le web, des étincelles rouges partent de ses doigts ; assise sur une fenêtre,
  elle se branche dessus et l'éclair court le long du bord.
- **Quand Claude a besoin de toi** (permission, question) : elle se téléporte à côté de ta souris, crinière hérissée, et insiste.
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

Le suivi des fenêtres ne marche que sous Windows pour l'instant (un petit script PowerShell lit la position des fenêtres, pas leurs titres ni leur contenu).
Sur macOS et Linux, elle flotte, dépasse des bords, tombe et se balade quand même.

Elle n'attrape la souris que sur son corps (au pixel près) : tout le reste de l'écran reste utilisable normalement.

- **Clic** sur elle : elle te dit où en est Claude.
- **Glisser** : tu la déplaces.
- **Clic** sur le panneau : il se ferme.
- **Ctrl+Alt+C** : elle se range (dans son biochip, comme dans la série) et il ne reste d'elle que son masque, les yeux
  fermés, en bas à gauche de l'écran. Ses yeux ne s'ouvrent que quand Claude a besoin de toi. Clique sur le masque
  (ou refais Ctrl+Alt+C) pour la faire revenir.
- **Icône près de l'horloge** : téléporter, regarder le satellite, démo, taille, son, écran, se balader, posséder tes fenêtres,
  langue, lancement au démarrage, hooks.

Elle parle **français ou anglais et choisit toute seule la langue de ton système**. Tu peux en forcer une dans le menu de l'icône.

## Installation

### Windows

Télécharge **`Capri-Setup-x.y.z.exe`** dans la [dernière release](https://github.com/mochiiwuff/capri-desktop/releases/latest)
et lance-le. Il s'installe pour ton utilisateur seulement (pas besoin d'être administrateur), ajoute un raccourci
sur le bureau et lance Capri. L'installeur n'est pas signé, donc Windows SmartScreen peut afficher « Windows a protégé
votre ordinateur » : clique sur **Informations complémentaires**, puis **Exécuter quand même**.

### Depuis le code

Il faut [Node.js](https://nodejs.org) 20 ou plus.

```bash
git clone https://github.com/mochiiwuff/capri-desktop.git
cd capri-desktop
npm install
npm start
```

### La brancher sur Claude Code

Clique sur l'icône de Capri près de l'horloge, puis **Installer les hooks Claude Code**. Ou en ligne de commande :

```bash
npm run hooks:install
```

Ça ajoute un hook à `~/.claude/settings.json` (une sauvegarde est faite à côté, tes hooks existants sont gardés).
Relance tes sessions Claude Code ensuite. Pour retirer : `npm run hooks:uninstall`.

Les hooks sont lancés en `async` : ils ne ralentissent jamais Claude, et si Capri n'est pas lancée ils ne font rien.

### La brancher sur Codex

Capri peut aussi suivre les **sessions locales de Codex**, en parallèle de Claude
Code. Il faut une version de Codex avec les
[hooks de cycle de vie](https://learn.chatgpt.com/docs/hooks) activés. Menu de
l'icône › **Installer les hooks Codex**, ou :

```bash
npm run hooks:codex:install
```

Les hooks sont ajoutés à `~/.codex/hooks.json` (`%USERPROFILE%\.codex\hooks.json`
sous Windows), ou `$CODEX_HOME/hooks.json` si cette variable est définie. Les hooks
existants sont conservés et le fichier existant est sauvegardé avant modification.
Ouvre une nouvelle session locale Codex, puis **vérifie et approuve les hooks**
avec `/hooks` dans le CLI Codex. L'installation ne contourne aucune autorisation.

Capri réagit aux prompts, outils, demandes d'autorisation, commandes en échec,
sous-agents, compactages, fins de tour et interruptions. Elle affiche la réponse
finale si Codex la fournit. Pour `apply_patch`, seuls les noms des fichiers sont
transmis, jamais le contenu du patch (128 chemins au maximum par action). Les
outils hébergés, comme la recherche web intégrée, n'émettent pas de hooks locaux.
Les sessions cloud ne sont pas prises en charge. Aucune clé API n'est nécessaire.

Les hooks d'outils et de progression tournent en arrière-plan. Les débuts/fins de
session, prompts, fins de tour et interruptions sont synchrones, avec un délai
maximal de deux secondes pour ne pas perdre la notification d'un tour très court.
L'adaptateur reste silencieux, termine sans erreur si Capri est fermée et ne prend
jamais de décision d'autorisation. Réinstalle les hooks si tu déplaces le clone,
l'application ou Node. La version installée utilise son propre runtime Electron.

```bash
npm run hooks:codex:status
npm run hooks:codex:uninstall
```

Pour vérifier une contribution : `npm test` (tests Node sans dépendance ajoutée).
Pour le test réel, lance Capri et une nouvelle session locale avec les hooks
approuvés : prompt, commande, patch sur deux fichiers, commande en échec, demande
d'autorisation et fin de tour. Vérifie les actions, le compteur, les alertes et la
réponse finale. Interromps un autre tour : aucune célébration. Ferme Capri et
vérifie que Codex fonctionne toujours. Les hooks Claude restent indépendants.

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
tools/build-cutins.py    découpe les cut-ins et les portraits du panneau dans des images de la série
src/main/                Electron : fenêtre transparente plein écran, clic à travers, tray, bridge HTTP local
  windows.js / .ps1      où sont les autres fenêtres (Windows), pour qu'elle s'assoie dessus
src/renderer/js/
  sprite.js              shader WebGL : tête, crinière, position assise, smears, images rémanentes, couleurs, glitch
  acting.js              les feuilles d'exposition : chaque mouvement, dessin par dessin
  capri.js               le personnage : postures, téléportation, assise, bords d'écran, chute, drag, sommeil
  fx.js                  éclats, colonnes de lumière, éclairs, glyphes, lignes de vitesse, ondes de choc, le satellite et la lumière rouge, les fenêtres possédées, les cut-ins
  panel.js               le panneau « transmission » et le ticker
  brain.js               traduit les événements Claude en répliques et en actions
  lines.js               ce qu'elle dit (FR / EN)
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
