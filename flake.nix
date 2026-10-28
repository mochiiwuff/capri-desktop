{
  description = "Capri — desktop companion that narrates Claude Code and chats through it (NixOS port)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        rec {
          capri = pkgs.callPackage ./nix/package.nix { };
          default = capri;
        }
      );

      # The package, plus Capri started in every graphical session (systemd --user).
      nixosModules.default =
        { pkgs, ... }:
        let
          # built with the system's own nixpkgs: its licence is non-commercial (unfree to Nix), and
          # the system is where allowUnfree is set
          capri = pkgs.callPackage ./nix/package.nix { };
        in
        {
          environment.systemPackages = [ capri ];

          systemd.user.services.capri = {
            description = "Capri desktop companion";
            wantedBy = [ "graphical-session.target" ];
            partOf = [ "graphical-session.target" ];
            after = [ "graphical-session.target" ];
            serviceConfig = {
              ExecStart = "${capri}/bin/capri";
              Restart = "on-failure";
              RestartSec = 5;
            };
          };
        };
    };
}
