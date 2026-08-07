---
title: CLI Reference
description: Every freemkv subcommand, flag, and stream URL.
---

The `freemkv` CLI has two forms:

```bash
# Convert: a source and a destination. There is NO command word — the action
# is the URL pair itself (rip a disc, convert an ISO to MKV, remux an m2ts…).
freemkv <source-url> <dest-url> [flags]

# Subcommand: the first argument is the command.
freemkv <subcommand> [args]              # info, update-keys, version, help
```

A bare invocation prints usage and exits `2`.

On **Windows and macOS** the same binary also opens as a desktop app — run `freemkv gui`, or open the `.app` on macOS (see [macOS](/docs/platforms-macos/)) — if you'd rather pick titles in a window than pass flags. The Linux build is command line only; there is no `gui` subcommand on Linux.

## Stream URLs

Every source and destination is a `scheme://` URL.

**Discs & images**

| URL | Source | Dest | Notes |
|---|---|---|---|
| `disc://` | ✓ | — | Optical drive (auto-detected; `disc:///dev/sg4` or `disc://D:` to target one) |
| `iso://path.iso` | ✓ | ✓ | Disc image — readable from anything; writable from `disc://` (rip a disc) or from another `iso://` (decrypt an image you have) |
| `dir://path/` | ✓ | ✓ | Decrypted file tree (VIDEO\_TS / BDMV) — readable as a source too, so a folder backup works anywhere an image does |

**Container files**

| URL | Source | Dest | Notes |
|---|---|---|---|
| `mkv://path.mkv` | ✓ | ✓ | Matroska movie — the keep-everything archival path |
| `m2ts://path.m2ts` | ✓ | ✓ | Blu-ray transport stream |
| `mp4://path.mp4` | ✓ | ✓ | MP4 (ISO-BMFF) — read *or* write; a play-everywhere compatibility export |

**Extraction sinks** (one facet of a title)

| URL | Source | Dest | Notes |
|---|---|---|---|
| `video://path/` | — | ✓ | Video tracks only — a directory, one native elementary-stream file per track |
| `audio://path/` | — | ✓ | Audio tracks only — a directory, one native-container file per track |
| `sub://path/` | — | ✓ | Subtitle tracks only — a directory, one file (`.sup` / `.idx`+`.sub`) per track |
| `demux://path/` | — | ✓ | All tracks as per-track elementary streams — a directory, one file per track |
| `chapters://path` | — | ✓ | Chapter markers for one title — a single file (`.xml` / `.txt` / `.vtt`) |
| `json://path.json` | — | ✓ | One title's structure (streams, chapters, clips) as JSON — a single file |
| `fvi://path.fvi` | — | ✓ | freemkv video index — a JSON-Lines, one-record-per-picture index file ([spec](/docs/fvi-format/)) |

**Transports**

| URL | Source | Dest | Notes |
|---|---|---|---|
| `network://host:port` | ✓ | ✓ | TCP (listen or connect) |
| `stdio://` | ✓ | ✓ | Stdin / stdout |
| `null://` | — | ✓ | Discard (read-speed benchmark) |

`disk://` is an alias for `disc://`. Everything is **decrypted by default**; `--raw` (`disc:// → iso://` only) is the sole encrypted output. BD/UHD discs need an AACS key — see [Decryption Keys](/docs/decryption-keys/); DVDs need none.

## Scheme details

What each scheme does, and when to reach for it.

### disc://

Rips the **main title** by default. Pick others with `-t N`, several at once, or
`-t all` for every title on the disc:

```bash
freemkv disc:// mkv://Movie.mkv          # main title → one file
freemkv disc:// mkv://out/ -t 1 -t 3     # titles 1 and 3 → out/ (a directory)
freemkv disc:// mkv://out/ -t all        # every title → out/ (a directory)
```

> Before 1.6.0, no `-t` meant *every* title. That default flipped to the main
> title only — obfuscated discs with dozens of near-equal-length playlists
> were ripping everything. Pass `-t all` to get the old behavior back.

### mkv://

Writes one decrypted movie. A **single title** goes to the file you name; **multiple titles** go to a **directory**, one file each, named `<disc>_t<N>.mkv`:

```bash
freemkv disc:// mkv://Movie.mkv          # single title → Movie.mkv
freemkv disc:// mkv://out/ -t 1 -t 3     # → out/Greenland_t1.mkv, out/Greenland_t3.mkv
```

### m2ts://

Same as `mkv://`, but writes a Blu-ray transport stream — one file for a single title, or `<disc>_t<N>.m2ts` per title into a directory.

### mp4://

Writes a single self-contained **MP4** (ISO-BMFF) — the container that plays
everywhere (browsers, phones, Apple devices, editors). Like `mkv://`, a single
title goes to the file you name and multiple titles go to a directory as
`<disc>_t<N>.mp4`.

```bash
freemkv iso://Movie.iso mp4://Movie.mp4 -t 1
```

**MP4 is a compatibility export, not the archival path — use `mkv://` to keep
everything.** MP4 can only carry codecs it has a mapping for, so freemkv muxes the
video (HEVC / H.264, with HDR10 colour signalling) plus the audio MP4 supports —
**AC-3, E-AC-3 / DD+** (incl. Atmos) and **DTS / DTS-HD** — and **leaves out —
loudly, never silently —** what MP4 can't hold: lossless **TrueHD**, **LPCM**, and
**PGS / VobSub** bitmap subtitles (MP4 subtitles are text-only). freemkv prints
exactly which tracks were excluded and why before it muxes. If a title has *no*
MP4-compatible video at all (e.g. a VC-1 or MPEG-2 disc), the mux fails rather
than writing a broken file. Output is **faststart** (the index is written first,
so it streams over HTTP without a pre-fetch).

**As a source**, `mp4://` reads a progressive MP4 back into the pipeline, so it
flows to any destination — convert an MP4 to MKV, re-extract its tracks, or dump
its metadata:

```bash
freemkv mp4://Movie.mp4 mkv://Movie.mkv     # MP4 → MKV, no re-encode
freemkv mp4://Movie.mp4 audio://tracks/     # pull its audio back out
freemkv mp4://Movie.mp4 json://Movie.json   # inspect its structure
```

### iso://

**As a source** (`iso://Movie.iso`), it rips the **main title** by default, same as `disc://`:

```bash
freemkv iso://Movie.iso mkv://Movie.mkv        # main title → a single file (the default)
freemkv iso://Movie.iso mkv://out/ -t all      # every title → out/Movie_t1.mkv, out/Movie_t2.mkv, …
```

`-t all` rips every title; because multiple titles means multiple files, the
*output* then has to be a directory.

**As a destination** (`iso://Movie.iso`), it writes a decrypted sector image — from
the disc in a drive, or from an image you already have:

```bash
freemkv disc:// iso://Movie.iso          # rip the disc to a decrypted image
freemkv iso://In.iso iso://Out.iso       # decrypt an image you already have
```

:::note[Two ways to write an ISO, and they behave differently]
`disc:// → iso://` is the **recovery path**: multi-pass retry, a resumable
mapfile, damage handling — everything a disc with bad sectors needs.

`iso:// → iso://` is a plain sequential copy with none of that, because a file
has no marginal media to retry. It exists to decrypt an image without hunting
down the disc again. `--multipass` and `--raw` are drive operations and are
rejected here (see below).
:::

…plus two flags for the `disc:// → iso://` rip specifically — they describe how
to read a *drive*, so they need a `disc://` source as well as an `iso://`
destination:

- **`--multipass`** — sweep, then retry the bad sectors, with a resumable **mapfile** sidecar (sector state only — never keys). Re-run until clean. Damaged-disc workflow: `disc:// iso:// --multipass`, then `iso:// mkv://`.
- **`--raw`** — write the sectors **encrypted**, a faithful image. You can't mux or benchmark ciphertext, so both flags error on any other destination — and there is no drive to re-read or leave encrypted on a file source, so both also error on any source that isn't `disc://`.

A plain `disc:// iso://` auto-resumes if interrupted.

### fvi://

Writes a **freemkv video index** — a JSON-Lines file (`.fvi`) with one record per coded picture, capturing the frame's type, position, and timing. It's an index *over* the video, not the video itself, so the output is a single `.fvi` file rather than a movie:

```bash
freemkv iso://disc.iso fvi://out.fvi
```

See the [FVI Format](/docs/fvi-format/) reference for the full specification.

### demux://

Extracts each track to its own **elementary-stream** file — video, audio, and subtitle streams split apart rather than muxed together. The destination is a **directory**, with one file written per track:

```bash
freemkv iso://disc.iso demux://out/
```

### video://

`demux://` narrowed to **video only** — each video track to its own file in a
directory, as a raw **elementary stream** in the codec's native form: `.hevc`,
`.h264`, `.vc1`, `.m2v` (MPEG-2), `.obu` (AV1). No audio, no subtitles. Useful for
stream analysis or feeding a re-encoder the exact bitstream off the disc.

```bash
freemkv iso://disc.iso video://tracks/     # e.g. tracks/Movie t00 HEVC.hevc
```

### audio://

`demux://` narrowed to **audio only** — every audio track to its own file in a directory, each in its **native container** so a player reads the codec's own headers directly: `.thd` (TrueHD), `.dts` / `.dtshd`, `.ac3`, `.eac3`, `.aac`, `.flac`. No video, no subtitles.

```bash
freemkv iso://disc.iso audio://tracks/     # e.g. tracks/Movie t01 eng TrueHD.thd, … eng EAC3.eac3
```

> **LPCM note.** Blu-ray/DVD LPCM has no container of its own, so it's written as headerless big-endian `.pcm` (Matroska `A_PCM/INT/BIG`). To play it you must tell the player its sample rate, channel count, and bit depth by hand.

### sub://

`demux://` narrowed to **subtitles only** — every subtitle track to its own file: PGS as `.sup`, VobSub as a paired `.idx` + `.sub`, text subtitles as `.srt`. No video, no audio.

```bash
freemkv iso://disc.iso sub://subs/         # e.g. subs/Movie t03 eng PGS.sup
```

### chapters://

Writes just the **chapter markers** of one title — a single sidecar file, no audio/video. The format follows the **output extension**: `.xml` (Matroska chapters, the default), `.txt` / `.ogm` (OGM simple), or `.vtt` (WebVTT). Because it's one title's chapters, pick the title with `-t` when the source has several.

```bash
freemkv iso://disc.iso chapters://Movie.xml -t 1    # Matroska XML
freemkv iso://disc.iso chapters://Movie.vtt -t 1    # WebVTT cues
```

Only the disc scan runs — no demux — so it returns in seconds.

### json://

Writes one title's **structure as JSON**: playlist identity, duration and size, every stream with its full detail (video resolution / frame rate / HDR / colour space / aspect; audio codec / channels / sample rate / language / purpose; subtitle codec / language / forced / qualifier), the clip list, and the chapter points. A machine-readable view for scripting or cataloguing — everything the scan resolved, nothing dropped.

```bash
freemkv iso://disc.iso json://Movie.json -t 1
```

Like `chapters://`, it's scan-only (no demux) and near-instant.

### dir://

**As a destination**, extracts the decrypted on-disc file tree (`VIDEO_TS/` or
`BDMV/`) straight into the folder, reading and decrypting only the disc's
allocated files.

```bash
freemkv disc:// dir://Movie/
freemkv iso://Disc.iso dir://Movie/
```

**As a source**, reads an extracted folder anywhere a disc image works — the
shape most backup tools produce. A folder that is already decrypted needs no
key; one that still carries an `AACS` directory is judged by its content rather
than by the directory being present, so a decrypted backup is not refused for a
leftover folder.

```bash
freemkv dir://Movie/ mkv://Movie.mkv
freemkv dir://Movie/ iso://Movie.iso
freemkv info dir://Movie/
```

3D folders are refused rather than produce a silently wrong result.

### network://host:port

Streams a rip over TCP instead of to a file: one end listens (`network://0.0.0.0:9000`), the other connects (`network://192.0.2.10:9000`). Rip on the machine with the drive and mux or store on another — no shared filesystem needed.

### stdio://

Writes the muxed output to stdout (or reads it from stdin), so you can chain freemkv into a pipe with no intermediate file. The classic use is transcoding on the fly: hand the stream to a transcoder that demuxes its input in a single linear pass, and it reads the pipe directly:

```bash
freemkv disc:// stdio:// | your-transcoder -i - -o Movie.mkv
```

A pipe only works for tools that read their input straight through. A transcoder that scans titles first — seeking around the file before encoding — cannot consume a non-seekable pipe. Hand it a file instead: mux with freemkv first, then transcode that:

```bash
freemkv disc:// mkv://Movie.mkv        # decrypt + mux to a file
your-transcoder -i Movie.mkv -o Movie.mp4
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
| `-v, --verbose` | Add technical detail — the drive, device, and disc region; the AACS generation (1.0 / 2.0 / 2.1) and MKB version; the disc hash and Volume ID; the resolved keys (Volume Unique Key and each CPS unit key); and per-stream PIDs (video, audio, **and subtitles**) with audio sample rates. Off by default to keep the listing scannable — turn it on when debugging a mux or AACS issue. |
| `--share` | Capture the drive's profile to a zip and print a ready-to-paste GitHub issue for the community drive-compatibility database. On a **release build + interactive terminal**, freemkv then offers to submit it for you — a `[Y/n]` prompt (default **yes**) that posts the issue to GitHub if you accept. `--mask` redacts drive serials first. Nothing is sent unless you confirm at that prompt. |

:::caution[`--share` is a separate route]
`--share` takes over the whole invocation and accepts only `--mask`, `-q`, `-v`,
`--log-file` and `-h`. Combining it with the listing flags fails —
`freemkv info disc:// --share --full` exits 1 with *Unknown option: --full*, and so
does `--log-level` on this route. On an `iso://` URL only `--full` is read; the other
listing flags are ignored.
:::

### Converting a file to MKV (no drive needed)

There is **no `remux` command** — converting a file is just the `<source-url> <dest-url>` form with a file source. Any file source (`m2ts://`, `iso://`) to a mux destination (`mkv://`, `m2ts://`) works, no drive involved.

```bash
freemkv m2ts://Movie.m2ts mkv://Movie.mkv       # convert a BD transport stream to MKV
freemkv iso://Disc.iso -t 1 mkv://Movie.mkv     # convert an ISO's main title to MKV
```

| Flag | Description |
|---|---|
| `-t, --title N` | Select title (1-based, repeatable). Default: the main title. Use `-t all` for every title in the source. |
| `-a, --audio SPEC` | Audio streams to keep: `all` (default), `none`, or a comma-separated language list (names or ISO codes). Video is always kept. |
| `-s, --subtitles SPEC` | Subtitle streams to keep: `all` (default), `none`, or a comma-separated language list. |

`-t` / `-a` / `-s` apply **only to a `disc://` or `iso://` source** — those are the
sources freemkv scans into a title list. Pairing them with a stream/file source
(`m2ts://`, `mp4://`, `mkv://`, `network://`, `stdio://`) is rejected before the rip
starts, so of the two examples above only the `iso://` one takes them.

Pick which language tracks land in the output — otherwise every audio and subtitle stream is kept (the archival default, identical to before 1.6.0):

```bash
freemkv iso://Movie.iso mkv://Movie.mkv -a eng,spa -s eng   # English + Spanish audio, English subtitles
freemkv disc:// mkv://Movie.mkv -a English -s none          # English audio only, no subtitles
```

Language tags match by identity: `English`, `en`, and `eng` all select the same track. A language that isn't on the disc lists the disc's actual languages and stops, rather than silently shipping the wrong file.

> On a **rip** (source *and* destination), `-s` means **subtitles**. On an info-only invocation (`freemkv info disc://`, no destination), `-s` / `--share` still submits the drive profile; use the long form `--share` when in doubt.

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
| `--keydb PATH` | Override the keydb location. Without it, freemkv searches the default locations — see [Decryption Keys](/docs/decryption-keys/). Only Blu-ray/UHD need a keydb; DVDs use none. |
| `--key-url URL` | Online key service (`http://…` or `https://…`); the local keydb is tried first if both are given. |
| `--key-auth TOKEN` | Bearer token for `--key-url`. |

If you supply **both** `--key-url` and `--keydb`, the local keydb is consulted
first (local-first) and the service is only queried when the keydb has no key
for the disc. The URL is validated before any request, and freemkv refuses to
send disc-key material to a loopback, private, or cloud-metadata address.

Title selection (`-t`) and the `disc:// → iso://`-only `--raw` / `--multipass` flags are covered under [Scheme details](#scheme-details).

Global (any command):

| Flag | Description |
|---|---|
| `--language CODE` | UI language — freemkv is fully localized in **29**: `ca` `cs` `da` `de` `el` `en` `es` `es-419` `fi` `fr` `hu` `id` `it` `ja` `ko` `nl` `no` `pl` `pt` `pt-br` `ro` `ru` `sk` `sv` `tr` `uk` `vi` `zh-hans` `zh-hant` (alias `--lang`). |
| `--log-level N` | Enable a diagnostic **log file**: 1 = warn … 4 = trace (the terminal stays clean). For bug reports use `--log-level 3`. Not accepted on the `info … --share` route, which has its own flag set. |
| `--log-file PATH` | Where to write the log (default `./log.txt`). |
| `-q, --quiet` | Suppress stdout. |
| `--force` | On a `dir://` destination, extract into a folder that is not empty (otherwise E9026 stops the run). |
| `RUST_LOG` | Power-user filter; enables file logging and wins over `--log-level`. |

Keys are never written to logs. One Ctrl-C halts a rip cleanly (tray unlocked, mapfile preserved); a second forces exit `130`. On a multi-title rip (`-t all` / multiple `-t N`), Ctrl-C is a **full stop** of the whole rip, not just the title in progress.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success. |
| `1` | Failed (rip / mux / scan error, bad flag, missing key). |
| `2` | No subcommand or URL (usage printed). |
| `130` | Second Ctrl-C. |
