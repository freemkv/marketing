---
title: Linux
description: Running freemkv and autorip on Linux. File locations, /dev/sg* SCSI generic access, and the autorip Docker model.
---

freemkv provides a native GTK4 desktop app and a command-line interface on Linux. Choose a package below from the **[Download page](/download/)**. The desktop packages include both interfaces; the standalone CLI does not need GTK.

## Native .deb package

For **x86_64 Ubuntu 24.04 and Linux Mint 22**, download `freemkv-amd64.deb`, then install it from your download directory:

```bash
sudo apt install ./freemkv-amd64.deb
freemkv --version
```

Open **freemkv** from your application menu, or run `freemkv gui`. APT installs the required desktop libraries. This package uses normal host drive permissions and has no application sandbox. Compatibility with other Debian-based distributions has not been validated.

To update, download the new `.deb` and repeat the installation command. There is no freemkv APT repository yet. To remove it, run `sudo apt remove freemkv`.

## Direct Flatpak bundle

The **x86_64** Flatpak is available directly from GitHub Releases; a freemkv Flathub listing is not required. Install Flatpak using your distribution's package manager, then add Flathub for the GNOME runtime:

```bash
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

Download `freemkv-x86_64.flatpak`, then run:

```bash
flatpak install --user ./freemkv-x86_64.flatpak
flatpak run org.freemkv.FreeMKV
```

The app also appears in your application menu. To use its CLI:

```bash
flatpak run --command=freemkv org.freemkv.FreeMKV --version
```

The bundle grants access to host files and devices for ripping. Host device permissions still apply. Updates to freemkv are manual: download the new bundle and install it with the same command. `flatpak update` updates installed runtimes but does not fetch new freemkv bundles from GitHub. Remove the app with `flatpak uninstall --user org.freemkv.FreeMKV`.

## Portable AppImage

For **x86_64 Ubuntu 24.04+ or Fedora 40+**, download `freemkv-x86_64-linux.AppImage`:

```bash
chmod +x freemkv-x86_64-linux.AppImage
./freemkv-x86_64-linux.AppImage
```

Keep the file wherever you prefer. To update, replace it with the new release. If your system cannot mount an AppImage, try `./freemkv-x86_64-linux.AppImage --appimage-extract-and-run`.

## Standalone CLI

Download the binary matching your CPU. For x86_64:

```bash
chmod +x freemkv-x86_64-linux
./freemkv-x86_64-linux --version
```

For ARM64, use `freemkv-aarch64-linux` instead. These are static CLI binaries without the desktop interface. Replace the downloaded file to update.

Snap Store and Flathub app listings are not currently available. The downloads above work independently of those submissions.

For autorip, use its Linux binary as a service or its Docker image. See [autorip Service](/docs/autorip/) for setup and a Compose example.

## File locations

### freemkv CLI

| What | Path |
|---|---|
| AACS keys | see **[Decryption Keys](/docs/decryption-keys/)** |
| Diagnostic log | off by default (see below) |

The CLI keeps the terminal clean and never writes a log unless asked. Run with `--log-level 3` to write `./log.txt` in the current directory, or `--log-file PATH` to choose the destination.

### autorip (Docker)

autorip stores its state inside the container at well-known mount points, which you bind-mount to the host:

| What | Path (in container) |
|---|---|
| Config (settings, keys, logs) | `/config` |
| Staging | `/staging` |

Bind these to host directories so settings and the AACS key database persist across container restarts.

## Device / drive access

- Both the desktop app and CLI reach optical drives through **SCSI generic** at `/dev/sg*`. Installing a package does not grant host device permissions. If access is denied, check the device owner, group and session ACLs. On systems where the drive belongs to `cdrom`, membership in that group may be required; sign out and back in after changing groups.
- The autorip container requires `privileged: true` and a `/dev:/dev` bind mount for optical drive access. Without `privileged`, the container starts but enumerates zero drives and the UI reports "No drives detected."

## Known quirks / troubleshooting

- If a rip can't see the drive in the container, confirm both `privileged: true` and the `/dev:/dev` mount are present.
- For capturing logs and other common fixes, see [Troubleshooting](/docs/troubleshooting/).
