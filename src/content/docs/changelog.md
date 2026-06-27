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

The first beta on top of 1.0.0. The headline is correctness: DVD rips now
start where you expect, and lossless audio is muxed faithfully. Plus two new
output formats and a handful of smaller fixes.

### Added

- **New `fvi://` output — a freemkv video index.** Write a compact
  JSON-Lines index file (`.fvi`) describing every coded picture in a title:
  its type, position, and timing. An index over the video, not the video
  itself. `freemkv iso://disc.iso fvi://out.fvi`.
- **New `demux://` output (beta).** Split a title into its individual
  elementary streams — one file per video, audio, and subtitle track — into a
  directory. `freemkv iso://disc.iso demux://out/`.
- **Build provenance in every MKV.** The output's muxing-application field now
  records the exact freemkv build that produced the file, so any MKV can be
  traced back to the version that made it.
- **New error code E7025 ("AACS bus key unavailable")**, with a clear message
  and recovery steps on the Error Codes page.

### Fixed

- **DVD rips now start at the movie, not the menu.** On discs that author a
  per-title menu (for example a studio "the parental level has been set"
  prompt), freemkv was prepending that entire menu segment to the front of the
  feature. Rips now open on the feature's first frame.
- **Lossless audio muxed correctly.** TrueHD and DTS-HD Master Audio tracks
  are now muxed faithfully, so lossless soundtracks come through intact.
- **`update-keys --keydb <path>` is honored.** Passing an explicit keydb path
  now downloads to that path; previously it was ignored and the file always
  landed in the default location.
- **autorip resume no longer races the muxer.** A staging directory that the
  mux worker already owns is no longer offered for resume, so a manual resume
  can't disturb a file the muxer is still reading.

## 1.0.0

The first stable release of the freemkv toolchain — the `freemkv` CLI, the
`libfreemkv` core library, and the `autorip` service, shipping together as a
set. This consolidates the full 1.0 release-candidate series into one baseline.

### Recovery

- **Multipass recovery engine.** A first pass sweeps the whole disc
  sequentially, tolerating bad sectors by marking the damaged range and
  pressing on. Follow-up passes retry just the bad ranges with per-sector
  recovery timeouts, reverse-direction reads, and range bisection — pursuing
  everything the drive can physically recover. A mapfile tracks per-sector
  state across passes, so an interrupted rip resumes where it left off.
- **Honest loss accounting.** Skipped or undecryptable bytes are folded into
  the loss total, so a partial decryption can never pass as a perfect rip. The
  single-pass path gives the drive its full recovery budget on a bad sector
  before reporting failure.

### Discs and decryption

- **DVD, Blu-ray, and 4K UHD.** CSS for DVDs and AACS 1.0 / 2.0 / 2.1 for
  Blu-ray and UHD.
- **Keyless DVD ripping.** A CSS-protected DVD decrypts with no key file at
  all — the title key is recovered directly from the disc and validated before
  use, so a wrong key fails cleanly instead of producing silent garbage. Works
  on a live disc or on a raw, still-scrambled ISO.
- **AACS via `keydb.cfg`.** Blu-ray and UHD decrypt when you supply AACS keys
  through a local `keydb.cfg` or an online key service. No AACS keys are built
  into the binary; a resolved key is verified against disc content before it is
  applied, and content keys are redacted from all logs.
- **Correct DVD video.** A dedicated MPEG-2 reassembler emits one coded picture
  per frame with reconstructed timestamps, replacing earlier framing that
  produced corrupted DVD video. Keyframes are self-contained across HEVC,
  H.264, and VC-1, and 4K titles assembled from spliced clips no longer stutter
  at the joins.

### Output

- **Stream-URL command surface.** `freemkv <source> <destination>` over
  `disc://`, `iso://`, `mkv://`, `m2ts://`, `dir://`, `network://`, `stdio://`,
  and `null://`, with `info` for disc and file metadata, `verify` for a
  health check, and `update-keys` for fetching a key database.
- **Fast, high-throughput muxing.** A threaded read-decrypt-demux-parse
  pipeline takes file-backed muxing from tens of megabytes per second to
  several hundred warm-cache, feeding a Matroska writer with correct
  presentation-order timestamps.
- **Full localization.** The CLI is localized across seven languages
  (English, German, Spanish, French, Italian, Dutch, Portuguese), and every
  failure surfaces as a plain-English (or localized) cause rather than a bare
  code.

### autorip service

- **Unattended ripping.** Detects a disc on insert, identifies it (title,
  poster, year), rips and muxes it to MKV, and moves the finished file to your
  library — entirely hands-off. A web dashboard shows live progress, per-drive
  cards, settings, and history.
- **Single- and multi-pass modes** with an abort-on-loss threshold for the main
  feature, so you choose between "require a perfect rip" and tolerating a few
  seconds of unrecoverable damage.
- **Resilient staging.** Rips resume across restarts, finished copies are
  validated before they're trusted, and the rip, mux, and move stages run
  independently so the drive is freed the moment the read finishes and the next
  disc can go in.
- **Auto-updating keys.** An optional updater downloads and refreshes the AACS
  key database for Blu-ray and UHD; DVDs need no key file.
- **Hardened by default.** Secrets are redacted from logs and the settings API,
  dashboard output is escaped, outbound requests are guarded, and the config
  file is written owner-only.
