---
title: libfreemkv
description: The core Rust library behind freemkv. Disc scanning, multipass recovery, AACS/CSS decryption, and MKV muxing.
---

libfreemkv is the engine the whole toolchain composes: disc scanning, multipass recovery,
sector-level retry, AACS/CSS decryption, and MKV muxing. The [CLI](/cli/) and
[autorip](/autorip/) are thin front ends over it. This page maps the library for developers
embedding it; the [download page](/download/) covers the ready-to-run tools.

- Source (authoritative): [github.com/freemkv/libfreemkv](https://github.com/freemkv/libfreemkv)
- Crate: `libfreemkv` on [crates.io](https://crates.io/crates/libfreemkv)
- License: AGPL-3.0

:::note[Authoritative API reference]
This page is a high-level map. For exact, current signatures, read the source on
**[GitHub](https://github.com/freemkv/libfreemkv)** — it's the source of truth; the
published crate and its generated docs can lag the latest source.
:::

```toml
[dependencies]
libfreemkv = "1.1.0-beta.1"
```

## Design principles

- **Streams are PES.** Every stream type reads its format into PES frames, or writes PES
  frames into its format. No byte-level `Read`/`Write`; no `Seek` on streams.
- **`Disc::copy()` for sector dumps.** A disc-to-ISO copy is a raw sector operation, not a
  stream.
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
    Iso { path: PathBuf },             // iso://image.iso
    M2ts { path: PathBuf },            // m2ts://file.m2ts
    Mkv { path: PathBuf },             // mkv://file.mkv
    Network { addr: String },          // network://host:port
    Stdio,                             // stdio://
    Null,                              // null://
    Dir { path: PathBuf },             // dir://path/ (decrypted file tree)
    Unknown { raw: String },           // unrecognized
}
```

Use `parse_url(&str) -> StreamUrl` to parse, and `input(url, &opts)` / `output(url, &title)`
to open streams. Bare paths without a scheme are rejected.

:::caution[Live discs bypass the URL resolver]
`disc://` is **not** opened via `input()`. A live disc requires
`Drive::open()` → `Disc::scan()` → `DiscStream::new()` directly, because the live-drive read
path carries adaptive bad-sector retry that the generic resolver doesn't. For a raw disc →
ISO copy, use `Disc::copy()` / `Disc::sweep()`, not the URL resolver.
:::

## Public API surface

A map of the main exports (see the [source](https://github.com/freemkv/libfreemkv) for full signatures):

### Disc and titles

- `Disc`: a scanned disc with titles, streams, format, AACS/CSS state.
- `Disc::scan(...)` scans a live drive; `Disc::scan_image(...)` scans an ISO.
- `Disc::sweep(...)` is the Pass 1 forward read; `Disc::copy(...)` runs sweep or patch, dispatched
  by mapfile state; `Disc::patch(...)` is Pass N recovery.
- `DiscTitle`, `Stream`, `Codec`, `Resolution`, `FrameRate`, `HdrFormat`, `ColorSpace`,
  and the audio/subtitle stream structs: structured title/stream metadata.
- `ScanOptions`: scan controls (including AACS host credentials and keydb path).

### Recovery and the mapfile

- `SweepOptions` / `CopyOptions` and `PatchOptions`: pass controls.
- `CopyResult` / `PatchOutcome`: pass results (good/unreadable/pending byte counts, halt
  status).
- The `mapfile` module: `Mapfile`, `SectorStatus` (`NonTried`, `NonTrimmed`, `NonScraped`,
  `Unreadable`, `Finished`), `MapEntry`, `MapStats`.

See **[How recovery works](/how-recovery-works/)** for the algorithm these types drive.

### Muxing and streams

- `build_iso_pipeline(...)`: the three-stage prefetch, demux, parse pipeline used by all
  file-backed mux paths.
- Stream types: `DiscStream`, `MkvStream`, `M2tsStream`, `NetworkStream`, `StdioStream`,
  `NullStream`; the `PesStream` trait is the common `read()` interface.
- `input(...)`, `output(...)`, `parse_url(...)`, `StreamUrl`.

### Drives and SCSI

- `Drive`: open, init, lock/unlock the tray, scan, read sectors.
- `list_drives()`, `find_drive()`, `drive_has_disc()`: enumeration.
- `DriveCredentials`: AACS host certificates for the authenticated handshake.

### Keys and decryption

- `DecryptKeys`: resolved AACS/CSS key material.
- `KeySource`: the interface a caller implements to supply keys; see
  [`freemkv-keysources`](/components/) for the bundled implementations.
- The `keydb` module: `keydb::default_path()`, `keydb::update(url)`.

### Errors and control

- `Error`: a numeric-coded error enum; `Result<T>` is `Result<T, Error>`.
  `Error::KeydbLoad` carries the path; the sentinel `<no keydb in search paths>` signals a
  missing keydb (see [Decryption Keys](/decryption-keys/)).
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
  [Decryption Keys](/decryption-keys/)) or an online key service; overridable via
  `ScanOptions`.
- A missing key database for an AACS disc surfaces as `Error::KeydbLoad` with the sentinel
  path `<no keydb in search paths>`, which front ends render as "no KEYDB.cfg found."

Full detail is on the [Decryption Keys](/decryption-keys/) page.
