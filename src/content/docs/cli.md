---
title: CLI Reference
description: Every freemkv subcommand, flag, and stream URL.
---

The `freemkv` binary has two forms:

```bash
# Rip / remux: a source and a destination. No command word — the action is
# implied by passing two URLs.
freemkv <source> <destination> [flags]

# Subcommand: the first argument is the command.
freemkv <subcommand> [args]              # info, verify, remux, update-keys, version, help
```

A bare invocation prints usage and exits `2`.

## Stream URLs

Every source and destination is a `scheme://` URL.

| URL | Source | Dest | Notes |
|---|---|---|---|
| `disc://` | ✓ | — | Optical drive (auto-detected; `disc:///dev/sg4` or `disc://D:` to target one) |
| `mkv://path.mkv` | ✓ | ✓ | Matroska movie |
| `m2ts://path.m2ts` | ✓ | ✓ | Blu-ray transport stream |
| `iso://path.iso` | ✓ | ✓ | Disc image |
| `fvi://path.fvi` | — | ✓ | freemkv video index — a JSON-Lines, one-record-per-picture index file ([spec](/fvi-format/)) |
| `demux://path/` | — | ✓ | Per-track elementary streams — a directory, one file per track |
| `dir://path/` | — | ✓ | Decrypted file tree (VIDEO\_TS / BDMV) |
| `network://host:port` | ✓ | ✓ | TCP (listen or connect) |
| `stdio://` | ✓ | ✓ | Stdin / stdout |
| `null://` | — | ✓ | Discard (read-speed benchmark) |

`disk://` is an alias for `disc://`. Everything is **decrypted by default**; `--raw` (`iso://` only) is the sole encrypted output. BD/UHD discs need an AACS key — see [Decryption Keys](/decryption-keys/); DVDs need none.

## Scheme details

What each scheme does, and when to reach for it.

### disc://

Rips the **main title** by default. Pick others with `-t N`, or several at once:

```bash
freemkv disc:// mkv://Movie.mkv          # main title → one file
freemkv disc:// mkv://out/ -t 1 -t 3     # titles 1 and 3 → out/ (a directory)
```

### mkv://

Writes one decrypted movie. A **single title** goes to the file you name; **multiple titles** go to a **directory**, one file each, named `<disc>_t<N>.mkv`:

```bash
freemkv disc:// mkv://Movie.mkv          # single title → Movie.mkv
freemkv disc:// mkv://out/ -t 1 -t 3     # → out/Greenland_t1.mkv, out/Greenland_t3.mkv
```

### m2ts://

Same as `mkv://`, but writes a Blu-ray transport stream — one file for a single title, or `<disc>_t<N>.m2ts` per title into a directory.

### iso://

**As a source** (`iso://Movie.iso`), it rips **all titles** by default — so the *output* has to be a directory, because multiple titles means multiple files:

```bash
freemkv iso://Movie.iso mkv://out/             # every title → out/Movie_t1.mkv, out/Movie_t2.mkv, …
freemkv iso://Movie.iso mkv://Movie.mkv -t 1   # just title 1 → a single file
```

**As a destination** (`iso://Movie.iso`), it writes a decrypted sector image of the disc:

```bash
freemkv disc:// iso://Movie.iso          # rip the disc to a decrypted image
```

…plus two flags that work **only with `iso://`**:

- **`--multipass`** — sweep, then retry the bad sectors, with a resumable **mapfile** sidecar (sector state only — never keys). Re-run until clean. Damaged-disc workflow: `disc:// iso:// --multipass`, then `iso:// mkv://`.
- **`--raw`** — write the sectors **encrypted**, a faithful image. You can't mux or benchmark ciphertext, so both flags error on any other destination.

A plain `disc:// iso://` auto-resumes if interrupted.

### fvi://

Writes a **freemkv video index** — a JSON-Lines file (`.fvi`) with one record per coded picture, capturing the frame's type, position, and timing. It's an index *over* the video, not the video itself, so the output is a single `.fvi` file rather than a movie:

```bash
freemkv iso://disc.iso fvi://out.fvi
```

See the [FVI Format](/fvi-format/) reference for the full specification.

### demux://

Extracts each track to its own **elementary-stream** file — video, audio, and subtitle streams split apart rather than muxed together. The destination is a **directory**, with one file written per track:

```bash
freemkv iso://disc.iso demux://out/
```

### dir://

Extracts the decrypted on-disc file tree (`VIDEO_TS/` or `BDMV/`) straight into the folder, reading and decrypting only the disc's allocated files.

```bash
freemkv disc:// dir://Movie/
freemkv iso://Disc.iso dir://Movie/
```

### network://host:port

Streams a rip over TCP instead of to a file: one end listens (`network://0.0.0.0:9000`), the other connects (`network://192.0.2.10:9000`). Rip on the machine with the drive and mux or store on another — no shared filesystem needed.

### stdio://

Writes the muxed output to stdout (or reads it from stdin), so you can chain freemkv into a pipe with no intermediate file. The classic use is transcoding on the fly with ffmpeg, which demuxes its input in a single linear pass and so reads a pipe directly:

```bash
freemkv disc:// stdio:// | ffmpeg -i - -c:v libx265 Movie.mkv
```

A pipe only works for tools that read their input straight through. HandBrake scans titles — it seeks around the file before encoding — so it cannot consume a non-seekable pipe. Hand it a file instead: mux with freemkv first, then transcode that:

```bash
freemkv disc:// mkv://Movie.mkv                       # decrypt + mux to a file
HandBrakeCLI -i Movie.mkv -o Movie.mp4 --preset "Fast 1080p30"
```

### null://

Reads and discards everything — a read-speed benchmark or dry run, with no output written.

## Subcommands

### info — inspect a disc, image, or file

Lists titles, durations, sizes, and stream details. A lone URL with no destination is the same as `freemkv info <url>`. Needs no key, even on AACS discs.

```bash
freemkv info disc://
freemkv info iso://Disc.iso
```

| Flag | Description |
|---|---|
| `-f, --full` | List every title (default: the first five, with a "+N more" footer). |
| `-b, --basic` | Title rows only — omit the per-stream (video/audio/subtitle) detail. |
| `-v, --verbose` | Add technical detail — AACS version + MKB version, and per-stream PIDs and audio sample rates. A handful of extra fields, not a flood; off by default to keep the listing scannable (turn it on when debugging a mux or AACS issue). |
| `--share` | Capture the drive's profile to a zip and print a ready-to-paste GitHub issue for the community drive-compatibility database. On a **release build + interactive terminal**, freemkv then offers to submit it for you — a `[Y/n]` prompt (default **yes**) that posts the issue to GitHub if you accept. `--mask` redacts drive serials first. Nothing is sent unless you confirm at that prompt. |

### verify — check disc health

Scans the main title and reports good / slow / recovered / bad sectors, with chapter + timestamp per damaged region. Writes nothing. **Exits `1` if any sector is unrecoverable** — scriptable as a pass/fail gate. Defaults to `disc://`.

```bash
freemkv verify
```

### remux — convert a file source to MKV (no drive needed)

`remux` is the `<source> <destination>` form under a command word: it converts one file to another with no drive involved. The classic case is m2ts → MKV, but any file source (`m2ts://`, `iso://`) to a mux destination (`mkv://`, `m2ts://`) works. No subcommand word is actually required — a bare `<source> <destination>` does the same thing — but `freemkv remux` is accepted, and `freemkv remux` with no URLs prints remux help rather than erroring.

```bash
freemkv remux m2ts://Movie.m2ts mkv://Movie.mkv     # remux a BD transport stream to MKV
freemkv remux iso://Disc.iso mkv://Movie.mkv        # mux an ISO image to MKV
```

| Flag | Description |
|---|---|
| `-t, --title N` | Select title (1-based, repeatable). Default: all titles in the source. |

### update-keys — refresh the AACS key database

Downloads, verifies, and installs an AACS keydb (`.txt` / `.zip` / `.gz`). `--url` is required. Both `http://` and `https://` URLs are supported.

```bash
freemkv update-keys --url https://example.org/keydb_eng.zip
freemkv update-keys --url http://example.org/keydb_eng.zip
```

By default the refreshed `keydb.cfg` is written next to the `freemkv` executable. The global `--keydb PATH` flag is honored here too — it sets **where the download lands**, so you can install to any location and later rip against the same path:

```bash
freemkv update-keys --keydb /srv/freemkv/keydb.cfg --url https://example.org/keydb_eng.zip
freemkv disc:// -t 1 mkv://Movie.mkv --keydb /srv/freemkv/keydb.cfg
```

### version / help

```bash
freemkv version    # also --version / -V
freemkv help       # also --help / -h (exit 0)
```

## Flags

All flags are optional.

Key sources (for a rip that needs decryption keys):

| Flag | Description |
|---|---|
| `--keydb PATH` | Override the keydb location. Without it, freemkv searches the default locations — see [Decryption Keys](/decryption-keys/). Only Blu-ray/UHD need a keydb; DVDs use none. |
| `--key-url URL` | Online key service (`http://…` or `https://…`); the local keydb is tried first if both are given. |
| `--key-auth TOKEN` | Bearer token for `--key-url`. |

If you supply **both** `--key-url` and `--keydb`, the local keydb is consulted
first (local-first) and the service is only queried when the keydb has no key
for the disc. The URL is validated before any request, and freemkv refuses to
send disc-key material to a loopback, private, or cloud-metadata address.

Title selection (`-t`) and the `iso://`-only `--raw` / `--multipass` flags are covered under [Scheme details](#scheme-details).

Global (any command):

| Flag | Description |
|---|---|
| `--language CODE` | UI language — freemkv is fully localized in **7**: `en` `de` `es` `fr` `it` `nl` `pt` (alias `--lang`). |
| `--log-level N` | Enable a diagnostic **log file**: 1 = warn … 4 = trace (the terminal stays clean). For bug reports use `--log-level 3`. |
| `--log-file PATH` | Where to write the log (default `./log.txt`). |
| `-q, --quiet` | Suppress stdout. |
| `RUST_LOG` | Power-user filter; enables file logging and wins over `--log-level`. |

Keys are never written to logs. One Ctrl-C halts a rip cleanly (tray unlocked, mapfile preserved); a second forces exit `130`.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success. |
| `1` | Failed (rip / mux / scan error, bad flag, missing key) or `verify` found unrecoverable sectors. |
| `2` | No subcommand or URL (usage printed). |
| `130` | Second Ctrl-C. |
