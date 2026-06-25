---
title: Troubleshooting
description: Fixes for the most common freemkv and autorip problems. No drives detected, missing decryption keys, bad sectors, interrupted rips, and capturing a debug log.
---

Fixes for the problems reported most often with freemkv and autorip. Find your symptom below; if none match, capture a debug log (next) and open an issue.

Hit a specific `Error: E<code> ...` line? Look it up on the [Error Codes](/error-codes/) page — every code is listed with its message, cause, and next steps.

**First, make sure you're on the latest version.** Many reported problems are already fixed in a newer release — check the [changelog](/changelog/) and update before digging further. You can confirm your running version from the [Checking versions](#checking-versions) section below.

## Capturing a debug log

For any failure or hang, capture a debug log first; it's the fastest path to a diagnosis and the one thing to attach to a bug report.

The CLI keeps the terminal clean by default and never prints raw diagnostics there. When something fails it prints a short block naming the cause and telling you exactly this: re-run with `--log-level 3` to get a log. That writes a diagnostic log to `./log.txt` (override the path with `--log-file`):

```bash
freemkv <source> <dest> --log-level 3              # writes ./log.txt
freemkv <source> <dest> --log-level 3 --log-file freemkv-debug.log
```

In autorip, enable the Debug toggle in the web UI (or `POST /api/debug`), reproduce the problem, then collect the container logs.

For where files (config, keys, logs, staging, output) live, see your platform page: [Windows](/platforms-windows/), [macOS](/platforms-macos/), or [Linux](/platforms-linux/).

## No drives detected in autorip

The container is missing `privileged: true`. Without it the container starts normally but enumerates zero drives, and the UI shows "No drives detected" with no other error.

```yaml
services:
  autorip:
    # required for optical SCSI access
    privileged: true
    volumes:
      # required: exposes host devices to the container
      - /dev:/dev
```

Confirm both `privileged: true` and the `/dev:/dev` bind mount are present, then restart the container. See [Deploy](/autorip/#deploy).

## No drive found on the CLI

If `freemkv info disc://` reports no drive:

- On Linux, target the SCSI generic device explicitly: use `/dev/sg*`, not `/dev/sr*`:

  ```bash
  freemkv info disc:///dev/sg4
  ```

- Confirm your user has permission to access the device node.

## No decryption keys available

You tried to read an AACS-encrypted disc (Blu-ray or 4K UHD) and no key source had its key. The CLI says something like *"This disc needs AACS decryption keys, but no key source provided them"* or *"No key source has a decryption key for this disc"* (often with the disc's id). DVDs are never affected.

**Next steps** — Blu-ray and 4K UHD need decryption keys you provide, from either of two key sources:

- **A local key database** (`keydb.cfg`): download or refresh it with `freemkv update-keys --url <keydb-url>`, or point `--keydb PATH` at one you already have.
- **An online key service:** configure it with `--key-url URL`.

**[Decryption Keys](/decryption-keys/)** covers both options for the CLI and for autorip.

## Drive rejected the disc's security credentials

If you have keys but the rip still fails at the drive handshake (the error says the drive *rejected this disc's security certificate* or *rejected the AACS host certificate*), the drive refused to start the secure session needed to read the disc:

- **Update your key database** first (`freemkv update-keys --url <keydb-url>`). A stale or incomplete keydb is the most common cause.
- If the keys are current and it still fails, the disc may need a **firmware-unlockable drive**. Some drives can be unlocked to read protected discs and others cannot; on a drive that can't be unlocked another way, this handshake is the only path and there's nothing more to try on that drive. Use a drive that supports unlocking.
- Make sure nothing else is using the disc; a busy drive can refuse to start a secure session.

Re-run with `--log-level 3` (writes `./log.txt`) and attach the log if you open an issue.

## Bad sectors on a disc

freemkv is built to recover damaged discs, but behavior depends on the mode:

- **Single-pass** (CLI direct disc → MKV, or autorip `max_retries = 0`): no retries; a read error fails the rip.
- **Multipass** (CLI `--multipass`, or autorip `max_retries ≥ 1`): the sweep records bad ranges and skips ahead; patch passes then re-read only those ranges from the disc. Use this mode for any disc you suspect is scratched. See [How recovery works](/how-recovery-works/).

Tips:

- Run `freemkv verify disc://` for a read-only health check. It reports good / slow / recovered / bad sectors and exits non-zero on anything truly unrecoverable.
- In autorip, set `abort_on_lost_secs` above `0` to tolerate a bounded amount of main-movie loss rather than failing on a disc that can't be read perfectly.

:::caution[Don't keep retrying a dying disc]
Repeatedly hammering the same bad sectors can push a drive into a fast-fail state where it stops attempting recovery entirely. If recovery stalls, let the drive cool down or eject and reload before trying again; don't launch pass after pass back-to-back.
:::

## An interrupted rip

- **CLI:** Ctrl-C halts cleanly and preserves the mapfile. Re-running the same `disc:// iso://` command resumes. A mux interrupted mid-write is not finalized (freemkv exits non-zero), so you never get a truncated MKV that looks complete.
- **autorip:** `/api/stop/{device}` preserves staging; the rip resumes on the next disc insert or container restart. See [Resume](/autorip/#resume).

## Raw flag rejected for MKV or M2TS output

`--raw` writes undecrypted bytes, which is only meaningful for an `iso://` destination. freemkv rejects `--raw` with an `mkv://` or `m2ts://` destination because ciphertext can't be muxed. Drop `--raw`, or change the destination to an ISO.

## Multiple titles to one file

Selecting more than one title (e.g. `-t 1 -t 3`) requires a directory destination; freemkv writes one file per title. Point the destination at a directory instead of a single file:

```bash
# directory destination, one file per title
freemkv disc:// mkv://out/ -t 1 -t 3
```

## Checking versions

```bash
# CLI
freemkv version
```

```bash
# autorip
curl -s http://<host>:8080/api/version
```
