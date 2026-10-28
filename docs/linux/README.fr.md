# Linux, CachyOS et Hyprland

Capri utilise **X11**, ou **XWayland sous Hyprland**, pour son overlay transparent,
son positionnement et les clics à travers. Le Wayland natif n'est pas pris en charge.
Les fenêtres Wayland des autres applications sont suivies par `hyprctl`.

## CachyOS / Arch

Installer les paquets système (Node.js 20 minimum) :

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
