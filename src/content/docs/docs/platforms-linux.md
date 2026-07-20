---
title: Linux
description: Running freemkv and autorip on Linux. File locations, /dev/sg* SCSI generic access, and the autorip Docker model.
---

On Linux both tools run natively as single static binaries. The `autorip` service can *also* run as a Docker container (the common choice for an always-on home server or NAS), but it's the same binary either way.

## Install / how to run

Download the Linux build from the **[Download](/download/)** page, make it executable, and run it:

```bash
mv freemkv-* freemkv && chmod +x freemkv
./freemkv --version
```

For autorip, run that same binary as a service, or run it as a Docker container (see [autorip Service](/docs/autorip/) for a full compose example).

## File locations

### freemkv CLI

| What | Path |
|---|---|
| AACS keys | see **[Decryption Keys](/docs/decryption-keys/)** |
| Diagnostic log | off by default (see below) |

The CLI keeps the terminal clean and never writes a log unless asked. Run with `--log-level 3` to write `./log.txt` in the current directory, or `--log-file PATH` to choose the destination.

### autorip (Docker)

autorip stores its state inside the container at well-known mount points, which you bind-mount to the host:

| What | Path (in container) |
|---|---|
| Config (settings, keys, logs) | `/config` |
| Staging | `/staging` |

Bind these to host directories so settings and the AACS key database persist across container restarts.

## Device / drive access

- The CLI reaches the optical drive through **SCSI generic** at `/dev/sg*`. You may need to be in the `cdrom` group or adjust the device's permissions.
- The autorip container requires `privileged: true` and a `/dev:/dev` bind mount for optical drive access. Without `privileged`, the container starts but enumerates zero drives and the UI reports "No drives detected."

## Known quirks / troubleshooting

- If a rip can't see the drive in the container, confirm both `privileged: true` and the `/dev:/dev` mount are present.
- For capturing logs and other common fixes, see [Troubleshooting](/docs/troubleshooting/).
