---
title: Install
description: Get freemkv — the command line, the desktop app, or the autorip service. A prebuilt binary or build from source.
---

There are two programs: **freemkv** — one binary that is both a **command-line tool** and a **native desktop app** — and the **autorip service** (a hands-off web app). Both are a single download with no runtime or dependencies. Grab a prebuilt binary, or build from source.

`freemkv` picks its face from how you start it: run `freemkv <args>` for the CLI, or open the app (on macOS today; Windows next) for a window. It's the same binary either way — the desktop app just adds a UI over the same engine.

For per-OS setup (where files live, how to reach the optical drive, and platform quirks), see your **[platform page](/docs/platforms-macos/)** (macOS, Windows, Linux).

## Prebuilt binaries

Go to the **[Download](/download/)** page; it detects your OS and hands you the right build. Download and run it — one self-contained file, no dependencies. The exact steps differ per OS, so follow your platform page:

- **[macOS](/docs/platforms-macos/)**: the **desktop app** as a `.dmg` (drag to Applications, open, rip), or a standalone **CLI binary** for scripts and `brew`.
- **[Windows](/docs/platforms-windows/)**: the **CLI** `freemkv.exe` (the desktop app is in development).
- **[Linux](/docs/platforms-linux/)**: the **CLI** binary (`chmod +x` and run; drive access via the `cdrom` group).

Every build has a matching `.sha256` checksum on its releases page — [freemkv](https://github.com/freemkv/freemkv/releases) for the CLI, [autorip](https://github.com/freemkv/autorip/releases) for the service.

## autorip

[autorip](/docs/autorip/) is a web app: insert a disc and it rips automatically to MKV, with progress, settings, and history in the browser. It runs on Windows, macOS, or Linux as a single binary, or (on Linux) as a Docker container.

```bash
# binary: download, make it executable, start the service
./autorip serve          # then open http://localhost:8080
```

For the Docker image, a full `docker-compose.yml`, a systemd unit, drive permissions, and every setting, see **[autorip → Deploy](/docs/autorip/#deploy)**. Blu-ray and 4K UHD also need **[decryption keys](/docs/decryption-keys/)**; DVDs work out of the box.

## Build from source

Pure Rust: clone and build with Cargo. The CLI and autorip live in separate repos, so build each one on its own:

```bash
# freemkv CLI
git clone https://github.com/freemkv/freemkv
cd freemkv
cargo build --release
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
