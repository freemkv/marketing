---
title: Error Codes
description: Every freemkv error code (E1xxx-E9xxx), its message, and what to do about it. Device, decryption, disc-read, key-database, and mux failures with causes and next steps.
---

Every failure freemkv reports carries a stable code of the form `E<number>`, shown
alongside a plain-language message — for example `Error: E6009 No audio or video streams were found in this title. The disc may be damaged or an unsupported format.`
This page lists every code, its message, and what to do about it. The codes are
stable across releases, so you can search this page (or a bug report) by code.

For a symptom-first walkthrough of the most common problems, start with
[Troubleshooting](/troubleshooting/). For any failure or hang, capture a debug log
first — re-run with `--log-level 3` (writes `./log.txt`).

:::note[How to read a code]
Codes are grouped by range: `E1xxx` device, `E2xxx` drive support, `E3xxx` unlock,
`E4xxx` SCSI, `E5xxx` I/O, `E6xxx` disc format, `E7xxx` decryption, `E8xxx` key
database, `E9xxx` stream/mux. Tokens like `{detail}` or `{hash}` in a message are
filled in at runtime with the specific value (a path, sector, or disc id).
:::

## Device (1xxx)

Problems reaching, opening, or talking to the optical drive.

| Code | Level | Message | Cause & next steps |
|---|---|---|---|
| <a class="ecode" id="E1000" href="#E1000">E1000</a> | Error | Drive not found at {detail}. Check the device path, or run without a path to auto-detect a drive. | **Cause:** freemkv could not find a drive at the given device path. **Next steps:** 1. Confirm a drive is connected and the disc is inserted. 2. On Linux, target the SCSI generic node: use `/dev/sg*`, not `/dev/sr*`. 3. List drives with `freemkv drive-info`. |
| <a class="ecode" id="E1001" href="#E1001">E1001</a> | Error | Permission denied for {detail}. Add yourself to the disk group, or run the command with elevated privileges. | **Cause:** The OS denied access to the drive device node. **Next steps:** 1. Add your user to the optical/disk group (e.g. `sudo usermod -aG cdrom $USER`) and re-login. 2. Or run freemkv with elevated privileges. 3. Confirm the device path with `freemkv drive-info`. |
| <a class="ecode" id="E1002" href="#E1002">E1002</a> | Error | The drive is not ready ({detail}). Insert a disc, wait for it to spin up, and try again. | **Cause:** The drive reported it is not ready — no disc, still spinning up, or still loading. **Next steps:** 1. Wait for the drive to finish loading the disc, then retry. 2. Re-seat the disc if it was just inserted. |
| <a class="ecode" id="E1003" href="#E1003">E1003</a> | Error | Drive reset failed: {detail} | **Cause:** A drive reset was attempted and failed. **Next steps:** 1. Reconnect the drive (unplug/replug USB or power-cycle) and try again. 2. Try a different USB port or cable if the drive is external. |
| <a class="ecode" id="E1004" href="#E1004">E1004</a> | Error | Could not reach the drive's command interface. Reconnect the drive and try again. | **Cause:** The platform SCSI command interface for the drive could not be obtained from the OS. **Next steps:** 1. Reconnect the drive and try again. 2. Confirm no other program holds the device. |
| <a class="ecode" id="E1005" href="#E1005">E1005</a> | Error | The drive is in use by another program. Close anything else using the disc and try again. | **Cause:** Another program holds the drive open, so freemkv cannot start its session. **Next steps:** 1. Close any other disc software, file manager preview, or media player using the disc. 2. On Linux, check for an automounter holding the device, then retry. |
| <a class="ecode" id="E1006" href="#E1006">E1006</a> | Error | Could not open the drive on this system. Reconnect the drive and try again. | **Cause:** The drive could not be opened on this system (platform open failed). **Next steps:** 1. Reconnect the drive and try again. 2. Confirm the device path and that your user can access it. |

## Profile / drive support (2xxx)

The drive or platform isn't recognized or supported yet.

| Code | Level | Message | Cause & next steps |
|---|---|---|---|
| <a class="ecode" id="E2000" href="#E2000">E2000</a> | Error | This drive isn't supported yet: {detail}. Run 'freemkv drive-info --share' to help add it. | **Cause:** The drive's vendor/model/firmware did not match any supported profile. **Next steps:** 1. Run `freemkv drive-info --share` to help add support for the drive. 2. Check the drive-support pages for known-working drives. |
| <a class="ecode" id="E2002" href="#E2002">E2002</a> | Error | Could not read the drive's capabilities. Reconnect the drive and try again. | **Cause:** The drive's capability data (mode pages) could not be read or parsed. **Next steps:** 1. Reconnect the drive and try again. 2. If it persists, capture a debug log and open an issue. |
| <a class="ecode" id="E2003" href="#E2003">E2003</a> | Error | This operating system isn't supported for direct drive access. | **Cause:** Direct drive access is not implemented for this operating system. **Next steps:** 1. Use a supported platform (Windows, macOS, or Linux). 2. Check the platform pages for current support. |
| <a class="ecode" id="E2004" href="#E2004">E2004</a> | Error | This drive type isn't supported yet. | **Cause:** The drive class is recognized but not yet implemented. **Next steps:** 1. Run `freemkv drive-info --share` to help prioritize support. 2. Use a supported drive in the meantime. |

## Drive unlock (3xxx)

Firmware-unlock steps for protected-disc reading.

| Code | Level | Message | Cause & next steps |
|---|---|---|---|
| <a class="ecode" id="E3000" href="#E3000">E3000</a> | Error | Drive unlock failed. | **Cause:** The drive firmware unlock step failed. **Next steps:** 1. Confirm the drive supports firmware unlocking — not all drives can be unlocked. 2. See the unlocked-drives page for supported models. |
| <a class="ecode" id="E3001" href="#E3001">E3001</a> | Error | The drive's firmware did not match the expected version. This drive may not be supported for unlocking. | **Cause:** The drive's firmware version did not match the version expected by the unlock routine. **Next steps:** 1. This drive may not be supported for unlocking, or its firmware differs. 2. Check the unlocked-drives page for compatible firmware. |

## SCSI (4xxx)

Low-level command failures between freemkv and the drive.

| Code | Level | Message | Cause & next steps |
|---|---|---|---|
| <a class="ecode" id="E4000" href="#E4000">E4000</a> | Error | The drive reported a command error ({detail}). The disc may be damaged, or the drive may need reconnecting. | **Cause:** A SCSI command to the drive returned an error status. **Next steps:** 1. The disc may be dirty or scratched — clean it and retry. 2. Reconnect the drive if the failure repeats on multiple discs. 3. Capture a debug log (`--log-level 3`) for the raw status/sense. |
| <a class="ecode" id="E4001" href="#E4001">E4001</a> | Error | Internal error while talking to the drive. Please report this. | **Cause:** An internal error occurred constructing a command for the drive. **Next steps:** 1. This is a bug — please report it with a debug log. |

## I/O (5xxx)

System-level input/output errors, typically writing the output.

| Code | Level | Message | Cause & next steps |
|---|---|---|---|
| <a class="ecode" id="E5000" href="#E5000">E5000</a> | Error | A system I/O error occurred ({detail}). Check the destination has space and you have write access. | **Cause:** A system-level I/O error occurred, typically writing the output. **Next steps:** 1. Confirm the destination has free space. 2. Confirm you have write access to the destination path. 3. Check the underlying disk/network share is healthy. |

## Disc format (6xxx)

Reading or parsing the disc's filesystem, playlists, and titles.

| Code | Level | Message | Cause & next steps |
|---|---|---|---|
| <a class="ecode" id="E6000" href="#E6000">E6000</a> | Error | Could not read the disc at sector {detail}. The disc may be dirty or scratched — clean it and try again. | **Cause:** A sector could not be read off the disc. **Next steps:** 1. Clean the disc and try again. 2. Use multipass mode (CLI `--multipass`, or autorip `max_retries ≥ 1`) to retry bad ranges. |
| <a class="ecode" id="E6001" href="#E6001">E6001</a> | Error | Could not read the disc's playlist data. The disc may be damaged or an unsupported format. | **Cause:** The disc's playlist (MPLS) data could not be parsed. **Next steps:** 1. The disc may be damaged or an unsupported variant — clean it and retry. 2. Capture a debug log and open an issue if it persists on a clean disc. |
| <a class="ecode" id="E6002" href="#E6002">E6002</a> | Error | Could not read the disc's clip data. The disc may be damaged or an unsupported format. | **Cause:** The disc's clip (CLPI) data could not be parsed. **Next steps:** 1. The disc may be damaged or an unsupported variant — clean it and retry. 2. Capture a debug log and open an issue if it persists on a clean disc. |
| <a class="ecode" id="E6003" href="#E6003">E6003</a> | Error | File not found on the disc: {detail} | **Cause:** An expected file was not present on the disc's filesystem. **Next steps:** 1. The disc may be damaged or an unsupported layout. 2. Confirm the disc is a supported DVD / Blu-ray / 4K UHD. |
| <a class="ecode" id="E6005" href="#E6005">E6005</a> | Error | Title {detail} doesn't exist on this disc. | **Cause:** A title index was requested that does not exist on this disc. **Next steps:** 1. List available titles with `freemkv disc-info disc://`. 2. Pick a title number within range. |
| <a class="ecode" id="E6007" href="#E6007">E6007</a> | Error | Could not read the disc's title structure. The disc may be damaged or an unsupported format. | **Cause:** The disc's title structure (IFO) could not be parsed. **Next steps:** 1. The disc may be damaged or an unsupported variant — clean it and retry. 2. Capture a debug log and open an issue if it persists on a clean disc. |
| <a class="ecode" id="E6008" href="#E6008">E6008</a> | Error | Invalid MKV file. | **Cause:** The MKV input is not a valid Matroska file. **Next steps:** 1. Confirm the file is a real MKV produced by freemkv or a compatible muxer. |
| <a class="ecode" id="E6009" href="#E6009">E6009</a> | Error | No audio or video streams were found in this title. The disc may be damaged or an unsupported format. | **Cause:** No playable streams were found in the selected title. **Next steps:** 1. Pick a different title with `freemkv disc-info disc://`. 2. If the disc is encrypted, confirm decryption keys are available. |
| <a class="ecode" id="E6010" href="#E6010">E6010</a> | Error | Operation stopped. | **Cause:** The operation was stopped (Ctrl-C, or autorip stop). **Next steps:** 1. Re-run the same command to resume from the preserved mapfile/staging. |
| <a class="ecode" id="E6011" href="#E6011">E6011</a> | Error | The recovery map file is invalid or corrupted. | **Cause:** The recovery map file (ddrescue mapfile) is invalid or corrupted. **Next steps:** 1. Delete the mapfile to start a fresh sweep, or restore a known-good copy. 2. Capture a debug log if it was produced by freemkv itself. |
| <a class="ecode" id="E6012" href="#E6012">E6012</a> | Error | Internal error reading the disc. Please report this. | **Cause:** An internal error occurred reading the disc. **Next steps:** 1. This is a bug — please report it with a debug log. |

## AACS / CSS decryption (7xxx)

Decryption of Blu-ray / 4K UHD (AACS) and DVD (CSS) discs.

| Code | Level | Message | Cause & next steps |
|---|---|---|---|
| <a class="ecode" id="E7000" href="#E7000">E7000</a> | Error | This disc needs AACS decryption keys (Blu-ray/UHD), but none were found. Download a key database with: freemkv update-keys --url <keydb-url> | **Cause:** The disc is AACS-encrypted (Blu-ray / 4K UHD) and no key source supplied its keys. **Next steps:** 1. Provide keys from a key source — a local `keydb.cfg` or an online key service. 2. Update a local key database: `freemkv update-keys --url <keydb-url>`. 3. See the Decryption Keys page. DVDs are never affected. |
| <a class="ecode" id="E7001" href="#E7001">E7001</a> | Error | The disc's security certificate is too short or invalid. | **Cause:** The disc's AACS security certificate was too short or malformed. **Next steps:** 1. Clean the disc and retry. 2. The disc may be damaged or an unsupported variant. |
| <a class="ecode" id="E7002" href="#E7002">E7002</a> | Error | The drive would not start a secure session for this disc — it may be in use by another program. Close anything else using the disc and try again. | **Cause:** The drive would not allocate a secure session for this disc. **Next steps:** 1. Close any other program using the disc and retry. 2. Re-seat the disc. |
| <a class="ecode" id="E7003" href="#E7003">E7003</a> | Error | The drive rejected this disc's security certificate. | **Cause:** The drive rejected this disc's AACS security certificate. **Next steps:** 1. Clean the disc and retry. 2. The disc may be damaged or unsupported on this drive. |
| <a class="ecode" id="E7004" href="#E7004">E7004</a> | Error | Could not read the disc's security certificate. The disc may be dirty or damaged. | **Cause:** The disc's AACS security certificate could not be read. **Next steps:** 1. Clean the disc and retry — read errors here usually mean dirt or damage. |
| <a class="ecode" id="E7005" href="#E7005">E7005</a> | Error | The disc's security certificate could not be verified. The disc may be damaged or unsupported. | **Cause:** The disc's AACS security certificate failed verification. **Next steps:** 1. The disc may be damaged or an unsupported variant. 2. Clean the disc and retry. |
| <a class="ecode" id="E7006" href="#E7006">E7006</a> | Error | Could not read a decryption key from the disc. The disc may be dirty or damaged. | **Cause:** A decryption key could not be read from the disc. **Next steps:** 1. Clean the disc and retry — this is usually dirt or damage. |
| <a class="ecode" id="E7007" href="#E7007">E7007</a> | Error | The drive rejected a decryption key for this disc. | **Cause:** The drive rejected a decryption key for this disc. **Next steps:** 1. Update your key source so it carries current keys for this disc. 2. Clean the disc and retry. |
| <a class="ecode" id="E7008" href="#E7008">E7008</a> | Error | A decryption key for this disc could not be verified. | **Cause:** A decryption key for this disc failed verification. **Next steps:** 1. Update your key source: `freemkv update-keys --url <keydb-url>`. 2. The disc may be damaged or the key stale. |
| <a class="ecode" id="E7009" href="#E7009">E7009</a> | Error | Could not read the disc's identifier. The disc may be dirty or damaged. | **Cause:** The disc's identifier (Volume ID) could not be read. **Next steps:** 1. Clean the disc and retry — this is usually dirt or damage. |
| <a class="ecode" id="E7010" href="#E7010">E7010</a> | Error | The disc's identifier could not be verified. The disc may be damaged or unsupported. | **Cause:** The disc's identifier failed verification. **Next steps:** 1. The disc may be damaged or an unsupported variant. 2. Clean the disc and retry. |
| <a class="ecode" id="E7011" href="#E7011">E7011</a> | Error | Could not prepare this disc's decryption key. | **Cause:** This disc's decryption key could not be prepared from the available inputs. **Next steps:** 1. Update your key source and retry. 2. Confirm the disc is supported by your key source. |
| <a class="ecode" id="E7013" href="#E7013">E7013</a> | Error | Decryption failed — the recovered key did not unlock this disc's data. The key may be wrong or outdated; refresh it with: freemkv update-keys --url <keydb-url> | **Cause:** Decryption of the disc's data failed. **Next steps:** 1. Update your key source so it has correct keys for this disc. 2. Confirm the disc is supported by your key source, then retry. |
| <a class="ecode" id="E7014" href="#E7014">E7014</a> | Error | CSS authentication failed: the drive could not establish the key exchange needed to decrypt this DVD. Try cleaning the disc and reinserting it. If the problem persists, your drive may not fully support CSS decryption. | **Cause:** The CSS key exchange needed to decrypt a DVD could not be established with the drive. **Next steps:** 1. Clean the disc and reinsert it. 2. If it persists, the drive may not fully support CSS decryption — try another drive. |
| <a class="ecode" id="E7015" href="#E7015">E7015</a> | Error | The drive rejected the AACS host certificate, and this drive can't be unlocked another way. | **Cause:** The drive rejected the AACS host certificate and cannot be unlocked another way. **Next steps:** 1. Update a local key database first (`freemkv update-keys --url <keydb-url>`); a stale one is the most common cause. 2. Use a firmware-unlockable drive — on a drive that can't be unlocked, this handshake is the only path. 3. Make sure nothing else is using the disc. |
| <a class="ecode" id="E7016" href="#E7016">E7016</a> | Error | This drive can't read the disc in the mode needed to decrypt it, and the secure session was refused. No way to decrypt this disc remains on this drive. | **Cause:** The drive can't enter the raw-read mode needed to decrypt, and the secure session was refused. **Next steps:** 1. Use a firmware-unlockable drive that supports the read mode this disc needs. 2. See the drive-support pages for compatible drives. |
| <a class="ecode" id="E7017" href="#E7017">E7017</a> | Error | Could not read this disc's identifier, so it can't be decrypted. The disc may be dirty or damaged, or the drive may not support it. | **Cause:** The disc's identifier could not be read, so it can't be decrypted. **Next steps:** 1. Clean the disc and retry — this is usually dirt or damage. 2. The drive may not support the path needed to read the identifier. |
| <a class="ecode" id="E7018" href="#E7018">E7018</a> | Error | No key source has a decryption key for this disc. | **Cause:** A key source was consulted but none had a decryption key for this disc. **Next steps:** 1. Update a key source: `freemkv update-keys --url <keydb-url>`, or configure an online key service. 2. Confirm the disc is supported by your key source. |
| <a class="ecode" id="E7019" href="#E7019">E7019</a> | Error | No key source has this disc's key. | **Cause:** No key source carried this disc's key. **Next steps:** 1. Update a key source: `freemkv update-keys --url <keydb-url>`. 2. Confirm the disc is supported by your key source. |
| <a class="ecode" id="E7020" href="#E7020">E7020</a> | Error | This drive isn't recognized, so the steps needed to read this disc's identifier aren't available. Run 'freemkv drive-info --share' to help add it. | **Cause:** The drive identity matched no profile, so the steps to read this disc's identifier aren't available. **Next steps:** 1. Run `freemkv drive-info --share` to help add support for the drive. 2. Use a supported drive in the meantime. |
| <a class="ecode" id="E7021" href="#E7021">E7021</a> | Error | This drive doesn't provide a way to read this disc's identifier. | **Cause:** The drive provides no path to read this disc's identifier. **Next steps:** 1. Use a drive whose profile carries an identifier-retrieval path. 2. See the drive-support pages. |
| <a class="ecode" id="E7022" href="#E7022">E7022</a> | Error | No key source has a decryption key for this disc (id: {hash}). | **Cause:** A key source was consulted but none had this disc's VUK (its decryption key). **Next steps:** 1. Update keys: `freemkv update-keys --url <keydb-url>`. 2. Confirm the disc is supported by your key source. 3. The `{hash}` in the message identifies the disc for lookup. |
| <a class="ecode" id="E7023" href="#E7023">E7023</a> | Error | This disc is copy-protected and no key could be recovered for this title, so it can't be decrypted (the output would be unreadable). | **Cause:** This copy-protected disc yielded no usable title key, so the output would be unreadable. **Next steps:** 1. Clean the disc and retry. 2. Confirm the disc is a supported, readable copy. |
| <a class="ecode" id="E7024" href="#E7024">E7024</a> | Error | No host certificate is available from any key source for the drive's secure handshake. | **Cause:** No key source supplied a host certificate for the drive's secure handshake. **Next steps:** 1. Provide a key source that includes a host certificate. 2. See the Decryption Keys page for key-source setup. |
| <a class="ecode" id="E7025" href="#E7025">E7025</a> | Error | This disc uses AACS bus encryption, but no bus key could be obtained from the drive's secure handshake, so its data can't be decrypted (the output would be unreadable). | **Cause:** The AACS bus key needed to complete the drive's secure handshake was not available. **Next steps:** 1. Update a local key database (`freemkv update-keys --url <keydb-url>`); a stale or incomplete one is the most common cause. 2. Confirm your key source carries the inputs this disc needs. 3. Re-seat the disc and retry. |

## Key sources (8xxx)

Reaching a key source — downloading, writing, loading, or parsing a local key
database (`keydb.cfg`) or an online key service.

| Code | Level | Message | Cause & next steps |
|---|---|---|---|
| <a class="ecode" id="E8000" href="#E8000">E8000</a> | Error | Cannot connect to the key database server: {detail} | **Cause:** freemkv could not connect to the key database server. **Next steps:** 1. Check your network connection and the key database URL. 2. Retry, or point at a reachable key database with `freemkv update-keys --url <keydb-url>`. |
| <a class="ecode" id="E8001" href="#E8001">E8001</a> | Error | Key database download failed (HTTP {detail}). Try again, or run: freemkv update-keys --url <keydb-url> | **Cause:** The key database download returned an HTTP error status. **Next steps:** 1. Try again — the server may be temporarily unavailable. 2. Confirm the URL: `freemkv update-keys --url <keydb-url>`. |
| <a class="ecode" id="E8002" href="#E8002">E8002</a> | Error | The key database is empty or invalid. Re-download it with: freemkv update-keys --url <keydb-url> | **Cause:** The downloaded key database was empty or invalid. **Next steps:** 1. Re-download it: `freemkv update-keys --url <keydb-url>`. 2. Confirm the URL points at a valid key database. |
| <a class="ecode" id="E8003" href="#E8003">E8003</a> | Error | Cannot write the key database: {detail} | **Cause:** The key database could not be written to disk. **Next steps:** 1. Confirm the config directory exists and is writable. 2. Check free space and permissions on the destination path. |
| <a class="ecode" id="E8004" href="#E8004">E8004</a> | Error | The key database could not be read. Re-download it with: freemkv update-keys --url <keydb-url> | **Cause:** The key database file could not be read or parsed. **Next steps:** 1. Re-download it: `freemkv update-keys --url <keydb-url>`. 2. Confirm the file isn't truncated or corrupted. |
| <a class="ecode" id="E8005" href="#E8005">E8005</a> | Error | Cannot load the key database: {detail} | **Cause:** The key database could not be loaded from disk. **Next steps:** 1. Confirm the `keydb.cfg` path is correct and readable. 2. Re-download it: `freemkv update-keys --url <keydb-url>`. |
| <a class="ecode" id="E8006" href="#E8006">E8006</a> | Error | The key database URL uses an address type that isn't supported ({detail}). | **Cause:** The key database URL uses an address type freemkv's downloader does not support. **Next steps:** 1. Use a supported URL scheme for the key database. 2. Download the key database manually and point `--keydb PATH` at it. |
| <a class="ecode" id="E8007" href="#E8007">E8007</a> | Error | The key database download was redirected too many times. Check the URL and try again. | **Cause:** The key database download was redirected too many times. **Next steps:** 1. Check the URL and try again. 2. Use a direct URL to the key database file. |

## Stream / mux (9xxx)

Building the output stream and muxing to the destination.

| Code | Level | Message | Cause & next steps |
|---|---|---|---|
| <a class="ecode" id="E9000" href="#E9000">E9000</a> | Error | Stream is read-only. | **Cause:** A read was attempted on a write-only stream (internal usage). **Next steps:** 1. This is a bug — please report it with a debug log. |
| <a class="ecode" id="E9001" href="#E9001">E9001</a> | Error | Stream is write-only. | **Cause:** A write was attempted on a read-only stream (internal usage). **Next steps:** 1. This is a bug — please report it with a debug log. |
| <a class="ecode" id="E9002" href="#E9002">E9002</a> | Error | Invalid stream URL: {detail} | **Cause:** A source/destination URL could not be parsed. **Next steps:** 1. Check the URL syntax (scheme, path, and any host:port). 2. See the CLI reference for valid source/destination forms. |
| <a class="ecode" id="E9003" href="#E9003">E9003</a> | Error | URL missing path: {detail} | **Cause:** A URL is missing its path component. **Next steps:** 1. Add the path to the URL (e.g. `iso:///path/to/out.iso`). 2. See the CLI reference for valid URL forms. |
| <a class="ecode" id="E9004" href="#E9004">E9004</a> | Error | URL missing port: {detail} | **Cause:** A URL is missing its port component. **Next steps:** 1. Add the port to the URL (e.g. `host:port`). 2. See the CLI reference for valid URL forms. |
| <a class="ecode" id="E9005" href="#E9005">E9005</a> | Error | Internal error while building the output. Please report this. | **Cause:** An internal error occurred while building the output. **Next steps:** 1. This is a bug — please report it with a debug log. |
| <a class="ecode" id="E9006" href="#E9006">E9006</a> | Error | The input data is corrupted or not in the expected format. | **Cause:** The input data was corrupted or not in the expected format. **Next steps:** 1. Confirm the source disc/file is readable and a supported format. 2. If reading a damaged disc, use multipass recovery. |
| <a class="ecode" id="E9007" href="#E9007">E9007</a> | Error | ISO image too large: {detail} | **Cause:** The ISO image is larger than this build can address. **Next steps:** 1. Use a destination/build that supports the required size. 2. Capture a debug log and open an issue with the disc capacity. |
| <a class="ecode" id="E9008" href="#E9008">E9008</a> | Error | No information is available for this input. | **Cause:** No information is available for the given input. **Next steps:** 1. Confirm the source is a supported disc or image. 2. Try `freemkv disc-info` against a disc source instead. |
| <a class="ecode" id="E9009" href="#E9009">E9009</a> | Error | Disc input can't be opened this way — this is an internal usage error. | **Cause:** A `disc://` URL was opened through the wrong API entry point (internal usage). **Next steps:** 1. This is an internal usage error — please report it with a debug log. |
| <a class="ecode" id="E9010" href="#E9010">E9010</a> | Error | The video stream's setup data could not be read. The source may be damaged or unsupported. | **Cause:** The video stream's setup data (parameter sets) could not be read. **Next steps:** 1. The source may be damaged or an unsupported variant — clean the disc and retry. 2. Capture a debug log and open an issue if it persists. |
| <a class="ecode" id="E9011" href="#E9011">E9011</a> | Error | Internal error while building the output. Please report this. | **Cause:** An internal error occurred while building the output. **Next steps:** 1. This is a bug — please report it with a debug log. |
| <a class="ecode" id="E9012" href="#E9012">E9012</a> | Error | This output format isn't supported yet. | **Cause:** The requested output format isn't implemented yet. **Next steps:** 1. Choose a supported output format (e.g. `mkv://` or `iso://`). 2. See the CLI reference for supported destinations. |
| <a class="ecode" id="E9013" href="#E9013">E9013</a> | Error | Internal error: a processing step stopped unexpectedly. Please report this. | **Cause:** An internal processing step stopped unexpectedly. **Next steps:** 1. This is a bug — please report it with a debug log. |
| <a class="ecode" id="E9014" href="#E9014">E9014</a> | Error | Timed out while finishing the output. Please try again. | **Cause:** Finishing the output timed out. **Next steps:** 1. Try again. 2. If the destination is a slow network share, retry to a local path first. |
| <a class="ecode" id="E9015" href="#E9015">E9015</a> | Error | Internal error: a processing step stopped unexpectedly. Please report this. | **Cause:** An internal processing step stopped unexpectedly. **Next steps:** 1. This is a bug — please report it with a debug log. |
| <a class="ecode" id="E9016" href="#E9016">E9016</a> | Error | Internal error: a processing step stopped unexpectedly. Please report this. | **Cause:** An internal processing step stopped unexpectedly. **Next steps:** 1. This is a bug — please report it with a debug log. |
| <a class="ecode" id="E9017" href="#E9017">E9017</a> | Error | Internal error while building the output. Please report this. | **Cause:** An internal error occurred while building the output. **Next steps:** 1. This is a bug — please report it with a debug log. |
| <a class="ecode" id="E9018" href="#E9018">E9018</a> | Error | Internal error: a processing step stopped unexpectedly. Please report this. | **Cause:** An internal processing step stopped unexpectedly. **Next steps:** 1. This is a bug — please report it with a debug log. |
| <a class="ecode" id="E9020" href="#E9020">E9020</a> | Error | The drive reported a disc size this version can't handle. | **Cause:** The drive reported a disc size this version can't handle. **Next steps:** 1. Update freemkv to the latest version. 2. Capture a debug log and open an issue with the reported capacity. |
| <a class="ecode" id="E9021" href="#E9021">E9021</a> | Error | The output stream is malformed. Please report this. | **Cause:** The output transport stream was malformed (a muxer invariant broke). **Next steps:** 1. This is a bug — please report it with a debug log. |
| <a class="ecode" id="E9022" href="#E9022">E9022</a> | Error | The output destination resolved only to blocked addresses and was refused. | **Cause:** The output destination resolved only to blocked addresses and was refused. **Next steps:** 1. Use an output host that resolves to a routable, non-private address. 2. This guard blocks loopback/private/link-local targets by design. |
| <a class="ecode" id="E9023" href="#E9023">E9023</a> | Error | No video or audio was produced — the output would be an empty file. The input may be undecryptable or have no readable data. | **Cause:** No video or audio was produced — the output would be an empty file. **Next steps:** 1. Confirm the input is decryptable (keys available for an encrypted disc). 2. Confirm the selected title has readable data; try multipass recovery on a damaged disc. |
| <a class="ecode" id="E9026" href="#E9026">E9026</a> | Error | The dir:// target folder is not empty. Pass --force to extract into it anyway, or choose an empty folder. | **Cause:** The `dir://` extraction target already contains files. **Next steps:** 1. Pass `--force` to extract into the non-empty folder anyway. 2. Or choose an empty destination folder. |
| <a class="ecode" id="E9027" href="#E9027">E9027</a> | Error | Not enough free space on the dir:// target to extract the decrypted file tree. Free up space or choose another folder. | **Cause:** The `dir://` target doesn't have enough free space for the decrypted file tree. **Next steps:** 1. Free up space on the destination. 2. Or extract to another folder with more capacity. |
| <a class="ecode" id="E9028" href="#E9028">E9028</a> | Error | Two files on the disc map to the same name on this filesystem, which would overwrite one. Extract to a case-sensitive filesystem, or report this disc. | **Cause:** Two files on the disc collide to one name on this filesystem (e.g. a case-insensitive volume). **Next steps:** 1. Extract to a case-sensitive filesystem. 2. Or report this disc if the collision looks unexpected. |
| <a class="ecode" id="E9029" href="#E9029">E9029</a> | Error | Could not write the extracted file tree to the dir:// target. Check the folder still exists and you have write access. | **Cause:** Writing the extracted file tree to the `dir://` target failed. **Next steps:** 1. Confirm the target folder still exists. 2. Confirm you have write access to it. |
| <a class="ecode" id="E9030" href="#E9030">E9030</a> | Error | Internal error while building the output. Please report this. | **Cause:** An internal error occurred while building the output. **Next steps:** 1. This is a bug — please report it with a debug log. |
| <a class="ecode" id="E9047" href="#E9047">E9047</a> | Error | The drive returned an unreadable disc-size response. Reconnect the drive and try again. | **Cause:** The drive returned an unreadable disc-size response. **Next steps:** 1. Reconnect the drive and try again. 2. Re-seat the disc. |

## Reporting a code

If a code's next steps don't resolve it, open an issue with:

- The full `Error: E<code> ...` line.
- A debug log: re-run with `--log-level 3` (writes `./log.txt`), or enable the
  Debug toggle in autorip and collect the container logs.
- Your freemkv version (`freemkv version`) and platform.

See [Troubleshooting](/troubleshooting/#capturing-a-debug-log) for log details.
