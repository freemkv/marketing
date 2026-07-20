---
title: macOS
description: Running freemkv on macOS. File locations, IOKit exclusive drive access, and /dev/diskN devices.
---

freemkv runs natively on macOS as a single static binary.

## Install / how to run

Download the macOS build (Intel or Apple Silicon) from the **[Download](/download/)** page, make it executable, and run it:

```bash
mv freemkv-* freemkv && chmod +x freemkv
./freemkv --version
```

## File locations

| What | Path |
|---|---|
| AACS keys | see **[Decryption Keys](/docs/decryption-keys/)** |
| Diagnostic log | off by default (see below) |

The CLI keeps the terminal clean and never writes a log unless asked. Run with `--log-level 3` to write `./log.txt` in the current directory, or `--log-file PATH` to choose the destination.

## Device / drive access

freemkv obtains **exclusive** access to the optical drive through IOKit. To do so it unmounts the disc first, so the drive is freed for direct reads while ripping. Optical drives appear as `/dev/diskN` devices.

## Known quirks / troubleshooting

- If the disc is mounted by the Finder, freemkv unmounts it to take exclusive access; that's expected.
- For capturing logs and other common fixes, see [Troubleshooting](/docs/troubleshooting/).
