---
title: MKV Output
description: freemkv writes a finished, library-ready MKV with named and tagged tracks, language flags, default/forced markers, named chapters, and a title. Not a raw demux.
---

This page describes what's inside the MKV freemkv produces, so you know what to
expect when the rip finishes.

freemkv writes a **finished, library-ready MKV** with named tracks, language tags,
default and forced flags, named chapters, and a title. Drop it into Plex,
Jellyfin, Kodi, or Infuse and it reads right, with no pass through a tag editor.

This same output is produced whether you rip with the [CLI](/cli/) or let
[autorip](/autorip/) do it automatically on disc insert.

## Track names

Each audio and video track carries a human-readable **name** (the
Matroska track name field), built from the disc's own playlist and authoring data.

**Audio tracks** are labeled with the name you'd recognize, plus channel layout
where known:

- `Dolby TrueHD 7.1`, `Dolby Atmos`, `Dolby Digital Plus 5.1`, `Dolby Digital 5.1`
- `DTS-HD Master Audio 7.1`, `DTS:X`, `DTS-HD High Resolution`, `DTS 5.1`
- `LPCM 2.0`

When the disc's authoring data identifies an immersive format, freemkv keeps
that richer descriptor (`Dolby Atmos`, `DTS:X`) rather than flattening to the
underlying carrier codec. Where the disc distinguishes regional variants (for
example Brazilian versus Castilian Portuguese), the variant marker is carried
through.

freemkv also **sanity-checks** the disc's label against the actual bitstream. If
authoring data claims a codec that contradicts the real stream, freemkv ignores
the bad label and derives the descriptor from the stream itself, so the track
name is always true to what's inside. When a disc carries no label at all,
freemkv still generates a correct codec-and-channels name, so you never get a
blank, anonymous track.

**Video tracks** get codec, resolution (`4K`, `1080p`, `720p`...), and HDR format
when present, for example `HEVC 4K HDR10` or `HEVC 4K Dolby Vision`.

When a disc carries a **Dolby Vision** enhancement layer (a second video stream
alongside the base picture), freemkv finds it in the playlist data and carries
it through to the MKV, preserving the dynamic-range metadata.

## Language tags

Every track carries its **language tag** (the Matroska language field), read
from the disc's per-stream metadata. Your player's automatic audio- and
subtitle-selection ("always play English audio, French forced subtitles") works
out of the box.

## Default and forced flags

freemkv sets the track flags your player relies on:

- **Default track.** Video and audio tracks are marked default — except
  secondary streams (picture-in-picture video, secondary audio) the disc flags
  as such — so the right track plays without you touching the menu.
- **Forced subtitles.** Tracks the disc marks as forced (on-screen foreign
  dialogue, signs) are written with the forced flag set, so players display them
  automatically over the matching audio without turning on full subtitles.

## Chapters

Chapters are preserved with their **names**, not just timestamps, so scrubbing
and chapter navigation show the real chapter titles from the disc.

## Title metadata

The MKV is stamped with the disc **title** and a writing-application tag
identifying the freemkv build that produced it (visible in MediaInfo as
"Writing application").

## Next steps

- Rip a disc yourself with the [CLI](/cli/).
- Set up hands-free ripping with [autorip](/autorip/).
