---
title: Flash Changelog
description: What's new in freemkv-flash, the drive flasher and dumper - newest first.
---

## 0.12.4

<small>2026-10-15</small>

### freemkv-flash

- MediaTek **INTM** (interim OEM) builds are now gated like any other MediaTek
  build. An INTM image is a complete, CMAC-valid build, and refusing it on either
  side of a crossflash had no reason of its own. INTM builds now pass the same
  family, chip, CMAC, OEM boot page, banner, rollback and post-flash identity
  checks as every other build, so a drive running an INTM build can be
  crossflashed back.
- Pioneer drives whose OEM receiver uses the two-part Kernel transfer now send
  the header and key first, followed by the body at the receiver-selected
  offset. The prior ordering could reject a valid 2.05 → 2.06 update.
- Update to `pioneer-optical 0.15.2` and `mediatek-optical 0.7.1`, both
  firmware-backed releases used by the flashing path.

## 0.12.3

<small>2026-10-14</small>

### freemkv-fw

- `create` now refuses an image where no change can be applied: it exits
  non-zero and writes no output file, instead of exiting 0 with a copy of the
  input. An image whose changes are all already set reports "this image is
  already modified"; any other image reports "nothing in this image can be
  modified by freemkv-fw" and points to flashing the stock image with
  `freemkv-flash`. `create --json` still prints the report, with a new
  top-level `"modified"` field (`true` when at least one change was applied).

### All tools

- The drive/chip generation (MT1959 vs MT1939) is now read from the firmware's
  **boot loader banner**, not the `MTEKMT19xx` identity string in the drive
  descriptor. That identity string is a stale vendor label on a number of
  drives — the JB8/JBC6/JBP6 builds (e.g. LG WH16NS58/WH16NS60,
  BH16NS40..NS50) report `MT1939` but run an MT1959 boot loader and MT1959
  code — so those drives and images are now correctly shown as **MT1959**.
  - `freemkv-fw create` modifies exactly the same images, byte-for-byte, as
    before; only the displayed chip/engine name changes for the affected
    builds (now MT1959). `create --json` gains a `chip` field (the banner chip);
    `engine` remains the code-layout/lineage name.
  - `freemkv-flash` info/inspect show the banner chip and list the identity tag
    only as a raw-facts curiosity; a live drive's chip is read from the banner
    it reports (the banner is always read). Flashing is unaffected; the chip
    gate compares banner to banner.
  - Restoring an existing backup still works: a backup of an affected drive that
    recorded the old `MT1939` label is accepted as a legacy alias of the banner
    chip.

### freemkv-flash

- MediaTek `backup` on a drive whose firmware does not expose its flash to the
  standard read (some drives answer only their calibration area) now says so
  plainly, instead of "backup needs every firmware byte", and points to the new
  diagnostic below. No partial or invented backup is written.
- New `freemkv-flash dump --read-map`: a read-only map of which READ BUFFER
  channels the drive answers with firmware. Run it and send the output to
  support when backup reports that the drive does not expose its flash.
- SCSI errors during flash and recover are reported accurately: a drive that
  rejects a command (CHECK CONDITION) is no longer described as a transport
  failure. The message names the status, decodes the sense data when the drive
  returns any, and says so when it returns none. The diagnostic log now records
  every firmware write chunk (offset, length, result).
- Pioneer **Kernel** flashing now follows the installed loader's real receive
  transport instead of one linear stream. The BD 10xx-generation loader (BDR-205
  through the S06/206 family) stages the Kernel body at transfer offset 0 and its
  front-key block at `0x10200`; sending the block at the linear `0x10000` lands
  in a reserved gap and the drive rejects it (the `SCSI transport failure …
  cdb=[3b,07,fe,01,00,00,…]` seen when recovering a 206 Kernel onto a 205). The
  transport is detected from the installed Kernel's own code, so loaders that do
  want a linear stream are unaffected, and an unrecognised Kernel layout is
  refused rather than written. Flash and recover now build the Kernel transfer
  with the same shared plan.
- `flash` can proceed **without a rollback backup** when the drive hides its
  flash from backup and the operator explicitly consents. The CLI shows an amber
  warning and requires a typed `y`; without a TTY (or in the GUI) it fails
  closed. Required file and drive-protocol checks still run; only the backup
  rollback simulation is skipped. The plan prints `NONE — flashing without a
  rollback backup`.
- MediaTek `backup` of a drive already running freemkv firmware reads the image
  back through freemkv's own injected command, so a drive whose stock firmware
  never exposed its flash can still be backed up once modified.

## 0.12.2

<small>2026-10-14</small>

### Pioneer

- Restore the 0.11.x crossflash rule: `flash` and `recover` gate on the hardware
  family, which spans several hardware versions (SATs). 0.12.1 added a
  same-SAT requirement to both, which refused every cross-model crossflash
  (e.g. BDR-UD03 -> BDR-UD04) that worked in 0.11.x. That requirement is
  removed.
- Keep the 0.12.1 receiver-encoding check in `flash`: a same-family image whose
  receiver encoding differs from the installed Kernel's (e.g. BDR-207M <->
  BDR-PR1ML) is refused before any write and pointed to `recover`, which
  re-encodes it. Re-encode stays recover-only until it is proven on hardware.
- Remove the backup-restorable (one-way Kernel-ABI) refusal from `flash`; it
  was not part of the 0.11.x rule.

## 0.12.1

<small>2026-10-14</small>

### Pioneer

- Add a brick-prevention receiver gate to `flash`. Before any write, the drive's
  currently-installed Kernel must be able to receive every component the flash
  sends: for a Kernel+Normal flash the target Kernel must carry the installed
  Kernel's hardware version (SAT), and the target Normal must decode, under the
  installed Kernel's receiver rules, to the same zero-checksum body the target
  Kernel decodes. A written Kernel+Normal must also share model and variant (the
  boot-time pairing the loader enforces at reset). This refuses, before any
  write, a Kernel swap across hardware versions and any Normal the installed
  Kernel cannot decode to the identical body (e.g. BDR-207M <-> BDR-PR1ML inside
  one SAT, and BDR-205 <-> BDR-206 across SATs), which would otherwise leave the
  drive stuck in update mode.
- Refuse a crossflash that would make the pre-flash backup un-restorable. A kept
  backup must always flash back, so `flash` refuses, before any write, a one-way
  cross-receiver pairing whose backup Normal needs Kernel entry points the target
  Kernel does not provide (the reverse direction still works). The gate fails
  closed: if restorability cannot be proven, the flash is refused.
- Route a same-SAT, different-edition bundle (e.g. BDR-207M ID43 -> BDR-PR1ML
  ID88) through the same crossflash classifier as a different-SAT target, so the
  receiver gate and backup-restorable check apply to it too.
- Add EXPERIMENTAL re-encode recovery to `recover` (recover-only, no override
  flag). For a drive stuck after a same-hardware crossflash, `recover` re-encodes
  the target Normal into the installed Kernel's receive transport (its XOR-skip
  offsets, rotation, derived-key pad and authentication) so the installed loader
  decodes it to the identical zero-checksum body, then writes the untouched
  target Kernel and the re-encoded Normal; the end-state resident firmware is
  byte-identical OEM. The re-encode is PROVEN OFFLINE (it must decode under the
  installed Kernel to the identical body with a zero BE32 checksum, including the
  real BDR-207M <-> BDR-PR1ML pair) but is NOT yet proven on hardware, so it
  stays recover-only for now; it is intended for promotion into the default
  `flash` path in a later release once proven on hardware. A fresh, caller-owned
  signature is applied, whose on-drive acceptance is part of what is unproven.
- `recover` refuses, before any write, a target that is not the installed
  drive's hardware family. It gates on the firmware family hash and, because
  that hash does not include the hardware version, additionally requires the
  target Kernel's SAT to match the installed Kernel's (a different SAT is a
  different drive generation); `recover` may cross receiver class but never
  hardware. Fails closed when the family or SAT cannot be read.
- Build against `pioneer-optical` 0.15.0, which exposes the receiver-class,
  Kernel-ABI (`required_abi`/`provided_abi`) and rotation APIs the receiver and
  backup-restorable gates above are built on.

### MediaTek

- Admit a MediaTek crossflash automatically between drives of the same hardware
  family, derived from the firmware itself — a content hash of
  chip·platform·loader·interface·medium·BD-write, which is the finest hardware
  distinction the image encodes (14x/16x/UHD differences within a family are
  firmware limits, and per-drive calibration lives on the drive and is not
  overwritten). An image of another model is flashed when it is the drive's
  hardware family and passes every content gate: chip match, a boot page a known
  OEM build stores, a valid AES-CMAC, an identical boot banner, a rollback
  simulation (the backup must flash back under the same rule), and a post-flash
  identity that confirms the drive now reports the new model. A different family,
  an INTM build or an unknown-identity image is refused, and an unknown family
  fails closed. There is no curated allowlist, no hardware-validated flag and no
  override. Same-model flashes and their messages are unchanged. The motivating
  case — LG WH16NS60 and WH16NS58 and the ASUS BW-16D1HT, all one JB8 family —
  now crossflashes; a JB7 BW-16D1HT or an LG BU40N is refused as a different
  family. Replaces the curated crossflash-class gate.

## 0.12.0

<small>2026-10-10</small>

### MediaTek

- Fix MediaTek backups on MT1939 drives (LG BH14NS40/BE14NU40 and others), which
  failed with "unrecognized boot page" and so blocked every MT1939 flash. A drive
  read's boot page is now recognized generically (it mirrors the image's page at
  `0x10000`) instead of by one BU40N hash.
- Rebuild MediaTek backups from a catalog of 204 OEM MT1959/MT1939 builds. A
  known build backs up byte-identical to the vendor file; an unknown build (a
  revision we lack, or a modified image) is rebuilt from its chip's factory
  contents and labelled as a reconstruction. Per-drive regions no longer take
  BU40N contents on every drive.
- Always check that an image's chip (MT1959 vs MT1939) matches the drive's,
  using the drive's identity descriptor (the boot banner can name the wrong
  generation). Previously this ran only with crossflash.
- Refuse to flash a raw drive read (such as a `dump` output): its boot page is
  the read-back copy and would not start the drive. An image's boot page must
  be one a known OEM build stores.
- Inspect and Compare support MediaTek images and drive reads, naming the exact
  OEM build when it is in the catalog.
- The MediaTek protocol lives in the new `mediatek-optical` crate (0.5.0 on
  crates.io), mirroring `pioneer-optical`.

### Native GUI

- The flash GUI is native on every OS: AppKit on macOS, Win32 common controls
  on Windows and GTK4/libadwaita on Linux (glibc). All three draw one
  platform-neutral model, so behaviour and wording match; musl Linux and
  `--egui` keep the egui window over the same model.
- Flash now runs a read-only plan, takes the pre-flash backup and authorizes
  the plan against it, and only then asks for confirmation, showing the
  authorized plan and any warnings. Nothing is written until you confirm;
  cancelling keeps the backup.
- The drive bar shows what the drive offers, and tabs follow it. Recovery is
  offered for an unsupported drive when a backend recognizes its receiver.
- Backup and dump files are named as the CLI names them, and file pickers list
  the formats the drive accepts.

### Backends

- One backend contract for every drive family: each backend declares what it
  can do (backup, dump, flash, recovery, inspect) and the CLI and GUI follow
  those capabilities, so adding a backend needs no front-end changes.
- Flashing runs in two read-only stages around the pre-flash backup before any
  write. Writes go only through a handle the engine grants after a saved backup
  or an acknowledged recovery; reads refuse any undeclared write command.
- One file recognizer serves flash, `check`, `info <file>` and Inspect; a file
  two backends claim equally is an error instead of a guess.
- Compare labels each region's role and counts only unexpected differences:
  per-drive data (revocation lists, settings, calibration) and the read-back
  boot page are expected to differ.
- Removed the unreachable force, skip-backup and recover-flash paths.

## 0.11.2

<small>2026-10-09</small>

- Derive the DVD region from the drive's RPC mask alone: a drive whose mask
  prohibits nothing lists regions 1-8 instead of "Not set", and the info and
  inspection views share one formatter. An unset region state reads "Never set".
- Show the drive's original product code, factory date and country of
  manufacture from its production record instead of fixed placeholder rows,
  and drop the never-read LabelFlash/LightScribe rows.
- Use pioneer-optical 0.12.4 for the production record decoder.

## 0.11.1

<small>2026-10-08</small>

- Expand drive information with grouped Kernel/Normal identity, media capabilities,
  DVD region counters, and codec-driven read-only Quiet Drive/PureRead settings.
- Show current and saved Quiet modes together without duplicate values. Hide
  unsupported PureRead versions and child controls; keep editing disabled.
- Keep diagnostic log paths in the diagnostics window and show unset DVD regions
  explicitly instead of presenting their permission mask as a selected region.
- Use pioneer-optical 0.12.1 with hardened codec validation and Rust regression
  tests for malformed input, write restrictions, transport failures and UI state.

## 0.11.0

<small>2026-10-08</small>

- Remove the public `flash --force` option. Use the separate `recover` command for Pioneer recovery; normal Flash retains its backup and compatibility requirements.
- Add a Pioneer Recovery tab and `recover` command with a required Current firmware reference or explicit Read from drive, plus a Kernel + Normal target package.
- Recovery skips automatic backups, compatibility policy gates, and firmware readback. Receiver credentials come from supplied firmware code, with no model/key lookup table. Drives already reporting update mode skip update entry.
- Reject unsupported recovery drives before firmware reads or update commands, including dry runs.
- Preserve strict write failures and diagnostics; report success only after normal identity and readiness return. This recovery path has simulated-transport coverage, including PR1ML/207M packages, but has not been verified on the affected hardware.
- Allow unsigned Current reference backups to be decoded without requiring a transfer signature; target packages still require valid authentication.
- Include pioneer-optical dev updates for generic H8 firmware inspection and diagnostic memory transfers.
- Rename Flash firmware to Flash and align inspection source labels with their buttons.

### Added

- Inspect firmware packages or a captured Pioneer drive in a separate results
  window, including hardware family, Kernel and Normal metadata, UHD support,
  expanded regions and recognized text tables. Live captures also report DVD
  region and remaining change counters when available.
- Compare two packages, or a package and one drive capture. Results lead with
  hardware families, followed by per-component and per-region differences after
  alignment, with percentages and text/JSON export.
- Generic comparison consumes single-image facts from Pioneer Optical. It
  excludes established metadata and supported direct-reference relocations;
  constants, unproven address changes and unknown data remain differences.

### Changed

- Use Pioneer Optical 0.12.0's bounded single-envelope analysis API. Unsupported
  formats and incomplete analysis have explicit messages; comparison does not
  enter a firmware update session.

## 0.10.9

### Fixed

- Pioneer backup no longer probes unrelated memory or assumes address zero is
  readable. Normal's location and size come from the captured Kernel's checksum
  and descriptor code. This fixes the 0.10.8 pre-flash backup failure on firmware
  that rejects reads below its exposed memory range, including BDR-212 firmware.
- Save validated captures before checking whether their components cover the
  proposed update. An incomplete capture remains on disk, while flash is refused.
- Refresh Pioneer OEM Kernel/Normal reconstruction metadata from the current
  firmware collection, including BDR-XD06U 1.11. Recognized firmware retains its
  OEM encoding key and signature instead of receiving zero placeholders.

### Changed

- Pin `pioneer-optical` to 0.11.3 for generic Kernel-derived backup layouts and
  precise layout validation error codes. Unknown or conflicting layouts are
  rejected before attempting a Normal read; no model-specific fallback is used.
- Add transport regressions for restricted read ranges, exact backup round trips,
  invalid Normal data, unsupported Kernel geometry and backup persistence ordering.
- Add a reproducible OEM-table generator that validates byte-exact reconstruction
  before admitting metadata, reports exclusions and preserves historical entries.
  Placeholder detection and raw encoding-key inspection use the library API.

## 0.10.8

### Fixed

- Pioneer Kernel transfers use the decoded key and the receiver representation,
  correcting the derived-key transfer that could fail midway through a same-family crossflash.
- Normal transfers authenticate and send the same continuous representation,
  including recoverable envelopes with inserted file blocks.
- Cross-generation OEM restoration verifies the intermediate and final Kernel;
  a failed restore propagates an error instead of claiming the drive is working.
- Dump captures mark overlong replies incomplete and stop reads on transport loss.
- Backup layout checks distinguish firmware descriptors from incidental inquiry and log strings
  and incomplete descriptor copies retained after an update.
- Flash execution is announced only after final preflight checks. Forced warnings
  and failure messages distinguish refusal, transfer failure, and unverified completion.

### Changed

- Pioneer validation and transfer preparation use published `pioneer-optical` 0.11.1,
  with stable error codes for diagnostics and future localized messages.
- Pioneer diagnostic dumps include address-aligned memory, the dedicated log
  command, additional read surfaces, and a directory of captured and unavailable regions.
- Dump enables temporary RAM logging after capture when the receiver supports it;
  unavailable logging does not fail the dump.

## 0.10.7

### Changed

- Drives are listed by the name the OS shows: the drive letter (`E:`) on
  Windows, `/dev/srN` on Linux and `diskN` on macOS while a disc is mounted,
  followed by the model, so identical drives can be told apart. The CLI `list`,
  the "multiple drives found" error, both desktop dropdowns and the flash
  confirmation all show it. Windows lists drives in letter order.

## 0.10.6

### Added

- macOS CLI/GUI drive-open failures automatically collect bounded, process-specific Apple plug-in messages in the operation log and distinguish interface initialization failures from exclusive-access failures.

### Changed

- MediaTek `backup` now saves a 2 MiB `.bin` in the vendor's update format instead
  of a `.tar` archive. It reads every firmware byte, stores the boot page in its
  encrypted form, and replaces per-drive NVRAM settings, calibration and AACS
  revocation lists with factory contents. Backups carry no personal data and
  are byte-identical to the OEM update file for 180 of 186 known MT1959 builds;
  the rest differ only in the factory BD revocation list. `dump` still saves the
  raw drive read, including per-drive data.
- MediaTek `dump` retries a failed 4 KiB read as 512-byte pieces, so readable
  windows next to unreadable memory are kept.

### Fixed

- Restoring a 0.10.x MediaTek `.tar` backup no longer writes the boot page as
  READ BUFFER returns it (decrypted in place by the drive); the archive is
  rebuilt into the stored form before flashing. Backup refuses firmware whose
  boot page it cannot recognize.

## 0.10.5

### Added

- Firmware modifier CLI and GUI operations now create automatic detailed logs,
  including image fingerprints, integrity verdicts, modification reports, output
  publication and full error chains. The modifier desktop UI now matches the
  flasher’s layout, styling, background operations and diagnostic viewer/export.
- Automatic diagnostic logs for CLI and desktop flasher operations, including
  platform/version, drive identity, SCSI commands, status/sense, transfer counts,
  timings, retries, native transport warnings and complete error chains.
  Command data is fingerprinted; metadata replies include bounded raw bytes.
  The desktop diagnostic viewer displays, copies and saves the same full log;
  failed operations also offer log export beside the error. No debug flag is needed.

### Fixed

- Validate MediaTek backup metadata using its response headers instead of treating
  allocation sizes as required lengths. Accept complete 24-byte serial descriptors
  and shorter INQUIRY replies, fetch longer metadata with bounded reads, and reject
  truncated or inconsistent descriptors. Logs include metadata bytes, requested/actual
  counts, decoded header lengths, follow-up reads, and validation outcomes.
- Require complete MediaTek preflight and fingerprint ROM reads, validate protocol
  probe descriptors, and recognize fixed-format sense with its valid bit set.
- Pioneer firmware access uses a four-byte probe and retries short responses up
  to twice, unlocking before each attempt. Explicit errors still stop the probe.
- Detect a disconnected Pioneer drive before subdividing failed recovery reads;
  record recovery errors and use a complete word for the liveness check.

## 0.10.4

### Fixed

- Pioneer flashing no longer uses model/revision allowlists or exact UD04 image
  sizes. CLI and GUI validate envelope framing, component pairing, receiver
  authentication, integrity and hardware-family compatibility.
- Resolve the supplied or installed Kernel before decoding Normal firmware,
  including family comparisons. Reject incompatible component tags before body
  decoding, and use the Kernel's receiver rules for integrity validation.

## 0.10.3

### Fixed

- **macOS: `freemkv-flash list` found no drives on some Macs.** At attach,
  macOS files each optical drive under `IOBDServices`, `IODVDServices` or
  `IOCompactDiscServices`, chosen from the profile list the drive returns to
  GET CONFIGURATION. Drive discovery only looked under `IOBDServices`, so a
  Blu-ray drive that macOS had filed as DVD or CD (its profile list omitted
  the BD profiles, or the command failed and macOS fell back to CD) printed
  `drives: none found`, and its `ioreg:` selector could not be opened.
  libfreemkv 1.8.0 searches all three classes.

## 0.10.2

### Added

- **Every platform freemkv ships on.** Each tool now has a Linux desktop app
  (`.deb` and AppImage, x86_64 and ARM64), Windows ARM64 builds, a per-tool
  Windows installer and portable zip, and static Linux CLIs for x86_64,
  ARM64 and 32-bit Raspberry Pi OS (armv7). Every GUI download carries its
  CLI, including the macOS `.app` for the Homebrew cask.
- **Package repositories.** The `.deb`s are served from the freemkv.org APT
  repository, and are repackaged as signed `.rpm` (Fedora, RHEL, openSUSE)
  and pacman (Arch Linux) packages for freemkv.org/rpm and freemkv.org/arch.

### Changed

- **pioneer-optical 0.10.** The flasher passes the 256-byte control buffer to
  `drive::enter_update` directly and writes through `Session::write(Role, …)`.
  The crate never sends a commit when a session is dropped, so a failed flash
  cannot commit a partial image. The separate `pioneer-codec` crate is gone.

### Fixed

- **Linux GUI packages.** `freemkv-flash-gui` / `freemkv-fw-gui` `.deb`s now
  depend on `libxkbcommon-x11-0`, `libxcursor1`, `libxi6` and `libxrandr2`,
  which the windowing layer loads at run time under X11. Without them the GUI
  exited at start-up.
- A Kernel+Normal bundle with an empty Kernel tag is rejected. A Kernel-only
  partial backup validates, but a flash bundle still needs its Normal.
- `--recover` checks the Normal component's size and alignment before
  entering update mode, and the Bd update class is assumed only under
  `--recover`.
- `dump` ends with a clear summary of any read gaps; salvage stops when the
  drive drops out, and its liveness probe re-reads the last good offset.
- Clearer recover advice and blocked-execution messages; broken intra-doc
  links in the Pioneer flash-plan module.

## 0.10.1

### Changed

- Uses the published `pioneer-optical` from crates.io and `libfreemkv` from
  its GitHub tag; builds no longer need sibling checkouts, and every
  dependency resolves from the committed `Cargo.lock`.
- Pioneer bundles carry only the two component envelopes (no manifest); the
  flasher reads the drive identity back after a flash.

## 0.10.0

### Added

- **Pioneer flasher.** Backup-first flash of Pioneer BD drives through
  `pioneer-optical`, gated on a hardware-family match between the installed
  and target firmware and on the installed Kernel tag. Cross-flash between
  editions of the same family; Kernel downgrade via the decoded-body marker
  patch.
- `dump` / `dump --force` and `flash --recover`.

## 0.9.2

### Fixed

- Silent `0x30/0x02 Incompatible medium installed` refusal on a specific
  triple-layer UHD (observed on a BU40N 1.00 fw-flashed drive):
  the drive-side disc classifier lands `[0x01ff9e04]` on `0xE8` for this
  disc (top nibble `0xE`) instead of the usual `0xC*`, which the un-hooked
  OEM `cmp` at `0x00136826` refused. Static analysis (three parallel
  passes) confirmed all 100 writers of `[0x01ff9e04]` are byte-identical
  between OEM and modified builds; the fix widens the gate itself under a
  flag rather than touching the classifier.

## 0.9.0

First public release since 0.8.3. Consolidates the 0.8.4–0.8.14 development
line: the `Encryption` flag-set consolidation, the boot-time de-bus fix, the
`thumb-asm` extraction, and a flasher hardening pass. Hardware-validated on
BU40N 1.00 — empty-tray base certification 59/59, and a UHD disc run proving
de-bussed reads end-to-end (every sampled unit opens with the AACS unit key).

### Added

- **Emit-time install guards at every detour site.** After each
  `thumb::write(&mut buf, site, &bl)` in `mt1959.rs` and
  `mt1939_classic.rs` the 4 bytes are decoded back and asserted to reach
  the intended stub VA. Twelve sites total — Speed, Region, Gate-A,
  deny-reset, UHD, HRL (per loop iteration), BD, plus the classic Region,
  Gate-A, AKE, HRL (per loop iteration), and the shared classic
  `commit_classic_detour` covering UHD+BD. Would have caught the 0.8.13
  BL-over-tail-call bug at emit time.

### Fixed

- **Flasher refuses to report success on ambiguity.** `wait_ready` now bails
  after 45 s instead of looping forever; post-settle sense hard-fails on
  MEDIUM/HARDWARE/ABORTED and warns (rather than silently swallowing) on an
  unparseable or errored reply; unverified read-back chunks and a failed
  firmware-identity read-back both bail instead of printing and continuing.
  `--allow-crossflash` now refuses when the drive's current firmware cannot
  be identified. Drive classification requires the `MT19` boot banner at
  `0x003000` in addition to the GET CONFIG `0x010C` echo, so a compliant
  non-MTK drive can no longer be misclassified as MediaTek. Tar dump members
  are length-checked and capped at 256 KiB before allocation, and the
  medium-status guard re-probes immediately before `flash_open` to close a
  preflight→open TOCTOU window.

## 0.8.11

### ABI BREAK

- **Added `Verb::Reboot` (`0x0F`)** — DEBUG_KNOCK-only. Invokes the firmware's
  boot function entry with `r0=4` to force the cold path (BSS clear + C-runtime
  data init + full post-init). Recovers a wedged drive without a power cycle;
  the safe-knock verb chain is re-armed to its power-on defaults. The target VA
  is baked into the emitted handler at build time (`boot_init_site - 0x10`), so
  no CDB arguments are carried beyond the verb byte.

## 0.8.3

### Changed

- **`Verb::Reset` now has three modes** (mode in `cdb[6]`), fixing an 0.8.2
  misnomer where "reset to OEM" actually restored the baked defaults:
  - `RESET_TO_FLASH` (`0x00`) — reload the saved config (marker-gated); unchanged.
  - `RESET_TO_DEFAULTS` (`0x01`, **new**) — restore the baked create-time
    `DEFAULT_FLAGS` (UHD/BD on) into RAM. This is what boot uses on a never-saved
    drive. (0.8.2's `RESET_TO_OEM` did this — it moved here and got the honest name.)
  - `RESET_TO_OEM` (`0xFF`) — now **true OEM**: forces every RAM flag to
    passthrough AND writes the NV block all-`0xFF` (marker included), leaving the
    drive byte-for-byte identical to a never-saved/never-configured one (**no
    trace**). Because the marker is then `0xFF`, the next boot loads the baked
    defaults, exactly like a fresh drive.

### Notes

- The NV blank is the ordinary SAVE flash primitive with an all-`0xFF` payload
  (op=1 RMW preserves the OEM region record at `+0x4B0`) — no special erase.

## 0.8.2

### Fixed

- **UHD/BD media-accept now survives a power-cycle.** The boot hook used to fill
  the feature-flag table with `0xFF` (OEM passthrough) on every power-on, so a
  drive that had UHD enabled only in RAM reverted to *refusing* UHD discs after a
  reboot ("Not Ready — Incompatible medium installed", no current profile), and a
  host that only checks readiness (autorip's drive poll) never saw the disc. The
  boot hook and `RESET`-to-OEM now fill the table from a baked per-create
  **defaults table** instead, and `create` ships **UHD and BD = `STATE_ON`** by
  default — so a flashed drive engages UHD/BD discs out of the box and after every
  power-cycle.

### Added

- **NV saved-marker (flag-table slot 0).** `SAVE` now stamps slot 0 non-`0xFF` to
  record "a config exists"; the boot hook / `RESET`-to-flash apply the saved
  feature bytes only when the marker is set, else fall back to the baked defaults.
  This lets a user deliberately `save` an all-passthrough config (which is
  byte-identical to erased flash) and have it honoured across a reboot, instead of
  being mistaken for "never saved" and overwritten by the defaults.

### Notes

- Defaults are baked into the CMAC-covered boot/reset stubs, so they persist
  through a flash (the NV block itself is not written by the image update).
  Hardware-validated on BU40N: boot→defaults, save→marker→reload honours the saved
  config, reset-to-OEM→defaults. A per-image `--oem-uhd`/`--oem-bd` create opt-out
  (leave a feature at OEM passthrough) is the planned follow-up.

## 0.8.1

Major firmware redesign (0.7.x → 0.8.x). Pairs with the freemkv stack 1.7.2
(freemkv-unlock mirrors this ABI). Flash with `freemkv-flash flash`, then rip
with autorip / the freemkv CLI 1.7.2.

### Added

- **Vendor ABI v2** — the drive command grammar is now verb + feature + state:
  `Save` (0x0B), `RESET`-to-flash/OEM modes, and explicit encodings for the seven
  orthogonal feature flags (Speed, Region, UHD, BD, HRL, AKE, BUS). The
  HRL/AKE/BUS unlock direction is `off = unlock` (`0x00`). Vendor-command data-in
  is floored at `MIN_ALLOC_LEN` (the drive aborts a sub-16-byte data-in — HW-confirmed).
- **SAVE/RESET/boot foundation** — persist the feature table to flash and reload
  it on boot; signature-derived NV SAVE-home.

### Feature availability (118-image OEM corpus)

- Region / AKE / BUS / HRL: 118/118. Speed / UHD / BD: 101/118 (the 17
  MT1939-classic images lack these by genuine architectural limitation).

## 0.7.1

### Added

- `freemkv-flash info` now identifies **every** drive family in a firmware image,
  not just MediaTek MT19xx: Pioneer (raw + zlib-packaged), legacy Hitachi-LG
  (HL-DT-ST) full-flash dumps, Renesas and MediaTek-bridge dumps, the encrypted
  MediaTek envelope, and ASCII Intel-HEX images — each reported with honest
  flashability (only MT19xx is flashable) and integrity where applicable.

### Changed

- `freemkv-flash flash` now writes only with a **closed, empty tray** — it refuses
  a loaded disc or an open tray (each with a distinct message) before any write.

### Validated

- **Hardware-proven on the LG BU40N (MT1959).** `freemkv-fw create` output flashed
  cleanly (read-back + on-device CMAC verified), `freemkv-hwtest` passed all lever
  checks, the AACS bus-decrypt KAT read byte-identical to the golden MK/LibreDrive
  reference, and a full UHD autorip produced an ISO **byte-identical to MakeMKV**.

## 0.7.0

### Security

- `freemkv-flash`: the flash write path now refuses — unconditionally, with no
  override — to write an image whose AES-CMAC does not verify, or whose
  drive-descriptor model (file offset 0x1EC000) does not name the target drive's
  INQUIRY product. Either gap could brick a good drive: a mis-signed/corrupted
  image the drive's boot authenticator rejects, or a right-family/wrong-model
  image (every MT19xx image CMAC-verifies for its OWN model, so CMAC alone can't
  catch that). Both gates run before any SCSI write; a dry-run stays a pure
  read-only inspection.

### Fixed

- `freemkv-fw`: two out-of-bounds panics on a malformed or short OEM image — the
  `ldr [pc,#imm]` literal-pool read past the image tail, and the Gate-A
  deny-reset site index — now fail closed (`None` / a clear error) instead of
  panicking. Added coverage for the flasher's failed-backup abort gate and for
  `freemkv-hwtest`'s hung-helper timeout/kill.

### Changed

- `freemkv-fw`: finalised the command set — `01` Identity, `02` Speed, `03`
  Region, `04` Raw Read, `09` DumpAll. Raw Read `0x04` has three states: `00`
  OEM enforce, `01` "cert valid" (a bare `READ DISC STRUCTURE` `0xAD` returns the
  Volume ID with no AKE), `02` "accept any host cert" (forces the AKE to state 6
  so the host can run a real AKE with a revoked cert). Speed/Region/Raw Read are
  flag-gated OEM-code trampolines; the `3C 0E` handler persists `flag[subfn]`.

## 0.6.2

### Changed

- `freemkv-fw`: Raw Read (subfn `0x04`) is now a **flag-gated AKE accept-gate
  trampoline**, not a `set_agid_state` poke. Grounded from the MK GOLD dump: MK
  runs the drive's own AKE (request-code `6`) rather than faking the gate byte, and
  the per-AGID state is a `1→…→6` machine whose terminal `6` is only reached by the
  real key-exchange. `find_ake_gate()` locates (by a signature byte-identical across
  OEM 1.00 and MK 1.03) the success/reset state writers; the detour rewrites the
  RESET writer so a failed host-cert verify is forced to state `6` (accept) when
  `flag[0x04]` is set, else the OEM `1`. The host drives the AKE (`0xA3`/`0xA4`) and
  reads the VID via `0xAD`; the firmware only defeats the cert-signature rejection.

## 0.6.1

### Fixed

- `freemkv-fw`: the prior `0x03` called the OEM VID producer/dispatcher inline,
  which hard-wedged the controller on a BU40N (Hardware Error → dead SATA target,
  host reboot to recover). Raw Read never calls them — failure is now a harmless
  CHECK CONDITION.

## 0.6.0

### Changed

- `freemkv-flash` now shares libfreemkv's SCSI transport instead of a local copy.

## 0.5.0

### Added

- `freemkv-flash`: standalone, multi-OS optical-drive firmware flasher/dumper,
  100% Rust. Three commands — `info` (default, identify + classify), `dump`
  (per-unit backup to an interoperable tar), `flash` (verbatim writer; dry-run
  planner by default, gated behind `--execute --i-understand-risk`).
- Layered architecture: CLI → generic `engine` (chip-agnostic orchestration:
  file read, pre-flash backup, dry-run plan, streaming loop, read-back verify,
  safety gate) → per-chip `DriveFamily` trait. MediaTek MT19xx is fully
  implemented; Pioneer/Renesas classify positive but are unsupported (the
  MTK-gate keeps them safe — no dump/flash CDB is ever issued).

### Robustness

- Linux SG_IO transport hardened for adversarial/degraded drives: a CHECK
  CONDITION on a data-IN read is never accepted as valid data (a failed region
  read can no longer silently corrupt a backup); a self-clearing UNIT ATTENTION
  is retried once on reads/polls (so a benign power-on notification does not
  masquerade as a failure), and NOT READY now gates the flash-open handshake
  before any WRITE BUFFER is issued. The post-burn COMMIT/READY/SENSE trailers
  are best-effort: only a real programming fault (sense key 0x3/0x4/0xB) reports
  the irreversible flash as failed.

### Notes

- `flash` is a **dumb verbatim writer**: it never modifies the image. Firmware
  authoring (downgrade, speed-lock, host-cert changes) is deliberately out of
  scope for a separate future tool.
