# Plan d’amélioration de Capri

Proposition fondée sur le commit `4e10e49`, avec CachyOS et Hyprland comme cible
Linux prioritaire. Ce document décrit des travaux à réaliser, pas des fonctionnalités
déjà disponibles. Les versions ci-dessous sont des jalons proposés.

## Suivi du premier chantier

- Le test de traduction accepte désormais uniquement la valeur nulle intentionnelle
  de `bond.up[0]`. Les vérifications des textes Claude/Codex/Antigravity sont conservées.
- `npm test` regroupe les suites : 14 tests passent localement, dont 9 pour Hyprland.
- `npm run test:smoke` vérifie le démarrage Electron, WebGL, le menu et la réception
  d’un hook dans le renderer avec un profil isolé ; ce test passe sous Xorg virtuel.
- Le workflow GitHub Actions est préparé pour Linux/Windows et Node.js 22.12/24,
  avec un job graphique Linux sous Xvfb. Son résultat distant reste à vérifier.
- Les dépendances de développement exigent Node.js 22.12 minimum ; la déclaration
  et la documentation sont alignées sur cette exigence.

Les lots suivants restent à réaliser, en particulier la validation sur CachyOS/Hyprland réel.

## État de départ

- L’overlay Linux fonctionne avec X11/XWayland. Le placement, les clics à travers
  et les configurations multi-écrans restent à vérifier dans une vraie session Hyprland.
- Le suivi Hyprland exécute trois commandes `hyprctl` toutes les 500 ms.
- Plusieurs intégrations restent propres à Windows : catalogue d’applications,
  fermeture des applications, commandes multimédias et détection USB/jeux.
- Dernière validation : quatre tests Linux réussis ; quatre tests de hooks réussis
  et un échec dans le parcours des traductions (`tests/hooks.test.js:113`).
- Aucune configuration GitHub Actions n’est présente dans le dépôt.
- La sauvegarde des clés API revient au texte clair lorsque le chiffrement est
  indisponible. La configuration est écrite directement dans son fichier final.
- `main.js` dépasse 1 000 lignes, `capri.js` 2 400 et `fx.js` 2 100 : les prochaines
  évolutions gagneraient à isoler leurs responsabilités progressivement.

## 1. Stabiliser et automatiser les vérifications — priorité P0

**Objectif : disposer d’une base fiable avant d’ajouter des fonctions.**

- Diagnostiquer l’échec du test de traduction : distinguer les valeurs nulles
  autorisées des traductions réellement manquantes, puis corriger sans affaiblir
  les assertions concernant Claude, Codex et les langues disponibles.
- Ajouter une commande `npm test` regroupant les suites et une CI Linux/Windows
  avec installation par `npm ci` et version Node explicitement choisie.
- Tester les pannes de `hyprctl`, les réponses invalides, la reprise du suivi,
  l’arrêt pendant une requête et les changements d’espace de travail.
- Ajouter un test de démarrage Electron sous affichage X virtuel : initialisation
  du personnage, réponse du bridge et absence d’erreur fatale du renderer.

**Critère de sortie :** toutes les suites prévues passent en CI ; le test graphique
Linux démarre réellement le rendu ; les limites du test virtuel sont documentées.

## 2. Fiabiliser CachyOS et Hyprland — priorité P0

**Objectif : obtenir une première version Linux validée sur un bureau réel.**

- Vérifier installation, transparence, clics à travers, interaction avec Capri,
  saisie dans le chat, tray Waybar et raccourcis dans une session CachyOS/Hyprland.
- Tester les échelles 100 %, 125 %, 150 % et les écrans avec échelles différentes,
  y compris les écrans placés à gauche et au-dessus de l’écran principal.
- Corriger la conversion des coordonnées Hyprland/Electron et expliciter le
  comportement avec `xwayland:force_zero_scaling`.
- Vérifier espaces spéciaux, fenêtres épinglées, plein écran, branchement d’écran,
  veille et reprise. Réviser les règles Hyprland à partir de ces essais.
- Exposer les capacités détectées : session, XWayland, `hyprctl`, tray et capture.
  Expliquer une fonction indisponible au lieu de laisser un bouton sans effet.

**Critère de sortie :** matrice d’essais renseignée avec versions et résultats ;
installation reproductible sur une machine CachyOS ; aucune limitation importante
non documentée. Une session Hyprland réelle est nécessaire pour clôturer ce lot.

## 3. Sécuriser la conservation des données et faciliter le diagnostic — priorité P1

**Objectif : éviter les pertes de réglages et rendre les erreurs compréhensibles.**

- Utiliser le trousseau disponible sous Linux et détecter aussi le backend
  `basic_text` d’Electron. Sans stockage sûr, proposer une clé limitée à la session
  ou une variable d’environnement ; ne pas l’enregistrer silencieusement en clair.
- Prévoir la migration des clés existantes sans les afficher dans les journaux.
- Valider et versionner la configuration ; écrire via un fichier temporaire puis
  remplacement atomique, avec sauvegarde et récupération d’un fichier corrompu.
- Valider les entrées du bridge et des appels IPC : événements acceptés, types,
  tailles et paramètres des actions sur les fichiers/applications.
- Présenter les erreurs utiles : port occupé, Ollama arrêté, modèle introuvable,
  portail indisponible ou refus de capture. Ajouter un diagnostic exportable qui
  exclut clés, conversations, captures et titres de fenêtres.

**Critère de sortie :** tests de sauvegarde interrompue, configuration invalide,
absence de trousseau et erreurs des services ; aucun secret dans les diagnostics.

## 4. Compléter les intégrations Linux — priorité P1

**Objectif : rapprocher les usages quotidiens de ceux disponibles sous Windows.**

- Découvrir les applications via les entrées XDG `.desktop` et les lancer avec
  les outils du bureau, sans interpréter leur commande avec un shell improvisé.
- Gérer les contrôles multimédias via MPRIS, éventuellement avec `playerctl`.
- Proposer la fermeture normale d’une fenêtre Hyprland après confirmation et
  revérification de sa cible. Garder l’arrêt forcé comme action distincte.
- Intégrer les captures via les portails du bureau et traiter explicitement
  refus, annulation et absence de service ; vérifier PipeWire sur Hyprland.
- Proposer un démarrage automatique XDG désactivable, sans modifier automatiquement
  la configuration personnelle de Hyprland.
- Ajouter ensuite batterie/chargeur via UPower et périphériques via UDisks/udev,
  selon leur utilité réelle et les permissions disponibles.

**Critère de sortie :** scénarios de bout en bout sur CachyOS ; dépendances
facultatives identifiées ; comportement explicite lorsqu’un outil manque.

## 5. Réduire la consommation et simplifier les évolutions — priorité P1/P2

**Objectif : garder un compagnon discret et un code facile à faire évoluer.**

- Mesurer CPU, mémoire, réveils et fluidité au repos, pendant les animations,
  en veille et durant une longue session de hooks sur une machine de référence.
- Exploiter le flux d’événements Hyprland pour déclencher les actualisations,
  avec regroupement des événements et interrogation périodique de secours.
  Reconnecter proprement après une coupure du compositeur.
- Réduire les tâches inutiles lorsque Capri est rangée ou la session verrouillée,
  en conservant les événements nécessaires aux notifications.
- Extraire progressivement les adaptateurs Windows/Hyprland, les handlers IPC,
  la gestion des écrans et les fournisseurs IA. Définir un contrat de capacités
  commun plutôt que multiplier les conditions de plateforme dans l’interface.
- Séparer ensuite la physique, les états du personnage et les effets visuels,
  avec des tests de comportement avant chaque extraction importante.

**Critère de sortie :** comparaison avant/après dans les mêmes conditions ; moins
de processus `hyprctl` au repos, sans régression de réactivité ou d’animation.
Les objectifs chiffrés seront fixés après la mesure initiale.

## 6. Distribuer des versions faciles à installer — priorité P1

**Objectif : pouvoir installer Capri sans environnement de développement.**

- Générer AppImage, archive Linux et installateur Windows en CI ; vérifier
  les métadonnées du fork, l’icône et l’association de la fenêtre au lanceur.
- Préparer des releases GitHub avec notes, sommes SHA-256 et artefacts testés.
- Fournir un `PKGBUILD` pour Arch/CachyOS, d’abord vérifié localement ; une
  publication AUR éventuelle constitue une étape distincte.
- Tenir les guides français et anglais à jour avec une matrice de fonctionnalités
  par plateforme et une rubrique de dépannage courte.
- Améliorer la navigation clavier, le focus du chat et l’option de réduction des
  animations, particulièrement lors de l’utilisation sous Hyprland.

**Critère de sortie :** installation et lancement depuis les artefacts sur une
machine propre ; sommes vérifiables et notes de version mentionnant les limites.

## Ordre de livraison proposé

| Jalon | Contenu | Condition avant livraison |
| --- | --- | --- |
| 0.4.5 | Tests/CI, réglages et stockage des clés, diagnostics essentiels | Lot 1 terminé ; corrections du lot 3 vérifiées |
| 0.5.0 | Support CachyOS/Hyprland validé, premières intégrations et paquets Linux | Lot 2 terminé ; fonctions retenues du lot 4 testées ; artefacts du lot 6 vérifiés |
| 0.6.0 | Suivi événementiel, consommation réduite, découpage progressif | Mesures et tests de non-régression du lot 5 |

Les nouvelles fonctions du lot 4 peuvent être livrées séparément. La détection USB
et une éventuelle publication AUR ne bloquent pas une première version Linux fiable.
Les améliorations d’accessibilité accompagnent chaque changement d’interface.

Un support Wayland natif via layer-shell mérite un prototype séparé après la
stabilisation de XWayland : vérifier d’abord sa faisabilité avec Electron, le
multi-écran et les régions d’entrée avant de prévoir une migration.

**Premier chantier recommandé :** corriger le test de traduction, ajouter `npm test`
et la CI, puis compléter les tests de panne/reprise Hyprland. Cela fournit une base
de contrôle pour tous les lots suivants.
