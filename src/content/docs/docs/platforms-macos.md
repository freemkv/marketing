---
title: macOS
description: freemkv on macOS — the native desktop app and the CLI, both from one binary. Install, drive access, and file locations.
---

On macOS, `freemkv` is **one binary with two faces**: a native desktop app and
the command line. Both run the same engine — the app just opens a window.

## Install with Homebrew (easiest)

```sh
brew install --cask freemkv/tap/freemkv   # desktop app
brew install freemkv/tap/freemkv          # command line
```

This is the path with no friction, and it is the one to use if you just want
the app working. Homebrew fetches with `curl`, which never marks a file as
quarantined, so the security prompt described below never appears. Everything
else on this page still applies.

## "Apple could not verify freemkv" on first launch

freemkv is not notarized by Apple yet, so **anything you download in a browser**
— the app *and* the plain CLI binary — is blocked the first time you open it.
The dialog says macOS "could not verify" it is free of malware, and offers only
a **Done** button.

This is not a broken download. Re-downloading will not help. Allow it once:

1. Open the app (or run the binary). It refuses — click **Done**.
2. Open **System Settings → Privacy & Security** and scroll down. There is now
   a line naming freemkv with an **Open Anyway** button.
3. Click **Open Anyway** and confirm.

That is a one-time step per download. Afterwards it opens like any other app.

For the CLI you can skip the trip through System Settings by clearing the
quarantine flag directly:

```bash
xattr -d com.apple.quarantine ./freemkv
```

:::note
Older guides — including earlier versions of this page — say to right-click the
app and choose **Open**. **macOS 15 Sequoia removed that shortcut.** The blocked
dialog no longer offers anything but **Done**, so Open Anyway in System Settings
is the only route on current macOS.
:::

Installing with Homebrew, or fetching with `curl`, avoids all of this: neither
sets the quarantine flag that triggers the check.

## The desktop app

Or download the macOS **`.dmg`** (Apple Silicon or Intel) from the
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
- **First launch** is blocked by macOS until you allow it once — see
  [above](#apple-could-not-verify-freemkv-on-first-launch).

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

A binary downloaded in a browser is blocked on first run, exactly like the app
— allow it once in **System Settings → Privacy & Security**, or run
`xattr -d com.apple.quarantine ./freemkv`. Fetching with `curl` or Homebrew
avoids it entirely. Each binary has a matching `.sha256` checksum on the
release page.

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

- Nothing here is **notarized** yet, so a browser download is blocked on first launch — see [above](#apple-could-not-verify-freemkv-on-first-launch) for the one-time fix, or install with Homebrew and skip it.
- If the disc is mounted by the Finder, freemkv unmounts it to take exclusive access; that's expected.
- For capturing logs and other common fixes, see [Troubleshooting](/docs/troubleshooting/).
