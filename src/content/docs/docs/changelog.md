---
title: Changelog
description: What's new in freemkv — the command line, the desktop app, and autorip — newest first.
---

<a href="/docs/changelog/rss.xml" aria-label="Subscribe via RSS" title="Subscribe via RSS" style="display:inline-flex;align-items:center"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="#f26522" aria-hidden="true"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20A2.18 2.18 0 0 1 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 4.95a10.61 10.61 0 0 1 10.61 10.61h-2.83A7.78 7.78 0 0 0 4 12.22V9.39Z"/></svg></a>

What's new across freemkv — the command line, the desktop app, and the
autorip service — newest first. Every release ships all three together under
one version number.

For the full technical detail behind a release, see the per-component notes:
[freemkv releases](https://github.com/freemkv/freemkv/releases) ·
[autorip releases](https://github.com/freemkv/autorip/releases).

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
