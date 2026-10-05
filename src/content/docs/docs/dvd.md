---
title: DVD-Video
description: A reference for the DVD-Video disc format — the physical and logical layout, the UDF and ISO 9660 filesystem, the VIDEO_TS tree and its IFO tables, the navigation model, the MPEG-2 program stream and its elementary streams, text data, region coding, and the CSS, CPRM and Macrovision protections.
---

DVD-Video is a **disc format**: a physical medium, a filesystem, a set of navigation tables, and
a stream layout. It is the ancestor of the [HD DVD](/docs/hddvd/) Standard Content model, which
reuses its Video Manager, Video Title Set, Program Chain, cell and navigation-pack structures at
higher bit rates. This page documents the DVD-Video format itself, then the copy-protection
mechanisms associated with DVD media.

## Physical and logical basics

A DVD is a 120 mm disc (an 80 mm variant exists), 1.2 mm thick, built from two 0.6 mm
substrates bonded together. It is read with a 650 nm laser. Data is organized in **2048-byte
logical sectors**; on disc, 16 sectors are grouped into one **32 KB ECC block** protected by a
Reed-Solomon product code. Each sector is carried as a 2064-byte data frame: a 12-byte header,
2048 bytes of main data, and a 4-byte error-detection code.

### Disc types

| Type | Sides | Layers per side | Nominal capacity |
|---|---|---|---|
| DVD-5 | 1 | 1 | 4.7 GB |
| DVD-9 | 1 | 2 | 8.5 GB |
| DVD-10 | 2 | 1 | 9.4 GB |
| DVD-18 | 2 | 2 | 17 GB |

Capacities are in decimal gigabytes. Double-sided discs (DVD-10, DVD-18) are read by flipping
the disc over; each side is an independent volume.

### Dual-layer track paths

A dual-layer side can be laid out in one of two ways:

- **PTP (Parallel Track Path)** — both layers are read from the inside of the disc to the
  outside. The second layer's addresses restart at the inside. Used for discs whose layers hold
  independent content.
- **OTP (Opposite Track Path)** — the first layer is read inside to outside, then the pickup
  refocuses on the second layer and reads it outside to inside. The two layers form one
  continuous address space, and the point where reading switches layers is the **layer break**.
  DVD-Video dual-layer movie discs use OTP.

### Filesystem

DVD-Video uses the **UDF 1.02** filesystem, with an **ISO 9660** structure written alongside it
as a bridge so that older readers can still see the files. The disc root contains two
directories:

```
/  (UDF 1.02 + ISO 9660, 2048-byte sectors)
├── VIDEO_TS/    The DVD-Video content (.IFO .BUP .VOB)
└── AUDIO_TS/    Reserved for DVD-Audio; empty on a DVD-Video disc
```

The files in `VIDEO_TS` are stored contiguously, and the format caps each file at 1 GiB, which is
why title content is split across several VOB files as described below.

**Edge cases in the UDF structures**

- A single UDF allocation descriptor carries a 30-bit length, so one extent covers at most
  2^30 − 2048 bytes (`0x3FFFF800`, a whole number of sectors). A file of the full 1 GiB is
  therefore described by two or more consecutive descriptors.
- The top two bits of the same length field give the extent type: 0 = recorded and allocated,
  1 = allocated but not recorded, 2 = neither, 3 = continuation of the descriptor list. A file's
  first descriptor can be type 1: its address is where space is reserved, not where data lives, and
  the extent reads as zeros. The hole occupies logical file offsets; subsequent recorded extents must not be shifted
  down over it. An IFO with a leading hole does not have a valid header at file offset zero.
  Resolve file offsets through the allocation descriptors before deriving disc addresses.
- UDF 1.02 describes files and directories with a File Entry (descriptor tag 261: extended
  attribute length at byte 168, allocation descriptors from byte 176 plus that length). The
  Extended File Entry (tag 266: lengths at byte 208, descriptors from byte 216) belongs to later
  UDF revisions.
- The Main Volume Descriptor Sequence is located through the Anchor Volume Descriptor Pointer at
  sector 256, not at a fixed sector number.
- A UDF directory lists its files in the order the authoring tool wrote them, not in playback
  order. Playback order of the title VOBs is the order of their numbers `_1` to `_9`.

## VIDEO_TS structure

A disc consists of one **Video Manager (VMG)** and from 1 to 99 **Video Title Sets (VTS)**.
The VMG holds disc-level information and the top-level menus. Each VTS holds a group of titles
that share a common set of attributes (video format, audio and subpicture stream layout) plus
that group's own menus.

| File | Role |
|---|---|
| `VIDEO_TS.IFO` | Video Manager Information (VMGI) — disc-level control tables |
| `VIDEO_TS.BUP` | Backup copy of `VIDEO_TS.IFO` |
| `VIDEO_TS.VOB` | Video Manager menu objects (disc-level menus) |
| `VTS_nn_0.IFO` | Video Title Set Information (VTSI) for title set `nn` (01–99) |
| `VTS_nn_0.BUP` | Backup copy of `VTS_nn_0.IFO` |
| `VTS_nn_0.VOB` | Menu objects for title set `nn` |
| `VTS_nn_1.VOB` … `VTS_nn_9.VOB` | Title objects for title set `nn` |

A **VOB** (Video Object) is an MPEG-2 Program Stream. The title VOBs of one VTS are logically
one continuous stream that is divided into files of at most 1 GiB each, up to nine files
(`_1` through `_9`); the files are concatenated in numeric order. A **BUP** file is a
byte-for-byte copy of the matching IFO, kept so that a damaged IFO can be recovered.

## IFO structures

An IFO contains top-level tables located by sector pointers and nested structures located
by byte offsets. Not every structure starts on a sector boundary; the First Play PGC, for
example, has a byte-addressed pointer. The first
sector holds a **management table** that begins with a 12-byte identifier —
`DVDVIDEO-VMG` for `VIDEO_TS.IFO`, `DVDVIDEO-VTS` for a `VTS_nn_0.IFO` — followed by the
specification version, attributes, and the **sector pointers** that locate every other table
in the file. Pointers to tables are expressed in sectors relative to the start of the IFO file;
the addresses inside tables that refer to VOB data are expressed in sectors relative to the
start of the VOB set.

### Video Manager Information (VMGI)

| Table | Contents |
|---|---|
| `VMGI_MAT` | Management table: identifier, version, region mask, number of VTSs, pointers to every other table, the First Play PGC, and the VMG menu video, audio and subpicture attributes |
| `TT_SRPT` | Title search pointer table: one entry per title (see below) |
| `VMGM_PGCI_UT` | Menu PGC information, organized by menu language |
| `PTL_MAIT` | Parental management information table |
| `VTS_ATRT` | Attributes of every VTS on the disc, so that the VMG can know a title set's video and stream layout without opening its IFO |
| `TXTDT_MG` | Text data manager (disc, title and chapter names; see [Text data](#text-data-txtdt)) |
| `VMGM_C_ADT` | Cell address table for the VMG menu VOB |
| `VMGM_VOBU_ADMAP` | VOBU address map for the VMG menu VOB |

The **`TT_SRPT`** holds one **12-byte entry per title**, up to 99 titles per disc. Each entry
records the title type (including how the title may be entered and whether it has multiple
angles), the **number of angles**, the **number of chapters (PTTs)**, the parental ID mask, the
**VTS number** the title lives in, the **title number within that VTS** (VTS_TTN), and the
start sector of that VTS. Its layout:

| Offset | Size | Field |
|---|---|---|
| 0x00 | 2 | Number of titles (at most 99) |
| 0x08 | 12 each | Title entries, in disc title order (title 1 first) |

| Entry offset | Size | Field |
|---|---|---|
| +2 | 2 | Number of chapters (PTTs) in the title |
| +6 | 1 | VTS number (1-based) |
| +7 | 1 | Title number within that VTS, VTS_TTN (1-based) |

Two entries with the same VTS number and VTS_TTN resolve to the same content.

### Video Title Set Information (VTSI)

| Table | Contents |
|---|---|
| `VTSI_MAT` | Management table: identifier, version, pointers to every other table, and the video, audio (up to 8) and subpicture (up to 32) attributes of both the menu and title domains |
| `VTS_PTT_SRPT` | Part-of-Title search pointer table: for each title, the list of chapters, each as a (PGC number, program number) pair |
| `VTS_PGCIT` | The PGC information table for the title domain: every PGC in the title set |
| `VTSM_PGCI_UT` | Menu PGC information, organized by menu language |
| `VTS_TMAPTI` | Time map table: time-to-sector lookup used for time search |
| `VTSM_C_ADT` | Cell address table for the menu VOB |
| `VTSM_VOBU_ADMAP` | VOBU address map for the menu VOB |
| `VTS_C_ADT` | Cell address table for the title VOBs |
| `VTS_VOBU_ADMAP` | VOBU address map for the title VOBs |

- **`C_ADT`** (Cell Address Table) lists each cell by VOB ID and cell ID with its start and end
  sector within the VOB set.
- **`VOBU_ADMAP`** is a flat list of the start sector of every VOBU in the VOB set, in order.
- **`VTS_TMAPTI`** contains one time map per PGC. A time map has entries at a fixed interval
  (1 to 255 seconds, set per map); each entry gives the sector of the VOBU nearest that
  time, so a player can seek by time without scanning.
- **`PGCI_UT`** tables (both `VMGM_` and `VTSM_`) hold one **language unit** per menu language,
  identified by an ISO 639 two-letter code. Each language unit lists its menu PGCs with a menu
  type: title, root, subpicture, audio, angle, or chapter (PTT) menu.

### Fixed field offsets

All multi-byte values in IFO files are big-endian. The management tables hold these fields at
fixed byte offsets from the start of the IFO file.

| File | Offset | Size | Field |
|---|---|---|---|
| `VIDEO_TS.IFO` | 0x00 | 12 | Identifier `DVDVIDEO-VMG` |
| `VIDEO_TS.IFO` | 0x22 | 4 | VMG category: byte 0x23 is the region mask (see [Region codes](#region-codes)) |
| `VIDEO_TS.IFO` | 0x3E | 2 | Number of title sets |
| `VIDEO_TS.IFO` | 0x84 | 4 | Byte offset of the First Play PGC, from the start of the file (0 = none) |
| `VIDEO_TS.IFO` | 0xC0 | 4 | Sector of the menu VOB (`VMGM_VOBS`) |
| `VIDEO_TS.IFO` | 0xC4 | 4 | Sector of `TT_SRPT` |
| `VIDEO_TS.IFO` | 0xD4 | 4 | Sector of `TXTDT_MG` (0 = none) |
| `VTS_nn_0.IFO` | 0x00 | 12 | Identifier `DVDVIDEO-VTS` |
| `VTS_nn_0.IFO` | 0xC0 | 4 | Sector of the menu VOBs (`VTSM_VOBS`) |
| `VTS_nn_0.IFO` | 0xC4 | 4 | Sector of the title VOBs (`VTSTT_VOBS`) |
| `VTS_nn_0.IFO` | 0xC8 | 4 | Sector of `VTS_PTT_SRPT` |
| `VTS_nn_0.IFO` | 0xCC | 4 | Sector of `VTS_PGCIT` |
| `VTS_nn_0.IFO` | 0x200 | 2 | Title-domain video attributes |
| `VTS_nn_0.IFO` | 0x202 | 2 | Number of audio streams (at most 8) |
| `VTS_nn_0.IFO` | 0x204 | 8 each | Audio stream attributes |
| `VTS_nn_0.IFO` | 0x254 | 2 | Number of subpicture streams (at most 32) |
| `VTS_nn_0.IFO` | 0x256 | 6 each | Subpicture stream attributes |

Offset `0xC4` means different things in the two files: in `VIDEO_TS.IFO` it locates a table inside
the same IFO (`TT_SRPT`), while in a `VTS_nn_0.IFO` it locates the title VOBs. Offset `0xC0` is the
menu VOB in both. A title set's menu VOB holds its own menu screens (for example a ratings notice),
so the film does not start there.

Table sectors are counted from the start of the IFO file. The VTS title-VOB sector (`0xC4`) is
also counted from the start of the IFO file, so the absolute disc sector of a VTS's first title
sector is the IFO file's own first sector plus that value.

**Video attributes** (the first byte, at `0x200`):

| Bits | Field | Values |
|---|---|---|
| 7–6 | MPEG version | |
| 5–4 | Video format | 0 = NTSC, 1 = PAL; 2 and 3 are reserved |
| 3–2 | Display aspect ratio | 0 = 4:3, 3 = 16:9; 1 and 2 are reserved |
| 1–0 | Permitted display modes | |

**Audio attributes** (8 bytes per stream):

| Byte | Bits | Field | Values |
|---|---|---|---|
| 0 | 7–5 | Coding mode | 0 = AC-3, 2 = MPEG-1 or MPEG-2 without extension stream, 3 = MPEG-2 with extension stream, 4 = LPCM, 6 = DTS |
| 0 | 4 | Multichannel extension present | |
| 0 | 3–2 | Language type | 0 = unspecified, 1 = language code in bytes 2–3 |
| 0 | 1–0 | Application mode | 0 = unspecified, 1 = karaoke, 2 = surround |
| 1 | 5–4 | Sample frequency | 0 = 48 kHz, 1 = 96 kHz |
| 1 | 2–0 | Channel count minus one | |
| 2–3 | | Language code | Two lowercase ASCII letters (ISO 639-1); `00 00` = unspecified |
| 4 | | Language code extension | Reserved |
| 5 | | Code extension | See the table below |

**Subpicture attributes** (6 bytes per stream):

| Byte | Field | Values |
|---|---|---|
| 0 | Coding mode (bits 7–5), language type (bits 1–0) | Coding mode 0 = 2-bit run-length; language type 0 = unspecified, 1 = language code in bytes 2–3 |
| 2–3 | Language code | Same form as the audio language code |
| 4 | Language code extension | Reserved |
| 5 | Code extension | See the table below |

**Code extension.** Byte 5 of each audio attribute and byte 5 of each subpicture attribute states
what kind of stream it is. Values not listed are unassigned.

| Value | Audio stream | Subpicture stream |
|---|---|---|
| 0 | Not specified | Not specified |
| 1 | Normal | Normal |
| 2 | For the visually impaired | Large |
| 3 | Director's comments | Children |
| 4 | Alternate director's comments | |
| 5 | | Normal captions |
| 6 | | Large captions |
| 7 | | Children's captions |
| 9 | | Forced |
| 13 | | Director's comments |
| 14 | | Large director's comments |
| 15 | | Director's comments for children |

The audio values are the values a player's preferred-audio-extension register (SPRM 17) is
compared against, and the subpicture values are those of the preferred-subpicture-extension
register (SPRM 19). Several streams can carry the same language code and differ only in this
byte, for example a normal track and a director's-comments track in one language. A subpicture
stream with code extension 9 holds forced subpictures (see [Forced subpictures](#forced-subpictures)).

**Language codes.** The code is two lowercase ASCII letters. The language type bits of byte 0
say whether the field is meaningful: when the type is 0 the field is unspecified and can hold
`00 00` or `FF FF`. The code is an ISO 639-1 two-letter code, so it needs mapping to a three-letter code for
use where those are required. Spellings withdrawn from ISO 639-1 also occur: `iw` (Hebrew), `in`
(Indonesian), `ji` (Yiddish), `jw` (Javanese) and `mo` (Moldavian).

**What describes a stream.** The IFO describes an audio stream by coding mode, channel count,
sample rate, language and code extension, and a subpicture stream by language and code extension.
The code extension is the field that marks commentary, caption, visually-impaired or forced
streams; the IFO carries no title text for a stream. A stream's physical ID comes from the PGC stream control,
not from its position in the attribute list.

### Title to PGC resolution

**`VTS_PTT_SRPT`** begins with a 2-byte count of titles at offset 0 and a 4-byte last-byte
address at offset 4. From offset 8 there is one 4-byte offset per title, counted from the start
of the table. Each offset locates that title's list of 4-byte chapter entries, which runs to the
next title's offset (or to the last byte for the final title). The first two bytes of each
chapter entry are the **PGC number** (1-based) of that chapter. The entries of one title may
name different PGCs: a title can be stored as one PGC per chapter.

**`VTS_PGCIT`** begins with a 2-byte PGC count at offset 0. From offset 8 there is one 8-byte
search entry per PGC, in PGC-number order; bytes 4–7 of each entry are the byte offset of that
PGC, counted from the start of `VTS_PGCIT`.

A title is resolved by taking its VTS_TTN, looking up its first chapter entry in
`VTS_PTT_SRPT`, and reading the PGC number from it.

## Navigation model

### Domains

Playback occurs in one of four domains, each with its own PGCs:

| Domain | Purpose |
|---|---|
| First Play (FP) | A single PGC (`FP_PGC`, held in `VMGI_MAT`) that runs when the disc is loaded |
| Video Manager Menu (VMGM) | Disc-level menus, in `VIDEO_TS.VOB` |
| Video Title Set Menu (VTSM) | Per-title-set menus, in `VTS_nn_0.VOB` |
| Title (TT) | The program content, in `VTS_nn_1..9.VOB` |

### Titles, chapters, PGCs, programs and cells

- A **title** is the unit a user selects. Its structure is given in `VTS_PTT_SRPT`.
- A **Part-of-Title (PTT)** is a chapter: a (PGC, program) entry point within the title. A
  title can have more than 99 chapters; do not confuse the disc title limit with the PTT count.
  libdvdread checks for fewer than 1000 PTTs, and the on-disc count is a 16-bit field.
- A **Program Chain (PGC)** is the playback sequence. A PGC groups cells and is the object
  to which navigation commands, stream selections and the palette attach.
- A **program** is a run of consecutive cells within a PGC that marks an entry point. A PGC
  stores its program count in an 8-bit field, and a **program map** lists the first cell of each.
  The program count must not exceed the cell count.
- A **cell** is a contiguous run of VOBUs and the smallest independently addressable playback
  unit. A PGC has up to 255 cells. A cell is identified by its **VOB ID** (16 bits) and **cell
  ID** (8 bits).

A PGC contains:

| Part | Contents |
|---|---|
| General information | Playback time, prohibited user operations, audio and subpicture stream control, next/previous/go-up PGC numbers, still time, and playback mode (sequential, random, shuffle) |
| Palette | 16 colors in YCbCr, 4 bytes each |
| Subpicture control | Per-stream mapping of subpicture streams for each display mode (4:3, wide, letterbox, pan-scan) |
| Command table | Pre-commands, post-commands and cell commands |
| Program map | Entry cell of each program |
| Cell playback information table | One entry per cell |
| Cell position information table | VOB ID and cell ID of each cell |

PGC fields sit at fixed byte offsets from the start of the PGC:

| PGC offset | Size | Field |
|---|---|---|
| 0x02 | 1 | Number of programs |
| 0x03 | 1 | Number of cells |
| 0x04 | 4 | Playback time of the whole PGC (BCD time) |
| 0x0C | 8 × 2 | Audio stream control, one 16-bit entry per logical audio stream |
| 0x1C | 32 × 4 | Subpicture stream control, one 32-bit entry per logical subpicture stream |
| 0xA4 | 16 × 4 | Colour palette |
| 0xE4 | 2 | Offset of the command table, from the start of the PGC (0 = none) |
| 0xE6 | 2 | Offset of the program map, from the start of the PGC (0 = none) |
| 0xE8 | 2 | Offset of the cell playback information table, from the start of the PGC (0 = none) |

For a sequential PGC, sum the cells on the selected playback path, taking one alternative
from each angle block. Summing every angle cell overcounts the duration; commands, stills and
non-sequential playback can also change the time experienced by a viewer.

### BCD time

A playback time is 4 bytes: hours, minutes and seconds each as two BCD digits, then a fourth
byte whose top two bits give the frame rate and whose low six bits are the frame count as BCD.
Frame-rate bits `01` mean 25 frames per second and `11` mean 30000/1001 frames per second; `00`
and `10` are not defined.

**NTSC conversion needs an explicit convention.** freemkv interprets this value as
non-drop-frame **timecode**, not elapsed real time. Under that convention the seconds field advances every 30 frames at the NTSC rate,
so conversion proceeds through a frame count: frames
equal ((hours × 3600 + minutes × 60 + seconds) × 30 + frames) at the NTSC rate, or
(… × 25 + frames) at the PAL rate, and real time is frames × 1001/30000 or frames / 25. This produces a duration 0.1 percent longer than treating the nominal frame count as
30 fps; it must not be applied indiscriminately to every DVD timestamp. A digit above 9 in a field is invalid.

**NTSC timecode drift.** Thirty frames of 1001/30000 s each last 1.001 s, so the timecode runs
0.1 percent behind real time: about 3.6 s per hour, growing with elapsed time (a chapter mark
about 67 minutes in is roughly 4 s early when the fields are read as seconds). Under this interpretation no frame numbers are skipped to compensate. PAL has no such drift, because 25
frames last exactly 1 s. Worked examples at the NTSC rate:

| Timecode | Frames | Real time |
|---|---|---|
| 00:19:58:24 | 35 964 | 1 199.999 s (just under 20 minutes) |
| 01:59:30:00 | 215 100 | 7 177.17 s (7170 s read as seconds) |

This is freemkv's conversion policy, not a settled statement of DVD conformance.
[libdvdnav's `dvdnav_convert_time`](https://code.videolan.org/videolan/libdvdnav/-/blob/master/src/dvdnav.c)
uses literal hours/minutes/seconds and adds the frame component separately; it does not apply
the 1.001 factor to the whole value. Check IFO-derived times against NAV presentation times
and the elementary stream before applying a global NTSC correction. The examples above
describe the frame-count interpretation used in
[freemkv's IFO parser](https://github.com/freemkv/libfreemkv/blob/dev/src/ifo.rs).

### Damaged IFOs

A `VTS_nn_0.BUP` has the same layout and sector pointers as its `VTS_nn_0.IFO`, so when the IFO
is damaged the BUP can be read in its place.

### Cell playback information

The cell playback information table holds one **24-byte entry per cell**, in playback order, at
the PGC offset given by `0xE8`:

| Entry offset | Size | Field |
|---|---|---|
| +0 | 1 | Category (bit fields below) |
| +1 | 1 | Bit 7: playback mode (when set, the player enters still mode after each VOBU); bit 6: restricted |
| +2 | 1 | Still time: 0 = none, 1–254 = seconds, 255 = infinite |
| +3 | 1 | Cell command number |
| +4 | 4 | Cell playback time (BCD time) |
| +8 | 4 | Sector of the first VOBU |
| +20 | 4 | Sector of the last VOBU's last sector (the cell's final sector) |

The remaining bytes hold the end of the first ILVU (+12) and the start of the last VOBU (+16). A
finite still therefore lasts at most 254 s, and a menu or still cell can hold one picture for that
long, so a gap of many seconds between video timestamps in such a cell is content, not a clock
fault. Sector values are counted from the start of the VTS title VOBs
(`VTSTT_VOBS`); a cell spans its first sector through its last sector inclusive.

The category byte:

| Bits | Field | Values |
|---|---|---|
| 7–6 | Block mode | 0 = not in a block, 1 = first cell of the block, 2 = a cell inside the block, 3 = last cell of the block |
| 5–4 | Block type | 0 = not in a block, 1 = angle block |
| 3 | Seamless playback | Seamless playback information is linked in the PCI; the cell can still carry the STC discontinuity flag, so seamless does not imply a continuous clock |
| 2 | Interleaved allocation | The cell's sector range is shared with other cells' interleaved units |
| 1 | STC discontinuity | The system clock restarts at the start of this cell |
| 0 | Seamless angle change | |

A **cell position information** table, with 4 bytes per cell, gives each cell's VOB ID and cell
ID.

### Programs and chapters

The **program map** holds one byte per program, at the PGC offset given by `0xE6`: the 1-based
number of the first cell of that program. A chapter (PTT) points at a program.

Within one sequential PGC, the **start time of a chapter** is the sum of the playback times
of the selected cells that come before
the first cell of its program. The sum is taken in frames at the PGC's frame rate and converted
once, so that chapter marks land on frame boundaries; adding rounded seconds per cell drifts. The
first chapter of that path starts at 0. A title spanning several PGCs also needs the
preceding PGC paths and its navigation behavior; a PGC-local sum is not a title-wide time. A cell that is a non-first piece of an angle block (below)
contributes no time, because only one angle of a block plays; an angle block counts once.

**Chapter names.** A chapter has a name only where the disc supplies one in `TXTDT_MG`. Discs may
omit the text data entirely. A title's chapter names are listed in `TXTDT_MG` in the order of the
chapters as `TT_SRPT` counts them.

### Angles and interleaving

A title can offer up to **nine camera angles**. The cells of an angle block are consecutive
entries in the PGC's cell table: the block's first cell has block mode 1 and block type 1, the
following cells of the block have block mode 2, and the final cell has block mode 3. Each
of these cells is one angle's version of the same scene. The first cell of the block is angle 1;
the cells with block mode 2 and 3 are the other angles. Only one angle plays, so the
other angles' cells are not part of the playback timeline and their durations are not added to the
time of the PGC.

To allow seamless switching, and seamless branching in general, the data of the cells involved is
divided into **Interleaved Units (ILVUs)** that are interleaved on disc: one ILVU from angle 1,
then one from angle 2, and so on, repeating. Cells with the interleaved allocation flag set
therefore do not occupy their sector range alone: the range also holds other cells' units (an
alternate angle, or a second version of a branch).

**Interleaved cells holding another program's units.** The other units need not be camera angles.
A disc can store two language versions of the same programme in one VOB, sharing the picture of
the scenes that are alike and interleaving units only where the versions differ (for example an
English and a German cut of each episode). The cell of one version then spans sectors that also
hold the other version's units. Its first-to-last sector range is not what that cell plays: only
the cell's own units are, and playing every sector mixes the two versions and makes the timeline
jump where they differ.

**Walking interleaved units.** In the DSI of a NAV pack (see [NAV pack](#nav-pack)), two fields
in the seamless playback information give, relative to the NAV pack's own sector, the **last
sector of this interleaved unit** and the **first sector of the next interleaved unit of the same
angle or scene**. The unit therefore occupies the sectors from the NAV pack through the unit-end
sector inclusive. The next unit begins at the NAV pack's sector plus the next-unit offset. The
chain ends when the next-unit offset is `0xFFFFFFFF` (the end of interleaving); both fields are 0
for a non-interleaved unit, so a unit-end offset of 0 is not a valid unit. The chain belongs to
an angle or scene within one VOB, not to a single cell: its units and next-unit pointers can run
past the last sector of a cell, and a cell can begin or end in the middle of a unit. A unit can
hold VOBUs of several consecutive cells of the same VOB. `VTS_C_ADT` lists an interleaved cell as
one entry per interleaved unit, giving the cell's sector pieces; a unit shared by two cells is
listed under both.

### Titles that share cells

A title is nothing more than a PGC's list of cell sector ranges, resolved from `TT_SRPT` and
`VTS_PTT_SRPT`. The tables do not give each title its own data: the cell tables of different
titles, and of different PGCs, can name the same sector ranges, and no field marks a range as
owned by one title. The disc stores each range once. The consequences:

- **Play-all titles.** A title can be the concatenation of other titles' cells. A TV disc usually
  lists each episode as a title, plus one **play-all** title whose cell list contains every
  episode's cell ranges, exactly, one after another. Its runtime is approximately the sum of the
  episodes' runtimes, and its size is larger than any one episode. The episodes it holds start at
  different sectors. Because the play-all repeats the episodes' sectors rather than carrying data
  of its own, adding the sizes of all titles counts the same sectors more than once.
- **Shared opening and closing cells.** Episodes can share a cell, for example an opening
  sequence or an end card; such a cell appears in every episode that uses it and appears once in
  the play-all. Sharing one cell does not make a title a play-all: a title is a play-all of another
  only when its cell list holds all of that title's cell ranges. Two cuts that share most of their
  sectors but not all overlap partially, so neither contains the other.
- **Parts that are not episodes.** A short title inside a play-all, such as a logo or a recap, is
  contained by it without being an episode.
- **The same episode twice.** A disc can list one episode more than once, for example with a
  different audio track set. These titles begin at the same sector and may list identical cell
  ranges and the same duration. An episode that merely opens on the same intro clip as another has
  a different cell list and is different content.
- **Decoy and duplicate titles.** Some discs list many titles whose cell lists are identical to the
  feature's; none is smaller than another, so none contains the others. A title with no cell
  ranges has no identity at all.

### Registers

The navigation machine has two register banks, both 16 bits wide:

- **16 General Parameter Registers (GPRM 0–15)** — scratch storage for disc authors. A GPRM
  can operate as a normal register or as a **counter** that counts elapsed time.
- **24 System Parameter Registers (SPRM 0–23)** — player state. Selected entries:

| SPRM | Meaning |
|---|---|
| 0 | Menu language |
| 1 | Audio stream number |
| 2 | Subpicture stream number and display flag |
| 3 | Angle number |
| 4 | Title number |
| 5 | Title number within the VTS |
| 6 | Current PGC number |
| 7 | Part-of-Title (chapter) number |
| 8 | Highlighted button |
| 12 | Parental management country code |
| 13 | Parental level |
| 20 | Player region code |

### Navigation commands

Navigation commands are **8 bytes** each. They are stored in a PGC's command table (pre-,
post- and cell commands) and in the highlight button definitions of the NAV pack. The command
set provides:

- **Compare and branch** — conditions on registers or immediates, with `Goto` and `Break`.
- **Set** — arithmetic and logic on GPRMs, and setting of system state such as audio stream,
  subpicture stream, angle, and parental level.
- **Link** — move within the current domain (to a PGC, program, cell, or the previous or next
  of these).
- **Jump** — leave the current domain to a title, a specific title in a VTS, a PGC, or a menu.
- **Call** — enter a menu from the title domain, with a resume point so that playback can
  return afterward.

Commands that combine a Set with a Link exist in a single 8-byte form.

#### Command tables

A PGC's command table is located by the 16-bit offset at PGC `0xE4`. Its first 16-bit field is
the number of pre-commands; the commands themselves follow from table offset 8, 8 bytes each. The
pre, post and cell command lists together hold at most 128 commands. The First Play PGC of `VIDEO_TS.IFO` is read the
same way; its pre-commands may select a title directly with a `JumpTT` (commonly a logo or
warning title rather than the feature) or jump to a menu.

#### Command encoding

The 8 bytes read as a big-endian value. Byte numbers below are counted from 0.

| Byte 0 bits 7–5 | Command family |
|---|---|
| 0 | Special: Goto, Break, SetTmpPML |
| 1 | Link (bit 4 = 0) or Jump/Call (bit 4 = 1) |
| 2 | SetSystem |
| 3 | SetGPRM |
| 4–6 | Compound forms that combine a Set with a Compare and a Link |

Byte 1 bits 3–0 select the sub-command within a family. Byte 1 bits 6–4 hold an optional
**compare operator** that guards the command; when the comparison is false the command has no
effect and execution continues with the next line. Byte 1 bit 7 says whether the right-hand
operand is an immediate.

| Compare operator | Meaning |
|---|---|
| 0 | No comparison (always executes) |
| 1 | Bitwise AND is non-zero |
| 2 | Equal |
| 3 | Not equal |
| 4 | Greater than or equal |
| 5 | Greater than |
| 6 | Less than or equal |
| 7 | Less than |

The compare operands sit in different bytes by family:

| Family | Left register | Right operand |
|---|---|---|
| Special, Link | byte 3 | immediate in bytes 4–5, or register in byte 5 |
| Jump/Call, SetSystem | byte 6 | register in byte 7 |
| SetGPRM | byte 2 | immediate in bytes 6–7, or register in byte 7 |

A register operand below 16 names a GPRM; a value of `0x80` or more names SPRM number (value
minus `0x80`).

| Family | Sub-command (byte 1 bits 3–0) | Operands |
|---|---|---|
| Special | 1 Goto | line number in byte 7 (1-based, within the same list) |
| Special | 2 Break | ends the list |
| Special | 3 SetTmpPML | sets the parental level in SPRM 13, then goes to the line in byte 7 |
| Jump | 1 Exit | |
| Jump | 2 JumpTT | VMG title number in byte 5 (low 7 bits) |
| Jump | 3 JumpVTS_TT | title number within the current VTS in byte 5 (low 7 bits) |
| Jump | 5 JumpVTS_PTT | title number in byte 5 (low 7 bits), chapter in bytes 2–3 (low 10 bits) |
| Jump | 6 JumpSS | target in byte 5 bits 7–6: 0 First Play; 1 VMG menu (menu id in byte 5 low 4 bits); 2 VTS menu (VTS number in byte 4, title in byte 3, menu id in byte 5 low 4 bits); 3 a VMG menu PGC (PGC number in bytes 2–3, low 15 bits) |
| Jump | 8 CallSS | target selector in byte 5 bits 7–6 |
| Link | 1 LinkSub | link code in byte 7 (low 5 bits); codes above `0x10` are undefined |
| Link | 4 LinkPGCN | PGC number in bytes 6–7 (low 15 bits) |
| Link | 5 LinkPTTN | chapter in bytes 6–7 (low 10 bits) |
| Link | 6 LinkPGN | program number in byte 7 (low 7 bits) |
| Link | 7 LinkCN | cell number in byte 7 |

A Link with sub-command 0 links nowhere. SetSystem and SetGPRM commands also carry a trailing link
in byte 1 bits 3–0, using the same codes as the Link family.

**SetGPRM.** Byte 0 bit 4 says whether the source value is an immediate (bytes 4–5) or a register
(byte 5); the destination GPRM is the low 4 bits of byte 3; byte 0 bits 3–0 give the operation:

| Operation | Meaning |
|---|---|
| 1 | Move |
| 2 | Swap: exchange the destination with the register named by the low 4 bits of byte 5 |
| 3 | Add |
| 4 | Subtract |
| 5 | Multiply |
| 6 | Divide |
| 7 | Modulo |
| 8 | Random |
| 9 | AND |
| 10 | OR |
| 11 | XOR |

Reference players saturate addition and multiplication at `0xFFFF`, clamp subtraction at 0, and
return `0xFFFF` for division or modulo by zero.

**SetSystem.** Byte 0 bits 3–0 give the operation. Operation 3 is **SetGPRMMD**: it stores a value
(an immediate in bytes 2–3, or the register in byte 3, chosen by byte 0 bit 4) into the GPRM given
by the low 4 bits of byte 5, and sets that register's mode from byte 5 bit 7 (1 = counter mode,
where the register counts elapsed time). The mode is applied even when the command's compare is false.
The other SetSystem operations write SPRMs.

## Program stream

A VOB is an **MPEG-2 Program Stream** made of **2048-byte packs**, one pack per sector. Each
pack begins with a 14-byte pack header (start code `00 00 01 BA`) carrying the
**System Clock Reference (SCR)**: a 33-bit base counting at 90 kHz plus a 9-bit extension at
27 MHz. The combined multiplex rate is limited to 10.08 Mbit/s, of which video may use at most
9.8 Mbit/s.

### Video Object Units

A VOB is divided into **VOBUs**. A VOBU holds a whole number of video groups of pictures
and nominally covers between 0.4 and 1.0 second of presentation time. It starts with a
**NAV pack**, and its video begins with a sequence header and an I-picture, so a VOBU is an
entry point for random access. A cell is a run of whole VOBUs.

### NAV pack

The NAV pack is the first pack of every VOBU. It contains a pack header, a system header, and
two packets on `private_stream_2` (stream ID `0xBF`). A sector is a NAV pack when it starts with
the pack start code `00 00 01 BA`, has the start code `00 00 01 BF` at byte `0x400`, and has
sub-stream ID `0x01` at byte `0x406`. The **PCI** packet comes first, in the space after the
system header; the **DSI** packet starts at byte `0x400` of the pack and runs to the end of the
sector. Each packet's data begins with a one-byte sub-stream ID after its 6-byte PES header, so
the DSI data starts at pack byte `0x407`.

- **PCI (Presentation Control Information)**, sub-stream ID `0x00`:
  - **PCI_GI** — general information: the pack's logical block number, a VOBU category field
    (which includes the Macrovision APS bits), user operation control, the VOBU start and end
    presentation times, and the elapsed time of the cell.
  - **NSML_AGLI** — angle information for non-seamless angle changes.
  - **HLI** — highlight information for menus: button groups, up to 36 buttons, the position,
    colour and contrast selection of each, and each button's navigation command.
- **DSI (Data Search Information)**, sub-stream ID `0x01`:
  - **DSI_GI** — general information: the NAV pack's SCR and logical block number, the
    end addresses of the VOBU and of its first, second and third reference pictures, and the
    VOB ID and cell ID.
  - **SML_PBI** — seamless playback information, including the ILVU addresses and sizes.
  - **SML_AGLI** — angle information for seamless angle changes, with a destination address for
    each of the nine angles.
  - **VOBU_SRI** — search information: relative addresses of VOBUs at forward and backward
    time offsets, for fast play.
  - **SYNCI** — synchronisation information tying audio and subpicture packets to the VOBU.

**PCI_GI**, counted from the first byte after the PCI sub-stream ID:

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | Logical block number of this NAV pack |
| 4 | 2 | VOBU category |
| 6 | 2 | Reserved |
| 8 | 4 | User operation control |
| 12 | 4 | VOBU start presentation time (90 kHz) |
| 16 | 4 | VOBU end presentation time (90 kHz) |

**DSI_GI**, counted from the first byte after the DSI sub-stream ID (it is 32 bytes long):

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | SCR of this NAV pack |
| 4 | 4 | Logical block number of this NAV pack |
| 8 | 4 | End address of the VOBU |
| 12 | 4 | End address of the first reference picture |
| 16 | 4 | End address of the second reference picture |
| 20 | 4 | End address of the third reference picture |
| 24 | 2 | VOB ID |
| 26 | 1 | Reserved |
| 27 | 1 | Cell ID |

**SML_PBI** follows DSI_GI directly, at DSI offset 32:

| SML_PBI offset | Size | Field |
|---|---|---|
| 0 | 2 | Category flags |
| 2 | 4 | End of this interleaved unit, in sectors from this NAV pack |
| 6 | 4 | Start of the next interleaved unit, in sectors from this NAV pack; `0xFFFFFFFF` means there is none (0 in a non-interleaved unit); `0x7FFFFFFF` is the corresponding "none" value of the SML_AGLI angle entries |

**Which cell a VOBU belongs to.** The VOB ID and cell ID in DSI_GI name the cell that owns the
VOBU. The first NAV pack of a cell names that cell. Where the sector range of one cell also holds
interleaved units of another program, a NAV pack that names a different pair opens a VOBU of
another cell; within a unit shared by two cells of the same VOB, these IDs place the boundary.

### Timestamps

Elementary-stream packets carry **PTS** (and, for video with reordered pictures, **DTS**)
values on the 90 kHz clock. A PTS or DTS is a 5-byte field of 33 bits with a marker bit that
must be set at the end of bytes 0, 2 and 4; a field with a cleared marker is malformed. The
PES header carrying them has its PTS/DTS flags in the top two bits of its second flags byte:
`10` = PTS only, `11` = PTS and DTS; the PTS follows the 3-byte fixed part of the PES header
(flags, flags, header length), and the DTS follows the PTS.

**Clock restarts.** Each VOB, and each cell whose STC discontinuity flag is set, may restart the
system clock, so PTS values are continuous only within a stretch of seamless playback. The PCI
gives the presentation window of every VOBU: its start and end time. Within a continuous stretch
each VOBU starts exactly where the previous VOBU ended. Where a VOBU's start time does not follow
the previous VOBU's end time, the clock has restarted and the timestamps of everything from that
VOBU onward are on a new base. A change of VOB can restart the clock, and the cell that begins it then has
the STC discontinuity flag set. Example: one VOB's clock ran from 0.1 s to 126.6 s and the
next VOB restarted at 0.07 s.

**Edge cases in timing**

- Timestamps are therefore not monotonic across a title: playback timing across a VOB or cell
  join is defined by the PCI times, not by the raw PES timestamps. A restart shifts the
  timestamps of every track at once.
- Streams are multiplexed with different lead times, so at a join the audio and subpicture
  packets of the next segment can arrive before the first video picture of that segment. Such
  audio can already carry the new clock's timestamps (for example a value near 0) while video
  of the previous segment is still running.
- A PTS or DTS is a 33-bit count of 90 kHz ticks and wraps after 2^33 ticks, about 26.5 hours.
  A drop of about 2^33 ticks followed by normal spacing is a wrap, not a clock restart.
- The SCR values of successive packs in a program stream are at most 0.7 s apart.
- The pack header's program mux rate field is in units of 50 bytes per second; the DVD maximum
  of 10.08 Mbit/s is 25 200 units.
- A PES header carries a PTS only on a packet in which an access unit starts, and the PTS
  belongs to the first access unit that starts in that packet. A video picture that starts
  after a preceding picture's tail takes that packet's PTS if it is the first picture
  beginning there; a picture merely continuing from an earlier packet does not. Video PTS values are typically
  present once per group of pictures; pictures without one are timed from temporal_reference
  and the field durations of the pictures before them.

## Elementary streams

Audio other than MPEG audio, and all subpictures, are carried on `private_stream_1` (stream ID
`0xBD`); the first payload byte is the **sub-stream ID**.

| Stream ID | Carries |
|---|---|
| `0xE0` | Video |
| `0xC0`–`0xC7` | MPEG-1 or MPEG-2 audio (up to 8 streams) |
| `0xBD` | Private stream 1: AC-3, DTS, LPCM audio and subpictures, selected by sub-stream ID |
| `0xBF` | Private stream 2: NAV pack PCI and DSI |

| Sub-stream ID on `0xBD` | Carries |
|---|---|
| `0x20`–`0x3F` | Subpicture streams (32) |
| `0x80`–`0x87` | AC-3 audio (8) |
| `0x88`–`0x8F` | DTS audio (8) |
| `0xA0`–`0xA7` | LPCM audio (8) |

Other packet types between payload packets are the system header (`0xBB`), the program
stream map (`0xBC`) and padding (`0xBE`); padding carries no data. A conforming program-stream PES has a non-zero packet length. H.222.0 permits
zero-length video PES in **transport streams**. A tolerant demuxer may recover such a malformed
program-stream packet by scanning for the next pack, system header, program end or valid PES
start code; that is recovery behavior, not DVD framing. A raw `00 00 01` also occurs inside
video data and is insufficient to identify a packet boundary. The low 3 bits of byte 13 of the pack header give the number of stuffing
bytes after it, which extend the header past 14 bytes.

**Sub-stream headers.** After the sub-stream ID byte:

| Sub-stream IDs | Header after the sub-stream ID | Then |
|---|---|---|
| `0x80`–`0x8F` (AC-3, DTS) | 3 bytes: number of frame headers (1 byte), first access unit pointer (2 bytes) | The elementary stream |
| `0xA0`–`0xA7` (LPCM) | The same 3 bytes | A 3-byte LPCM audio header, then the samples |
| `0x20`–`0x3F` (subpicture) | None | The subpicture data |

In an AC-3 or DTS packet the PTS belongs to the first access unit that starts in the packet; the
pointer locates it. A packet can hold several complete frames and still carry only that one PTS,
so the times of the later frames follow from the frame duration (a DTS core frame of 512 samples
at 48 kHz lasts 10.667 ms). A frame can straddle two packets.

### Video

Video is **MPEG-2 Main Profile at Main Level** or **MPEG-1**, on stream ID `0xE0`. Only 4:3 and
16:9 display aspect ratios are allowed. The pixel grid is anamorphic at 720×480 or 720×576 either
way; the display shape comes from the aspect ratio, not from the frame size.

| System | Frame rate | MPEG-2 resolutions | MPEG-1 resolution |
|---|---|---|---|
| NTSC | 29.97 | 720×480, 704×480, 352×480, 352×240 | 352×240 |
| PAL | 25 | 720×576, 704×576, 352×576, 352×288 | 352×288 |

- **Film material.** NTSC film material at 23.976 frames per second is coded as 29.97 frames
  per second with **3:2 pulldown signalled by flags** in the MPEG-2 picture coding extension
  (`repeat_first_field` and `top_field_first`) rather than by repeating pictures in the stream.
  PAL film material is normally coded at 25 frames per second.
- **Widescreen.** 16:9 pictures are coded anamorphically in the same frame size. The VTS video
  attributes specify which **display modes** are permitted on a 4:3 display: letterbox,
  pan-scan, or both. Pan-scan uses horizontal offsets carried in the MPEG-2 sequence display and
  picture display extensions.
- **Sequence header fields.** Counted from the first byte of the sequence start code
  `00 00 01 B3`: the horizontal size is 12 bits starting at byte 4, the vertical size is the
  following 12 bits (bytes 5–6), and byte 7 holds the aspect ratio code in its high nibble and the
  frame rate code in its low nibble. Aspect codes: 1 = square samples, 2 = 4:3, 3 = 16:9,
  4 = 2.21:1; 0 is forbidden. Frame rate codes: 1 = 24000/1001, 2 = 24, 3 = 25, 4 = 30000/1001,
  5 = 30, 6 = 50, 7 = 60000/1001, 8 = 60; 0 is forbidden. DVD-Video uses 1, 3 and 4.
- **Picture flags.** The picture coding extension is the extension start code `00 00 01 B5`
  whose first byte has the identifier nibble `1000`. Counted from the start code, byte 6 holds
  `picture_structure` in its low 2 bits (`11` = frame picture, `01` = top field, `10` = bottom
  field); byte 7 holds `top_field_first` in bit 7 and `repeat_first_field` in bit 1; byte 8 holds
  `progressive_frame` in bit 7. The sequence extension is the `00 00 01 B5` whose identifier
  nibble is `0001`; `progressive_sequence` is bit 3 of the byte at offset 5 from its start code.
- **Field count per picture.** A field picture lasts one field period. A frame picture with
  `repeat_first_field` clear lasts two. With `repeat_first_field` set, a frame picture lasts three
  field periods when `progressive_sequence` is 0 and `progressive_frame` is 1 (the film
  case), and two when `progressive_frame` is 0; when `progressive_sequence` is 1 it lasts six
  (`top_field_first` set) or four (clear). A film-sourced NTSC stream therefore alternates
  two- and three-field pictures, and the start of each picture follows the sum of the field
  periods before it rather than a fixed 1/29.97 s grid.

**Soft telecine, interlaced and mixed material**

- **23.976 coded inside 29.97.** A film title on an NTSC disc declares 29.97 frames per second
  in its sequence header and in the IFO, but its pictures are progressive frames coded at
  24000/1001 per second; the pulldown is carried by `repeat_first_field`. The coded frame count
  is 80 percent of what the declared rate implies. A field lasts 1001/60000 s (16.68 ms), so a
  two-field picture lasts 33.37 ms and a three-field picture 50.05 ms; the 2:3 cycle of two
  pictures covers five fields (83.42 ms), an average of 41.71 ms per picture.
- **Flags are per picture.** `progressive_frame`, `top_field_first` and `repeat_first_field`
  are set in each picture's coding extension, so one title can change character mid-stream:
  film sections (progressive frames, `repeat_first_field` set on alternate frames, 23.976) can be
  followed by video sections (interlaced frames, `repeat_first_field` clear, 29.97), and back.
  The picture duration then changes at the switch, and no single frame rate describes the title;
  one rate describes only the dominant material.
- **`progressive_sequence` and `progressive_frame`.** `progressive_sequence` is a property of the
  whole sequence and `progressive_frame` of one picture. A picture is progressive when either
  is 1. The two flags do not have to agree with the declared scan.
- **Progressive coding under an interlaced declaration.** The IFO video attributes and the
  sequence header describe 480-line or 576-line interlaced video whether or not the pictures
  are coded progressive. Film and animation discs commonly set `progressive_frame` on every
  picture while `progressive_sequence` stays 0, so the content is progressive on a disc that
  declares interlace.
- **Leaders.** A progressive leader (a logo or studio card) can open an interlaced feature, and
  an interlaced leader can open a progressive one, so the first picture does not represent the
  title.
- **Field order.** Interlaced material is top-field-first or bottom-field-first, and the order
  is carried per frame picture in `top_field_first`. A frame can instead be coded as two field
  pictures, each with its own picture header, whose parity is given by `picture_structure`
  (`01` = top field, `10` = bottom field); one displayed frame is then two coded pictures.
- **Closed captions.** NTSC line-21 caption data may be carried in the video stream's user
  data, with its presence flagged in the video attributes.
- **Groups of pictures.** `temporal_reference` (10 bits, display order within the group)
  restarts at 0 at every GOP header. The last bits of the GOP header (byte 7 counted from the
  start code `00 00 01 B8`) are `closed_gop` (bit 6) and `broken_link` (bit 5). A GOP with
  `closed_gop` clear is open: its leading B-pictures were coded with a forward reference in the
  previous GOP, so a stream that begins at that GOP (a title start, or a join after a
  `broken_link` GOP) has leading B-pictures that cannot be decoded. The I-picture of an open GOP
  comes first in coding order but is displayed after those B-pictures, so the display start of
  the GOP lies before the I-picture's own PTS.
- **Aspect code in MPEG-1.** In MPEG-1 video the aspect codes are pel aspect ratios, so code 3
  is not 16:9.
- **Colour.** Standard-definition DVD video is BT.470 B/G (PAL) or SMPTE 170M (NTSC) unless a
  sequence display extension carries `colour_description`; its `colour_primaries` and
  `matrix_coefficients` values are 1 = BT.709, 5 = BT.470 B/G, 6 = SMPTE 170M. Video is limited
  range (luma 16–235). A 720×480 frame is not 3:2: with no square pixels, the display shape comes
  only from the aspect field.

### Audio

Each title set and menu declares its audio streams in its management table: up to **8 audio
streams** in a title set, each with a coding mode, channel count, language code and
extension, and a quantisation or sample-rate field.

| Coding | Notes |
|---|---|
| AC-3 (Dolby Digital) | Up to 5.1 channels, 48 kHz, maximum 448 kbit/s |
| DTS | Up to 5.1 channels, 48 kHz, optional in players; commonly 754 or 1509 kbit/s |
| LPCM | 48 or 96 kHz, 16, 20 or 24 bits, up to 8 channels, maximum 6.144 Mbit/s |
| MPEG-1 / MPEG-2 audio | Layer II; up to 8 streams on stream IDs `0xC0`–`0xC7` |

An audio attribute entry describes one logical stream. The **audio stream control** field of a
PGC (16 bits per logical stream, at PGC `0x0C`) says which physical stream that logical stream is
in this PGC: bit 15 set means the stream is present; bits 10–8 are the physical stream number `n`
(bits 14–11 are reserved). The physical stream's ID is derived from the coding mode and `n`:

| Coding | Stream carrying physical stream `n` |
|---|---|
| AC-3 | `private_stream_1` sub-stream `0x80 + n` |
| DTS | `private_stream_1` sub-stream `0x88 + n` |
| LPCM | `private_stream_1` sub-stream `0xA0 + n` |
| MPEG audio | PES stream ID `0xC0 + n` |

The number `n` is the physical stream number, not a count within a codec: a DTS stream declared
after an AC-3 stream uses its own physical number, not a number restarted at 0. A PGC can mark
several logical streams with the same physical stream, and some PGCs mark none present. Coding
mode 3 declares an additional **extension bit stream** that carries the multichannel part of an
MPEG-2 audio stream beyond its MPEG-1-compatible base channels.

**Edge cases in audio streams**

- **Physical order does not follow quality or declaration order.** The i-th declared audio
  stream does not have to sit on the i-th physical stream. A disc can place a 2.0 downmix on
  sub-stream `0x80` and the 5.1 main mix on another AC-3 sub-stream, while the attribute entry
  declares 5.1 for the stream. The PGC audio stream control, not the sub-stream number, says
  which physical stream a logical stream plays. A DTS stream on physical number 1 is sub-stream
  `0x89`, not `0x88`.
- **A programme can open as 2.0.** A feature often opens with logos or warnings whose audio is
  a 2.0 AC-3 stream on `0x80`, and the 5.1 main mix begins a fraction of a second later on the
  same sub-stream. The first frames of a sub-stream therefore do not show its channel count: the
  first AC-3 frames can carry the 2/0 channel mode (`acmod` 2) and later frames the 3/2 mode
  with LFE (`acmod` 7, `lfeon` set). The AC-3 channel count is `acmod` (channels 2, 1, 2, 3, 3,
  4, 4, 5 for values 0 to 7) plus `lfeon`.

**LPCM audio header.** The three bytes that follow the sub-stream header of an LPCM packet:

| Byte | Bits | Field |
|---|---|---|
| 0 | 7 | Emphasis flag |
| 0 | 6 | Mute flag |
| 0 | 4–0 | Audio frame number within its group of frames |
| 1 | 7–6 | Quantisation: 0 = 16 bit, 1 = 20 bit, 2 = 24 bit; 3 is reserved |
| 1 | 5–4 | Sample rate: 0 = 48 kHz, 1 = 96 kHz; 2 and 3 are not used on DVD |
| 1 | 2–0 | Channel count minus one |
| 2 | 7–5 | Dynamic range X |
| 2 | 4–0 | Dynamic range Y (linear gain 2^(4 − (X + Y/30))) |

Samples are big-endian and interleaved by channel. 16-bit samples are stored as plain 16-bit
words. For 20-bit and 24-bit audio, samples are stored in groups: a group of `g` samples
(2 for mono, 4 for every other channel count) is `g` 16-bit words holding the most significant 16
bits of each sample, followed by the remaining low bits of the whole group: one byte per sample
for 24-bit audio, and one nibble per sample for 20-bit audio (the first sample of a pair in the
high nibble), so a 20-bit group has `g / 2` extra bytes.

### Subpictures

Subpictures carry subtitles, menu highlights and graphics. A subpicture unit holds
**run-length-encoded bitmaps of 2 bits per pixel**, so each pixel selects one of **four
colours**. The four colours are taken from the **16-entry YCbCr palette of the current PGC**,
and each of the four has its own 4-bit contrast (transparency) value. The unit also holds
**display control sequences** that give the display area, the colour and contrast selection, the
start and stop times, and the addresses of the top-field and bottom-field pixel data, so the
bitmap is interlaced. Up to **32 subpicture streams** can be declared, selected by sub-stream
IDs `0x20`–`0x3F`. A PGC maps each declared stream to a physical stream number separately for
each display mode (4:3, wide, letterbox, pan-scan).

**Subpicture unit.** A unit begins with a 2-byte size giving the unit's total length including
those two bytes. A unit can span several PES packets of the same sub-stream: only the first carries
a PTS, and the continuation packets carry none. A unit is therefore complete when the bytes
gathered reach the declared size. The size is at most 65535 bytes.

**Palette.** The PGC colour table (16 entries of 4 bytes, from PGC `0xA4`) stores each entry as
padding, Y, Cr, Cb, in that byte order: Cr precedes Cb. The values are studio range (luma 16–235,
chroma 16–240).

**Subpicture stream control.** Each logical subpicture stream has a 32-bit entry at PGC `0x1C`:
bit 31 set means the stream is present in this PGC; bits 28–24 are the sub-stream number used when
the display is 4:3, and bits 20–16 the number used when the display is wide (16:9). The physical
sub-stream ID is `0x20` plus that number. Anamorphic discs interleave the separate 4:3, wide,
letterbox and pan-scan variants of a stream, so a logical stream's sub-stream number is not simply
its position. Two logical streams may name the same number. A stream whose present bit is clear is
not presented by that PGC, but its packets can still be multiplexed in the PGC's cells, for
example in cells shared with the PGC of another language.

Menu buttons are drawn by overlaying a highlight subpicture on the menu's video; the **HLI** in
the NAV pack selects which colours and contrast apply to the buttons in their normal, selected
and activated states.

#### Display control sequences

After the pixel data, bytes 2–3 of the unit give the offset of the first **display control
sequence (SP_DCSQ)**. Each sequence is:

| Offset | Size | Field |
|---|---|---|
| 0 | 2 | Delay: time after the unit's PTS at which the commands run |
| 2 | 2 | Offset of the next sequence; equal to the sequence's own offset in the last one |
| 4 | | Commands, ending with `0xFF` |

The delay counts the 90 kHz clock divided by 1024, so one tick is 1024/90000 s (about
11.38 ms) and `0x0100` is about 2.91 s. A subpicture's display time is the delay of the
sequence that holds its stop command, and the stop can sit in a later sequence than the start.

| Code | Name | Length (bytes) | Meaning |
|---|---|---|---|
| `0x00` | FSTA_DSP | 1 | Forced start display |
| `0x01` | STA_DSP | 1 | Start display |
| `0x02` | STP_DSP | 1 | Stop display |
| `0x03` | SET_COLOR | 3 | Colour indices into the PGC palette: 2 data bytes, four 4-bit values |
| `0x04` | SET_CONTR | 3 | Contrast values: 2 data bytes, four 4-bit values |
| `0x05` | SET_DAREA | 7 | Display area: 6 data bytes, x and y start and end (12 bits each) |
| `0x06` | SET_DSPXA | 5 | Offsets of the top-field and bottom-field pixel data: two 16-bit values |
| `0x07` | CHG_COLCON | variable | Change colour and contrast in parts of the display area; a 16-bit length follows |
| `0xFF` | CMD_END | 1 | End of the command list of this sequence |

#### Forced subpictures

`FSTA_DSP` (`0x00`) and `STA_DSP` (`0x01`) both start the display of the unit and take no
operands. They differ in when the unit may be shown. A unit started with `STA_DSP` is shown
only when the viewer has subpictures switched on (the display flag, bit 6 of SPRM 2, set) and
has selected the stream carrying it. A unit started with `FSTA_DSP` is a **forced** unit: it is
shown even when subtitles are switched off. The stream-number field of SPRM 2 takes the value 63
for forced display (62 means no stream).

Forced units carry text that must always be readable, such as the translation of a
foreign-language passage or an on-screen sign. A subpicture stream made only of forced
units is a **forced-subtitle stream**; its subpicture attribute can carry code extension 9
(see [Code extension](#ifo-structures)). A stream that holds both ordinary and forced units
displays the ordinary ones only when subtitles are on. Menu subpictures also begin with
`FSTA_DSP`, since menu buttons are shown whatever the viewer's subtitle setting.

### Stream limits

| Item | Limit |
|---|---|
| Video Title Sets | 99 |
| Titles | 99 |
| Chapters (PTTs) per title | 99 |
| Programs per PGC | 99 |
| Cells per PGC | 255 |
| Angles | 9 |
| Audio streams per title set | 8 |
| Subpicture streams | 32 |
| Highlight buttons per menu | 36 |
| GPRM / SPRM | 16 / 24 |
| Title VOB files per VTS | 9, each at most 1 GiB |
| Commands per PGC (pre, post and cell lists combined) | 128 |
| Multiplex rate | 10.08 Mbit/s |
| Video bit rate | 9.8 Mbit/s |

## Text data (TXTDT)

`TXTDT_MG` in `VIDEO_TS.IFO` can hold optional text: the disc name, title names, and chapter
names, in one or more languages. It is entirely optional and many discs omit it. The structure
has no official public specification; the layout below is the commonly documented one.

The 4-byte value at `VIDEO_TS.IFO` offset `0xD4` is the sector, counted from the start of the
file, of the **TXTDT_MG** (0 = absent). All offsets below are from the start of the TXTDT_MG.

| Offset | Size | Field |
|---|---|---|
| 0x00 | 12 | Identifier |
| 0x0C | 2 | Reserved |
| 0x0E | 2 | Number of language units |
| 0x10 | 4 | Offset of the last byte of the TXTDT_MG |
| 0x14 | 8 each | Language unit pointers |

| Pointer offset | Size | Field |
|---|---|---|
| +0 | 2 | Language code |
| +2 | 1 | Reserved |
| +3 | 1 | Character set |
| +4 | 4 | Offset of the language unit |

A **language unit** begins with 204 bytes of header: a 4-byte offset of the unit's last byte,
then up to 100 16-bit offsets, the first locating the disc-name entry and each following one the
entry of the corresponding title in `TT_SRPT` order. At offset 204 of the unit is a 16-bit field
holding **twice** the number of text entries, then 2 reserved bytes, then the entries from
offset 208, 8 bytes each:

| Entry offset | Size | Field |
|---|---|---|
| +0 | 1 | Entry type |
| +6 | 2 | Offset of the entry's string, counted from offset 204 of the unit |

A string ends at a tab (`0x09`) or a NUL byte.

| Type | Meaning |
|---|---|
| `0x01` | Disc name |
| `0x02` | Title name |
| `0x04` | Chapter name |

Other type values occur (for example `0x2E`, an authoring-tool tag); these are private entries
with no standard meaning.

**Order and association.** Entries are in disc order. A title entry (`0x02`) is followed by the
chapter entries (`0x04`) of that title, one per chapter, until the next title entry. The first
title entry corresponds to the first `TT_SRPT` entry, the second to the second, and so on. Each
title's chapter entries match the chapter count in its `TT_SRPT` entry.

**Character set** (byte 3 of the unit pointer): `0x01` is ISO 646 and `0x11` is ISO 8859-1; both
are one byte per character.

## Region coding and parental management

### Region codes

The world is divided into **eight regions**, and a disc carries an 8-bit **region mask** in
`VMGI_MAT` with one bit per region. The mask is the second byte of the 4-byte `vmg_category`
field at `0x22`, so it sits at byte **`0x23`** of `VIDEO_TS.IFO`. Bit *n* (bit 0 being the least
significant) set means the disc is **not** playable in region *n* + 1, so the mask `0x00` marks
a region-free disc. For example, `0xFD` (all bits but bit 1 set) allows region 2 only, and `0x3F`
allows regions 7 and 8. The other bytes of `vmg_category` are not part of the region mask.

| Region | Area |
|---|---|
| 1 | United States, Canada |
| 2 | Europe, Japan, Middle East, South Africa |
| 3 | South-East and East Asia |
| 4 | Australia, New Zealand, Latin America, Caribbean |
| 5 | Russia, Eastern Europe, India, Africa, North Korea, Mongolia |
| 6 | China |
| 7 | Reserved |
| 8 | Special international venues (aircraft, cruise ships) |

Players hold their region in SPRM 20. Enforcement is the responsibility of the player or drive.
The television system (NTSC at 525 lines and 60 fields, PAL at 625 lines and 50 fields) is a
separate property, recorded in the video attributes.

### Parental management

`PTL_MAIT` defines parental levels per country (ISO 3166 country code). **Levels 1 through 8**
are defined, where a higher level is more permissive. Each title's `TT_SRPT` entry has a parental
ID mask, and a title set may hold the same content as several alternate PGCs, each tagged with a
parental level; the player selects the PGC that matches the level held in SPRM 13. This makes it
possible for a single disc to present different cuts of the same title to different viewers.

## Copy protection

Three protection mechanisms are associated with DVD media. They operate at different layers and
are independent of one another.

### CSS (Content Scramble System)

CSS protects pressed DVD-Video content. It is a **40-bit stream cipher**. The elements are:

- **Disc key.** Stored in the lead-in of the disc, hidden from ordinary file reads, as a block
  that holds the disc key encrypted once under each of a set of **player keys** assigned to
  licensed manufacturers, plus a check value. A licensed player recovers the disc key using its
  own player key.
- **Title keys.** Each protected title set has its own 5-byte title key, stored in the sector
  headers of its VOB data and encrypted with the disc key.
- **Sector scrambling.** In each scrambled 2048-byte sector the first 128 bytes, containing the
  pack header and the start of the PES header, remain clear. The rest of the sector (bytes
  `0x80`–`0x7FF`) is scrambled using a key stream derived from the title key. The flag that marks
  a sector as scrambled is the **PES scrambling control** field: bits 5–4 of the first PES
  header's flags byte, non-zero when scrambled. In a pack with a 14-byte pack header and no
  stuffing, that byte is at sector offset `0x14`; with n bytes of pack stuffing it is at
  `0x14 + n`, and in an MPEG-1 system stream (12-byte pack header, marker bits `0010`) those
  bytes are a packet length and a timestamp field, not a scrambling flag. NAV packs are not scrambled. IFO files, BUP files and filesystem structures are
  never scrambled: bytes that resemble the flag at offset `0x14` of such a sector are not
  scrambling flags.
- **Edge cases.**
  - *Byte `0x14` of an IFO sector.* The IFO files, BUP files and the UDF and ISO 9660 structures
    are never scrambled, but byte `0x14` of such a sector holds whatever the structure stores
    there, and bits 5–4 can be set. The second sector of a `VIDEO_TS.IFO`, which holds
    `TT_SRPT`, can begin `00 26 00 00` and hold `0x15` at offset `0x14`: bits 5–4 read as `01`,
    yet it is not a pack, and the flag means nothing there.
  - *Clear sectors on a CSS disc.* The scrambling flag is per sector, so scrambled and clear
    sectors can alternate. A disc can hold whole title sets, short stub titles or menu
    cells in the clear beside scrambled ones, and a title can open with a long run of clear
    sectors (a logo or rating card) before scrambled content begins. Such clear sectors can
    still have stray bits at `0x14` when the byte is read without checking for a pack.
  - *Sector seed.* The per-sector seed of the key stream is the 5 bytes at sector offsets
    `0x54`–`0x58`, inside the clear first 128 bytes, combined with the title key.
- **Authentication.** When a drive and a host are separate devices (a PC), they perform a
  **mutual challenge-response handshake** across the drive interface before the drive will
  release the disc key and title keys. The handshake establishes a **bus key**, and the
  protected keys cross the interface encrypted under it. A drive that has not been
  authenticated refuses to read a scrambled sector: it returns CHECK CONDITION with sense key
  ILLEGAL REQUEST (5), ASC/ASCQ `6F/03` ("read of scrambled sector without authentication"),
  which distinguishes a scrambled sector from an unreadable one.

Region is enforced by the player or drive; the cipher itself does not encode a region.

### CPRM (Content Protection for Recordable Media)

CPRM applies to **recordable** DVD media (such as DVD-RAM, DVD-R and DVD-RW), not to pressed
DVD-Video discs. Each blank disc carries a unique **media ID**, and a **Media Key Block (MKB)**
distributes keys to licensed devices in a way that allows revocation of compromised devices. A
licensed device derives a media key from the MKB, combines it with the media ID, and uses the
result to encrypt and decrypt content with the **C2 cipher**. The content is tied to the
individual disc it was recorded on.

### Macrovision analog protection (APS)

**APS** (Analog Protection System) is not encryption. It controls whether the player's
**analog video output** adds Macrovision's copy-protection signal. The setting is carried as
APS bits in the VOBU category field of the PCI and can vary from VOBU to VOBU. A related set of
**CGMS** (Copy Generation Management System) bits in the sector's copyright management data
signals the copying permission of the content.

## Glossary

| Term | Meaning |
|---|---|
| VMG | Video Manager: the disc-level control structure and top menus |
| VTS | Video Title Set: a group of titles sharing attributes, with its menus |
| IFO | Information file holding the control tables |
| BUP | Backup copy of an IFO |
| VOB | Video Object: an MPEG-2 Program Stream file |
| VOBU | Video Object Unit: the NAV-pack-led unit of about 0.4 to 1.0 second |
| NAV pack | The first pack of each VOBU, carrying PCI and DSI |
| PCI / DSI | Presentation Control Information / Data Search Information |
| PGC | Program Chain: the playback sequence and its attached commands and palette |
| PTT | Part of Title: a chapter |
| Cell | The smallest addressable run of VOBUs in a PGC |
| ILVU | Interleaved Unit: the interleaving granule for angles and seamless branching |
| GPRM / SPRM | General / System Parameter Register |
| SCR | System Clock Reference in the pack header |
| PTS / DTS | Presentation / Decoding Time Stamp |
| HLI | Highlight Information: menu button definitions in the PCI |
| PTP / OTP | Parallel / Opposite Track Path on dual-layer discs |
| CSS | Content Scramble System |
| CPRM | Content Protection for Recordable Media |
| APS | Analog Protection System (Macrovision) |
| TT_SRPT | Title search pointer table: the disc's title list |
| VTS_TTN | Title number within its title set |
| SPU | Subpicture unit: one subtitle or button bitmap with its display control sequence |
| TXTDT | Text data: optional disc, title and chapter names |
| STC | System Time Clock: the clock that PTS and DTS values refer to |

## References

Specifications define the formats; implementation links document concrete parser and recovery behavior. Research and community sources are identified separately. Observations from particular discs are not universal format guarantees.

### Specifications

- DVD Forum, DVD Specifications for Read-Only Disc, Part 3: Video — licensed specification; the implementation references below are not substitutes for it
- ECMA-267: 120 mm DVD, Read-Only Disk — [ecma-international.org](https://ecma-international.org/publications-and-standards/standards/ecma-267/)
- [ITU-T H.222.0 / ISO/IEC 13818-1, MPEG-2 Systems](https://www.itu.int/rec/T-REC-H.222.0) — program-stream, transport-stream and PES syntax
- [ITU-T H.262 / ISO/IEC 13818-2, MPEG-2 Video](https://www.itu.int/rec/T-REC-H.262)
- [ATSC A/52:2018, AC-3 and E-AC-3](https://www.atsc.org/wp-content/uploads/2021/04/A52-2018.pdf)
- [ECMA TR/112, Universal Disk Format](https://ecma-international.org/publications-and-standards/technical-reports/ecma-tr-112/) — archived UDF revisions, including 1.02

### Open-source implementations

**Filesystem access and decryption**

- libdvdcss, sector scrambling flag: [css.c](https://code.videolan.org/videolan/libdvdcss/-/blob/master/src/css.c) and [libdvdcss.c](https://code.videolan.org/videolan/libdvdcss/-/blob/master/src/libdvdcss.c)

**Navigation and metadata**

- [freemkv / libfreemkv](https://github.com/freemkv/libfreemkv) — IFO, navigation and title parsing; implementation limits are identified in the text.
- libdvdread, IFO structures: [ifo_types.h](https://code.videolan.org/videolan/libdvdread/-/blob/master/src/dvdread/ifo_types.h)
- libdvdread, NAV pack structures: [nav_types.h](https://code.videolan.org/videolan/libdvdread/-/blob/master/src/dvdread/nav_types.h)
- libdvdnav, command decoding: [vmcmd.c](https://code.videolan.org/videolan/libdvdnav/-/blob/master/src/vm/vmcmd.c) and [decoder.c](https://code.videolan.org/videolan/libdvdnav/-/blob/master/src/vm/decoder.c)
- libdvdnav, chapter and title times: [searching.c](https://code.videolan.org/videolan/libdvdnav/-/blob/master/src/searching.c)

**Elementary streams and codecs**

- FFmpeg, DVD LPCM: [pcm-dvd.c](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/pcm-dvd.c)

**Extraction and output**

- [freemkv](https://github.com/freemkv/freemkv) — disc extraction application built on libfreemkv.
- [FFmpeg](https://github.com/FFmpeg/FFmpeg) — demuxing, decoding and remuxing.
- [MKVToolNix](https://mkvtoolnix.download/) — Matroska muxing and inspection.

### Research and community references

- mpucoder's DVD-Video pages: [dvd.sourceforge.net/dvdinfo](https://dvd.sourceforge.net/dvdinfo/), notably [IFO](https://dvd.sourceforge.net/dvdinfo/ifo.html), [VMG IFO](https://dvd.sourceforge.net/dvdinfo/ifo_vmg.html), [VTS IFO](https://dvd.sourceforge.net/dvdinfo/ifo_vts.html), [PGC](https://dvd.sourceforge.net/dvdinfo/pgc.html), [PCI](https://dvd.sourceforge.net/dvdinfo/pci_pkt.html), [DSI](https://dvd.sourceforge.net/dvdinfo/dsi_pkt.html), [VM commands](https://dvd.sourceforge.net/dvdinfo/vmi.html), [registers](https://dvd.sourceforge.net/dvdinfo/sprm.html), [subpictures](https://dvd.sourceforge.net/dvdinfo/spu.html), [LPCM](https://dvd.sourceforge.net/dvdinfo/lpcm.html), [MPEG streams](https://dvd.sourceforge.net/dvdinfo/dvdmpeg.html) and [pack header](https://dvd.sourceforge.net/dvdinfo/packhdr.html)
