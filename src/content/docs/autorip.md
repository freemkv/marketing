---
title: autorip Service
description: Deploy and configure the autorip service. Web UI, HTTP API, recovery tuning, and resume.
---

autorip is a rip service: insert a disc, and it rips automatically to MKV. A browser-based UI shows live progress, settings, and history, with nothing to type. This page covers deploying autorip and tuning it; for the manual command-line workflow, see the [CLI reference](/cli/).

On disc insert, autorip runs the full pipeline automatically: a tolerant sweep, targeted patch retries on bad ranges, decrypt, and mux to MKV. Multiple drives rip in parallel, each with independent state.

autorip runs on Linux, macOS, or Windows, on a host with an optical drive (a home server or NAS works well). Run it as a single binary, or (on Linux) via Docker. Linux is the most-tested target; the configuration and API reference below apply to every platform. The container and udev rip-on-insert trigger are Linux-only; on macOS and Windows the daemon polls for inserted discs.

![autorip ripping a disc, showing the matched title, poster, and live per-pass progress](/autorip-ripper.png)

*The autorip dashboard during an active rip: matched title and metadata up top, with live per-pass progress, ETA, and throughput below.*

## Deploy

### Binary

Get the autorip binary from the [Download](/download/) page, then run the service:

```bash
# rename to `autorip`, make it executable, and start the service
mv autorip-* autorip && chmod +x autorip
./autorip serve          # then open http://localhost:8080
```

One static binary, no container, no runtime. Drive access uses the `cdrom` group or a udev rule (no `--privileged`); point `AUTORIP_DIR`, `OUTPUT_DIR`, and `STAGING_DIR` at local paths.

### Docker

Published to GHCR as `ghcr.io/freemkv/autorip` (`:latest` and `:vX.Y.Z`). Drop this compose file on a host with an optical drive and bring it up:

```yaml
# docker-compose.yml
services:
  autorip:
    image: ghcr.io/freemkv/autorip:latest
    container_name: autorip
    restart: unless-stopped
    privileged: true                    # REQUIRED for optical SCSI drive access
    environment:
      - AUTORIP_DIR=/config             # where settings.json + logs live
      - PORT=8080                       # web bind port (set at start, not at runtime)
      - AUTORIP_LOG_LEVEL=autorip=info,libfreemkv=warn,freemkv=warn   # tracing filter
    volumes:
      - /dev:/dev                       # live host /dev (handles USB re-enumeration)
      - ./config:/config                # settings.json + logs
      - /mnt/media:/output              # final MKV / M2TS destination
      - /tmp/autorip:/staging           # intermediate ISO + mapfile
      - /sys:/sys:ro                    # read-only sysfs
    ports:
      - 8080:8080
    healthcheck:
      test: ["CMD", "curl", "--fail", "--silent", "--max-time", "4", "http://127.0.0.1:8080/api/state"]
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3
```

```bash
docker compose up -d
```

Then open `http://<host>:8080`.

:::caution[privileged is mandatory]
Without `privileged: true`, the container starts fine but detects **zero** optical drives,
and the UI reports "No drives detected" with no other error. This is the single most common
setup mistake. See [Troubleshooting](/troubleshooting/).
:::

### Mount reference

| Mount | Purpose |
|---|---|
| `/dev:/dev` | Live host device tree; lets autorip enumerate optical drives and survive USB re-enumeration. |
| `/config` | Persistent home for `settings.json`, per-device logs, and (by default) the keys directory. |
| `/output` | Where finished MKV/M2TS files land. |
| `/staging` | Intermediate ISO + mapfile during a multipass rip. |
| `/sys:ro` | Read-only sysfs. |

### Decryption keys

DVDs need none; Blu-ray and 4K UHD need keys. See **[Decryption Keys](/decryption-keys/)** for the options (a local file or an online service). autorip's key settings live in [Configuration → Keys](#keys) below.

For Docker, bind-mount a host directory to `/root/.config/freemkv` so keys persist across restarts:

```yaml
volumes:
  - ./config/keys:/root/.config/freemkv
```

### Bootstrap environment variables

These are read at container start and cannot be changed at runtime:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Web UI / API bind port. |
| `AUTORIP_DIR` | `/config` | Where `settings.json` and logs are stored. |
| `AUTORIP_LOG_LEVEL` | `autorip=info,libfreemkv=warn,freemkv=warn` | `tracing` filter for log verbosity. |
| `RIP_USER` | `autorip` | Unix user the container creates and runs the daemon as. |
| `NFS_HOST` | _(unset)_ | If set with the two below, autorip mounts an NFS share inside the container at startup. |
| `NFS_EXPORT` | _(unset)_ | Export path on the NFS server (e.g. `/mnt/pool/media`). |
| `NFS_MOUNTPOINT` | _(unset)_ | Where to mount the share inside the container; point `output_dir` here. |
| `NFS_OPTS` | _(sensible default)_ | Optional override for NFS mount options. |

Everything else is configured through the web UI and persisted to `settings.json`. The NFS mount is best-effort: if the server is unreachable the container still starts and logs the failure.

## Configuration reference

All settings are editable in the **Settings** page of the web UI and stored in `settings.json` under `AUTORIP_DIR`.

### Paths and library

| Setting | Default | Meaning |
|---|---|---|
| `staging_dir` | `/staging` | Where intermediate ISO + mapfile live during a rip. |
| `output_dir` | `/output` | Final MKV / M2TS destination. |
| `movie_dir` | _(empty)_ | Optional subdirectory under output for movies. |
| `tv_dir` | _(empty)_ | Optional subdirectory under output for TV. |
| `output_format` | `mkv` | Output container: `mkv`, `m2ts`, `iso`, or `network` (stream to `network_target`). |
| `network_target` | _(empty)_ | Network output target `host:port` (for streaming output). |
| `keep_iso` | `false` | Keep the intermediate ISO in the library after muxing. |

### Disc handling

| Setting | Default | Meaning |
|---|---|---|
| `on_insert` | `scan` | What to do on disc insert: `nothing`, `scan`, or `rip`. |
| `auto_eject` | `true` | Eject the disc automatically after a rip completes. |
| `main_feature` | `true` | Rip only the longest (main feature) title. |
| `min_length_secs` | `600` | Ignore titles shorter than this many seconds. |

### Recovery tuning

| Setting | Default | Meaning |
|---|---|---|
| `max_retries` | `1` | `0` = single-pass (no retries); `1`-`10` = multipass with that many patch passes. |
| `on_read_error` | `stop` | On a read error during the sweep: `stop` or `skip` (skip-ahead). |
| `abort_on_lost_secs` | `0` | Tolerated main-movie loss in seconds after retries; `0` = require a perfect rip. |
| `capture_without_keys` | `false` | Capture to ISO even when AACS keys are missing, deferring the mux. |
| `max_rip_duration_secs` | `28800` (8 h) | Hard ceiling on total rip time across all passes. |
| `min_pass_budget_secs` | `5400` (90 m) | Minimum wall-clock budget allotted to each pass. |
| `transport_recovery_delay_secs` | `5` | Delay after a USB transport re-enumeration before retrying the drive. |
| `decrypt_threads` | `0` | Decryption worker threads; `0` = auto-detect CPU cores. |

### Keys

| Setting | Default | Meaning |
|---|---|---|
| `key_source` | `local` | `local` (use a local key database) or `online` (use a key service). |
| `keydb_path` | _(unset)_ | Explicit path to a local key database file. |
| `keydb_url` | _(empty)_ | URL to download a key database from (used by the update action and daily refresh). |
| `keyserver_url` | _(empty)_ | Base URL of an external key service (when `key_source = online`). |
| `keyserver_secret` | _(empty)_ | Optional bearer token for the key service. |

### Metadata and notifications

| Setting | Default | Meaning |
|---|---|---|
| `tmdb_api_key` | _(empty)_ | TMDB API key for title lookup / matching. |
| `webhook_urls` | _(empty)_ | URLs that receive a JSON POST on rip / move events. |
| `log_retention_days` | `30` | How long to keep per-device `.log` files. |

## Recovery

autorip wraps the same recovery engine as the [freemkv CLI](/cli/); see [How recovery works](/how-recovery-works/) for the full sweep-and-patch model. The `max_retries` setting selects between two modes.

### Pass modes

- **Single-pass** (`max_retries = 0`) streams the disc directly to the output container. No intermediate ISO, no retries. Fastest path; appropriate for healthy discs.
- **Multipass** (`max_retries ≥ 1`) runs the full recovery pipeline:
  1. **Sweep** reads the whole disc to an intermediate ISO, recording good and bad ranges in a mapfile and skipping ahead over damage.
  2. **Patch** re-reads the bad ranges from the disc, up to `max_retries` times.
  3. **Mux** decrypts the ISO and writes the final container.

Multipass exits the retry loop early as soon as there are no unreadable bytes left.

### Accepted loss

After retries are exhausted, autorip evaluates `abort_on_lost_secs` against **main-movie** loss only (menus and trailers are excluded):

- `abort_on_lost_secs = 0`: perfect rip required; abort if any main-movie data is still unreadable.
- `abort_on_lost_secs = N`: finish the MKV as long as no more than `N` seconds of main-movie video are missing.

:::note
`abort_on_lost_secs = 0` means **require a perfect rip**, not "never abort". In multipass mode the rip exits early the moment there are zero unreadable bytes, and aborts after retries are exhausted if any main-movie loss remains. Set e.g. `30` to tolerate up to 30 seconds of loss before giving up.
:::

When a rip aborts on loss, the staging directory is preserved so you can review or retry.

### Time budgets

`max_rip_duration_secs` caps total wall-clock time across all passes. `min_pass_budget_secs` guarantees each pass a minimum amount of time. Together they keep a badly damaged disc from running indefinitely while still giving each recovery pass a fair shot.

## Web UI

The dashboard at `http://<host>:8080` shows each drive's current state and live progress (status, percentage, ETA, bad ranges). From it you can:

- Scan, rip, stop, and eject per drive.
- Edit any [configuration](#configuration-reference) value in **Settings**.
- Review held rips (when title matching needs confirmation) and pick the correct title, optionally via a TMDB search.
- Inspect per-device logs and the system debug log.

![autorip idle, showing per-drive controls and the device log](/autorip-controls.png)

*Per-drive controls (Resume, Rip, Verify, Eject) with the live device log expanded below.*

State updates stream to the browser over Server-Sent Events (`/events`).

## API reference

autorip exposes an HTTP API on the same port as the UI. JSON errors use `{"ok": false, "error": "..."}`; simple successes return `{"ok": true}`. `{device}` is a drive identifier from `/api/state`.

### State and info

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/state` | Snapshot of every drive's rip state, plus move/verify state. |
| `GET` | `/api/version` | Running version, e.g. `{"version":"1.1.0-beta.1"}`. |
| `GET` | `/api/system` | System info: mux/move queues and the output file list. |
| `GET` | `/events` | Server-Sent Events stream of live state pushes. |

### Settings

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/api/settings` | - | Full configuration (secrets redacted). |
| `POST` | `/api/settings` | JSON config fields | Overlay and persist settings to `settings.json`. |

### Rip control

| Method | Path | Query / Body | Description |
|---|---|---|---|
| `POST` | `/api/scan/{device}` | - | Scan the disc (no rip). |
| `POST` | `/api/rip/{device}` | `?resume=yes\|no` (optional) | Start a rip. See [Resume](#resume) below. |
| `POST` | `/api/verify/{device}` | - | Read-only disc health check (non-destructive). |
| `POST` | `/api/stop/{device}` | - | Stop the active rip; **preserves** staging for resume (404 if device unknown). |
| `POST` | `/api/eject/{device}` | - | Eject the disc (409 if a rip/scan is in progress). |

### Keys

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/update-keydb` | Download the key database from the configured `keydb_url` (SSRF-guarded fetch). |

### Review and metadata

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/api/review` | - | List rips on hold awaiting operator review. |
| `POST` | `/api/review/resolve` | `{dir, action, title, year}` | Resolve a held rip: `proceed`, `retitle`, or `cancel`. |
| `GET` | `/api/tmdb/search` | `?q=query` | Search TMDB for title candidates. |
| `POST` | `/api/title/{device}` | `{title, year, poster_url, overview, media_type}` | Override the matched title for the active disc (one-shot). |

### Debug and logs

| Method | Path | Query / Body | Description |
|---|---|---|---|
| `GET` | `/api/logs/{device}` | - | Per-device log, most recent lines first (plain text). |
| `GET` | `/api/debug` | `?n=&level=&device=&q=` (optional) | Recent debug events (JSON, filterable). |
| `POST` | `/api/debug` | `{"enabled":true\|false}` | Toggle debug logging at runtime. |

Toggle debug logging and watch the mux stage:

```bash
# enable debug logging
curl -s -X POST http://<host>:8080/api/debug -d '{"enabled":true}'

# stream mux-stage output from the container
docker logs autorip --tail=500 -f | grep '\[mux\]'
```

## Resume

autorip's recovery work survives interruptions.

- **Default** (`POST /api/rip/{device}`, no param): starts a fresh sweep — the mapfile is recreated and the ISO truncated. It does not delete an existing staging directory, but it does not resume one either; a disc already marked `.completed` is skipped rather than re-ripped.
- **`?resume=yes`**: require an existing resumable staging directory. If the sweep is incomplete, it continues the partial sweep, re-reading only the not-yet-recovered ranges from the disc; if the mapfile is already fully recovered, it re-muxes the staged ISO without any disc reads. If no resumable state exists, the request still returns `200` and the rip ends in an error state (there is no synchronous `404`).
- **`?resume=no`**: wipe staging and start completely fresh.

Stopping a rip with `/api/stop/{device}` **preserves** staging, so a stopped rip resumes on the next disc insert or container restart, with no time lost on a long UHD rip.

## Output and notifications

Finished files land in `output_dir`, optionally split into `movie_dir` / `tv_dir`. Set `webhook_urls` to have autorip POST a JSON event to external systems (a media server, a chat webhook) when a rip or move completes.

When a rip finishes, autorip sends a `rip_complete` payload:

```json
{
  "event": "rip_complete",
  "title": "Dune: Part Two",
  "year": 2024,
  "format": "UHD",
  "poster_url": "https://image.tmdb.org/...",
  "duration": "2h 46m",
  "codecs": "HEVC 4K HDR10 · TrueHD 7.1 · ...",
  "size_gb": 78.4,
  "speed_mbs": 24.1,
  "elapsed_secs": 5460,
  "output_path": "/output/Dune Part Two (2024)/Dune Part Two (2024).mkv",
  "errors": 0,
  "lost_video_secs": 0.0
}
```

When the file is moved to its final destination, a smaller `move_complete` payload:

```json
{ "event": "move_complete", "title": "Dune: Part Two", "output_path": "/output/..." }
```
