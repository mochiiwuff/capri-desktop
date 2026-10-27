[English](README.md) · **Français**

# Capri

Capri, le construct du *Project Capricorn* (Cyberpunk: Edgerunners, saison 2), vit sur ton bureau
et te raconte ce que fait ton IA de code, **Claude Code**, **Codex** ou **Antigravity** : elle se téléporte,
glitche, commente chaque action, vient te chercher quand elle attend ta permission et part en vrille quand la tâche est finie.

![Capri annonce que Claude a terminé](docs/done.png)

![Téléportation, image par image](docs/teleport.png)

## Ce qu'elle fait

- **Quand elle démarre** : elle attrape ton écran. Ses bords grésillent en rouge, sa main gauche s'abat sur le bord,
  puis la droite, ses bras s'allongent vers le centre pendant qu'elle se hisse, et son visage percute la vitre (un
  flash blanc, un noir, ses couleurs décalées, l'écran qui tremble). Elle regarde autour d'elle, cligne des yeux,
  ouvre grand la bouche sur « hi » (une étiquette surgit à côté de son visage, son nom tapé dessous), lâche le bord
  droit pour te faire coucou de sa main griffue, le rattrape, jette un œil là où elle va, et lâche : ses bras se
  brisent en éclats depuis les mains, et sa tête prend son élan et plonge jusqu'à sa place, où son corps se déplie
  depuis son visage.

  ![Son intro : ses mains sur les bords, son visage contre la vitre, le coucou, elle se ragrippe](docs/intro.png)

- **Pendant que Claude bosse** : un ticker au-dessus d'elle affiche l'action en cours
  (`MODIFIE gigs.ts`, `EXÉCUTE npm test`, `CHERCHE "paginate"`…) et elle lâche des petits glyphes de données.
  Quand Claude lance une commande ou va sur le web, des étincelles rouges partent de ses doigts ; assise sur une fenêtre,
  elle se branche dessus et l'éclair court le long du bord.
- **Quand Claude se tait en pleine tâche** (il réfléchit, ou un modèle local qui rame) : au bout de 15 secondes, le
  ticker passe en violet et compte les secondes (`RÉFLÉCHIT… 45 s`), et elle s'occupe (une pirouette, un coup d'œil
  autour d'elle, le satellite une fois). Après 40 secondes elle en dit un mot ; après deux minutes elle te prévient
  que rien n'est bloqué.
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

Le suivi des fenêtres ne marche que sous Windows pour l'instant (un petit script PowerShell lit la position des fenêtres, pas leurs titres ni leur contenu).
Sur macOS et Linux, elle flotte, dépasse des bords, tombe et se balade quand même.

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
- **Me brancher à Claude** : ses hooks en un clic. C'est aussi son accueil la première fois qu'elle démarre. À côté,
  **Gratuit avec Ollama** lance Claude Code (ou Codex) via Ollama pour toi : ses hooks se mettent en place, Ollama
  s'installe s'il n'est pas là, et une fenêtre s'ouvre sur `ollama launch claude`, où tu choisis un modèle.
- **Me parler** : voir « Lui parler » plus bas.

Elle fait des têtes en parlant : huit expressions, toutes des images d'elle tirées de la série (elle observe, elle
détourne la tête, le sourire avec le croc, les yeux tout ronds, elle te regarde droit dans les yeux, le fou rire bouche
grande ouverte, tous ses yeux à la fois, le sourire en zigzag). Chaque message prend celle qui va avec, et son portrait
glitche d'une expression à l'autre.

![Elle pointe la fenêtre de Claude pendant une demande de permission, puis son icône](docs/guide.png)

![Ses huit expressions](docs/faces.png)

### Son rapport de mission

**Rapport de mission** dans son menu : une carte de ce que Claude a abattu aujourd'hui, faite pour être capturée. Les
tâches finies en gros, puis les actions, les fichiers modifiés et les erreurs, la plus longue mission et son projet, les
prompts, les autorisations et les projets. Les chiffres défilent jusqu'à leur valeur. **Copier l'image** met une image
de la carte dans ton presse-papiers, sur son propre fond sombre, prête à coller n'importe où. Le soir (après 18 h),
après une vraie journée (3 tâches ou plus), elle te l'apporte d'elle-même, une fois. La démo ne compte pas, et tout
reste sur ton PC, un jour à la fois.

### Lui parler

**Lui parler** dans son menu (ou le bouton **Parle-moi** quand tu cliques sur elle et qu'il ne se passe rien) : tu
écris dans son panneau et elle te répond, dans son personnage. Elle sait ce que fait Claude et ce qu'il a fait
aujourd'hui. Elle répond par écrit (ou à voix haute : voir « Lui parler à voix haute »), dans sa langue. Entrée envoie,
Échap ferme.

La première fois, elle règle tout avec toi, avec des boutons, sans terminal :

- **Sur mon PC** (gratuit, rien ne sort de chez toi) : elle installe [Ollama](https://ollama.com) pour toi (avec
  winget, l'installeur de Windows), le réveille, et télécharge un modèle pendant qu'une barre se remplit : gemma3
  (3,3 Go, meilleur dans les autres langues que l'anglais) ou llama3.2 (2 Go, pour les petits PC). Sur un tout petit
  modèle (1B et moins), elle te prévient qu'elle risque de dire n'importe quoi et t'en propose un meilleur.
- **En ligne, sans compte** : Pollinations, rien à régler.
- **J'ai une clé** : Groq ou Gemini (tous les deux ont une offre gratuite), OpenRouter, OpenAI, Mistral ou DeepSeek.
  Tu colles ta clé dans son panneau et elle la vérifie. Elle reste sur ton PC, chiffrée avec ton compte Windows, et ne
  part que vers ce service.

Son menu › **Modèle IA** pour changer plus tard : **Choisir avec elle…**, ou directement un service et un modèle,
LM Studio (`:1234`), llama.cpp ou vLLM (`:8080`), n'importe quel serveur compatible OpenAI (**Clé API ou
adresse…**), ou **Claude Code** lui-même : tes messages partent à `claude -p` dans le dossier que tu choisis, en
continuant la même conversation, et ses hooks montrent ce qu'il fait. Dans ce cas, le mode `default` ne le laisse que
lire (personne n'est là pour dire oui) ; `acceptEdits` le laisse modifier des fichiers sans demander. **Oublier nos
conversations** efface ce qu'elle a retenu de vos discussions.

**C'est une IA.** Ses réponses sont écrites par le modèle, pas par les scénaristes de la série : c'est une version
fan d'elle, et le panneau du chat le dit à chaque fois.

**Ce qu'elle peut faire sur ton PC** (Windows), quand tu lui demandes dans le chat :

- **Ouvrir une appli ou un jeu** : tout ce qui est dans ton menu Démarrer (les applis du Store comme Spotify
  comprises), tes jeux Steam et Epic (« ouvre Spotify », « lance Brawlhalla »). Si tu l'as nommé toi-même, ça s'ouvre
  tout de suite ; si c'est son IA qui l'a proposé, tu as d'abord un bouton.
- **La musique** : « pause », « suivante », « plus fort », « coupe le son »… appuient sur les touches multimédia, donc
  ça marche avec Spotify et la plupart des lecteurs, dès que tu envoies. « Mets Daft Punk sur Spotify » ouvre Spotify
  sur une recherche (l'appli si tu l'as, sinon le site).
- **Un site** : toujours derrière un bouton qui montre où il mène.
- **Fermer une appli** (« ferme AM Music », « tu peux couper Discord ? ») : un bouton au nom de l'appli, et rien ne se
  passe tant que tu ne cliques pas. Elle la ferme comme son propre bouton de fermeture, donc l'appli peut encore te
  demander d'enregistrer. Si elle s'est seulement cachée dans la zone de notification, elle te propose **Forcer la
  fermeture**, là encore seulement sur ton clic (le travail non enregistré est alors perdu). Elle ne ferme jamais les
  morceaux de Windows, Claude, Ollama ni elle-même. À l'oral, tu confirmes en disant « oui ».

Elle peut aussi regarder ton écran quand tu le demandes, et parler avec toi à voix haute : voir plus bas. Rien d'autre : jamais tes fichiers.

### Directement depuis tes mots (Windows)

Demande-lui dans son chat, ou à voix haute : elle comprend tout de suite les demandes simples et les fait elle-même, dans ses cinq langues,
sans passer par l'IA (c'est instantané et ça marche même avec un tout petit modèle). Pour le reste, le modèle peut
lui-même demander une de ces actions, mais seulement si ton message demandait quelque chose. Plusieurs à la fois,
ça marche aussi : « mets le volume à 30 et ouvre YouTube ».

| Tu dis | Elle fait | Sa réaction |
|---|---|---|
| « ouvre YouTube », « va sur reddit.com » | ouvre la page dans ton navigateur (ou l'appli du même nom si tu l'as) | elle lance son bras vers l'écran, un éclair rouge au bout des doigts |
| « ouvre une page web », « ouvre le navigateur » | ouvre ton navigateur | pareil |
| « ouvre mes mails », « ouvre ma boîte mail » | tes mails : Gmail, Outlook (web) ou l'appli Outlook / Courrier, au choix dans son menu › **Mes mails** | pareil |
| « lance Spotify », « démarre le bloc-notes », « lance Brawlhalla » | lance l'appli ou le jeu (menu Démarrer, Steam, Epic) | pareil, vers la barre des tâches |
| « cherche des recettes de crêpes », « cherche lofi girl sur YouTube » | une recherche Google (ou YouTube, Wikipédia, Maps, Images) | pareil |
| « pause », « reprends la musique », « chanson suivante », « précédente » | pilote ce qui joue (Spotify, navigateur, AM Music… tout ce que le panneau média de Windows voit) | elle se tait la tête basse, danse, ou balaie l'air du bras |
| « c'est quoi cette musique ? » | te dit le titre et l'artiste | elle tend l'oreille |
| « mets du Daft Punk » | le cherche sur Spotify s'il est installé, sinon sur YouTube Music | elle danse |
| « volume à 30 », « monte le son », « baisse un peu », « à fond », « coupe le son » | le volume du PC | une barre de volume à côté de sa tête ; bras levés pour monter, mains poussées vers le bas pour baisser |
| « baisse Spotify », « volume de Discord à 20 » | le curseur de cette appli dans le mélangeur de volume de Windows | pareil, avec le nom de l'appli |

Si elle ne trouve ni appli ni site au nom que tu dis, elle te le dit et propose de le chercher sur le web (un bouton,
ou « oui » à voix haute).

Ce qu'elle ne fait jamais : toucher à tes fichiers, à tes réglages ou à tes messages. Une appli n'est lancée que si
elle est dans ton menu Démarrer (ou un jeu Steam / Epic), et une page ne s'ouvre qu'en `http(s)`.

Et sans rien lui demander :
- **La molette** sur elle règle le volume (une barre s'affiche à côté de sa tête), **le clic du milieu** met la musique
  en pause ou la relance.
- **Quand ta musique joue**, elle danse dessus de temps en temps (des notes s'envolent de sa crinière), et commente
  parfois un nouveau morceau. Son menu › **Bouger sur ma musique** pour la calmer.

### Elle regarde ton écran (quand tu le demandes)

« Regarde mon écran », « qu'est-ce que tu vois ? », ou son menu › **Regarder mon écran** : sa tête se redresse, ses
yeux en gros plan, une ligne rouge descend tout l'écran et ses coins se verrouillent, puis elle te dit ce qu'elle voit
et le commente, dans son personnage.

- **Ta permission d'abord.** Par défaut elle demande à chaque fois (**Toujours**, **Juste cette fois**, **Non**, ou
  « oui » à voix haute). Son menu › **Voir mon écran quand je le demande** la laisse regarder sans demander. Elle ne
  regarde jamais d'elle-même, sauf si tu coches l'option ci-dessous.
- **Des coups d'œil à elle** (désactivé par défaut) : son menu › **Commenter mon écran de temps en temps**. Toutes les
  6 à 12 minutes, à un moment calme (pas de chat ouvert, rien à l'écran, Claude au repos, elle réveillée), elle jette un
  œil à ton écran et dit une petite phrase dessus dans une bulle « COUP D'ŒIL ». Elle reste vague sur ce qui a l'air
  privé et évite de se répéter. Même image unique, même modèle local, rien d'enregistré.
- **Une seule image**, de l'écran où elle est, prise au moment où tu le demandes, sans elle dessus, envoyée au modèle
  local puis jetée. Rien n'est enregistré.
- **Il faut un modèle qui voit** les images, dans Ollama (quel que soit le modèle de son chat, Gemini ou Claude Code compris) : `ollama pull gemma3` (environ 3 Go ; `llava`, `qwen2.5vl`, `minicpm-v`…
  marchent aussi). Elle le trouve toute seule ; son menu › **Modèle qui voit (Ollama)** pour en choisir un autre. Si ton
  modèle de chat voit déjà les images, elle s'en sert.

### Lui parler à voix haute

Son menu › **Lui parler à voix haute**, **Ctrl+Alt+V** n'importe où, ou le bouton **VOIX** de son chat : elle t'écoute
(des arcs de son autour de sa tête, verts quand c'est toi qui parles), te répond **à voix haute**, puis t'écoute à
nouveau. Tout ce qu'elle sait faire marche aussi à l'oral : « baisse le son », « ouvre YouTube », « regarde mon
écran », et « oui » pour confirmer. « Au revoir » ou « stop », Ctrl+Alt+V ou ✕ pour arrêter ; si tu ne dis rien,
elle demande si tu es toujours là, puis coupe le micro. Tu peux toujours écrire pendant ce temps.

- **Ses oreilles** : [Whisper](https://github.com/openai/whisper), un modèle de reconnaissance vocale qui tourne **sur
  ton PC** (sur la carte graphique quand il y en a une, via [transformers.js](https://github.com/huggingface/transformers.js)).
  La première fois, elle te demande avant de le télécharger depuis Hugging Face (environ 210 Mo, une seule fois).
  Son menu › **Sa voix** › **Reconnaissance vocale** : *tiny* (plus rapide), *base* (par défaut), *small* (plus
  précis, plus lourd).
- **Sa voix** : au choix dans son menu › **Sa voix**, et **Lire ses réponses écrites à voix haute** si tu veux
  l'entendre aussi quand tu écris.
  - **Voix de Capri** : sa vraie voix, une voix neuronale ([Piper](https://github.com/rhasspy/piper)) qui tourne sur
    ton PC et rendue *sienne* : petite, douce et un peu chuchotée, avec le chœur des esprits en elle, des arrêts nets
    comme si son processeur freezait, un mot qui bégaie comme un CD rayé, des voix plus âgées qui remontent sous la
    sienne, et des « Hihi ! » / « Oups ! » saturés coupés par de la friture. Son menu › **Sa voix** › **Ses glitchs** :
    *Légers*, *Poupée flippante* (par défaut), *Construct instable*. La première fois, elle demande avant de
    télécharger la voix (environ 63 Mo) et eSpeak-NG (18 Mo, qui lit le texte pour la voix) : une seule fois, puis
    tout se passe sur ton PC. Pas de voix féminine Piper en portugais : là, elle garde celle de Windows.
  - **Une des voix de Windows** (Hortense, Julie, Paul en français…), rien à installer. C'est aussi celle qu'elle prend
    si sa voix n'est pas encore là.
- **Le micro** n'est allumé que pendant une conversation vocale, et coupé quand elle parle (pour qu'elle ne s'entende
  pas elle-même). Ta voix ne quitte jamais ton PC. S'il ne marche pas : Paramètres Windows › Confidentialité ›
  Microphone › autoriser les applis de bureau.

### La personnaliser

Clic droit sur elle › **La personnaliser…** (ou « Me personnaliser » dans son guide), un panneau à la fois, et chacun
peut être passé :

- **Comment elle t'appelle.** Elle s'en sert de temps en temps, et en revenant (« Capri en ligne. Salut, Max. »).
- **Comment elle est**, avec tes mots (« plus taquine, et parle-moi de Night City ») : son chat suit ça. Elle reste
  Capri.
- **Des phrases à toi**, qu'elle dit de temps en temps avec les siennes quand tu cliques sur elle. Écris `{name}` dans
  l'une d'elles et elle y met ton prénom.
- **Des choses à retenir** (ton jeu préféré, ton chat, D…) : son chat les garde en tête.

Dans son chat, « appelle-moi Léa » et « souviens-toi que mon chat s'appelle Neko » marchent aussi. Tout ça reste dans
ses réglages, sur ton PC.

Elle n'attrape la souris que sur son corps (au pixel près) : tout le reste de l'écran reste utilisable normalement.

- **Clic** sur elle : elle te dit où en est Claude (s'il ne se passe rien : un bouton **Parle-moi**, pour discuter
  avec elle).
- **Glisser** : tu la déplaces.
- **Molette** sur elle : le volume. **Clic du milieu** : pause / lecture.
- **Ctrl+Alt+V** : une conversation à voix haute (et Ctrl+Alt+V à nouveau pour l'arrêter).
- **Clic** sur le panneau : il se ferme.
- **Ctrl+Alt+C** : elle se range (dans son biochip, comme dans la série) et il ne reste d'elle que son masque, les yeux
  fermés, en bas à gauche de l'écran. Ses yeux ne s'ouvrent que quand Claude a besoin de toi. Clique sur le masque
  (ou refais Ctrl+Alt+C) pour la faire revenir.
- **Son menu** : clic droit sur elle (il est aussi sur son icône près de l'horloge) : téléporter, regarder le satellite,
  démo, comment ça marche, rapport de mission, lui parler, lui parler à voix haute, regarder mon écran, taille, son,
  écran, modèle IA, voir mon écran, commenter mon écran, modèle qui voit, sa voix, bouger sur ma musique, mes mails, se balader, posséder tes fenêtres,
  langue, lancement au démarrage, hooks.

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

Garde ce terminal ouvert tant qu'elle tourne. Pas encore testé sur macOS ni Linux : elle devrait démarrer, mais les tours
avec les fenêtres (s'asseoir dessus, les posséder, t'afficher la réponse de Claude quand tu es ailleurs) ne marchent que
sous Windows, et sous Linux le calque transparent marche mieux sous X11 (Wayland a du mal avec les fenêtres qui laissent
passer les clics).

### La brancher sur Claude Code à la main

Clic droit sur Capri, puis **Installer les hooks Claude Code**. Ou en ligne de commande :

```bash
npm run hooks:install
```

Ça ajoute un hook à `~/.claude/settings.json` (une sauvegarde est faite à côté, tes hooks existants sont gardés).
Relance tes sessions Claude Code ensuite. Pour retirer : `npm run hooks:uninstall`.

Les hooks sont lancés en `async` : ils ne ralentissent jamais Claude, et si Capri n'est pas lancée ils ne font rien.

### Codex ou Antigravity à la place de Claude Code

Clic droit sur elle › **Surveiller** › **Codex** ou **Antigravity**. Elle te salue et propose de se brancher, comme
pour Claude Code. Ensuite :

- **Codex** : relance-le et autorise ses hooks quand il te le demande. Ils vont dans `~/.codex/hooks.json`. Son hook
  pour Codex a besoin de [Node.js](https://nodejs.org) 20 ou plus dans ton PATH.
- **Antigravity** : lance une nouvelle conversation. Ses hooks vont dans `~/.gemini/config/hooks.json`.

Elle en suit un seul à la fois, celui choisi dans son menu, et ses répliques, son guide et son chat prennent son nom.
Elle ne fait que regarder : quand Codex ou Antigravity demande une autorisation, c'est toujours là-bas que tu réponds.
En ligne de commande : `npm run hooks:codex:install` ou `npm run hooks:agy:install` (`:uninstall` pour les retirer),
et `npm run test:hooks` lance les tests des deux adaptateurs. **Surveiller** › **Rien, juste me tenir compagnie** :
elle ne parle plus d'aucun.

### Tester sans Claude

```bash
npm run demo
```

Rejoue une fausse session complète (lecture, recherche web, sous-agent, écriture, test qui plante, demande de
permission, fin), puis montre tout ce qu'elle fait toute seule, une phrase avant chaque numéro : ses autres esprits,
l'éclair sur ta souris, la grande séquence du satellite, la possession d'une fenêtre (un petit terminal s'ouvre
pour elle, puis se ferme sous elle et elle tombe), le sommeil jusqu'à son masque, et le rangement en bas à gauche.
C'est aussi dans le menu de l'icône, dans sa langue ; en ligne de commande c'est en anglais, ou précise la langue :
`npm run demo -- fr` (ou `es`, `pt`, `ru`).

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
- Ce qu'elle peut faire quand tu le lui demandes : la musique, le volume, lancer une appli du menu Démarrer, ouvrir une
  page web ou une recherche, fermer une appli (après ton clic ou ton « oui »), regarder ton écran (avec ta permission).
  Rien d'autre : ni tes fichiers, ni tes réglages, ni tes messages. Un petit script PowerShell (`src/main/system.ps1`,
  à lire) fait ces gestes pour elle.
- L'avertissement de SmartScreen vient du fait que l'installeur n'est pas signé, pas de ce qu'il fait.

## FAQ

- **Mac, Linux ?** Pas encore d'installeur, mais tu peux la lancer depuis le code (voir plus haut).
- **Téléphone, Android ?** Non, il lui faut un ordinateur.
- **D'autres assistants ?** Claude Code, Codex et Antigravity : son menu › **Surveiller**. Cursor, Windsurf et Gemini CLI : pas encore.
- **Ollama ?** De deux façons. Claude Code qui tourne sur un modèle local via Ollama (`ollama launch claude`) : elle le
  voit comme n'importe quel Claude Code, c'est juste plus lent, et son ticker compte les secondes pendant qu'il
  réfléchit. Et elle peut discuter avec toi via Ollama : voir « Lui parler ».
- **Elle bouge à peine, son intro apparaît et disparaît juste en fondu.** Windows a ses animations coupées
  (Paramètres › Accessibilité › Effets visuels › Effets d'animation), et elle suit ce réglage. Son menu ›
  **Animations** › **Toutes** la fait bouger quand même ; la première fois, elle te pose la question.
- **Un écran noir derrière elle.** Sur certains PC, sa fenêtre transparente s'affiche en noir (souvent les cartes
  NVIDIA avec FXAA, MFAA ou le HDR activés ; d'autres applis du même genre comme Desktop Mate le font aussi). Clic droit
  sur elle, ou sur son icône près de l'horloge › **Affichage** › **OpenGL** : elle redémarre en se dessinant autrement.
  Toujours noir ? **Sans la carte graphique**, qui demande un peu plus au processeur. Couper FXAA et MFAA dans le
  panneau de configuration NVIDIA peut aussi régler le problème.
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

Son chat va à Ollama sur ton PC (`127.0.0.1:11434`, ou `OLLAMA_HOST`) avec ce qu'elle sait du moment (le nom du
projet, la dernière action de Claude, les compteurs du jour). Son journal de mission reste dans son propre stockage,
sur ton PC.

Quand tu lui demandes de regarder ton écran, l'image va au même Ollama local, pour cette réponse seulement, puis elle
est jetée. En conversation vocale, ta voix est transcrite sur ton PC (Whisper) et n'est jamais envoyée ni enregistrée.
Les seules connexions vers l'extérieur sont celles que tu demandes : le téléchargement unique du modèle Whisper
depuis Hugging Face, celui de sa voix (Hugging Face pour la voix Piper, jsDelivr pour eSpeak-NG, chacun à une version
fixe et vérifié par son empreinte avant d'être gardé), toujours après ton accord, et les pages ou recherches qu'elle
ouvre dans ton navigateur.

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
- **Son intro** : un gros plan d'elle, découpé pour que ton bureau se voie autour de sa crinière
  (`tools/build-intro.py`), en six dessins échangés comme des cellulos (au repos, la bouche entrouverte, à moitié et
  grande ouverte pour « hi », la main penchée d'un côté puis de l'autre pour le coucou, une image sur trois), et
  tout le reste est de l'animation par-dessus : des images d'impact (elle en silhouette
  blanche puis noire), un décalage RVB qui se resserre, l'écran qui tremble, le trait qui vibre une image sur deux,
  ses yeux redessinés par-dessus ceux de l'image pour qu'ils regardent autour et clignent, la caméra qui avance,
  l'étiquette qui claque. Jamais un bord droit de l'image à l'écran : elle apparaît par des découpes en dents de
  scie qui bougent (ses bras depuis les côtés, puis qui se brisent depuis les mains, puis sa tête seule pour le
  plongeon, avec des images rémanentes et son zigzag).
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
tools/build-cutins.py    découpe les cut-ins et ses expressions dans des images de la série
tools/build-intro.py     détoure les gros plans de son intro, tous de la même façon
src/main/                Electron : fenêtre transparente plein écran, clic à travers, tray, bridge HTTP local
  windows.js / .ps1      où sont les autres fenêtres (Windows), pour qu'elle s'assoie dessus
  ollama.js              son chat : le modèle local, via Ollama
  apps.js                fermer une appli que tu lui demandes de fermer (après ton clic)
  system.js / .ps1       ses mains sur le PC : musique, volume (le PC ou une appli), applis du menu Démarrer, pages web
  sight.js               une image de ton écran, quand tu lui demandes de regarder
src/renderer/js/
  sprite.js              shader WebGL : tête, crinière, position assise, smears, images rémanentes, couleurs, glitch
  acting.js              les feuilles d'exposition : chaque mouvement, dessin par dessin
  capri.js               le personnage : postures, téléportation, assise, bords d'écran, chute, drag, sommeil
  fx.js                  éclats, colonnes de lumière, éclairs, glyphes, lignes de vitesse, ondes de choc, le satellite et la lumière rouge, les fenêtres possédées, les cut-ins, son intro
  panel.js               le panneau « transmission », ses expressions et le ticker
  guide.js               son guide : les tutos, aller jusqu'aux choses et les montrer du doigt
  brain.js               traduit les événements Claude en répliques et en actions
  mission.js             le journal de mission du jour, pour son rapport
  chat.js                lui parler : la conversation, qui elle est, ses réponses qui arrivent, la conversation vocale
  commands.js            ce que tu lui demandes de faire, lu directement dans tes mots (5 langues, sans IA)
  powers.js              le faire : musique, volume, applis, web, avec la réaction qui va avec ; molette, clic du milieu, danser sur ta musique
  ears.js                ses oreilles : le micro, la détection de ta voix, et Whisper (ears-worker.js, ears-worklet.js)
  speech.js              sa voix : la sienne (speech-worker.js : eSpeak-NG puis Piper, voicefx.js : ses effets), ou une de Windows
  lines.js               ce qu'elle dit (FR / EN / ES / PT / RU)
  chip.js                son masque : quand elle dort, et en bas à gauche quand tu la ranges
  voice.js               les sons
```

Pour bosser dessus : `npm run dev` active des routes de debug sur le bridge (`/debug/capture` enregistre une image de la fenêtre dans `captures/`,
`/debug/testwin` ouvre des fenêtres de test sur lesquelles elle peut s'asseoir, une par nom, `/debug/mouse` bouge et clique un pointeur
factice sur la fenêtre de Capri, sans toucher au vrai, `/debug/type` écrit dans son chat, `/debug/command` avec
`{"name":"heard","text":"…"}` fait comme si elle l'avait entendu à voix haute, `{"name":"glance"}` lui fait jeter un coup d'œil à l'écran tout de suite).
Si Capri installée tourne déjà, lance la version de dev à côté avec son propre dossier de données et son propre port :
`CAPRI_PORT=47899 npx electron . --dev --user-data-dir=<un dossier>`.
`npm run dist` fabrique l'installeur Windows dans `dist/`.

## Crédits et droits

Capri / Project Capricorn, Cyberpunk et Cyberpunk: Edgerunners appartiennent à CD PROJEKT RED, Studio Trigger et Netflix.
Projet de fan, non commercial, sans lien avec eux. Les images du personnage dans `assets/capri/` viennent d'images de la série,
d'une découpe faite par des fans et d'un fan art (les gros plans de son intro) ; elles ne sont **pas** couvertes par la licence MIT du code.
Si un ayant droit veut qu'elles soient retirées, ouvre une issue.

Polices : Chakra Petch et JetBrains Mono, sous licence SIL Open Font License, via Fontsource.

Sa voix (téléchargée à ta demande, jamais incluse dans Capri) : les voix [Piper](https://github.com/rhasspy/piper)
*siwis* (français, CC-BY 4.0, SIWIS, University of Edinburgh), *amy* (anglais, voix Mimic 3 de Mycroft), *sharvard*
(espagnol, CC-BY 3.0, University of Edinburgh) et *irina* (russe, RHVoice, licence non précisée), et
[eSpeak-NG](https://github.com/espeak-ng/espeak-ng) (GPL-3.0). Sa voix est conçue à partir de ce qu'on sait du
personnage, pas copiée sur celle d'une actrice.
