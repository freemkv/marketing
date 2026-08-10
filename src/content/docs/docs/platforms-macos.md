---
title: macOS
description: freemkv on macOS — the native desktop app and the CLI, both from one binary. Install, drive access, and file locations.
---

On macOS, `freemkv` is **one binary with two faces**: a native desktop app and
the command line. Both run the same engine — the app just opens a window.

## The desktop app

Download the macOS **`.dmg`** (Apple Silicon or Intel) from the
**[Download](/download/)** page, open it, and drag **`freemkv.app`** out —
to Applications, or just your Downloads folder; anywhere works, there's no
install step. Double-click it, then pick a disc or a disc image, tick the titles
and tracks you want, choose a format, and press **Rip**.

![The freemkv desktop app on macOS with a disc image loaded — per-title and per-track selection, output format, and a live log.](/freemkv-gui-macos.png)

*The freemkv desktop app on macOS.*

- **Open a source** with the file picker, or **drag an `.iso` / `.mkv` /
  `.m2ts` / `.mp4`** straight onto the window.
- **Per-title and per-track selection** with tri-state rollup, an output-format
  picker that follows the source, live progress (engine speed + ETA), and a
  copyable log.
- **First launch:** the app is not notarized yet, so macOS Gatekeeper blocks the
  first open. Double-click it, click **Done** on the dialog, then open **System
  Settings → Privacy & Security**, scroll down to the line naming freemkv and
  click **Open Anyway**. It launches normally from then on. (Right-click →
  **Open** used to work; macOS 15 Sequoia removed that shortcut.)

## The command line

The very same binary is the full `freemkv` CLI. If you installed the app, the
executable lives inside it:

```bash
/Applications/freemkv.app/Contents/MacOS/freemkv --version
```

Or download the standalone **CLI binary** for macOS (Apple Silicon or Intel)
from the [Download](/download/) page — handy for scripts, `brew`, or CI:

```bash
mv freemkv-*-macos freemkv && chmod +x freemkv
./freemkv iso://Disc.iso mkv://Movie.mkv
```

From a terminal, `freemkv gui` opens the desktop window; any other invocation is
the CLI. See the **[CLI reference](/docs/cli/)** for the full command grammar.

## File locations

| What | Path |
|---|---|
| AACS keys | see **[Decryption Keys](/docs/decryption-keys/)** |
| Diagnostic log | off by default (see below) |

The CLI keeps the terminal clean and never writes a log unless asked. Run with `--log-level 3` to write `./log.txt` in the current directory, or `--log-file PATH` to choose the destination.

## Device / drive access

freemkv obtains **exclusive** access to the optical drive through IOKit. To do so it unmounts the disc first, so the drive is freed for direct reads while ripping. Optical drives appear as `/dev/diskN` devices.

## Known quirks / troubleshooting

- Nothing here is **notarized** yet, so the first launch of the app — and the first run of a downloaded CLI binary — is blocked until you allow it once in **System Settings → Privacy & Security → Open Anyway**. Right-click → **Open** no longer works on macOS 15 Sequoia. For the CLI you can instead run `xattr -d com.apple.quarantine ./freemkv`.
- If the disc is mounted by the Finder, freemkv unmounts it to take exclusive access; that's expected.
- For capturing logs and other common fixes, see [Troubleshooting](/docs/troubleshooting/).
