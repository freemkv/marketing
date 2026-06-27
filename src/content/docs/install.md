---
title: Install
description: Get the freemkv CLI or the autorip service. A prebuilt binary or build from source.
---

There are two programs: the **freemkv CLI** (manual, one disc at a time) and the **autorip service** (a hands-off web app). Both are a single download with no runtime or dependencies. Grab a prebuilt binary, or build from source.

For per-OS setup (where files live, how to reach the optical drive, and platform quirks), see your **[platform page](/platforms-windows/)** (Windows, macOS, Linux).

## Prebuilt binaries

Go to the **[Download](/download/)** page; it detects your OS and hands you the right build (Linux, macOS, or Windows; Intel or ARM, except macOS, which is Apple Silicon only). It's one self-contained file per program; download and run it. The exact run command differs slightly per OS, so follow your platform page:

- **[Windows](/platforms-windows/)**: download the `.zip`, extract, run from a terminal.
- **[macOS](/platforms-macos/)**: `chmod +x` and run; the disc is unmounted for exclusive access.
- **[Linux](/platforms-linux/)**: `chmod +x` and run; drive access via the `cdrom` group.

Every build has a matching `.sha256` checksum on its releases page — [freemkv](https://github.com/freemkv/freemkv/releases) for the CLI, [autorip](https://github.com/freemkv/autorip/releases) for the service.

## autorip

[autorip](/autorip/) is a web app: insert a disc and it rips automatically to MKV, with progress, settings, and history in the browser. It runs on Linux, macOS, or Windows as a single binary, or (on Linux) as a Docker container.

```bash
# binary: download, make it executable, start the service
./autorip serve          # then open http://localhost:8080
```

For the Docker image, a full `docker-compose.yml`, a systemd unit, drive permissions, and every setting, see **[autorip → Deploy](/autorip/#deploy)**. Blu-ray and 4K UHD also need **[decryption keys](/decryption-keys/)**; DVDs work out of the box.

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

- **[Platforms](/platforms-windows/)**: per-OS setup, file locations, and drive access.
- **[CLI reference](/cli/)**: every subcommand, flag, and stream URL.
- **[Decryption Keys](/decryption-keys/)**: what Blu-ray and UHD need before they decrypt.
