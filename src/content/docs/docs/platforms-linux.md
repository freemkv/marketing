---
title: Linux
description: Install and update freemkv on Linux, find your settings and output, and troubleshoot optical-drive access.
---

freemkv comes in two builds for Linux. **Install one or the other**; both are the `freemkv` command. Choose a download from the **[Download page](/download/)**.

- **freemkv** (the app): a native GTK4 desktop app plus every CLI command. `.deb`, Flatpak or AppImage.
- **freemkv CLI**: the command line only, without GTK. `.deb` or static binaries.

With the app, a bare `freemkv` opens the window. With no display (for example over SSH, where neither `DISPLAY` nor `WAYLAND_DISPLAY` is set) it prints usage instead, like the CLI.

## Install

### App .deb package

For **x86_64 Ubuntu 24.04 and Linux Mint 22**, download `freemkv-amd64.deb`, then install it from your download directory:

```bash
sudo apt install ./freemkv-amd64.deb
freemkv --version
```

Open **freemkv** from your application menu, or run `freemkv`. APT installs the required desktop libraries. This package uses normal host drive permissions and has no application sandbox. Compatibility with other Debian-based distributions has not been validated.

### Direct Flatpak bundle

The **x86_64** Flatpak is available directly from GitHub Releases; a freemkv Flathub listing is not required. Install Flatpak using your distribution's package manager, then add Flathub for the GNOME runtime:

```bash
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
```

Download `freemkv-x86_64-linux.flatpak`, then run:

```bash
flatpak install --user ./freemkv-x86_64-linux.flatpak
flatpak run org.freemkv.FreeMKV
```

The app also appears in your application menu. To use its CLI:

```bash
flatpak run --command=freemkv org.freemkv.FreeMKV --version
```

The bundle grants access to host files and devices for ripping. Host device permissions still apply.

### Portable AppImage

For **x86_64 Ubuntu 24.04+ or Fedora 40+**, download `freemkv-x86_64-linux.AppImage`:

```bash
chmod +x freemkv-x86_64-linux.AppImage
./freemkv-x86_64-linux.AppImage
```

Keep the file wherever you prefer.

### Command line only

On x86_64 Ubuntu or Linux Mint, install the `freemkv-cli` package:

```bash
sudo apt install ./freemkv-cli-amd64.deb
freemkv --version
```

The `freemkv` and `freemkv-cli` packages both install `/usr/bin/freemkv` and replace each other, so installing one removes the other.

On any distro, download the static binary matching your CPU. For x86_64:

```bash
chmod +x freemkv-cli-x86_64-linux
./freemkv-cli-x86_64-linux --version
```

For ARM64, use `freemkv-cli-aarch64-linux` instead. These have no desktop interface; a bare `freemkv` prints usage. See the [CLI reference](/docs/cli/) for ripping commands and options.

Snap Store and Flathub app listings are not currently available. The downloads above work independently of those submissions.

## First launch

For `.deb` or Flatpak, open freemkv from the application menu. For AppImage, run the downloaded file after making it executable. Open a disc, image or folder, select the titles and tracks, choose an output location and press **Rip**.

If your system cannot mount an AppImage, try:

```bash
./freemkv-x86_64-linux.AppImage --appimage-extract-and-run
```

## Update or remove

| Installation | Update | Remove |
|---|---|---|
| `.deb` | Download the new package and repeat `sudo apt install ./freemkv-amd64.deb` (or `./freemkv-cli-amd64.deb`) | `sudo apt remove freemkv` (or `freemkv-cli`) |
| Flatpak bundle | Download the new bundle and repeat `flatpak install --user ./freemkv-x86_64-linux.flatpak` | `flatpak uninstall --user org.freemkv.FreeMKV` |
| AppImage or standalone CLI | Close freemkv and replace the downloaded file | Delete the downloaded file |

There is no freemkv APT repository yet. Direct Flatpak bundles also require manual app updates; `flatpak update` updates installed runtimes but does not fetch new freemkv bundles from GitHub. Settings and ripped movies are separate from program files.

## File locations

| What | Location |
|---|---|
| Native desktop settings | `$XDG_DATA_HOME/freemkv/gui-settings.json`, normally `~/.local/share/freemkv/gui-settings.json` |
| Flatpak desktop settings | `~/.var/app/org.freemkv.FreeMKV/data/freemkv/gui-settings.json` |
| Finished movies | The output location you choose before ripping |
| AACS keys | See [Decryption Keys](/docs/decryption-keys/) |
| CLI diagnostic log | Off by default; `--log-level 3` writes `log.txt` in the current folder |

To capture a log at a specific path:

```bash
freemkv info disc:// --log-level 3 --log-file "$HOME/freemkv-log.txt"
```

Use the path to your downloaded binary, or the Flatpak CLI command above, if you did not install the `.deb`.

## Drive access

Both interfaces use **SCSI generic** devices at `/dev/sg*`. Installing a package does not grant host device permissions. If access is denied, check the device owner, group and session ACLs. On systems where the drive belongs to `cdrom`, membership in that group may be required; sign out and back in after changing groups.

Close other software using the disc and check the drive connection before retrying.

## autorip

For automatic ripping through a browser, use autorip's Linux binary or Docker image. See [autorip Service](/docs/autorip/) for setup, data locations and a Compose example.

The Docker configuration needs access to the optical devices. The supplied example uses `privileged: true` and a `/dev:/dev` bind mount; keep its persistent configuration and output mounts when updating the container.

## Troubleshooting

- **Permission denied when opening the program:** make the standalone binary or AppImage executable with `chmod +x`.
- **AppImage cannot mount:** try the extraction command under [First launch](#first-launch).
- **No drive is available:** check the connection and review [Drive access](#drive-access). For Docker, also check the device configuration.
- **A movie is missing:** check the output location selected for that rip.

For key setup, see [Decryption Keys](/docs/decryption-keys/). For logs and shared fixes, see [Troubleshooting](/docs/troubleshooting/).
