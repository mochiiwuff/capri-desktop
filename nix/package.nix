{
  lib,
  buildNpmPackage,
  electron,
  makeWrapper,
  makeDesktopItem,
  copyDesktopItems,
  nodejs,
  glib,
  playerctl,
  wireplumber,
  xdg-utils,
  libX11,
  libXext,
}:

let
  # what she runs on Linux: node for her Claude Code hook, gio to start apps and open the trash,
  # playerctl and wpctl for music and volume, xdg-open for links
  runtimePath = lib.makeBinPath [
    nodejs
    glib
    playerctl
    wireplumber
    xdg-utils
  ];
in
buildNpmPackage {
  pname = "capri-desktop";
  version = (lib.importJSON ../package.json).version;

  src = lib.cleanSourceWith {
    src = ./..;
    filter =
      path: _:
      !(lib.hasInfix "/node_modules" path || lib.hasInfix "/dist" path || lib.hasInfix "/result" path);
  };

  npmDepsHash = "sha256-qiCvtUcEGMRuudcXuXMSAYdwdslt+0fSg8UAnaMgH18=";

  # electron comes from nixpkgs: no binary download, no electron-builder
  env.ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
  npmFlags = [ "--ignore-scripts" ];
  dontNpmBuild = true;

  nativeBuildInputs = [
    makeWrapper
    copyDesktopItems
  ];
  buildInputs = [
    libX11
    libXext
  ];

  installPhase = ''
    runHook preInstall

    npm prune --omit=dev --ignore-scripts

    # where her window takes the pointer on X11 (src/main/shape.js)
    mkdir -p $out/libexec
    $CC -O2 -o $out/libexec/capri-shape native/capri-shape.c -lX11 -lXext
    mkdir -p $out/share/capri
    cp -r src assets hooks scripts package.json LICENSE node_modules $out/share/capri/

    # XWayland: on GNOME's Wayland a window can't keep itself on top or place itself, she needs both.
    # ~/.local/bin last on PATH: where the Claude Code installer puts `claude`.
    makeWrapper ${lib.getExe electron} $out/bin/capri \
      --add-flags $out/share/capri \
      --add-flags "--ozone-platform=x11" \
      --prefix PATH : ${runtimePath} \
      --set CAPRI_SHAPE $out/libexec/capri-shape \
      --run 'export PATH="$PATH:$HOME/.local/bin"'

    install -Dm644 assets/icons/capri.png $out/share/pixmaps/capri.png

    runHook postInstall
  '';

  desktopItems = [
    (makeDesktopItem {
      name = "capri";
      desktopName = "Capri";
      comment = "Desktop companion for Claude Code";
      exec = "capri";
      icon = "capri";
      categories = [ "Utility" ];
    })
  ];

  meta = {
    description = "Capri, a desktop companion that narrates what Claude Code is doing and chats through it";
    homepage = "https://github.com/mochiiwuff/capri-desktop";
    license = lib.licenses.unfree; # PolyForm Noncommercial 1.0.0
    platforms = lib.platforms.linux;
    mainProgram = "capri";
  };
}
