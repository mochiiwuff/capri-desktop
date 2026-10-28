# Développement et tests

Utiliser Node.js **22.12 minimum**, ou Node.js 24 LTS. Cette version minimale
correspond aux dépendances de développement Electron du lockfile. Les hooks
installés séparément continuent de nécessiter Node.js 20 minimum.

```sh
npm ci
npm test
```

`npm test` exécute les suites `tests/*.test.js` : hooks Claude/Codex/Antigravity,
traductions, installation des hooks et suivi des fenêtres Hyprland. Les tests
de hooks ouvrent un serveur HTTP éphémère sur `127.0.0.1` : l’environnement doit
autoriser l’écoute locale. Aucun modèle IA ni service distant n’est requis.

La suite `tests/platform.test.js` vérifie aussi la détection des capacités Linux,
les réponses invalides des services, le contenu du diagnostic et les explications
affichées lorsque des actions ne sont pas disponibles. Les services sont simulés :
ces tests tournent également sur le runner Windows.

Les suites peuvent aussi être exécutées séparément :

```sh
npm run test:hooks
npm run test:linux
```

Les tests Hyprland simulent les réponses du compositeur et le passage du temps.
Ils vérifient les espaces de travail, les pannes, les réponses invalides, la
reconnexion, les requêtes lentes et l’arrêt du suivi avec une requête en cours.
Ils ne nécessitent ni Linux ni une session Hyprland.

## Démarrage graphique Linux

```sh
npm run test:smoke
```

Cette commande nécessite un affichage X11 réel ou virtuel. Sur un serveur sans
session graphique, installer Xvfb et xauth, puis lancer :

```sh
xvfb-run -a -s '-screen 0 1920x1080x24' npm run test:smoke
```

Le test lance sa propre instance Electron avec un profil temporaire, un port
éphémère et le rendu logiciel WebGL. Il vérifie le bridge HTTP, une première
image dessinée par WebGL, le menu et la réception d’un événement de hook par le
cerveau du personnage. Il termine sa propre instance et supprime son profil,
sans installer de hooks ni modifier les réglages de l’utilisateur.
Il vérifie aussi l’accès au diagnostic via IPC, les réglages Linux désactivés dans
le menu et l’explication des commandes multimédias indisponibles dans le chat.

Le serveur X virtuel ne valide pas la transparence avec le compositeur, les clics
à travers ou le multi-écran Hyprland. Pour ces essais, suivre le
[guide CachyOS/Hyprland](linux/README.fr.md).

## Intégration continue

Le workflow [Tests](../.github/workflows/ci.yml) exécute `npm test` sous Linux et
Windows, avec Node.js 22.12 et 24. Un job Linux distinct lance le test Electron
sous Xvfb avec son sandbox activé. Les dépendances sont installées avec `npm ci`.

Les jobs s’exécutent lors des push et des pull requests, ou manuellement depuis
GitHub Actions. La configuration du workflow ne prouve pas que les jobs ont
réussi : consulter les résultats de l’exécution sur GitHub.
