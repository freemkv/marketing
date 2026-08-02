---
title: libfreemkv
description: The core Rust library behind freemkv. Disc scanning, sector reading, AACS/CSS decryption, and MKV muxing.
---

libfreemkv is the engine the whole toolchain composes: disc scanning, sector reading,
AACS/CSS decryption, and MKV muxing. The [CLI](/docs/cli/) and
[autorip](/docs/autorip/) are thin front ends over it. This page maps the library for developers
embedding it; the [download page](/download/) covers the ready-to-run tools.

:::note[Recovery moved out in 1.6.0]
The sweep/patch strategy, the ddrescue mapfile, damage classification and the multipass
loop are **no longer part of libfreemkv**. They live in the
[`freemkv-engine`](/docs/components/) crate as
`freemkv_engine::recovery::{copy, sweep, patch}`. libfreemkv keeps the raw single-shot
sector read and the SCSI-fact translation the strategy is built on.
:::

- Source (authoritative): [github.com/freemkv/libfreemkv](https://github.com/freemkv/libfreemkv)
- Consumed by git tag
- License: MIT

:::note[Authoritative API reference]
This page is a high-level map. For exact, current signatures, read the source on
**[GitHub](https://github.com/freemkv/libfreemkv)** — it's the source of truth; the
published crate and its generated docs can lag the latest source.
:::

```toml
[dependencies]
libfreemkv = "1.6.0"
```

## Design principles

- **Streams are PES.** Every stream type reads its format into PES frames, or writes PES
  frames into its format. No byte-level `Read`/`Write`; no `Seek` on streams.
- **Sector dumps are not streams.** A disc-to-ISO copy is a raw sector operation, driven by
  `freemkv_engine::recovery::copy` over libfreemkv's `SectorSource`.
- **`DiscStream` is any disc.** A physical drive or an ISO file behind the same type, just
  with a different sector source.
- **No English in the library.** Errors are numeric codes (`Error` enum); applications
  handle all user-facing text and i18n.
- **Functions return errors; only `main()` exits.** The library never calls
  `process::exit`.

## Stream URLs

Sources and destinations are addressed by `scheme://` URLs, parsed into `StreamUrl`:

```rust
pub enum StreamUrl {
    Disc { device: Option<PathBuf> },  // disc://  or  disc:///dev/sgN
    M2ts { path: PathBuf },            // m2ts://file.m2ts
    Mkv { path: PathBuf },             // mkv://file.mkv
    Mp4 { path: PathBuf },             // mp4://file.mp4 (compatibility export)
    Network { addr: String },          // network://host:port
    Stdio,                             // stdio://
    Iso { path: PathBuf },             // iso://image.iso
    Dir { path: PathBuf },             // dir://path/ (decrypted file tree)
    Null,                              // null://
    Demux { dir: PathBuf },            // demux://dir/ (per-track elementary streams)
    Video { dir: PathBuf },            // video://dir/ (video tracks only)
    Audio { dir: PathBuf },            // audio://dir/ (audio tracks only)
    Sub { dir: PathBuf },              // sub://dir/   (subtitle tracks only)
    Fvi { path: PathBuf },             // fvi://file.fvi (per-picture video index)
    Chapters { path: PathBuf },        // chapters://file.xml|.txt|.vtt
    Json { path: PathBuf },            // json://file.json (title metadata)
    Unknown { raw: String },           // unrecognized
}
```

Use `parse_url(&str) -> StreamUrl` to parse, and `input(url, &opts)` / `output(url, &title)`
to open streams. Bare paths without a scheme are rejected.

:::caution[Live discs bypass the URL resolver]
`disc://` is **not** opened via `input()`. A live disc requires
`Drive::open()` → `Disc::scan()` → `DiscStream::new()` directly, because the live-drive read
path carries adaptive bad-sector retry that the generic resolver doesn't. For a raw disc →
ISO copy, use `freemkv_engine::recovery::copy`, not the URL resolver.
:::

## Public API surface

A map of the main exports (see the [source](https://github.com/freemkv/libfreemkv) for full signatures):

### Disc and titles

- `Disc`: a scanned disc with titles, streams, format, AACS/CSS state.
- `Disc::scan(...)` scans a live drive; `Disc::scan_image(...)` scans an ISO.
- `Disc::identify(...)` is the fast path — UDF only, no playlist parse.
- `DiscTitle`, `Stream`, `Codec`, `Resolution`, `FrameRate`, `HdrFormat`, `ColorSpace`,
  and the audio/subtitle stream structs: structured title/stream metadata.
- `ScanOptions`: scan controls (AACS host credentials, the key-source layer, and a halt token).

### Recovery and the mapfile — in `freemkv-engine`, not here

None of the recovery surface lives in libfreemkv any more. In the `freemkv-engine` crate:

- `freemkv_engine::recovery::{copy, sweep, patch}`: the copy driver, the Pass 1 forward
  sweep, and the Pass N targeted retry.
- `freemkv_engine::recovery::mapfile`: `Mapfile`, `SectorStatus` (`NonTried`, `NonTrimmed`,
  `NonScraped`, `Unreadable`, `Finished`), `MapStats`, `mapfile_path_for`.

What libfreemkv still owns is the layer underneath: `Drive::read(lba, count, buf, recovery)`
(one CDB, no inline retry — `recovery` only selects the 10 s vs 60 s timeout), `ScsiSense` /
`SenseFamily` for classifying what the drive reported, and `WritebackFile` for the output.

See **[How recovery works](/docs/how-recovery-works/)** for the algorithm these types drive.

### Muxing and streams

- `build_iso_pipeline(...)`: the three-stage prefetch, demux, parse pipeline used by all
  file-backed mux paths.
- Stream types: `DiscStream`, `MkvStream`, `M2tsStream`, `NetworkStream`, `StdioStream`,
  `NullStream`; the `pes::Stream` trait, re-exported at the crate root as `PesStream`
  (to avoid colliding with `disc::Stream`, the codec-kind enum), is the common
  `read()` interface.
- Write-only sinks (dest-only): `Mp4Sink` (MP4 output), the per-track-class demux
  sinks (`video://` / `audio://` / `sub://` / `demux://`), and the metadata sinks
  (`chapters://` / `json://` / `fvi://`).
- `input(...)`, `output(...)`, `parse_url(...)`, `StreamUrl`.

### Drives and SCSI

- `Drive`: open, init, lock/unlock the tray, scan, read sectors.
- `list_drives()`, `find_drive()`, `drive_has_disc()`: enumeration.
- `DriveCredentials`: AACS host certificates for the authenticated handshake.

### Keys and decryption

- `DecryptKeys`: resolved AACS/CSS key material.
- `KeySource`: the interface a caller implements to supply keys; see
  [`freemkv-keysources`](/docs/components/) for the bundled implementations.

### Errors and control

- `Error`: a numeric-coded error enum; `Result<T>` is `Result<T, Error>`.
  `Error::KeydbLoad` carries the path; the sentinel `<no keydb in search paths>` signals a
  missing keydb (see [Decryption Keys](/docs/decryption-keys/)).
- `Halt`: a cooperative cancellation token; a progress-callback trait reports pass
  progress and can request a halt.

## The mux pipeline

`build_iso_pipeline` wires three overlapping stages:

1. **Prefetched producer**: reads sectors ahead of demand (with optional batching) and
   applies the decrypting sector-source decorator, feeding a bounded channel.
2. **Demux thread**: a dedicated consumer that demultiplexes the transport/program stream
   into PES frames.
3. **Pipelined PES stream**: applies codec parsers and exposes the `PesStream` interface to
   the caller.

All file-backed mux paths (CLI ISO/M2TS remux, autorip's multipass and resume mux) flow
through this pipeline.

## AACS and CSS key model

- **CSS (DVD)** is built in, with no external key file needed. On a CSS-enforcing drive,
  `unlock_css_reads` issues the classic bus-auth handshake purely to unlock scrambled-sector
  reads; no player keys are compiled in and none are used. Title keys are recovered
  keylessly by the Stevenson known-plaintext attack (`css::crack_key`).
- **AACS (Blu-ray / 4K UHD)**: no key material is compiled in; keys come through a
  `KeySource` — either a local `keydb.cfg` (searched in default OS paths; see
  [Decryption Keys](/docs/decryption-keys/)) or an online key service; overridable via
  `ScanOptions`.
- A missing key database for an AACS disc surfaces as `Error::KeydbLoad` with the sentinel
  path `<no keydb in search paths>`, which front ends render as "no KEYDB.cfg found."

Full detail is on the [Decryption Keys](/docs/decryption-keys/) page.
