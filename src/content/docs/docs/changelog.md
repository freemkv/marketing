---
title: Changelog
description: What's new in freemkv — the command line, the desktop app, and freemkv-library — newest first.
---

<a href="/docs/changelog/rss.xml" aria-label="Subscribe via RSS" title="Subscribe via RSS" style="display:inline-flex;align-items:center"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#f26522" aria-hidden="true"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20A2.18 2.18 0 0 1 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 4.95a10.61 10.61 0 0 1 10.61 10.61h-2.83A7.78 7.78 0 0 0 4 12.22V9.39Z"/></svg></a>

What's new across freemkv — the command line, the desktop app, and the
freemkv-library server (autorip before 1.8.0) — newest first. Every release ships all three together under
one version number.

For the full technical detail behind a release, see the per-component notes:
[freemkv releases](https://github.com/freemkv/freemkv/releases).

## 1.8.3

<small>2026-10-09</small>

### Added

- **Pioneer runtime unlocking (beta).** freemkv automatically unlocks supported Pioneer and Pioneer-based drives in RAM, without flashing firmware. The CLI, app, and Library use the same unlock flow and can read the disc Volume ID. Speed and region controls are not yet available for Pioneer drives.

### Changed

- Release checks now verify download links, checksums, and package manifests before the release is considered complete.

## Firmware 0.11.0

<small>2026-10-08</small>

- **Recovery** is a separate Pioneer workflow in the desktop app and CLI. Supply
  Current firmware and the package to install, or explicitly read Current from
  the drive. Recovery skips backups and firmware readback, and handles a receiver
  already in update mode. It remains experimental pending hardware confirmation.
- Remove `flash --force`. Normal Flash retains its backup and compatibility
  checks for supported MediaTek and Pioneer firmware.
- Reject unsupported recovery drives before firmware reads or update commands.
- Add firmware inspection and comparison, align source labels, and shorten the
  Flash tab name.

See the [firmware command reference](/docs/firmware-tools/#freemkv-flash) and
[0.11.0 release notes](https://github.com/freemkv/freemkv-firmware/releases/tag/v0.11.0).

## 1.8.2

<small>2026-10-08</small>

### Changed

- **Faster key lookup.** Discs are keyed from the CPS units they declare instead of reading every stream file: a 46-file UHD over USB goes from about 95 s to under 2 s. The live scan also reads less of the disc.
- App: **Start** reuses the drive, scan and keys from **Open**, about 8 s less per rip.
- Library: MKV rips that don't keep the ISO read only the titles they mux, not the whole disc.

### Fixed

- Library: Stop no longer rescans the disc it stopped, a network share that stops responding no longer hangs startup, and key-service retries no longer reread the disc.
- Windows: a bare drive letter (`E`) opens that drive. Linux: a bare node name (`sg3`, `sr0`) opens it under `/dev`.
- The Library server image reports its real rip-library version (1.8.1's image showed 1.8.0; the code was the same).

## 1.8.1

<small>2026-10-07</small>

### New

- **Connect to Remote Library.** Settings can connect other freemkv Libraries: their drives appear beside yours with machine labels, live progress, controls and logs, and shared muxing, moving and title-review panels. Jobs and output stay on the machine that owns them.
- **ARM builds:** Windows on ARM, 64-bit ARM Linux (`.deb` and AppImage) and 32-bit Raspberry Pi OS (CLI), plus a multi-arch server image.
- **Webhooks** support custom authentication headers, including Jellyfin, with a Test button.

### Changed

- Drive lists show every optical drive. Windows no longer misses drives numbered above `CdRom15` (common with USB drives), Linux lists drives when the `sg` module is not loaded, and macOS no longer stops at eight drives.
- macOS: the app ships as a `.zip` instead of a `.dmg` (allow its first launch under Privacy & Security).
- File moves show a recent transfer speed and a steadier ETA.

### Fixed

- A stopped disc no longer restarts on its own, and the Library stays responsive through storage and connection stalls.
- macOS: one drive no longer appears twice while it is being ripped.
- Renesas drives: more reliable unlocking.

## 1.8.0

<small>2026-10-05</small>

### New

- **freemkv-library replaces autorip.** The ripping server is now part of freemkv, with a Library tab for remuxing and checking your movies. Existing autorip installs keep pulling the same image name and load their settings unchanged.
- **Separate app and CLI builds on every OS.** Windows gets a per-user installer, Linux a split `.deb`, a Flatpak and a confined Snap, and Homebrew a `freemkv` cask and a `freemkv-cli` formula.
- **DVD:** chapter names where the disc has them, the disc's region, stream labels such as commentary, and forced subtitles detected.
- **HD DVD:** AACS-encrypted HD DVDs decrypt with a known key.
- **UHD:** HDR10 mastering data is kept when content light level is absent; HDR10+ and Dolby Vision tracks are labelled correctly.

### Changed

- An ISO is decrypted unless you ask for raw, on every front end, and a stopped multi-pass recovery resumes where it stopped.
- The app's title list shows each title's length and size in their own columns, with its chapters under a collapsed row.
- Ripped files are named from the disc's title.

### Fixed

- TrueHD 7.1 and Atmos tracks are labelled correctly.
- A DVD ripped to a folder is descrambled.
- An encrypted Blu-ray folder rips like its ISO.
- The server no longer loses work when a network share drops: rips and moves wait for it instead of writing to local disk.

### freemkv-library replaces autorip

- The autorip service is now **freemkv-library**, the freemkv web server. This is a rebrand: behaviour and settings are unchanged, so an existing install just pulls the new image.
- The image is `ghcr.io/freemkv/freemkv-library` (`:latest` and `:vX.Y.Z`). The same image is still published as `ghcr.io/freemkv/autorip`, and it still answers to the `autorip` command.
- It reads your existing `/config/settings.json` unchanged, and the `AUTORIP_*` environment variable names are unchanged.
- New web UI.
- New **Library** tab: lists your MKVs and ISOs side by side, shows which freemkv version muxed each MKV, remuxes out-of-date titles from their ISO, and audits the library.
- freemkv-library ships only as a Docker image; there are no native binary downloads or Homebrew formula for it.

## 1.7.7

<small>2026-09-26</small>

### Fixed

- Forced PGS subtitles now disappear when their display period ends, instead of remaining until the next subtitle.
- Preserve PGS clear-event timestamps when remuxing, addressing the reproduced issue in #52. A fresh rip is needed to confirm the fix on affected discs.
- Improve audio frame handling and preserve opening audio and MKV timing metadata.
- Keep the Linux desktop interface responsive while opening and scanning sources.

### Linux packages

- Add a native `.deb` containing the desktop app and CLI for Ubuntu 24.04 and Linux Mint 22.
- Publish direct `.flatpak` downloads on GitHub Releases, independently of Flathub acceptance.
- Add installation instructions and download links for both formats.

### Quality and maintenance

- Expand subtitle regression tests and add FFmpeg checks for subtitle clearing, audio/video content and timing.
- Add media known-answer tests and Linux/macOS/Windows output comparisons.

## 1.7.6

<small>2026-09-26</small>

**Added**

- **Linux desktop app (BETA).** freemkv now has a native GTK4 + libadwaita
  desktop app on Linux, with the same features as the macOS and Windows apps:
  pick a drive, file or folder, tick titles and tracks, choose a format, press
  Rip. Same core on all three, so a fix lands everywhere at once. A Flatpak
  (`org.freemkv.FreeMKV`) and an AppImage are on the way; Flathub submission
  follows this release.
- **Rip-finished notification** on macOS, Windows and Linux. Click it to open
  the output folder. Turn it off in Settings if you don't want it (default: on).

**Fixed**

- `freemkv info` accepts `--log-level`, and `--log-file` without a path no
  longer eats the next option.
- No more false "MP4 can't hold MPEG-2" warning after switching discs.
- The log pane stays fast during long rips on macOS and Windows.
- On Linux the default output folder is your real Videos folder, even if it
  was moved or has a translated name.
- `info --share` explains why the disc structure could not be captured.

**Autorip**

- Re-inserting a disc after an interrupted rip (crash, power loss, eject) picks up where it left
  off instead of restarting from title 1.
- The UI shows how much staging space the selected titles will need before the rip starts, and
  a resume no longer fails the space check by ignoring what is already staged.
- Key-service failures get their own messages: an outage, a definitive "no key for this disc",
  over quota and unlicensed are told apart, and only the outcomes where retrying can help are
  retried. The tracker link in the AACS-failure message is clickable.

_This release aligns all components to 1.7.6._

## Firmware 0.9.2

<small>2026-09-25</small>

`freemkv-firmware` versions independently of the rest of the stack — see the
[Firmware tools](/docs/firmware-tools/) reference for the full command ABI.

**Changed**

- **`Feature::Uhd` renamed to `Feature::Unrestricted`.** Same numeric discriminant (`0x03`) — the
  wire byte is unchanged, so existing hosts keep interoperating. The new name documents the
  intended semantic: one flag now controls all AACS media acceptance — BD, UHD, and the auth-cell
  state-band gate below. `Feature::Bd` (`0x04`) is now **deprecated**: `SET`/`GET` still round-trip
  through its own NV slot, but it has no runtime effect.

**Added**

- **New lever: the auth-cell state-band widen at `0x00136826`.** Wired through `Unrestricted` on
  BU40N 1.00 (`cmp (state>>4),#0xC; bne <6F/02>`), widening the accepted top-nibble set when armed.
  `STATE_ON` (`0x01`) widens; `STATE_OFF` (`0x00`) and `STATE_PASSTHROUGH` (`0xFF`) both replay OEM.
  A freshly flashed drive with virgin NV boots with `Unrestricted = STATE_ON` — the widen is on by
  default.

**Fixed**

- Silent `0x30/0x02 Incompatible medium installed` refusal on a specific triple-layer UHD whose
  disc classifier lands its state byte on `0xE8` instead of the usual `0xC*` band that the OEM gate
  accepted.

## 1.7.5

<small>2026-09-23</small>

**Fixes**

- **Drives running freemkv firmware 0.9.0 unlock again.** Firmware 0.9.0
  consolidates two separate drive controls — one for the authentication
  handshake, one for in-transit encryption — into a single control, because the
  second one turned out to do nothing on its own. The unlocker now sets the one
  control instead of the two that no longer exist. Without this, a drive on
  0.9.0 firmware would fall back to the slower online-key route. Drives on older
  firmware are unaffected.

**If you flash firmware**

- freemkv-firmware 0.9.0 is a separate release and needs this version of freemkv
  to drive it. It fixes a bug where a drive could come up with in-transit
  encryption disabled at power-on even when it was configured to leave it on,
  and a second one where changing the encryption setting with no disc loaded
  would stop the drive answering further freemkv commands until it was
  power-cycled. Validated end-to-end on an LG BU40N: a 4K disc returned every
  sampled unit unwrapped, and the key resolved normally.

_This release aligns all components to 1.7.5._

## 1.7.4

<small>2026-09-21</small>

**Fixes**

- **Correct main title on BD-J / Java-menu Blu-rays.** Some discs that drive
  their menu with BD-J (a Java menu) were having the wrong title picked. 1.7.4
  walks the disc's menu, adds a chapter-completeness failsafe, and breaks ties by
  stream richness, so autorip and the CLI pick the real main feature — keeping
  the Dolby Vision layer and all subtitle tracks instead of a lesser sibling.
- **PGS subtitle "Timestamps are unset" muxing error fixed.** Blu-ray (PGS)
  subtitles now carry a proper per-block duration, so muxing no longer fails with
  the "Timestamps are unset" error.
- **Clearer "no key in keydb" messaging.** A missing key now tells you whether
  the disc simply isn't in the database or is listed but still needs a VID to be
  usable, and the lookup now shows the disc hash so a report can be matched up.

**New / Maintenance**

- More resilient keydb downloading: a slow-but-progressing download is no longer
  killed by an absolute deadline (rolling-idle timeout).
- Security and quality hardening: OpenSSF Scorecard, REUSE compliance, and
  provenance-ready CI across the components.

_This release aligns all components to 1.7.4._

## 1.7.3

<small>2026-09-19</small>

**Fixes**

- **Correct main title on multi-angle / seamless-branch UHD discs.** Some 4K
  Blu-rays that use multiple angles for the main feature were having the wrong
  title (or no title) picked, because the disc's stream table was read at the
  wrong place for a multi-angle playlist. 1.7.3 locates it correctly, so autorip
  and the CLI pick the real main feature. Validated against a 92-disc UHD corpus.

**New**

- **`freemkv info … --share` captures a disc's structure for bug reports.** If a
  disc still picks the wrong title, `--share` bundles just the small
  BDMV/VIDEO_TS metadata (playlists, clip info — a few hundred KB, no video/audio
  and no keys) so the problem can be reproduced without sending the whole disc.
  Works on a drive, an ISO, or a folder. See
  https://freemkv.org/docs/troubleshooting/#sharing-a-profile-share

_This release aligns all components to 1.7.3._

## 1.7.2

<small>2026-09-18</small>

**Fixes**

- **freemkv firmware drives now unlock and decrypt correctly.** Drives running
  freemkv firmware were not having all of their features applied during a rip —
  in particular, sample data sent for key recovery could still be bus-encrypted,
  and some drives fell back to the online/AACS path instead of unlocking
  directly. 1.7.2 applies every firmware feature the way it should, so freemkv
  firmware drives unlock cleanly and hand off clean, decrypted data.

- **More reliable disc size detection.** Hardened how we read a disc's capacity
  so a drive that briefly reports the wrong size no longer produces an empty or
  truncated rip.

**New**

- **Use freemkv firmware with 1.7.2.** This release ships the updated firmware
  modify support, so drives you flash with freemkv firmware work end-to-end with
  the 1.7.2 app.

_This release aligns all components to 1.7.2._

## 1.7.1

<small>2026-09-14</small>

**Fixes**

- **LibreDrive unlocking restored.** A regression in 1.7.0 stopped some drives
  from unlocking — those that report a specific model name our catalogue lists
  more generically (for example the LG BU40N). 1.7.1 matches them correctly
  again, so LibreDrive-based Blu-ray and UHD ripping works on these drives as it
  did before.

_This release aligns all components to 1.7.1._

## 1.7.0

<small>2026-09-06</small>

**New — early access (beta)**

- **Renesas drive unlocking.** freemkv can now open selected Renesas / Pioneer
  drives for reading, alongside the existing routes. This is early and
  unvalidated — if you have one of these drives, give it a try and tell us how
  it goes.
- **freemkv firmware.** freemkv can also read drives running freemkv's own
  firmware. The companion tools that flash and modify that firmware —
  `freemkv-flash` and `freemkv-fw`, each with a command line and a desktop app —
  are at [freemkv.org/firmware](https://freemkv.org/firmware/).

**Fixes**

- An MP4/MOV file that uses 64-bit box sizes could be read only part-way
  through; it is now walked in full.
- The right drive profile is now chosen for a drive whose exact model isn't in
  our catalogue but reports a valid product id — previously it could be matched
  to a sibling model, and that model's microcode.

**Security**

- Fixed a low-severity memory-safety issue in the internal sector-prefetch
  buffer pool (advisory GHSA-j8ww-f5fg-9pmh). No shipped feature could trigger
  it.

_This release aligns all components to 1.7.0._

## 1.6.14

<small>2026-08-31</small>

**Fixes**

- The web dashboard no longer briefly hangs while scanning a large library.

_This release aligns all components to 1.6.14._

## 1.6.13

<small>2026-08-28</small>

**Drive support**

- `freemkv info disc:// --share` now captures a few additional drive
  responses on Pioneer / Renesas drives. If you have one of these drives and
  would like to help us add support for it, re-run the command and share the
  profile it prints.

_This release aligns all components to 1.6.13._

## 1.6.12

<small>2026-08-27</small>

**Ripping**

- **macOS:** fixed a case where the disc could unmount partway through a rip —
  seen as `E1000` ("Write failed"), with the disc then re-mounting on its own.
  freemkv now holds an exclusive claim on the drive for the whole rip, so the
  system no longer takes it back mid-read.
- If the disc or drive state changes underneath a rip, freemkv now reacquires
  the drive and restarts the pass instead of failing the read.

_This release aligns all components to 1.6.12._

## 1.6.11

<small>2026-08-26</small>

**Ripping**

- More reliable main-feature detection on Blu-ray and DVD discs: freemkv now
  follows the disc's own on-disc navigation to find the main feature, instead
  of guessing from title length alone, so it's far less likely to be fooled by
  a decoy title.

**Autorip**

- Fixed a rare case where a disc could get stuck endlessly retrying a failed
  mux step instead of being marked as failed and moving on.

_This release aligns all components to 1.6.11._

## 1.6.10

<small>2026-08-23</small>

**Ripping**

- Fixed rare Dolby TrueHD / Atmos audio errors on discs that carry a gap in their
  transport stream: the ripped track could make some players report audio glitches
  around the affected moment, or an integrity checker flag the file as corrupt.
  freemkv now resynchronises the audio cleanly across such gaps, so the muxed file
  plays back and verifies without the errors. (The gapped instant is in the source
  and can't be recovered, but the file is no longer flagged corrupt.)

## 1.6.9

<small>2026-08-22</small>

**Autorip**
- **Automatic per-episode TV ripping** — insert a series disc and every episode comes out as its own `Show S01E02 - Title.mkv`, filed into `TV/Show (Year)/Season NN/`, with no operator step. Episodes are matched to TMDB and numbered correctly even when a season is split across several discs.
- **Manual Rename** — file a disc under any exact name you type, with no TMDB match required, so an alternate cut (e.g. a “Super Duper Cut”) no longer collides with an already-ripped title.

_This release aligns all components to 1.6.9; only autorip changed._

## 1.6.8

<small>2026-08-21</small>

**Autorip**
- Webhooks now fire per pipeline stage — **Rip** (the disc is read and the drive is free), **Mux** (the MKV is produced), and **Move** (the file lands in your library) — each independently selectable per hook
- The **Rip** notification now arrives the moment the drive is free, so you can load the next disc while the mux keeps running in the background — instead of only arriving once the mux had finished
- The Ripper tab's "still working in the background" banner now also shows while a file is being moved, not just while muxing

_This release aligns all components to 1.6.8; only autorip changed._

## 1.6.7

<small>2026-08-21</small>

**Autorip**
- Each webhook can now choose whether it fires on rip complete, move complete, or both
- The Move card shows a separate progress bar for every moved file — the movie and its kept ISO each get their own
- A title that is being moved is no longer listed twice in the Move card
- A failed webhook now logs the real reason (e.g. the connection was reset) instead of a generic "uncategorized error"

_This release aligns all components to 1.6.7; only autorip changed._

## 1.6.6

<small>2026-08-20</small>

**Autorip**
- Webhooks can now point at your LAN (e.g. a Home Assistant automation) — the private-address guard no longer blocks them

_This release aligns all components to 1.6.6; only autorip changed._

## 1.6.5

<small>2026-08-20</small>

**Autorip**
- Mobile-friendly dashboard
- Save the intermediate or whole-disc ISO to a dedicated ISO folder
- Rips made without a TMDB key now land in your movie library
- Failed review actions now show an error instead of looking like they worked
- A Stop that times out now says so instead of reporting success
- A resumed box-set disc no longer writes a duplicate copy
- A resumed rip can no longer be muxed short

**Command line & desktop app**
- A re-mux that drops data no longer reports a clean success
- A partly-recovered damaged disc is now reported even without `--multipass`, and the exit code matches
- `-t all` on a disc whose scan failed now errors instead of quietly ripping only the first title
- `--help` now lists every URL scheme the tool accepts; `--language` is documented
- `--language auto` now follows your system language
- Missing error messages no longer print as raw codes like `error.E9056`
- `info mkv://…` now prints its labels in your language
- A crashed rip can no longer report itself as finished
- The CLI and desktop app no longer freeze mid-rip after an earlier hiccup
- A value-taking flag can no longer swallow the URL or flag after it
- Windows: dragging a disc onto the window mid-rip no longer discards the rip
- Windows: File > Exit now honours the "rip still running" check
- The desktop diagnostic log no longer grows without bound

**Languages**
- Chinese (Simplified & Traditional) now display correctly
- `LC_ALL=C` is now honoured over `LC_MESSAGES`
- 22 more messages translated across 29 languages

**Discs & decoding**
- Fixes a Blu-ray whose title end could look cut off
- Fixes swapped DVD subtitle colours
- Audio/subtitle tracks in many languages no longer show as "undefined"
- A split HD-DVD feature can no longer be exported as half the film
- A Blu-ray title with an unreadable clip can no longer be exported short
- A decrypted HD-DVD is no longer refused with a DVD copy-protection error
- Stopping a scan can no longer make a disc look like it holds fewer titles
- A failed read can no longer be papered over and reported complete
- An ISO backup of an intact movie is no longer flagged seriously damaged
- Cancelling a rip now keeps the sectors already recovered
- A corrupt recovery mapfile is now refused instead of silently trusted

**Security**
- `--share` now requires an explicit yes — a bare Enter declines
- A failed settings save no longer leaves a plaintext token on disk
- Disc-supplied text can no longer smuggle control characters into logs
- Hardened the disc-emulator test tool against malicious profiles

## 1.6.4

<small>2026-08-15</small>

**Autorip**
- A stalled upload can no longer restart the service mid-rip
- The main log no longer grows for the life of the container
- A redirected webhook is no longer reported as delivered

**Command line & desktop app**
- A freshly opened disc now shows the title you want, not the bottom of the list
- Unticking a track under one title no longer leaves it ripping under another
- A damaged-disc recovery can no longer write the wrong film under the right name
- Decrypting an image over its own source file is now refused
- A video-only title's checkbox no longer shows and toggles backwards
- The key-database download no longer hangs forever on a slow mirror
- A fresh install can now rip from a drive or ISO out of the box
- The window no longer freezes while probing the drive at launch

**Discs & decoding**
- Fixes a Blu-ray/UHD title whose sound ran on about half a minute past the picture
- A multi-title-set DVD can no longer be decrypted under the wrong key
- A disc with an all-zero language code no longer aborts track export
- A power-cycle-recoverable drive wedge is no longer written off as permanent data loss
- A rip cancelled seconds in no longer reports a healthy disc as seriously damaged

## 1.6.3

<small>2026-08-10</small>

**Command line & desktop app**
- Install with Homebrew on macOS and Linux (`brew install freemkv/tap/freemkv`)
- Asking for forced subtitles in one language no longer ticks several others
- The log can now be shown and hidden while a rip is running
- Hiding the log no longer leaves a blank band across the window (macOS)
- "Whole disc → ISO image" now works on a disc image
- Preferred-language settings are now pick-lists instead of free text

## 1.6.2

<small>2026-08-08</small>

**Autorip**
- Set preferred audio, subtitle and forced-subtitle languages once instead of per disc

**Command line & desktop app**
- Set preferred track languages once instead of on every disc

**Discs & decoding**
- Fixes a stray moment of sound at the end of an HD-DVD title
- Fixes a click at every chapter break on a DVD

## 1.6.1

<small>2026-08-07</small>

**Command line & desktop app**
- Decrypt an existing disc image with `iso://In.iso iso://Out.iso`
- Read an extracted `VIDEO_TS` or `BDMV` folder anywhere an image works, including drag-and-drop
- Windows: the `.zip` now contains the desktop app, not the console tool

**Discs & decoding**
- Fixes Blu-ray titles built from several clips that ran minutes long with drifting sound
- Fixes a decrypted DVD image that could lose most of its title list
- Fixes NTSC DVD chapter marks and durations that ran about 0.1% short

## 1.6.0

<small>2026-08-03</small>

**Command line & desktop app**
- freemkv for Mac — a native desktop app: open a disc or image, tick titles and tracks, press Rip
- One `freemkv` binary is now both the command line and the desktop app
- Pick audio/subtitle tracks by language (`-a` / `-s`)
- True multi-pass damaged-disc recovery in the desktop app
- Per-track-kind export in the desktop picker (video / audio / subtitle only)
- Ripping now defaults to the main title only — add `-t all` for every title
- Ctrl-C now stops the whole rip, and re-running resumes
- A disc with no key now stops with one clear error instead of repeating it per title
- `stdio://` output is now pure stream data with no text mixed in
- A UTF-8 BOM in `gui-settings.json` no longer wipes your settings
- Key-service outages now report as their own error, not "no key for this disc"

**Languages**
- The desktop app speaks 29 languages, with a live in-app switch

**Discs & decoding**
- Correctly labels forced versus full-dialogue subtitle tracks
- An undecryptable CSS DVD now errors instead of reporting success
- A corrupt `mkv://` input now errors instead of returning an empty result

## 1.5.2

<small>2026-07-22</small>

**Command line**

- The unlock report now labels DVDs as "DVD" instead of "CSS".

**Discs & decoding**

- TrueHD 7.1/Atmos audio is now corrected on AACS-encrypted Blu-ray and UHD discs, instead of falling back to a 5.1 channel count.
- AACS 2.1 menu and extras titles that carry no forensic key now rip using the disc's base key instead of failing.
- Multi-key AACS discs now decrypt each clip with its own key, fixing garbled secondary content.
- CSS DVDs no longer produce garbled output; every read now uses the correct per-title key.
- Scanning a CSS DVD is much faster — about 25 seconds down to about 6.
- A disc that can't be decrypted now stops with an error instead of writing scrambled data or a truncated block out as a broken file.

## 1.5.1

<small>2026-07-20</small>

**Discs & decoding**

- TrueHD audio was being silently dropped entirely (and could send some players into a runaway memory spiral); it is fixed. Titles ripped while this was broken need a re-rip.
- HD DVD AACS keys are now found whatever directory and filename layout the studio used, not just the most common one.
- HD DVD discs with more than one protected title now decrypt all of them instead of just the first.
- A disc with marginal, barely-readable spots no longer "rips clean" while hiding corrupted data; those spots are now retried and either recover or are reported as an honest gap.

## 1.5.0

<small>2026-07-19</small>

**Command line**

- New MP4 output — rip straight to a play-everywhere MP4 with no external transcoder. It's a compatibility export: tracks MP4 can't hold (TrueHD, LPCM, bitmap subtitles) are listed and excluded rather than silently dropped.
- MP4 can now also be used as a source, for a frame-exact round trip into any other format.
- Five new single-part exports: video-only, audio-only, and subtitle-only files, a chapter-markers sidecar, and a full title-structure JSON.

**Discs & decoding**

- Forced subtitles can now be detected from the subtitle content itself, so discs that don't flag them are handled correctly too.
- Corrupt audio frames are now dropped cleanly instead of muxed as glitches, across every audio format, while keeping picture and sound in sync.
- TrueHD: brief bursts of stream damage no longer throw away a whole track or shift the audio that follows.
- Uncommon free-format MP2/MP3 audio is no longer rejected.

## 1.4.5

<small>2026-07-18</small>

**Discs & decoding**

- AACS 2.1 forensic discs now produce a clean stream, instead of visible playback glitches and dropped frames around each forensic segment.
- A decryption key written with an uppercase prefix is no longer silently ignored.

**Security**

- Decryption keys can no longer end up in a log or crash message.

## 1.4.4

<small>2026-07-17</small>

**Discs & decoding**

- Online key lookups were sometimes skipped before ever reaching the key service; they now run reliably.

## 1.4.3

<small>2026-07-17</small>

**Discs & decoding**

- The online key service can now return a full forensic key set as well as a single key.

## 1.4.2

<small>2026-07-15</small>

**Discs & decoding**

- Fixed a bug where content that decrypted fine but didn't parse as clean video could blank out good picture and repeatedly re-query the key server for a key it already had.

## 1.4.1

<small>2026-07-14</small>

**Discs & decoding**

- A single bad packet no longer causes a whole block of good video to be discarded.
- A track is now flagged 3D only when that information is actually present on the disc.

## 1.4.0

<small>2026-07-13</small>

**Discs & decoding**

- Blu-ray 3D (MVC) support — a 3D disc rips to a single MKV that preserves both eyes, with no transcoding or side-by-side conversion. The 2D view is byte-identical to a standard 2D rip.

## 1.3.2

<small>2026-07-10</small>

**Discs & decoding**

- Better recognition of AACS 2.1 forensic-variant discs, ahead of full decryption support.

## 1.3.1

<small>2026-07-10</small>

**Discs & decoding**

- HD-DVD titles now use the disc's own playlist for clip order, duration, name, and chapters instead of guessing from filenames, with the old guess kept as a fallback.

**Project**

- Relicensed to the MIT License from 1.3.1 onward (releases through 1.3.0 remain AGPL-3.0).

## 1.3.0

<small>2026-07-08</small>

**Discs & decoding**

- AACS 2.1 (FMTS) discs are now recognized as their own format and mostly rip, with only the not-yet-supported forensic segments skipped.
- Initial HD-DVD support — HD-DVD is detected as its own format and its video and audio rip through the pipeline. Title composition is still a best guess, so a disc that authors two features under one naming scheme may show as a single title.
- Older program-stream video (H.264, VC-1, HEVC on HD-DVD and older discs) now gets correct per-frame timestamps.
- The main feature is now picked by physical size, so a disc that splits its feature across many small clips is no longer passed over for a shorter composite.
- More reliable track-label detection across differing disc authoring, with a last-resort fallback that reads menu-artwork languages.

**Security**

- Disc metadata (title, labels) is now cleaned before it's printed, so a malicious disc can't inject terminal control sequences.

## 1.2.2

<small>2026-07-04</small>

**Discs & decoding**

- AACS 2.1 Media Key Variant support now matches real variant discs.
- Fixed AACS device-key fallback that had been silently broken.
- Resolving the AACS processing key on UHD discs is roughly 15× faster — about 37 seconds down to about 2.4.

## 1.2.1

<small>2026-07-02</small>

**Discs & decoding**

- DVD DTS audio no longer muxes with timestamps that some strict players rejected.

## 1.2.0

<small>2026-07-01</small>

**Command line**

- Progress now includes a per-range breakdown of damage — chapter, movie-time offset, and at-risk time.
- A rip now reports which unlock mechanisms (firmware, AACS, CSS) actually ran.

**Discs & decoding**

- Damaged-disc recovery now tries a wider set of techniques, re-ranked per disc by what's actually working.
- Added an optional recovery mode for discs with heavily hardened damage.
- A new "fast capture" pass grabs every readable block first, before falling back to slower per-sector recovery.
- A block that genuinely can't be decrypted is now concealed cleanly so the file still plays, instead of writing broken data.
- Recovery can no longer hang forever on a wedged drive.
- Every DVD now rips at full speed — a drive speed-up had been skipped for DVDs.
- DVD DTS/LPCM tracks that weren't the disc's first audio no longer come out silent.
- Real video is no longer dropped at the end of an encrypted fragment.
- Audio no longer corrupts across a stream discontinuity.
- Online key lookups for disc images now send the required data, instead of every request being rejected.
- Discs using an older AACS version now read their keys correctly.
- Fixed a possible crash on a corrupt disc.

## 1.1.0

<small>2026-06-28</small>

**Command line**

- Every user-facing error now shows an error code, with a new Error Codes reference page listing the cause and next steps for each, in all supported languages.
- Windows-reserved filenames on a disc are now safely renamed on extraction instead of aborting.

**Discs & decoding**

- Every decrypted unit is now verified before it's accepted, catching a class of silent bad read.
- Stricter AACS acceptance, so a wrong key can't coincidentally pass and quietly corrupt output.
- DVD rips now start on the actual movie instead of the disc's menu screens.
- Multi-part files in folder extraction no longer have later parts written as empty holes.
- Fixed a rare false frame-split in DTS-HD Master Audio.
- Fixed TrueHD timestamps stepping backward under certain source timing.
- Fixed several container-metadata issues (color info, subtitle wipe, sidecar alignment).

**Security**

- Fixed a misread flag that could defeat a safety check meant to refuse decrypting encrypted-bus content with no bus key.

## 1.0.0

<small>2026-06-24</small>

First stable release.

- A command-line tool that rips optical discs to MKV.
- Decrypts DVDs (CSS — including keyless recovery, with no key database needed), Blu-ray, and UHD (AACS 1.0/2.0).
- Keys are resolved from a local key database and verified against real disc content before use.
- Multipass recovery reads through bad sectors on scratched or damaged discs, and can resume after an interruption.
- MKV output from a fast threaded pipeline, with support for HEVC, H.264, VC-1, MPEG-2, TrueHD, DTS(-HD), and PGS subtitles.
- Can also write a decrypted file tree or a whole-disc ISO image.
- Works across Windows, macOS, and Linux.
