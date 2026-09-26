---
title: macOS
description: Install and update freemkv on macOS, find your settings and output, and troubleshoot optical-drive access.
---

freemkv provides a native desktop app and a command-line interface on macOS. Both use the same ripping engine. Choose **Apple Silicon** or **Intel** for your Mac on the **[Download page](/download/)**.

## Install

### Desktop app

With Homebrew:

```bash
brew install --cask freemkv/tap/freemkv-app
```

Or download the matching `.dmg` from [GitHub Releases](https://github.com/freemkv/freemkv/releases), open it and drag `freemkv.app` into **Applications**.

Open freemkv, select a disc, image or folder, choose the titles and tracks, select an output location and press **Rip**. You can also drag a supported media file onto the window.

![The freemkv desktop app on macOS with a disc image loaded.](/freemkv-gui-macos.png)

### Command line

With Homebrew:

```bash
brew install freemkv/tap/freemkv
freemkv --version
```

For a standalone download, use `freemkv-aarch64-macos` on Apple Silicon or `freemkv-x86_64-macos` on Intel. For example:

```bash
chmod +x freemkv-aarch64-macos
./freemkv-aarch64-macos --version
```

The desktop app also contains the CLI:

```bash
/Applications/freemkv.app/Contents/MacOS/freemkv --version
```

Running `freemkv gui` opens the desktop interface. See the [CLI reference](/docs/cli/) for ripping commands and options.

<a id="apple-could-not-verify-freemkv-on-first-launch"></a>

## First launch

A browser download may prompt macOS to verify the app or CLI. If macOS cannot verify the developer or notarization, and you trust the official download:

1. Try opening the app or running the binary, then dismiss the prompt.
2. Open **System Settings → Privacy & Security**.
3. Choose **Open Anyway** for freemkv and confirm.

This creates an exception for that app. Different warnings, such as a damaged file or detected malware, need separate investigation. See [Apple's first-launch guidance](https://support.apple.com/en-us/102445).

## Update or remove

For Homebrew installations:

```bash
brew update
brew upgrade --cask freemkv/tap/freemkv-app
brew upgrade freemkv/tap/freemkv
```

Run the upgrade command for the app or CLI you installed. For direct downloads, close freemkv and replace the app or standalone binary with the new release.

Use `brew uninstall --cask freemkv/tap/freemkv-app` or `brew uninstall freemkv/tap/freemkv` to remove a Homebrew installation. For direct downloads, delete the app or binary. Settings and ripped movies are separate.

## File locations

| What | Location |
|---|---|
| Desktop settings | `~/Library/Application Support/freemkv/gui-settings.json` |
| Finished movies | The output location you choose before ripping |
| AACS keys | See [Decryption Keys](/docs/decryption-keys/) |
| CLI diagnostic log | Off by default; `--log-level 3` writes `log.txt` in the current folder |

To capture a log at a specific path:

```bash
freemkv info disc:// --log-level 3 --log-file "$HOME/Desktop/freemkv-log.txt"
```

Use the path to your downloaded binary if you did not install it with Homebrew.

## Drive access

freemkv uses IOKit to obtain exclusive access to the optical drive. It unmounts the disc before direct reads, so the disc disappearing from Finder while ripping is expected. Devices appear as `/dev/diskN`.

Close other software using the disc. If access fails, reconnect the drive and try again.

## autorip

For automatic ripping through a browser, see [autorip Service](/docs/autorip/). The prebuilt macOS autorip binary is available for Apple Silicon; Intel users can build it from source.

## Troubleshooting

- **macOS blocks the app or CLI:** review [First launch](#first-launch).
- **The disc disappears from Finder:** freemkv unmounts it to take exclusive drive access.
- **No drive is available:** check the connection and close other disc software.
- **A movie is missing:** check the output location selected for that rip.

For key setup, see [Decryption Keys](/docs/decryption-keys/). For logs and shared fixes, see [Troubleshooting](/docs/troubleshooting/).
