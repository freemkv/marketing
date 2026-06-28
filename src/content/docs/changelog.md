---
title: Changelog
description: Notable changes across the freemkv toolchain (CLI, library, and autorip service), newest first.
---

<a href="/changelog/rss.xml" aria-label="Subscribe via RSS" title="Subscribe via RSS" style="display:inline-flex;align-items:center"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#f26522" aria-hidden="true"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20A2.18 2.18 0 0 1 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 4.95a10.61 10.61 0 0 1 10.61 10.61h-2.83A7.78 7.78 0 0 0 4 12.22V9.39Z"/></svg></a>

All notable changes across the freemkv toolchain (the `freemkv` CLI,
the `libfreemkv` core library, and the `autorip` service) are recorded
here, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and the project
follows semantic versioning.

The toolchain releases as a set: every component ships the same version
number on each release, even when a given component has no functional
change in that cycle.

## 1.1.0-beta.1 — Unreleased

The first beta on top of 1.0.0, headlined by a **post-read decrypt-verify
gate** that catches silent bad reads during the rip and a major overhaul of
DVD processing — plus two new output formats, AACS correctness fixes, and a
handful of smaller fixes including targeted DTS-HD MA and TrueHD edge cases.

### Added

- **Post-read decrypt-verify gate (Blu-ray / UHD).** Every encrypted unit is
  now verified — decrypted and checked against the disc's own structure —
  *during* the rip, before it's accepted as good. A unit that can't be
  decrypted is treated like a bad read and retried, catching the rare "silent
  bad read" where a sector comes back without an error but its contents are
  subtly wrong. It only ever flags a unit it is certain about, so it never turns
  a good read bad, and it can be disabled at build time.
- **New `fvi://` output — a freemkv video index.** Write a compact
  JSON-Lines index file (`.fvi`) describing every coded picture in a title:
  its type, position, and timing. An index over the video, not the video
  itself. `freemkv iso://disc.iso fvi://out.fvi`.
- **New `demux://` output.** Split a title into its individual
  elementary streams — one file per video, audio, and subtitle track — into a
  directory. `freemkv iso://disc.iso demux://out/`.
- **Build provenance in every MKV.** The output's muxing-application field now
  records the exact freemkv build that produced the file, so any MKV can be
  traced back to the version that made it.
- **New error code E7025 ("AACS bus key unavailable")**, with a clear message
  and recovery steps on the Error Codes page.

### Fixed

- **Major overhaul of DVD processing.** freemkv's DVD title and VOB
  sector mapping was reworked from the ground up. The most visible result:
  rips now begin at the *feature* instead of several minutes of the disc's
  menu. On discs that author a per-title menu (for example a studio "the
  parental level has been set" prompt), freemkv had been prepending that
  entire menu segment to the front of the feature; rips now open on the
  feature's first frame.
- **`--version` now matches the build stamped into MKVs.** The CLI's `--version`
  string and the `MuxingApp` / `WritingApp` fields written into every MKV now
  derive from a single libfreemkv constant — the package version plus the git
  short hash (e.g. `freemkv 1.1.0-beta.1 (g835cc99)`). The muxer previously kept
  its own copy of that string, so the two could drift; a binary and the files it
  produces can no longer report different versions.
- **DTS-HD Master Audio: a false core-sync inside the lossless extension no
  longer splits an audio frame.** A byte pattern in the extension substream that
  resembled the `0x7FFE8001` core sync word could truncate the lossless
  extension and produce decode errors on the affected frames. The extension
  substream is now sized exactly from its header, so that pattern is skipped as
  data.
- **TrueHD: decode timestamps no longer step backward.** In a case where the
  source PES timing lagged the audio access-unit cadence, the muxed decode
  timestamp could regress (non-monotonic-DTS warnings to the muxer); the running
  timestamp is now clamped so it never goes backward.
- **`update-keys --keydb <path>` is honored.** Passing an explicit keydb path
  now downloads to that path; previously it was ignored and the file always
  landed in the default location.
- **AACS reliability fixes.** On bus-encrypted discs the flag that says "this
  needs a drive bus key" was read from the wrong bit, which could let a rip
  proceed without the key and produce garbage instead of failing clearly — it is
  now read per spec (confirmed against real discs). The check that accepts a
  decryption key is also stricter, so a wrong key can no longer coincidentally
  pass and corrupt a unit.
- **autorip: ISO rips now require a complete disc image.** The "Max Acceptable
  Main Movie Loss" tolerance is a muxed-output (MKV / M2TS) setting and is
  ignored for an ISO rip — an ISO is captured whole or the rip stops, so a
  leftover MKV tolerance can't quietly let an ISO accept loss.
- **autorip: aborted rips can resume instead of starting over.** A rip that
  stops because of unrecoverable loss keeps its progress and re-checks on the
  next attempt (after cleaning the disc, raising the loss tolerance, or another
  recovery pass) rather than discarding everything.
- **autorip resume no longer races the muxer.** A staging directory that the
  mux worker already owns is no longer offered for resume, so a manual resume
  can't disturb a file the muxer is still reading.
- **autorip progress is now two states: Good and Maybe — never more.** The live
  rip card dropped the old `Feature` / `Cosmetic` / `No chance` / `Lost` chips.
  **Good** is whatever has been read and verified clean; **Maybe** is everything
  not yet good — pending, skipped, or not-yet-decryptable, all folded together,
  because a later pass (or simply power-cycling a stuck drive) often still
  recovers it. Nothing is declared "lost" while the rip is still running. Whether
  a rip passes is decided only at the end, against your loss tolerance. The Maybe
  chip shows whole-disc bytes but the *movie* time they cost, at millisecond
  precision — so `Maybe 990 MB · 0:00` is 990 MB of extras with zero movie impact
  (it passes), while `Maybe 12 KB · ~1 ms` is a few seconds-of-movie sectors that
  a zero-loss setting will correctly reject.

## 1.0.0

First stable release of the freemkv toolchain. Consolidates the full 1.0
release-candidate series (rc.1 through rc.5.3) into one stable baseline, with
no functional change over rc.5.3. From here the `freemkv` CLI, the `libfreemkv`
core library, and the `autorip` service ship as a set on a shared version
number.

## 1.0.0-rc.5.3

### Added

- **`dir://` output** — write a decrypted `VIDEO_TS` / `BDMV` file tree straight
  from a disc or ISO instead of a single muxed file.

### Changed

- **Source-agnostic key errors** — decryption messages no longer assume a local
  key database is *the* key source.
- **The default `keydb.cfg` location is next to the executable** (portable CLI);
  the autorip service keeps its container path.
- **Simpler flags** — dropped `-k` (use `--keydb`) and removed `--device` (the
  drive is named in the source URL, e.g. `disc:///dev/sgN`).

### Fixed

- **Fail loud on missing keys or bad input** instead of silently writing an
  undecrypted file.

## 1.0.0-rc.5.2

### Fixed

- **Reverted the rc.5.1 `DefaultDecodedFieldDuration` experiment for interlaced
  SD-DVD.** rc.5.1 added a 20 ms `DefaultDecodedFieldDuration` field element to
  the 576i/480i track header on the theory that Windows derives fps from it.
  Captured evidence showed that element made Windows Explorer report 12.5 fps
  (half) and MediaInfo flip the track to "Frame rate mode: Variable", while
  MK's rip of the same disc omits it. The element is therefore no longer
  written (`MkvTrack::video` now passes `field_duration_ns == 0`); the track
  keeps `FlagInterlaced=1` + `FieldOrder=TFF` and the full-frame 40 ms
  `DefaultDuration` (`1/DefaultDuration` = 25 fps), matching MK. How a given
  player or shell handler chooses to display interlaced fps is not guaranteed.
- **Correct AC-3 audio track selected on DVDs with non-standard sub-stream
  ordering.** freemkv assigned each declared audio stream a physical sub-stream
  by ordinal (`0x80+n`), assuming the IFO's first stream lives at `0x80`. On
  discs where the 5.1 main mix sits on a different sub-stream and `0x80` carries
  a 2.0 down-mix (e.g. Silence of the Lambs), the 2.0 was muxed under a "5.1"
  label. freemkv now probes each physical sub-stream's actual channel count from
  the disc — scanning every AC-3 frame and taking the maximum, so a brief 2.0
  logo bed at the feature head can't mask the real 5.1 — and routes each declared
  stream onto the sub-stream that genuinely matches.
- **"Decryption failed" on large AACS Blu-ray titles fixed.** AACS encrypts in
  aligned units of 3 sectors (6 KiB); the unit-alignment gate measured `lba % 3`
  against absolute disc LBA 0, but the unit grid is actually anchored at each
  clip's encrypted-region start. A clip whose start is not 3-sector-aligned had
  its readable units wrongly rejected — failing the feature/large titles of some
  discs while short clips passed. The gate is now clip-anchored.
- **Single-pass disc→MKV recovers marginal/transient sectors before failing.**
  The direct-to-MKV path now gives the drive its full ECC recovery budget on a
  bad sector (matching the multipass rip) instead of reporting a read failure a
  multipass rip would have recovered.
- **4K decode glitches at non-seamless clip joins fixed (Top Gun class).**
  Titles assembled from clips joined at non-seamless boundaries no longer drop
  reference frames at the join ("Could not find ref" stutter); the splice
  keyframe is rewritten so the decoder discards only the genuinely-dangling
  leading pictures.

### Changed

- **`freemkv-keysources` is now a pure key lookup.** The encrypted content-sample
  reader and the candidate-key resolution loop moved into libfreemkv (they read
  the disc and validate keys — decryption mechanism, not lookup). A key source
  now only looks a key up and hands it back. Downstream API: use
  `libfreemkv::read_encrypted_units` / `libfreemkv::resolve_and_apply` (was
  `freemkv_keysources::read_sample_units` / `…::resolve_and_apply`).

### Added

- **`--log-level 3` is now self-sufficient for MKV/opening-frame diagnosis.**
  The diagnostic pass now (a) dumps the ACTUAL MKV `TrackEntry` elements written
  per track (`tag=mkv.track`: FlagInterlaced, FieldOrder, DefaultDuration,
  DefaultDecodedFieldDuration via field-duration, Display dims, codecPrivate as
  hex) so the Windows-fps-class metadata is verifiable from a log alone, and
  (b) captures the first ~100 coded frames per track (raw bytes) to a
  `<output>.opening.bin` side file with a per-frame summary line
  (`tag=mkv.opening.frame`: track, key/delta, size, PTS) so opening-GOP / menu
  issues are diagnosable from a future log without the disc. Both are gated to
  log-level 3; a normal run opens no side file and records nothing.

### Verified

- **DVD opening-GOP / still-frame open handling is correct (no change needed).**
  The hypothesis that the opening pictures get the wrong (last-seen) sequence
  header or have their PTS floored to t=0 was traced and ruled out: the
  codecPrivate is the FIRST sequence header (read once at headers-ready, before
  any later AU), DVD VOBU structure guarantees each title opens on a sequence
  header + I-frame (no mid-GOP open), the parser back-anchors leading
  still-frames to the disc's real timeline, and the muxer anchors its timestamp
  base on the opening keyframe's real PTS so the t=0 floor never corrupts it.
  Regression tests pin all three.

## 1.0.0-rc.5.1

### Fixed

- **CSS reads unlocked on enforcing drives.** CSS-protected DVDs on
  drives that enforce CSS authentication previously produced an empty MKV
  at exit 0, or hung indefinitely. The read path now issues the bus-auth
  handshake (`css::auth::unlock_css_reads`) to unlock scrambled-sector
  reads before attempting any data transfer, so the drive gates lift
  correctly.
- **Keyless title-key recovery always runs.** The Stevenson known-plaintext
  attack (`css::crack_key` / `src/css/stevenson.rs`) now recovers the
  title key even when the bus-auth scan detects a CSS drive, removing a
  code path that fell through to locked reads on certain disc/drive
  combinations. A wrong key still fails cleanly (confirmed by a sector
  descramble check) rather than producing silent garbage.
- **Early bail on undecryptable discs.** When CSS authentication succeeds
  but no valid title key can be recovered, the mux path now terminates
  with a clear error code instead of writing an empty (or zero-byte)
  output file.
- **DVD audio channel count from AC-3 bitstream.** The audio channel count
  is now parsed from the AC-3 elementary-stream bitfield rather than from
  the IFO audio attributes, so the reported channel count always matches the
  actual muxed audio even when the IFO attribute disagrees. Passthrough only
  — no downmix is performed. (Selecting the correct audio sub-stream on discs
  with non-standard ordering is a separate item — see Known issues.)
- **Interlaced MKV frame rate on Windows.** Interlaced content (576i/480i)
  now emits a `DefaultDecodedFieldDuration` element in the MKV track
  header, which Windows Media Foundation and Explorer use to derive the
  display frame rate. Without it, players reported an incorrect or zero
  frame rate on interlaced tracks.
- **Per-track `BPS` bitrate tags populated.** The `BPS` tag is written for
  each track so players and shell extensions (Windows Explorer, MPC-HC,
  etc.) can display the per-stream bitrate without reading the full file.
- **Interlaced field order corrected to TFF.** 576i tracks were written
  with a bottom-field-first (BFF) container flag that disagreed with the
  top-field-first order carried in the MPEG-2 stream; the MKV `FieldOrder`
  element now matches the stream (TFF) so deinterlacers use the correct
  field parity.
- **DVD first-play menu no longer prepended to the feature.** The title
  VOBS base sector was read from the VTS menu-VOBS pointer (`vtsm_vobs`,
  offset 0xC0) instead of the title-VOBS pointer (`vtstt_vobs`, 0xC4), so on
  a disc that authors a per-title menu the entire menu VOB — e.g. a studio
  first-play "the parental level has been set, press yes" prompt — was
  prepended to the movie and every cell extent shifted back. The rip now
  opens on the feature's first frame.

### Changed

- **AACS handshake skipped on DVDs.** The AACS authentication sequence is
  no longer attempted on DVD discs (it never applied to CSS-encrypted
  media); attempting it on a DVD drive was a no-op at best and surfaced
  spurious errors at worst.

### Added

- **Structured disc diagnostics at `--log-level 3`.** A new diagnostic
  pass emits structured log events at INFO level when the log level is 3
  or higher: DVD PGC/cell layout and IFO video/audio attributes; BD/UHD
  playlist, clip, and AACS metadata. Provides a single-command snapshot
  for diagnosing mux or authentication issues without instrumenting the
  source.
- **Reduced per-operation log spam.** Mux-read and seek operations are
  demoted to TRACE (were DEBUG); benign navigation-packet drops are
  summarized as a single counter at the end of the title rather than
  logged per-packet.

### Known issues

- **Wrong audio track on discs with non-standard substream ordering.**
  Audio sub-stream ids are assigned by per-codec ordinal rather than read
  from the IFO/PGC stream-number table, so a disc whose physical substream
  order diverges from the convention may select the wrong audio track
  (e.g. a 2.0 stream in place of 5.1). Diagnose with
  `freemkv info disc://… --log-level 3`; fix tracked for the next release.

## 1.0.0-rc.4.2

### Fixed

- **Windows durability.** New platform-aware `io::fsync` module: directory
  fsync is a no-op on Windows (std cannot open a directory there, which
  logged a spurious warning on every mapfile write — including from the
  CLI), and a shared `file_durable` helper opens files read+write before
  `sync_all` so the flush succeeds on Windows, where `FlushFileBuffers`
  rejects a read-only handle with `ERROR_ACCESS_DENIED`.

## 1.0.0-rc.4

An audit-driven round of correctness, durability, and Windows-transport
fixes. No API changes; behavior is more conservative on damaged media and
on partial decryption.

### Fixed

- **Decrypt-time loss is accounted for.** A partial AACS/CSS decryption
  failure can no longer pass as a perfect rip — skipped/undecryptable
  bytes are folded into the loss total — and partial CPS-unit (per-title)
  key coverage is rejected in the AACS validation gate instead of
  producing partly-garbage output.
- **Durable writes.** `keydb.cfg` is written atomically (temp file +
  fsync + rename), and the mapfile fsyncs its parent directory after the
  rename so a resume checkpoint survives a crash.
- **Truthful error causes.** A server-dropped keydb download is
  classified as a connection error, not a parse error; a missing home
  directory maps to "not found" rather than a keydb-parse failure; the
  I/O error from opening an AACS-inputs ISO is preserved; and a
  transport failure is preserved through the AACS auth handshake instead
  of being relabeled.
- A failed `READ CAPACITY` now warns instead of silently using a
  zero-sector disc.
- A leaked pipeline consumer can no longer finalize an abandoned output.
- **Windows SCSI.** `ScsiPassThroughDirect` is packed to match the
  `ntddscsi.h` layout, `StorageAdapterDescriptor.BusType` width is
  corrected (`u8` → `u32`), oversized read batches on non-sysfs
  (Windows) drives are bounded, `IOCTL_STORAGE_RESET_DEVICE` failures are
  surfaced, and a device reset only sleeps on success.
- Mux now tracks skipped bytes so a partly-read title reports accurate
  loss.

### Changed

- The per-read `Drive::read` trace event was demoted to TRACE so a debug
  log isn't flooded by per-sector reads.

## 1.0.0-rc.2

Second release candidate for 1.0. libfreemkv is the core library: disc scan,
multipass sector recovery, content decryption (CSS, AACS 1.0/2.0), and the
threaded mux pipeline that turns a disc or ISO into an MKV. This candidate adds
keyless DVD/CSS support and correct DVD video, on top of security and recovery
hardening.

### Added

- **Keyless DVD/CSS title-key recovery.** A CSS-protected DVD decrypts with no
  key database — the title key is recovered directly from the scrambled disc
  data via the Stevenson known-plaintext attack (ported from libdvdcss) and
  validated by descrambling a sector and confirming the known plaintext
  reappears, so a wrong key fails cleanly instead of producing silent garbage
  (`src/css/stevenson.rs`). `Disc::scan_image` recovers the same title key from
  a raw, still-scrambled CSS ISO, so a raw image can be muxed without
  pre-decryption.
- **MPEG-2 Program-Stream access-unit reassembler** (`src/mux/codec/mpeg2.rs`).
  Buffers elementary-stream bytes across PES packets and emits exactly one
  coded picture per MKV block, with presentation timestamps reconstructed from
  the stream — fixing corrupted DVD video. Bounded buffer so a malformed stream
  cannot exhaust memory.

### Changed

- Self-contained keyframes: the active param sets (HEVC VPS/SPS/PPS, H.264
  SPS/PPS, VC-1 sequence/entry headers) are re-asserted at every keyframe and
  any mid-title param-set change is emitted in-band, fixing whole-segment
  HEVC/H.264/VC-1 corruption when a source stops repeating or reverts a param
  set.
- Block timestamps use presentation order keyed on track type, so B-frame video
  (including a Dolby Vision enhancement layer) keeps its true presentation
  timestamps instead of decode-order timecodes.
- Mux unit alignment is scheme-aware (AACS vs CSS/none), so DVD extents are no
  longer rejected for unit misalignment.
- MKV output records `freemkv <version>` in the Muxing/Writing application
  fields, so every output file is traceable to its build.
- Subtitle `BlockDuration` values are scaled by the segment timecode scale, so
  display durations are correct when the scale is not 1 ms.
- The NOT_READY retry pause in the patch (Pass N) loop is halt-responsive: a
  stop request interrupts the drive-recovery wait immediately instead of
  blocking shutdown.
- Bounded the keydb decompressed-plaintext reader (caps a malformed or
  zip-bombed download).

### Fixed

- A `READ(10)` that returns GOOD status with a residual underrun is treated as a
  failed read (routed to retry) instead of committing stale buffer data —
  closing a silent-corruption hole in the sweep and patch paths.
- `raw_command` on Linux masks the `DRIVER_SENSE` bit before treating a result
  as an error, preventing false transport errors on commands that return sense
  alongside a GOOD response.
- `READ CAPACITY (10)` rejects the "capacity exceeds 32-bit" sentinel instead of
  silently wrapping to 0 and misreporting disc size.

### Security

- Content keys (CSS disc/title keys, AACS unit/volume keys) are redacted in log
  output (logged as `<redacted>` with a 1-byte fingerprint); a test guards
  against any key field being logged with a raw value.
- The macOS SCSI shim uses `posix_spawn` directly instead of `system()` / `sh
  -c`, eliminating a command-injection vector on the device-path string.

## 1.0.0-rc.1

First release candidate for 1.0 — the first tagged 1.0 milestone of the core
library. Established the full feature set: multipass sector recovery, content
decryption (CSS, AACS 1.0/2.0) from `keydb.cfg`, disc parsing, and the threaded
mux pipeline (see "Pre-1.0 development" for the consolidated feature list).

## Pre-1.0 development

Versions 0.x were the iterative development series leading up to 1.0. The
highlights, condensed:

- **Multipass recovery engine.** Pass 1 sweeps the whole disc sequentially,
  tolerating bad sectors with an adaptive damage-jump algorithm (mark the bad
  range, keep going). Pass N retries the bad ranges with per-sector recovery
  timeouts, reverse-direction reads, and range bisection. A mapfile tracks
  per-sector state across passes so a rip can resume.
- **Drive and SCSI layer.** Single-shot, synchronous SG_IO transport on Linux
  (with IOKit on macOS and SPTI on Windows), full SCSI sense decoding, and
  drive enumeration / presence probes. Single-shot reads by design — recovery
  lives in the multipass orchestration, not inline in the read path.
- **Content decryption.** CSS for DVDs and AACS 1.0/2.0 for Blu-ray and UHD,
  with keys read from `keydb.cfg`. A single decrypting decorator wraps the
  sector source so decryption is one audited surface, and a resolved key is
  verified against disc content before it is applied.
- **Disc parsing.** UDF, MPLS/CLPI (Blu-ray), and IFO (DVD) parsing for title
  and extent assembly, with bounds checks on values derived from untrusted disc
  input. Canonical main-title selection picks the real feature over a
  play-all virtual playlist on branching discs.
- **Mux pipeline (the "highway").** A three-stage threaded pipeline —
  read+decrypt, demux, codec parse — with a recycled buffer pool, taking
  file-backed mux from ~60 MB/s to several hundred MB/s warm-cache. Codec
  parsers for HEVC, H.264, VC-1, MPEG-2, TrueHD, DTS(-HD), and PGS feed an
  EBML/Matroska writer.
- **I/O stack.** Bounded-cache writeback (`sync_file_range` +
  `posix_fadvise(DONTNEED)`) keeps the kernel dirty-page cache bounded on long
  sequential writes, and time-batched mapfile persistence keeps NFS-staged rips
  fast.
- **Library hygiene.** No user-facing English in the library — all errors are
  numeric codes handled by the application layer. A large spec-grounded,
  mutation-verified test suite guards the silent-corruption surfaces. Rust 2024
  edition; release builds use thin LTO.
