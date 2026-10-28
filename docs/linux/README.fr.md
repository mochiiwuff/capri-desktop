# Linux, CachyOS et Hyprland

Capri utilise **X11**, ou **XWayland sous Hyprland**, pour son overlay transparent,
son positionnement et les clics à travers. Le Wayland natif n'est pas pris en charge.
Les fenêtres Wayland des autres applications sont suivies par `hyprctl`.

## CachyOS / Arch

Installer les paquets système (Node.js 22.12 minimum) :

```sh
sudo pacman -S --needed nodejs npm gtk3 nss alsa-lib libxss libxtst mesa xorg-xwayland
npm ci
npm start
```

Lancer depuis un terminal **dans la session Hyprland** : `DISPLAY` et
`HYPRLAND_INSTANCE_SIGNATURE` doivent être hérités. `hyprctl` est fourni par
Hyprland. Aucun accès root n'est nécessaire pour lancer Capri.

Pour générer les paquets :

```sh
npm run dist:linux
```

Les fichiers sont dans `dist/`. Pour l'AppImage :

```sh
chmod +x dist/Capri-*.AppImage
./dist/Capri-*.AppImage
```

Si FUSE n'est pas disponible, extraire l'AppImage avec `--appimage-extract`, puis
lancer `squashfs-root/AppRun`, ou utiliser l'archive `tar.gz` et son exécutable `capri`.
`npm run dist:win` conserve la génération de l'installateur Windows.

## Configuration Hyprland

Ajouter une règle pour que le gestionnaire de fenêtres ne transforme pas l'overlay
plein écran en fenêtre carrelée. Syntaxe des versions récentes de Hyprland :

```ini
windowrule {
    name = capri-overlay
    match:class = ^(capri)$
    match:title = ^(Capri Overlay)$
    float = on
    pin = on
    no_initial_focus = on
    no_blur = on
    no_shadow = on
    border_size = 0
}
```

Recharger avec `hyprctl reload`. Sur une ancienne version, utiliser les règles
équivalentes documentées par cette version. Vérifier la classe effective avec
`hyprctl clients` si une règle ne s'applique pas.

Pour une première validation, régler les moniteurs à une échelle de **1** et ne pas
activer `xwayland:force_zero_scaling`. Les coordonnées Hyprland sont logiques ;
le placement avec échelles fractionnaires ou différentes entre écrans reste à
valider sur une machine réelle. Ne pas forcer `--ozone-platform=wayland` : les API
Electron nécessaires au déplacement et aux clics à travers y sont limitées.

Une barre avec module de tray (par exemple Waybar avec `tray`) permet d'accéder au
menu. Le clic droit sur Capri ouvre également son menu. Sous Hyprland, un raccourci
peut être réservé au compositeur : utiliser le menu si Ctrl+Alt+C ne fonctionne pas.
Ollama est facultatif et doit être installé/démarré séparément pour le chat local.

Pour conserver une clé API entre les lancements, un trousseau GNOME/libsecret ou
KWallet doit être disponible et déverrouillé. Sinon Capri utilise la clé uniquement
en mémoire pour la session ; elle ne la sauvegarde pas via `basic_text`. Voir le
[guide de stockage et de récupération](../STORAGE.fr.md).

## Diagnostic depuis le menu

Le menu de Capri propose **Diagnostic et fonctions disponibles**. Il indique la
session détectée, l’affichage X11/XWayland, la réponse de `hyprctl` et les fonctions
prises en charge. **Actualiser** relance les vérifications après une correction.

Les réglages indisponibles sont désactivés : par exemple, le démarrage automatique
Linux et la détection des autres IA ne sont pas encore intégrés. Le chat explique
aussi pourquoi une commande multimédia ou une fermeture d’application ne peut pas
être exécutée. L’assistant de configuration ne propose plus l’ouverture automatique
de Claude/Codex via Ollama sous Linux ; le diagnostic donne la commande manuelle.

Pour la capture Wayland, un portail détecté reste une **condition à vérifier**,
pas une preuve de fonctionnement : la permission et le bureau peuvent influer sur
le résultat. Un portail non actif peut démarrer à la demande. La présence de
`pw-cli` indique seulement que l’outil PipeWire est installé. L’intégration des
captures via les portails reste un chantier distinct.

**Copier le diagnostic** copie un rapport JSON limité aux états techniques, à la
distribution reconnue et aux versions de Capri/Electron. Il ne contient ni valeurs
de variables d’environnement, ni chemins personnels, ni titres de fenêtres, ni
conversations, ni sorties brutes des commandes. La visibilité effective du tray
reste inconnue : vérifier le module Waybar si l’icône manque.

## Fonctionnalités et limites

- Overlay, animations et hooks Claude/Codex/Antigravity : fonctionnement commun.
- Hyprland : suivi des fenêtres mappées sur les espaces visibles et spéciaux,
  fenêtres épinglées, fenêtre active, coordonnées relatives à l'écran de Capri.
  Les titres ne sont pas envoyés au rendu. Une panne de `hyprctl` vide la liste
  et le suivi reprend automatiquement quand le compositeur répond.
- Autres bureaux Linux : overlay disponible sous X11/XWayland, sans suivi des fenêtres.
- Recherche de fichiers : parcours des dossiers personnels, sans Windows Search.
- Ouverture des dossiers et fichiers : associations du bureau via Electron.
- Catalogue d'applications installées, fermeture d'applications, touches multimédia,
  détection des jeux et périphériques USB : intégrations Windows seulement.
- Captures d'écran : sous Wayland, permissions et sélection peuvent dépendre du
  portail (`xdg-desktop-portal-hyprland`, PipeWire) et de la version d'Electron.
- L'ordre d'occlusion des fenêtres et les applications plein écran peuvent limiter
  les effets dessinés par-dessus ; aucun protocole layer-shell n'est utilisé.

## Vérification

```sh
npm run test:linux
npm run test:hooks
npm run dev
```

Dans Hyprland, vérifier transparence, clic à travers hors personnage, glisser/déposer,
changement d'espace de travail, fermeture d'une fenêtre et passage entre écrans.
Les tests Node vérifient l'adaptateur ; ils ne remplacent pas ces essais graphiques.
