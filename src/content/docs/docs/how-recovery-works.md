---
title: How Recovery Works
description: How the sweep/patch two-pass design, the mapfile, and the mux pipeline work together to extract everything a drive can read.
---

This page explains how freemkv extracts everything a drive can read from a disc: the
two-pass sweep-and-patch design, the mapfile that drives it, and the mux pipeline that turns
recovered sectors into a playable container. Since 1.6.0 the recovery engine lives in
[freemkv-engine](/docs/components/) (`freemkv_engine::recovery`) — it moved out of
libfreemkv, which keeps the sector-read and SCSI layer underneath it — and is shared by both
the [CLI](/docs/cli/) and [autorip](/docs/autorip/).

## The principle

freemkv's goal is to **recover 100% of readable data** from a disc, where "readable" means
anything the drive can physically return.

That's not "best effort". The engine tolerates transient drive trouble, adapts its read
size down to a single sector when needed, and gives the drive firmware its full recovery
window for marginal sectors, so it never gives up on a sector the hardware could still
return.

## Sweep, then patch

Recovery runs as a forward **sweep** followed by one or more targeted **patch** passes. In
the CLI this is `--multipass`; in autorip it's multipass mode (`max_retries ≥ 1`).

### Pass 1: sweep

A forward, sequential read of the whole disc to an ISO, tolerant of bad sectors:

- Reads each ECC block in order. Good blocks are written and marked **Finished**.
- When a block won't read, freemkv **zero-fills** it, marks the range for recovery,
  and **keeps going**; one bad spot near the start never costs you the rest of the disc.
- A sliding window tracks the last 16 ECC-block results. When failures cross a threshold
  (calibrated from real drive data), the sweep concludes it has hit a damaged region and
  **jumps ahead**, leaving the skipped gap for the patch pass. The jump distance
  escalates the longer damage persists, then resets after a run of clean reads.
- Only a true transport failure (the drive's bridge crashing) aborts the pass.

The result is a complete ISO with good data in place and every unread region recorded in
the **mapfile** for the patch pass to work on.

### Pass N: patch

Targeted retries over only the ranges the sweep couldn't read:

- Walks bad ranges in **reverse** (highest address first, end-to-start within each
  range). The sweep jumps *forward* over damage, so good data tends to sit at the *tail*
  of an unread range; reading backward hits that good data first and converges on the true
  bad-block boundary.
- Reads in **32-sector batches**, falling back to single-sector reads inside any batch that
  comes back partly dead, so a bad spot costs granularity only where it actually is.
- Runs a **chain of recovery handlers** over each still-bad section, in breadth-first tiers.
  Each handler is one idea — probe the middle of the range (bisect), jump past a long dead
  run, sweep backwards, sweep forwards — and each gets a hard wall-clock deadline, so no
  single handler can grind a dead zone indefinitely. Whatever one handler leaves, the next
  tries from a different angle.
  - **Tier 0** scouts fast (max speed, 10-second timeout) to grab the readable bulk.
  - **Tier 1** re-reads the residue deep, giving the drive its full 60-second recovery
    window so firmware-level error correction has every chance to succeed.
  - **Tier 2** runs marginal specialists on only what survives tiers 0-1, each targeting one
    physical failure mode: slower spindle, cache-bypass (FUA) re-read, cache priming,
    oscillating and speed-sweeping reads. A technique that doesn't suit this disc scores low
    and self-deprioritises rather than being dropped.
- A handler that recovers nothing for four consecutive reads **yields early** to the next
  one instead of burning its whole time budget on a dead zone.
- A sustained run of drive fast-fail responses is detected as a **wedge** and aborts the
  pass, rather than hammering a drive that has stopped attempting recovery at all.
- Handles "not ready" sense conditions with a pause-and-retry rather than immediately
  writing the sector off.
- A sector that still can't be read is left **NonTrimmed** so the next pass gets another
  shot at it; only after the final retry pass does the orchestrator promote whatever is
  still unrecovered to **Unreadable**.
- Watchdogs (a whole-pass timeout and a per-range time budget) prevent a hopelessly
  damaged region from stalling the run indefinitely.

Each patch pass narrows the remaining damage. Multipass stops early the moment everything in
the mux scope is **Finished** — no NonTried, NonTrimmed, NonScraped, or Unreadable bytes
left to recover.

:::caution[Be gentle with the drive]
Hammering the same bad sectors in tight, repeated retries can push a drive into a
fast-fail state where it stops attempting recovery at all. freemkv's patch pass is
deliberately paced (single-sector probing inside a failed batch, per-handler deadlines,
early yield on unproductive reads, and wedge detection) to coax data out of marginal media
without driving the hardware into that state.
:::

## The mapfile

The mapfile is freemkv's record of what's been read and what hasn't. It is a
**ddrescue-compatible plain-text file**, written next to the ISO (`<image>.iso.mapfile`),
and flushed to disk at most once per second (plus a final flush when it's closed), so an
interrupted run leaves an on-disk state at most about a second stale.

Each region of the disc carries a status:

| Status | Marker | Meaning |
|---|---|---|
| **NonTried** | `?` | Not yet attempted. |
| **NonTrimmed** | `*` | A fast read failed; the range's edges still need trimming. |
| **NonScraped** | `/` | Trimmed; the interior still needs a sector-by-sector scrape. |
| **Unreadable** | `-` | The drive could not read this region this session. |
| **Finished** | `+` | Good data, recovered. |

Because the mapfile is persisted continuously, recovery is **resumable**: an interrupted
sweep or a later patch run picks up exactly where it left off, and the patch pass knows
precisely which ranges still need work. This powers [autorip's resume](/docs/autorip/#resume)
and the CLI's auto-resuming `disc:// iso://` copy.

## Mux

Once the map is clean (or an [accepted-loss threshold](/docs/autorip/#accepted-loss) is reached),
freemkv **muxes**: it decrypts the captured data (see [Decryption Keys](/docs/decryption-keys/))
and writes the titles to the output container.

Muxing runs through a three-stage threaded pipeline so reading/decrypting, demultiplexing,
and codec parsing all overlap:

1. **Prefetch + decrypt**: a producer reads sectors ahead of demand and decrypts them.
2. **Demux**: a dedicated thread splits the transport/program stream into PES frames.
3. **Parse**: codec parsers turn PES frames into the elementary streams the container needs.

This keeps the drive (or ISO read) saturated instead of stalling between stages. The
library entry point is `build_iso_pipeline`; see the [library overview](/docs/libfreemkv/) for
the API.

## Running it from the CLI

Multipass recovery is three commands: sweep, patch, then mux. The patch pass re-runs the
**same** sweep command: freemkv reads the mapfile, detects which pass it's on, and re-reads
the bad ranges from the disc. Repeat the patch as many times as you like; each run narrows
the remaining damage and stops early once nothing is left to recover.

```bash
# Sweep the disc to an ISO, then re-run the SAME command to patch the
# remaining bad ranges. Repeat until the mapfile is clean.
freemkv disc:// iso://Disc.iso --multipass

# Mux the finished ISO to MKV
freemkv iso://Disc.iso mkv://Movie.mkv
```

See the [CLI reference](/docs/cli/) for full options.

## Running it from autorip

[autorip](/docs/autorip/) performs the entire flow automatically on disc insert, with a
configurable retry count and accepted-loss threshold, with no commands to type.
