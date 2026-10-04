---
title: Components
description: The eight crates that make up the freemkv toolchain, what each one owns, and how they fit together.
---

freemkv is a family of eight Rust crates. Two are front ends you run (the freemkv app and command line, and the freemkv-library server); the rest are libraries they share, plus a drive emulator for testing. Each section below says what the piece owns, what it deliberately leaves to someone else, and where to read more.

## freemkv

**The desktop app and command line**, for Windows, macOS, and Linux. On the command line every operation is a source and a destination as `scheme://` stream URLs: rip a disc to MKV, copy a disc to an ISO, remux an existing image, or inspect a disc. The desktop app does the same jobs through a window: pick titles and tracks, choose a format, press Rip.

- **Owns:** the user interface, command parsing, and output to the terminal or window.
- **Does not:** implement ripping, recovery, or decryption itself. It drives freemkv-engine and libfreemkv, gets keys from freemkv-keysources, and takes its wording from freemkv-i18n.

See the [CLI reference](/docs/cli/). Get it from the [Download](/download/) page. Source: [freemkv/freemkv](https://github.com/freemkv/freemkv).

## freemkv-library

**The freemkv web server (formerly autorip).** Insert a disc and it rips to MKV on its own: it detects optical drives, runs the full sweep, patch, and mux pipeline, and serves a web UI for settings, live progress, and history, plus a Library tab for your MKVs and ISOs. Ships as a Docker image.

- **Owns:** drive detection, the rip-on-insert trigger, the web UI and HTTP API, and job history.
- **Does not:** have its own rip logic. It runs the same freemkv-engine as the desktop app and command line, so both behave identically on the same disc.

See [freemkv-library](/docs/library/). Published to GHCR at `ghcr.io/freemkv/freemkv-library:latest` (also still as `ghcr.io/freemkv/autorip`). Built from the [freemkv/freemkv](https://github.com/freemkv/freemkv) repo and run as `freemkv server`.

## freemkv-engine

**The shared rip engine**: disc-to-MKV orchestration over libfreemkv, used by every front end. Recovery moved here from libfreemkv in 1.6.0.

- **Owns:** recovery (the sweep and patch passes, the mapfile, and multipass retries), the multi-title rip loop, preflight checks, and resolving keys through freemkv-keysources.
- **Does not:** talk to the drive or decrypt sectors directly (that is libfreemkv), or present anything to a user (that is the front ends).

See [How recovery works](/docs/how-recovery-works/). Source: [freemkv/freemkv-engine](https://github.com/freemkv/freemkv-engine).

## freemkv-keysources

**Key lookup for AACS discs.** Pluggable sources (a local `keydb.cfg`, or an online key service) that look a disc up and hand libfreemkv its unit keys. This is how [decryption keys](/docs/decryption-keys/) reach the decryption pipeline.

- **Owns:** reading and downloading `keydb.cfg`, and querying the key service.
- **Does not:** derive or apply keys. libfreemkv does all the AACS work once it has them.

Source: [freemkv/freemkv-keysources](https://github.com/freemkv/freemkv-keysources).

## freemkv-i18n

**The locale strings** used by the front ends, bundled into the binary with on-disk overrides, and English as the fallback.

- **Owns:** loading translations and formatting messages, including the text for error codes.
- **Does not:** appear below the front ends. The libraries never produce English text, so translation happens in one place.

Source: [freemkv/freemkv-i18n](https://github.com/freemkv/freemkv-i18n).

## libfreemkv

**The core library.** Everything that touches the disc lives here.

- **Owns:** drive access over SCSI; disc scanning (UDF, playlists, titles, and streams); stream labels; AACS and CSS decryption; and demuxing and muxing to MKV, MP4, and M2TS.
- **Does not:** read `keydb.cfg` or download keys (AACS keys come from the caller, usually via freemkv-keysources); run recovery (that is freemkv-engine); or produce English text. Errors are numeric codes, listed in [Error codes](/docs/error-codes/).

See the [library overview](/docs/libfreemkv/). Source: [freemkv/libfreemkv](https://github.com/freemkv/libfreemkv).

## freemkv-unlock

**The drive-level unlock layer**, the base crate libfreemkv builds on. An unlocker removes a drive-level barrier so the drive serves readable sectors; libfreemkv runs it during drive setup, so front ends never see it.

- **Owns:** the unlocker contract and the self-contained unlocker modules for supported drives.
- **Does not:** decrypt content. Unlocking a drive is separate from AACS or CSS decryption (see [Unlocked drives](/docs/drives-unlocked/)).

Source: [freemkv/freemkv-unlock](https://github.com/freemkv/freemkv-unlock).

## bdemu

**A drive emulator used as a test fixture.** It intercepts Linux SCSI calls and answers from captured drive responses, so the drive, decryption, and recovery paths can be tested without a physical disc. Linux only; not something you install to rip.

- **Owns:** emulated drive profiles and the SCSI interception.
- **Does not:** ship to users. It exists for development and CI.

Source: [freemkv/bdemu](https://github.com/freemkv/bdemu).

## How they fit together

![Layered diagram of freemkv's components. At the top, the two front ends: freemkv (desktop app and command line) and freemkv-library (web server). Both use freemkv-engine (recovery and the rip loop), freemkv-keysources (keydb.cfg and key service), and freemkv-i18n (locale strings), and also call libfreemkv directly. freemkv-engine uses freemkv-keysources and libfreemkv; freemkv-keysources supplies keys to libfreemkv (drive access, disc scan, AACS/CSS decryption, mux). libfreemkv depends on freemkv-unlock (drive unlock) at the base. bdemu, a dashed test fixture beside them, emulates a drive and builds on libfreemkv and freemkv-unlock.](/architecture.svg)

The front ends stay thin: freemkv and freemkv-library handle the interface, freemkv-engine runs the rip, and libfreemkv does the disc work underneath, with freemkv-unlock preparing the drive. Keys enter from the side through freemkv-keysources, and user-facing text is added only at the top through freemkv-i18n. bdemu stands in for a real drive in tests.
