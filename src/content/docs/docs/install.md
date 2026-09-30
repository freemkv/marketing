---
title: Install
description: Get freemkv — the app or the CLI — or the autorip service. Prebuilt downloads or build from source.
---

There are two programs: **freemkv**, for ripping and converting discs, and the **autorip service** (a hands-off web app).

freemkv comes in two builds of the same program. **Install one or the other**, not both; each replaces the other:

- **freemkv** (the app): the desktop window *plus* every CLI command. `freemkv disc:// mkv://Movie.mkv` works in a terminal; a bare `freemkv` opens the window.
- **freemkv CLI**: the command line only, with no desktop dependencies. For servers, scripts and SSH sessions. A bare `freemkv` prints usage.

Either way the command is `freemkv` and the CLI behaves identically.

For per-OS setup (where files live, how to reach the optical drive, and platform quirks), see your **[platform page](/docs/platforms-macos/)** (macOS, Windows, Linux).

## Prebuilt downloads

Go to the **[Download](/download/)** page; it detects your OS and highlights the right build.

| OS | freemkv (app) | freemkv CLI |
|---|---|---|
| **[Windows](/docs/platforms-windows/)** | `freemkv-x86_64-windows-setup.exe` installer (adds `freemkv` to PATH), or the portable `freemkv-x86_64-windows.zip` | `freemkv-cli-x86_64-windows.exe` |
| **[macOS](/docs/platforms-macos/)** | `brew install --cask freemkv/tap/freemkv`, or the `.dmg` (Apple Silicon / Intel) | `brew install freemkv/tap/freemkv-cli`, or the bare binary (Apple Silicon / Intel) |
| **[Linux](/docs/platforms-linux/)** | `freemkv-amd64.deb` (package `freemkv`), `freemkv-x86_64-linux.AppImage`, `freemkv-x86_64-linux.flatpak`, or the Flatpak from [FlatPark](/docs/platforms-linux/#flatpak-from-flatpark); Flathub listing on the way | `freemkv-cli-amd64.deb` (package `freemkv-cli`), or a static binary for x86_64 / aarch64 |

Every asset has a matching `.sha256` checksum on its releases page: [freemkv](https://github.com/freemkv/freemkv/releases) or [autorip](https://github.com/freemkv/autorip/releases).

## autorip

[autorip](/docs/autorip/) is a web app: insert a disc and it rips automatically to MKV, with progress, settings, and history in the browser. It runs on Windows, macOS, or Linux as a single binary, or (on Linux) as a Docker container.

```bash
# binary: download, make it executable, start the service
./autorip serve          # then open http://localhost:8080
```

For the Docker image, a full `docker-compose.yml`, a systemd unit, drive permissions, and every setting, see **[autorip → Deploy](/docs/autorip/#deploy)**. Blu-ray and 4K UHD also need **[decryption keys](/docs/decryption-keys/)**; DVDs work out of the box.

## Build from source

Pure Rust: clone and build with Cargo. freemkv and autorip live in separate repos, so build each one on its own:

```bash
# freemkv
git clone https://github.com/freemkv/freemkv
cd freemkv
cargo build --release                  # CLI
cargo build --release --features gui   # app (Linux needs GTK4 4.10+ and libadwaita 1.4+)
# binary at target/release/freemkv

# autorip service
git clone https://github.com/freemkv/autorip
cd autorip
cargo build --release
# binary at target/release/autorip
```

## Next steps

- **[Platforms](/docs/platforms-windows/)**: per-OS setup, file locations, and drive access.
- **[CLI reference](/docs/cli/)**: every subcommand, flag, and stream URL.
- **[Decryption Keys](/docs/decryption-keys/)**: what Blu-ray and UHD need before they decrypt.
