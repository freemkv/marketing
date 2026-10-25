---
title: Install
description: Get freemkv — the app or the CLI — or the freemkv-library server. Prebuilt downloads or build from source.
---

There are two programs: **freemkv**, for ripping and converting discs, and **freemkv-library** (a hands-off web server, Docker image).

freemkv comes in two builds of the same program. **Install one or the other**, not both; each replaces the other:

- **freemkv** (the app): the desktop window *plus* every CLI command. `freemkv disc:// mkv://Movie.mkv` works in a terminal; a bare `freemkv` opens the window.
- **freemkv CLI**: the command line only, with no desktop dependencies. For servers, scripts and SSH sessions. A bare `freemkv` prints usage.

Either way the command is `freemkv` and the CLI behaves identically.

For per-OS setup (where files live, how to reach the optical drive, and platform quirks), see your **[platform page](/docs/platforms-macos/)** (macOS, Windows, Linux).

## Prebuilt downloads

Go to the **[Download](/download/)** page; it detects your OS and highlights the right build.

| OS | freemkv (app) | freemkv CLI |
|---|---|---|
| **[Windows](/docs/platforms-windows/)** | `scoop install freemkv` ([Scoop](/docs/platforms-windows/#scoop)), the `freemkv-x86_64-windows-setup.exe` installer (adds `freemkv` to PATH) or portable `freemkv-x86_64-windows.zip`; ARM64: `freemkv-aarch64-windows-setup.exe` / `.zip` | `scoop install freemkv-cli`, `freemkv-cli-x86_64-windows.exe`, or `freemkv-cli-aarch64-windows.exe` for ARM64 |
| **[macOS](/docs/platforms-macos/)** | `brew install --cask freemkv/tap/freemkv` for Apple Silicon; `freemkv-x86_64-macos.zip` for Intel | `brew install freemkv/tap/freemkv-cli` for Apple Silicon; `freemkv-cli-x86_64-macos` for Intel |
| **[Linux](/docs/platforms-linux/)** | `sudo apt install freemkv` from the [APT repository](/docs/platforms-linux/#apt-repository-recommended) (Ubuntu 24.04+, Mint 22+, Debian 13+), `sudo dnf install freemkv` from the [RPM repository](/docs/platforms-linux/#rpm-repository-fedora-rhel-opensuse), `sudo pacman -S freemkv` from the [Arch repository](/docs/platforms-linux/#arch-linux-pacman-repository), `snap install freemkv` ([Snap Store](/docs/platforms-linux/#snap-store)), the Flatpak from [FlatPark](/docs/platforms-linux/#flatpak-from-flatpark), or `freemkv-amd64.deb` / `freemkv-arm64.deb`, `freemkv-x86_64-linux.AppImage` / `freemkv-aarch64-linux.AppImage`, `freemkv-x86_64-linux.flatpak` | `freemkv-cli` from the same APT, RPM or Arch repository, `freemkv-cli-{amd64,arm64,armhf}.deb`, or a static binary for x86_64, aarch64 or ARMv7 (32-bit Raspberry Pi OS) |

Every asset has a matching `.sha256` checksum on its releases page: [freemkv](https://github.com/freemkv/freemkv/releases).

## freemkv-library

[freemkv-library](/docs/library/) replaces autorip. It is a web server: insert a disc and it rips automatically to MKV, with progress, settings, history, and a Library tab in the browser. It ships as a Docker image.

```bash
docker run --privileged -v /dev:/dev -p 8080:8080 \
  ghcr.io/freemkv/freemkv-library:latest    # then open http://localhost:8080
```

For a full `docker-compose.yml`, drive permissions, and every setting, see **[freemkv-library → Deploy](/docs/library/#deploy)**. Blu-ray and 4K UHD also need **[decryption keys](/docs/decryption-keys/)**; DVDs work out of the box.

## Build from source

Pure Rust: clone and build with Cargo. freemkv-library is the same repo built with the `server` feature (it runs as `freemkv server`); the Docker image is built from `docker/Dockerfile`:

```bash
# freemkv
git clone https://github.com/freemkv/freemkv
cd freemkv
cargo build --release                  # CLI
cargo build --release --features gui   # app (Linux needs GTK4 4.10+ and libadwaita 1.4+)
cargo build --release --features server   # freemkv-library server
# binary at target/release/freemkv
```

## Next steps

- **[Platforms](/docs/platforms-windows/)**: per-OS setup, file locations, and drive access.
- **[CLI reference](/docs/cli/)**: every subcommand, flag, and stream URL.
- **[Decryption Keys](/docs/decryption-keys/)**: what Blu-ray and UHD need before they decrypt.
