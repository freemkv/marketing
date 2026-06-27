---
title: Overview
description: What freemkv is, how the recovery model works, and how the toolchain fits together.
---

<div class="discord-callout"><strong>Need help or stuck?</strong> Join the <a href="https://discord.gg/kDh5esedcg">freemkv Discord</a> for community help and support — the fastest way to get a hand with rips, drives, and decryption.</div>

freemkv is a Rust toolchain for optical-disc backup. Its goal is to **recover 100% of readable data from any optical disc, automatically**, then decrypt and mux the result to MKV.

"Readable" is the bound: **if a sector can be read off the disc, freemkv reads it.** Not best-effort: everything the drive can physically recover, pursued through transient errors and marginal media.

If you just want to rip a disc, the **[CLI reference](/cli/)** has every command, or run the **[autorip service](/autorip/)** and let it do it on disc insert.

## The recovery model

Disc recovery runs in two phases:

- **Pass 1, sweep.** A sequential read of the whole disc, tolerant of bad sectors. When a sector won't read, freemkv records the range and skips ahead instead of aborting, so one bad spot never costs you the rest of the disc.
- **Pass N, patch.** Targeted retries on the bad ranges from the sweep: multi-attempt, with a per-sector recovery timeout, cache priming, and bisection of unread ranges to find the good middle of a partly-damaged region.

Once the map is clean (or an accepted-loss threshold is reached), freemkv muxes: decrypt the disc and write the titles to MKV. See **[How recovery works](/how-recovery-works/)** for the full model.

## Formats and decryption

| Format | Encryption | Keys |
|---|---|---|
| DVD | CSS | None (keyless) |
| Blu-ray | AACS 1.0 | Required |
| 4K UHD | AACS 2.0 / 2.1 | Required |

DVDs decrypt with no setup. Blu-ray and 4K UHD need decryption keys you provide; see **[Decryption Keys](/decryption-keys/)**. 4K UHD covers both AACS 2.0 and 2.1 discs, and both decrypt the same way — from the keys you supply, not from the disc's variant data.

## The toolchain

freemkv ships in two ways, both built on a shared core.

**freemkv CLI**: manual, scriptable control. Every input and output is a `scheme://` stream URL:

```bash
# rip a disc to MKV — main title only
freemkv disc:// -t 1 mkv://Movie.mkv

# inspect a disc
freemkv info disc://

# remux an existing ISO to MKV — main title only
freemkv iso://Disc.iso -t 1 mkv://Movie.mkv
```

On a `disc://` drive, freemkv rips the **main title** by default (one file). An `iso://`
image instead rips **every** title — one file each, to a directory. Add `-t N` to choose a
specific title; run `freemkv info disc://` to list them with durations.

Available for Linux, macOS, and Windows. See the **[CLI reference](/cli/)**.

**autorip**: a service (Linux, macOS, Windows) that watches your optical drives, runs the full pipeline on disc insert, and exposes a web UI. Insert a disc, get an MKV, repeat. See the **[autorip service](/autorip/)**.

Both compose libfreemkv, the core library that handles recovery, sector-level retry, AACS decryption, and MKV muxing. See **[Components](/components/)** for the breakdown of every crate.

## Next steps

- **[Install](/install/)**: prebuilt binaries or build from source.
- **[Platforms](/platforms-windows/)**: per-OS setup, file locations, and drive access (Windows, macOS, Linux).
- **[CLI reference](/cli/)**: every subcommand, flag, and stream URL.
- **[Decryption Keys](/decryption-keys/)**: what Blu-ray and UHD need.
