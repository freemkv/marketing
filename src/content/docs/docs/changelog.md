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
