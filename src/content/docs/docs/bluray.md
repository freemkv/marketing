---
title: Blu-ray
description: A reference for the Blu-ray Disc (BD-ROM, HD) format — the UDF 2.50 filesystem, the BDMV tree, index.bdmv and HDMV navigation, MPLS playlists, CLPI clip info, the M2TS transport stream and its elementary streams, timelines across clips, and how a title is told apart from menus, decoys and play-all playlists.
---

Blu-ray is a **disc format**; AACS is the **encryption** layered on top. The two are
independent, exactly as they are for HD DVD and 4K UHD: the format is the medium, the
filesystem, the navigation data and the stream layout; AACS is the key hierarchy and the content
cipher. This page documents the format. Encryption is on the [AACS reference](/docs/aacs/);
4K UHD material (UHD media capacities, HEVC, HDR10, HDR10+, Dolby Vision, AACS 2.x specifics, the
`.fmts` stream extension) is on the [4K UHD reference](/docs/uhd/) and is not repeated here. The
sibling format with a different container is [HD DVD](/docs/hddvd/).

:::note[Scope and conventions]
All multi-byte integers in BDMV navigation files (`index.bdmv`, `MovieObject.bdmv`, `*.mpls`,
`*.clpi`) are **big-endian**. All multi-byte integers in UDF structures are **little-endian**.
Offsets are in bytes from the start of the structure named, zero-based. Where a value is listed
as a code table, codes not listed exist in the wider specification but are not described here.
The last section lists structures this page does not specify.
:::

## Disc and filesystem

| Property | Value |
|---|---|
| Logical sector | **2048 bytes** (same as DVD and HD DVD) |
| Filesystem | **UDF 2.50** with a **metadata partition** |
| Layers | 1 or 2 for BD-25 / BD-50; up to 3 for UHD BD-ROM (see [4K UHD](/docs/uhd/)) |
| Stream files | Large (several GB), commonly stored as **several extents**, including physically contiguous extents |

The filesystem does not record how many layers the disc has. The layer count follows from the
total sector capacity of the medium: a single-layer disc is on the order of 12 million sectors,
a dual-layer disc roughly double. Partition start and length come from the Partition Descriptor, not a fixed 288-sector
margin. With N the total sector count, UDF anchor candidates include sector 256, N−257 and
N−1; the anchors locate the main and reserve descriptor sequences. Capacity must therefore come from the drive, not from the partition descriptor.

### Locating the root directory

UDF is traversed by following pointers; each step reads one or two sectors.

1. **Anchor Volume Descriptor Pointer (AVDP)** at **sector 256**. Descriptor tag identifier `2`
   (tag id is the little-endian `u16` at offset 0). The Main Volume Descriptor Sequence extent
   is recorded at **offset 16 (length in bytes, `u32`)** and **offset 20 (location, `u32`)**. Validate the descriptor tag, extent length and bounds. On failure, try the other valid
   anchors and the reserve sequence. Scanning customary sector 32 is a recovery heuristic,
   not a substitute for a valid anchor.
2. **Volume Descriptor Sequence.** Sweep descriptors from that start until the Terminating
   Descriptor (tag `8`). Tags used:

   | Tag | Descriptor | Fields used |
   |---|---|---|
   | `1` | Primary Volume Descriptor | Volume identifier: 32-byte d-string at **offset 24** |
   | `5` | Partition Descriptor | **Partition starting location** `u32` at **offset 188** |
   | `6` | Logical Volume Descriptor | Number of partition maps `u32` at **offset 268**; File Set Descriptor long_ad: length at **offset 248**, block at **offset 252**; partition maps start at **offset 440** |

3. **Partition maps.** The maps start at offset 440 of the Logical Volume Descriptor; each
   begins with a type byte and a length byte. Walk the map count and each declared length rather than assuming an order. A
   **Type 2** map (type byte `2`) whose
   23-character type identifier at **offset 5** of the map reads `*UDF Metadata Partition` is
   the **metadata partition**. The map is 64 bytes; the
   **Metadata File location** is the `u32` at **offset 40** of the map (a partition-relative
   block holding the Metadata File's File Entry).
4. **Metadata File.** An Extended File Entry (tag `266`) whose allocation descriptors list the
   extents (partition-relative) that together form the metadata partition. Only recorded
   extents (type 0) hold metadata blocks; the **metadata partition block number → absolute
   sector** mapping walks these extents in file order and respects every extent length, including the last.
5. **File Set Descriptor** (tag `256`) at the block recorded in the Logical Volume Descriptor,
   in the metadata partition (block 0 is the customary location). The **root directory ICB** is
   a long_ad at **offset 400** of the FSD, with its location `u32` at **offset 404**.

Resolve each long_ad through its partition-reference number. Metadata addresses and
physical-partition addresses are different spaces; ordinary stream data usually uses the
physical partition, where absolute sector = partition start + extent location. A reader must
follow the selected map rather than assume a partition from the kind of file.
See [ECMA-167](https://ecma-international.org/publications-and-standards/standards/ecma-167/)
and [libudfread](https://code.videolan.org/videolan/libudfread) for descriptor traversal.

### File Entries and allocation descriptors

| Tag | Entry | `L_EA` at | `L_AD` at | Descriptors begin at |
|---|---|---|---|---|
| `261` | File Entry | 168 | 172 | `176 + L_EA` |
| `266` | Extended File Entry (BD-ROM norm) | 208 | 212 | `216 + L_EA` |

Both carry the **information length** (`u64`) at **offset 56** and the ICB Tag flags at
**offset 34**, whose low 3 bits select the allocation descriptor form:

| Flags & 7 | Form | Size | Extent location at |
|---|---|---|---|
| 0 | Short AD | 8 bytes | +4 |
| 1 | Long AD | 16 bytes | +4 |
| 2 | Extended AD | 20 bytes | **+12** |
| 3 | **Embedded data** | — | the file's bytes sit inline where descriptors would be |

Each descriptor begins with a `u32`: the **top 2 bits are the extent type** and the low 30 bits
the byte length.

| Extent type | Meaning |
|---|---|
| 0 | Recorded and allocated: `length` bytes of data at the location |
| 1, 2 | Not recorded (sparse): the file's byte space includes `length` bytes of zeros; nothing is read from the disc, and later extents must not slide down over them |
| 3 | Continuation: the location is a block in the referenced partition holding more descriptors, preceded by an Allocation Extent Descriptor header |

A descriptor with a 30-bit length of 0 ends the list. Stream files may use
multiple extents even when physically contiguous because one descriptor has a 30-bit length; very small files (key and navigation files of a
couple of KiB) may use embedded data. A file with an information length of 0 may legally be
embedded with no content.

### Directories

A directory's content is a run of **File Identifier Descriptors** (tag `257`):

| Offset | Field |
|---|---|
| 18 | File characteristics: `0x02` directory, `0x04` deleted, `0x08` parent |
| 19 | `L_FI`, length of the file identifier |
| 24 | ICB location (`u32`, metadata block) |
| 36 | `L_IU`, length of implementation use (`u16`) |
| `38 + L_IU` | File identifier (`L_FI` bytes) |

The descriptor length is `38 + L_IU + L_FI` rounded up to a multiple of 4. A tag of `0` ends the
listing. A **deleted** entry (bit `0x04`) may point at a zero-length ICB that is not a File
Entry, so it is skipped. A file identifier is at most 255 bytes. Names use **OSTA Compressed Unicode (CS0)**:
the leading compression ID `8` selects one-byte character values, and `16` selects
big-endian 16-bit values. Decode CS0 explicitly rather than treating the whole identifier
as a UTF-16 string. File names on a disc may appear in any letter case (for example `INDEX.BDMV` and
`index.bdmv`, `.MPLS` and `.mpls`), so a reader may offer a case-insensitive fallback for disc-image compatibility. Preserve
the recorded name and prefer an exact match; UDF itself does not make names case-insensitive. The deepest
standard path is `BDMV/BACKUP/BDJO/*.bdjo`, three directories below the root.

## The disc tree

```
/                               (UDF 2.50, 2048-byte sectors)
├── AACS/                       AACS key-input files (and a DUPLICATE/ copy of each)
├── CERTIFICATE/                certificate directory, sibling of BDMV
└── BDMV/
    ├── index.bdmv              title table: First Playback, Top Menu, titles
    ├── MovieObject.bdmv        HDMV navigation programs
    ├── PLAYLIST/NNNNN.mpls     playlists
    ├── CLIPINF/NNNNN.clpi      one clip-information file per clip
    ├── STREAM/NNNNN.m2ts       the clips themselves (transport streams)
    │   └── SSIF/NNNNN.ssif     interleaved base+dependent view, 3D discs only
    ├── BDJO/NNNNN.bdjo         BD-J object files
    ├── JAR/NNNNN.jar           BD-J applications (and loose JAR/NNNNN/ resource folders)
    ├── META/
    │   ├── DL/bdmt_<lang>.xml  disc-library metadata, one file per language
    │   └── TN/                 optional chapter names; frequently an empty directory
    ├── AUXDATA/                auxiliary resources: sound.bdmv, NNNNN.otf fonts, dvb.fontindex
    └── BACKUP/                 redundant copies of navigation files (BACKUP/BDJO/...)
```

| Path | Role |
|---|---|
| `AACS/` | Present only on protected discs. Holds `Unit_Key_RO.inf`, `MKB_RO.inf`, `Content000.cer` / `Content001.cer`, and optionally `MKB_RW.inf`; a `DUPLICATE/` subdirectory carries a second copy of each managed file so a damaged primary has a fallback. `AACS/` exists only at the volume root; `BDMV/` holds no AACS copy. See [AACS](/docs/aacs/) |
| `CERTIFICATE/` | Directory at the **volume root**, next to `BDMV/` and `AACS/`. Like `AACS/`, it carries no presentation content |
| `BDMV/index.bdmv` | Title table. [Below](#indexbdmv) |
| `BDMV/MovieObject.bdmv` | HDMV navigation programs. [Below](#movieobjectbdmv-and-hdmv-navigation) |
| `PLAYLIST/*.mpls` | One playlist per file, named by a 5-digit number. The number is the playlist id used by navigation commands |
| `CLIPINF/*.clpi` | One per clip, same 5-digit stem as the stream file |
| `STREAM/*.m2ts` | Clip AV stream files. A UHD disc under AACS 2.1 uses the `.fmts` extension instead ([4K UHD](/docs/uhd/)) |
| `STREAM/SSIF/*.ssif` | On a Blu-ray 3D disc, an interleaved file holding both eyes' views for a clip; the `.m2ts` for the clip carries the base view only |
| `BDJO/*.bdjo`, `JAR/*.jar` | Java (BD-J) titles. [Below](#bd-j) |
| `META/DL/bdmt_<lang>.xml` | Localized disc title and description. [Below](#metadlbdmt_langxml) |
| `META/TN/` | Optional chapter-name files. The directory is often present and **empty**; absence of names is normal, and chapter names are not stored in the playlist |
| `AUXDATA/` | Auxiliary resources: `sound.bdmv` (HDMV sound effects), `NNNNN.otf` fonts and `dvb.fontindex`. The directory is often empty |
| `BACKUP/` | Redundant copies of navigation files, including `BACKUP/BDJO/*.bdjo` |

Clip names are 5 decimal digits (`00001`). The same stem names the clip's `CLIPINF/NNNNN.clpi`
and its `STREAM/NNNNN.m2ts` (or `.fmts`, `.ssif`). Playlists and clips are numbered
independently.

When bus encryption is enabled on an AACS disc, only the sectors of the files under `STREAM/`
(including the `.ssif` files) are bus-encrypted; the filesystem structures and navigation files
are not (see [AACS](/docs/aacs/)).

### META/DL/bdmt_&lt;lang&gt;.xml

Disc-library metadata is a `disclib` root (namespace `urn:BDA:bdmv;disclib`) holding a `di:discinfo` element in the namespace `urn:BDA:bdmv;discinfo`, prefix `di:`. There
is one file per language, named `bdmt_<lang>.xml` where `<lang>` is a 3-letter ISO 639-2 code
(for example `bdmt_eng.xml`). Elements used:

| Element | Content |
|---|---|
| `di:name` | The disc title (inside `di:title`) |
| `di:description` | Container for `di:tableOfContents` and `di:thumbnail` (an image reference); not a text description |
| `di:setNumber` and `di:numSets` | Disc N of M for a multi-disc set |
| `tableOfContents/titleName` | Per-title names (`titleNumber` attribute) inside `di:description`; on some discs the only title text |

A non-English file can hold the generic placeholder title `Blu-ray` while `bdmt_eng.xml` holds
the real title; the placeholder is not a real title. When no
metadata file yields a title, the UDF **volume identifier** (Primary Volume Descriptor offset
24, typically an upper-case, underscore-separated name) is the fallback name for the disc. The
directory under `META/` is not always `DL` alone; other subdirectories may exist.

## index.bdmv

`index.bdmv` is the title table: what plays at power-on, what the top-menu key goes to, and the
numbered titles.

| Offset | Field |
|---|---|
| 0 | `INDX` |
| 4 | Version, 4 ASCII digits (`0100`, `0200`, `0240`, `0300`) |
| 8 | `u32` address of the indexes block |

At the indexes address:

| Offset | Field |
|---|---|
| +0 | `u32` index length |
| +4 | **First Playback** object (12 bytes) |
| +16 | **Top Menu** object (12 bytes) |
| +28 | `u16` number of titles |
| +30 | Titles, 12 bytes each |

Each 12-byte object:

| Offset | Field |
|---|---|
| 0 | Bits 7-6: **object type**: `1` = HDMV, `2` = BD-J |
| 6 | HDMV: `u16` `id_ref`, the index of an object in `MovieObject.bdmv`; `0xFFFF` means no object |

**Title numbers** as used by navigation commands: `0` is the Top Menu, `1`..N index the title
table, `0xFFFF` is First Playback.

The First Playback object selects the initial navigation mode. Individual titles have
their own object types, so a disc can mix HDMV and BD-J:

| First Playback | Behaviour |
|---|---|
| **HDMV** | Runs a navigation program from `MovieObject.bdmv`. The program may play logos, test conditions and jump into a menu or a title. The playlist it plays for the main feature is statically discoverable |
| **BD-J** | A Java application chooses what plays. The playlist is decided at run time by code and is not in any table |

## MovieObject.bdmv and HDMV navigation

| Offset | Field |
|---|---|
| 0 | `MOBJ` |
| 4 | Version, 4 ASCII digits |
| 40 | `MovieObjects()`: `u32` length, `u32` reserved |
| 48 | `u16` number of objects |
| 50 | Objects |

Each object: **1 byte flags, 1 byte reserved, `u16` number of commands**, then that many
**12-byte commands**. A densely branching dispatcher object may hold several thousand commands.

### Command layout

| Byte | Bits | Field |
|---|---|---|
| 0 | 7-5 | **Operand count** (0, 1 or 2) |
| 0 | 4-3 | **Group** |
| 0 | 2-0 | **Sub-group** |
| 1 | 7 | Operand 1 is immediate |
| 1 | 6 | Operand 2 is immediate |
| 1 | 3-0 | Branch option |
| 2 | 3-0 | Compare option |
| 3 | 4-0 | Set option |
| 4-7 | | Destination operand (`u32`) |
| 8-11 | | Source operand (`u32`) |

A non-immediate operand is a register reference: **bit 31 set selects a player status register
(PSR)**, bit 31 clear a **general purpose register (GPR)**. A GPR index is the low 12 bits (4096
GPRs); a PSR index is the low 7 bits (128 PSRs). A navigation command can only **store to GPRs**:
stores addressed to a PSR are refused, and PSRs hold values set by the player.

| Group | Sub-group | Option | Meaning |
|---|---|---|---|
| 0 BRANCH | 0 GOTO | branch `1` GOTO, `2` BREAK | GOTO jumps to a command index inside the object; BREAK ends the program |
| 0 BRANCH | 1 JUMP | `0` JumpObject, `1` JumpTitle, `2` CallObject, `3` CallTitle | Objects are addressed by object number; titles by title number (see above) |
| 0 BRANCH | 2 PLAY | `0` PlayPL, `1` PlayPL_PI, `2` PlayPL_PM | Operand is a **playlist id** (the number in the `.mpls` name). The other options of this sub-group (terminate, link) do not start a playlist |
| 1 CMP | | `1` BC (every bit set in the destination also set in the source), `2` EQ, `3` NE, `4` GE, `5` GT, `6` LE, `7` LT | When the comparison is false, the **next command is skipped** |
| 2 SET | 0 SET | `1` MOVE, `2` SWAP, `3` ADD, `4` SUB, `5` MUL, `6` DIV, `7` MOD, `8` RND, `9` AND, `0xA` OR, `0xB` XOR, `0xC` BITSET, `0xD` BITCLR, `0xE` SHL, `0xF` SHR | Result goes to the destination register |
| 2 SET | 1 SETSYSTEM | | Sets system parameters |

Arithmetic saturates at the 32-bit bounds; division and modulo by zero give `0xFFFFFFFF`;
shifts and bit numbers of 32 or more are not masked (a shift of 32+ gives 0). A value derived
from RND is unpredictable, so a branch or compare on it cannot be resolved without playing the
disc.

### Registers that steer a feature-finding program

Navigation programs use compares against player registers to dispatch (first start versus
return from a title, language, region, and so on). The values below describe one initial player configuration, not constants that every
player must expose. Language, region and capabilities depend on player settings; consult
[libbluray's register implementation](https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/register.c)
when reproducing that player's defaults.

| PSR | Power-on value | Note |
|---|---|---|
| 4 | `0xFFFF` | Current title: none selected |
| 5 | `0xFFFF` | Current chapter: none selected |
| 6, 7, 8 | `0` | |
| 0 | `1` | |
| 1 | `0xFF` | |
| 2 | `0x0FFF0FFF` | |
| 3 | `1` | |
| 10 | `0xFFFF` | |
| 12, 13 | `0xFF` | |
| 14 | `0xFFFF` | |
| 15 | `0xAAAA` | |
| 16, 17, 18 | `0x00FFFFFF` | |
| 19 | `0xFFFF` | |
| 20 | `2` | |
| 29 | `3` | |
| 30 | `0x0001FFFF` | |
| 31 | `0x00030200` | |
| 36, 37 | `0xFFFF` | |
| 42 | `0xFFFF` | |
| 44 | `0xFF` | |
| 48..61 | `0xFFFFFFFF` | |

A program that tests `PSR4 == 0xFFFF` sees "no title selected" at power-on. Properties that
follow for finding the main title:

- **Following First Playback can reach the feature on an HDMV disc.** The program may run
  logos and pre-roll through PlayPL (their playlists are short, or contain no feature video)
  and end in a PlayPL, or a JumpTitle to an object that does, for the feature.
- **The Top Menu's "Play Movie" is not in `MovieObject.bdmv` alone.** Menus are interactive
  graphics streams inside menu clips; their **button commands** are HDMV commands stored in the
  IG stream, not in the movie object file. A disc whose First Playback goes to the menu
  therefore reveals the feature only through those button commands.
- Branches on an RND-derived value, programs that never reach a PlayPL, and BD-J First Playback
  objects leave the feature undetermined from the navigation files alone.

## BD-J

A BD-J title is a Java application (Xlet) packaged in `BDMV/JAR/NNNNN.jar`, started according to
a **BD-J Object** in `BDMV/BDJO/NNNNN.bdjo`.

### BDJO layout

The file is **bit-packed, most significant bit first**. A fixed **48-byte header** (`BDJO`,
a 4-byte version such as `0100`, `0200`, `0240` or `0300`, then a 40-byte table of section
addresses) is followed by sections in sequence:

| Section | Layout |
|---|---|
| TerminalInfo | `u32` length; 5-byte default font; 4 bits initial HAVi configuration id; 1 bit menu call mask; 1 bit title search mask; 34 bits padding |
| AppCacheInfo | `u32` length; `u8` item count; 1 byte pad; items of 12 bytes (type 1, name reference 5, language code 3, pad 3) |
| AccessiblePlaylists | `u32` length; 11 bits playlist count; 1 bit access-to-all flag; 1 bit autostart-first-playlist flag; 19 bits pad; then 6 bytes per playlist (5-character name, 1 pad) |
| ApplicationManagementTable | `u32` length; `u8` application count; 1 byte pad; applications |

One application record:

| Field | Size |
|---|---|
| `application_control_code` | 8 bits: **`1` = AUTOSTART**, `2` = PRESENT |
| application type / reserved | 4 + 4 bits |
| organization id | 32 bits |
| application id | 16 bits |
| descriptor tag and length | 10 bytes |
| profile count | 4 bits, then 12 bits pad; each profile 6 bytes (profile number 2, major/minor/micro 3, pad 1) |
| priority | 8 bits |
| binding, visibility, reserved | 2 + 2 + 4 bits |
| application names | `u16` byte length, that many bytes, padded to an even length |
| icon locator | length-prefixed string, then 16 bits of icon flags |
| **base directory** | length-prefixed string: the primary jar id (for example `00000` → `BDMV/JAR/00000.jar`) |
| **classpath extension** | length-prefixed string: more jar ids separated by `;` |
| **initial class** | length-prefixed string: the Xlet's fully qualified class name |
| parameters | `u8` byte length, that many bytes, padded when the length is **even** |

A length-prefixed string is a `u8` length, that many Latin-1 bytes, then **one pad byte when the
length is even**. Trailing NULs are not part of the value.

The autostart application is the one that drives the disc. A `.jar` is a ZIP archive that may have
other data **prepended** before the archive, in which case the central directory sits at
`end-of-central-directory offset − central directory size` rather than at its recorded offset.

### What lives in application space

The BD-J layer is **application-defined space**. BD-J defines APIs, application lifecycle and packaging; disc-specific resource schemas
and playlist-selection logic are authored by the application. The following resource formats
are observed authoring conventions, not requirements of the BD-J standard:

- The Xlet selects playlists by number in code. The playlist id often appears as a string
  constant such as `00800.mpls` in the application's classes; jars that are not autostart
  applications (present-only apps, auxiliary jars) can contain playlist names that are not the
  feature.
- **Stream names, purposes and forced status are not stored in the playlist.** The stream
  table (below) carries only coding type, language and format codes. Whether an audio stream
  is a commentary, a descriptive-audio track or an alternate music track, and whether a subtitle
  is SDH or forced, is recorded, when at all, only in application resources, in
  authoring-framework-specific formats. These include:

  | Carrier | Content |
  |---|---|
  | `playlists.xml` as a loose file in `BDMV/JAR/<id>/` | Per playlist, comma-separated language lists for audio (`aud`) and subtitles (`sub`) in stream-table order, a `forced_sub` list whose cells are an **enumeration** (`1` = a full track that contains forced segments, `2` or `3` = a dedicated forced-narrative track, anything else none), and `aud_com1_idx` / `sub_com1_idx` listing commentary positions |
  | `dcx.xml` as a loose file in `BDMV/JAR/<id>/` | `<playlist id=... name=... durs=...>` elements (`durs` in seconds); nested `<audio>` and `<subtitle>` elements with language, purpose and forced/SDH attributes: `type="rnib"` on audio is described video, `form="sdh"` on a subtitle is SDH, `type="embed"` is forced; `id` is the 1-based STN slot. Later discs of the same framework compile the data into classes and ship no loose file |
  | `streamproperties.xml` with `playbackconfig.xml` (loose in `BDMV/JAR/<id>/`) | Per-stream content and qualifier; stream-number mapping |
  | `language_streams.txt`, `menu_base.prop` (loose in `BDMV/JAR/<id>/`) | Language and type lists; stream number to menu-button names |
  | `bluray_project.bin` (loose in `BDMV/JAR/<id>/`) | Binary file containing UTF-8 tokens such as `{lang}_{codec}_{purpose}_{region}_`, in stream-table order per playlist |
  | Compiled `.class` files | Strings such as `English Dolby Atmos`, `English Descriptive Audio`, `English SDH`, or ordinal references into enum classes whose names are obfuscated per disc |
  | Menu graphic file names | A language token in the name (for example `..._Eng_Composite1.png`); the set of tokens is the set of menu languages |

  A stream-name list is positional: the Nth entry names the Nth stream of the playlist's stream
  table, and empty entries still occupy their slot. Sibling playlists over the same feature clip
  can enumerate different subtitle sets, so one slot number can resolve to different PIDs in
  different playlists; a list describes one playlist's table only.
- Manifests may state a **feature playlist** outright, with its running time. An entry whose
  stated running time is under a minute is a candidate menu or stub, even when named
  `feature`; duration and naming are heuristics and require checking the actual content.

## MPLS

An `.mpls` file describes one playlist: an ordered list of **PlayItems**, each naming a clip and
an in/out interval, with a stream table per item and a mark table for chapters.

### Header

| Offset | Field |
|---|---|
| 0 | `MPLS` |
| 4 | Version, 4 ASCII digits (`0200`; `0240` is defined for 3D, though 3D discs can use `0200`; `0300` on UHD) |
| 8 | `u32` address of **PlayList()** |
| 12 | `u32` address of **PlayListMark()**; `0` when absent |
| 16 | `u32` address of ExtensionData (see below) |
| 20-39 | Remaining header bytes |

The header is at least 40 bytes. Sections are located by these addresses, never by position.

### PlayList()

| Offset | Field |
|---|---|
| 0 | `u32` length |
| 4 | 2 bytes reserved |
| 6 | `u16` number of PlayItems |
| 8 | `u16` number of SubPaths |
| 10 | PlayItems, one after another |

Each PlayItem is `u16 length` (not counting the length field) followed by that many bytes.
The next item starts `2 + length` after this one. Always trust the length: an item may carry
bytes beyond the fixed fields.

### PlayItem

| Offset | Field |
|---|---|
| 0-4 | **Clip information file name**: 5 ASCII digits (the clip stem) |
| 5-8 | **Codec identifier**: `M2TS` |
| 9 | Reserved |
| 10 | Bit 4: **is_multi_angle**; bits 3-0: **connection_condition** |
| 11 | **ref_to_STC_id**: index of the clip's STC sequence |
| 12-15 | **IN_time**, `u32`, **45 kHz** ticks |
| 16-19 | **OUT_time**, `u32`, 45 kHz ticks |
| 20-27 | UO_mask_table (8 bytes) |
| 28 | Miscellaneous flags |
| 29 | Still mode |
| 30-31 | Still time |
| 32 | (Multi-angle only) number of angles |
| 32 or `32 + 2 + (angles − 1) × 10` | **STN table** |

**Time base.** IN and OUT are 45 kHz ticks: seconds = ticks / 45000. They are the upper 32 bits
of the 33-bit, 90 kHz presentation timestamps found in the clip's PES headers: a time `t`
compares with a PES PTS `p` as `p / 2`. A PlayItem's duration is `OUT − IN`; a playlist's
duration is the sum over its items. Each interval is in **the clip's own clock**, not in a
playlist clock.

**Connection condition** (low nibble of byte 10): `1` = non-seamless connection to the
previous PlayItem, `5` and `6` = seamless connection. A seamless connection says nothing about
the numbers in the two clips' PTS sequences, which are independent (see
[Timelines](#timelines)).

**Multi-angle items.** When bit 4 of byte 10 is set, a **two-byte header** follows the fixed
part at offset 32 (its first byte is the number of angles), then a **10-byte record for each additional
angle**; the primary angle's clip is the one named at the head of the item. The STN table begins
after this block, at `32 + 2 + (angles − 1) × 10`. A reader that assumes the STN table always
starts at offset 32 misreads every multi-angle item.

**Each PlayItem has its own STN table.** A playlist whose items point at different clips can
carry different stream sets per item (for example a first item that is an audio-less logo clip
and a second that is the feature). Reading only the first item's table describes the first
clip, not the playlist.

### STN table

| Offset | Field |
|---|---|
| +0 | `u16` length |
| +2 | 2 bytes reserved |
| +4 | `u8` number of **primary video** streams |
| +5 | `u8` number of **primary audio** streams |
| +6 | `u8` number of **PG** (presentation graphics / subtitle) streams |
| +7 | `u8` number of **IG** (interactive graphics) streams |
| +8 | `u8` number of **secondary audio** streams |
| +9 | `u8` number of **secondary video** streams |
| +10 | `u8` number of **picture-in-picture PG** streams |
| +11 | `u8` number of **Dolby Vision enhancement-layer** video streams ([4K UHD](/docs/uhd/)) |
| +12 | 4 bytes reserved |
| +16 | Stream entries |

Stream entries follow in **a fixed category order**: primary video, primary audio, PG followed
immediately by the picture-in-picture PG entries (one run, no reference block between), IG,
secondary audio, secondary video, Dolby Vision enhancement layer. Every entry is a
**stream_entry** (where the stream is) followed by **stream_attributes** (what it is).

| Part | Layout |
|---|---|
| stream_entry | `u8` length (not counting itself), `u8` **entry type**, then type-dependent fields holding the PID |
| stream_attributes | `u8` length, `u8` **coding type**, then coding-type-dependent fields |

PID location inside the stream_entry (offsets from the length byte):

| Entry type | Stream is | PID at |
|---|---|---|
| 1 | In the PlayItem's own clip | +2 |
| 2 | In a SubPath's SubClip | +4 |
| 3 | In a SubPath's clip | +3 |
| 4 | SubPath Dolby Vision enhancement layer | +3 |

Secondary streams carry **reference blocks** after the attributes. Secondary **audio**: `u8`
count, 1 reserved byte, that many reference bytes, then one pad byte when the count is **odd**
(the entry's extra size is `2 + count + (count mod 2)`). Secondary **video** has two such blocks
in a row: audio references, then PG references. PG and IG entries have no reference block.

An entry whose length or attribute length runs past the item ends the stream table, and every
category after it.

#### Stream attributes by category

| Category | Bytes after the coding type |
|---|---|
| Video | `format_rate`: high nibble **video format**, low nibble **frame rate**. For HEVC, one more byte: high nibble **dynamic range** (`0` SDR, `1` HDR10, `2` Dolby Vision), low nibble **colour space** (`0` unknown, `1` BT.709, `2` BT.2020) — see [4K UHD](/docs/uhd/) |
| Audio (primary, secondary) | `format_rate`: high nibble **channel layout**, low nibble **sample rate**; then 3 bytes **ISO 639-2** language |
| PG | 3 bytes language |
| TextST | 1 byte character code, then 3 bytes language |
| IG | 3 bytes language |

A PG or IG coding type (`0x90`, `0x91`) can be found in an **audio** entry slot of a table whose
streams are misaligned; its attributes then use the PG layout (language right after the coding
type), not the audio layout.

**Video format** nibble: `1` 480i, `2` 576i, `3` 480p, `4` 1080i, `5` 720p, `6` 1080p, `7` 576p,
`8` 2160p.

**Frame rate** nibble: `1` 23.976, `2` 24, `3` 25, `4` 29.97, `6` 50, `7` 59.94 (`5` and `8` are not assigned, although `8` occurs on discs; treat it as unknown).

**Channel layout** nibble: `1` mono, `3` stereo, `6` multichannel (channel count unspecified), `12` a stereo plus
multichannel combination (the multichannel layout is not stated). The nibble is the base
layout; a lossless track can carry more channels than it states (a TrueHD track listed as multichannel
may be 5.1, 7.1 or Atmos).

**Sample rate** nibble: `1` 48 kHz, `4` 96 kHz, `5` 192 kHz, `12` combination of 48 and 192 kHz,
`14` combination of 48 and 96 kHz. Combination codes name a core plus an extension at another
rate; the primary rate is 48 kHz.

**Language** is a 3-letter **ISO 639-2** code. Discs may use either the bibliographic or the
terminologic form. The twenty languages whose forms differ are:

| /B | /T | /B | /T | /B | /T | /B | /T |
|---|---|---|---|---|---|---|---|
| `alb` | `sqi` | `fre` | `fra` | `may` | `msa` | `wel` | `cym` |
| `arm` | `hye` | `geo` | `kat` | `per` | `fas` | | |
| `baq` | `eus` | `ger` | `deu` | `rum` | `ron` | | |
| `bur` | `mya` | `gre` | `ell` | `slo` | `slk` | | |
| `chi` | `zho` | `ice` | `isl` | `tib` | `bod` | | |
| `cze` | `ces` | `mac` | `mkd` | `mao` | `mri` | | |
| `dut` | `nld` | | | | | | |

An absent or empty language field means "unknown", not a different language.

### Coding types

The coding type byte shares the value space of the MPEG-TS PMT `stream_type`; the same codes
appear in the STN table, in CLPI ProgramInfo and in the PMT.

| Code | Stream |
|---|---|
| `0x02` | MPEG-2 video |
| `0x1B` | H.264 / AVC video |
| `0x20` | H.264 / MVC dependent view (3D) |
| `0x24` | HEVC video ([4K UHD](/docs/uhd/)) |
| `0xEA` | VC-1 video |
| `0x80` | LPCM audio |
| `0x81` | Dolby Digital (AC-3) |
| `0x82` | DTS |
| `0x83` | Dolby TrueHD (with an AC-3 core) |
| `0x84` | Dolby Digital Plus (E-AC-3) |
| `0x85` | DTS-HD High Resolution |
| `0x86` | DTS-HD Master Audio |
| `0x87` | E-AC-3 (also appears as a PMT stream type) |
| `0x90` | Presentation Graphics (PGS subtitles) |
| `0x91` | Interactive Graphics (menus) |
| `0x92` | Text subtitle (TextST) |
| `0xA1` | Secondary E-AC-3 |
| `0xA2` | Secondary DTS-HD (DTS Express / LBR), lossy, low bitrate |

`0x91` is a menu overlay, not a subtitle. `0xA2` is a low-bitrate lossy stream used for
picture-in-picture commentary mixing, not a lossless DTS-HD track.

### SubPaths and SubPlayItems

The PlayList header carries a SubPath count, and entry types 2 to 4 in a stream_entry address
streams stored in a SubPath's clip rather than the PlayItem's clip. A SubPath is how secondary
video and audio, out-of-mux presentation graphics and the Dolby Vision enhancement layer are
located when they are not in the main clip. The structure of a SubPath and its SubPlayItems is
not specified on this page.

### PlayListMark()

Located at the header's mark address.

| Offset | Field |
|---|---|
| 0 | `u32` length |
| 4 | `u16` number of marks |
| 6 | Marks, **14 bytes each** |

| Mark offset | Field |
|---|---|
| 0 | Reserved |
| 1 | **mark_type**: `1` = entry mark (a chapter), `2` = link point, `0` reserved |
| 2-3 | `u16` **ref_to_PlayItem_id**: index of the PlayItem in this playlist |
| 4-7 | `u32` **mark_time_stamp**, 45 kHz, in the referenced item's clip clock |
| 8-9 | entry_ES_PID |
| 10-13 | `u32` duration |

Note that `mark_type` is the **second** byte; the first is reserved. Only type `1` marks are
chapters. A chapter's position on the playlist's timeline is

```
position = Σ (OUT − IN of every earlier PlayItem) + (mark_time_stamp − IN of the referenced PlayItem)
```

all in 45 kHz ticks. A mark that falls before its item's IN time maps before zero and clamps to
0; a mark whose PlayItem reference is out of range has no position. **Chapters have no names in
the playlist**; they are ordinals.

### ExtensionData

The address at header offset 16 locates extension data used by features added after the base
format. For **3D**, the MVC dependent-view stream is not in the base STN table; it is described
in an extension stream table (STN_table_SS). The dependent view's PID is the base view's PID
plus one. The layout of the extension blocks is not specified here.

## CLPI

One `.clpi` per clip.

| Offset | Field |
|---|---|
| 0 | `HDMV` |
| 4 | Version, 4 ASCII digits |
| 12 | `u32` address of **ProgramInfo** |
| 40 | **ClipInfo** |

**ClipInfo** (offset 40): `u32` length (+0), 2 bytes reserved (+4), `u8` clip stream type (+6),
`u8` application type (+7), 4 bytes (+8), **`u32` TS recording rate** (+12, offset 52 in the
file), and **`u32` number of source packets** at **file offset 56**. The clip file's size is
exactly `source packets × 192` bytes. For a **3D** clip the count is for the base view only; the
SSIF file for the clip is larger. A damaged file may report 0.

**ProgramInfo** (at its address):

| Offset | Field |
|---|---|
| 0 | `u32` length |
| 4 | 1 byte reserved |
| 5 | `u8` number of programs |
| 6 | Programs |

A program: `u32` SPN of program-sequence start, `u16` program-map PID, `u8` number of streams,
`u8` number of stream groups (8 bytes), then each stream:

| Field | Size |
|---|---|
| PID | 2 |
| `u8` StreamCodingInfo length | 1 |
| StreamCodingInfo | `coding_type`, then by type |

StreamCodingInfo contents after the coding type: video types (`0x02`, `0x1B`, `0x24`) carry
no language; audio types (`0x80`..`0x86`, `0xA1`, `0xA2`) carry the format/rate
byte at +1 and the **language at +2..+5**; TextST carries a character code at +1 and the
language at +2..+5; PG and IG carry the language at **+1..+4**.

A clip's ProgramInfo can list a PID that no playlist's STN table names. ProgramInfo restates, per clip, the stream table that the playlist's STN table states per
playlist. A PID is only unique **within one clip**: two unrelated clips each place their first
audio stream at the same PID.

**SequenceInfo, CPI / EP_map.** A clip's timeline is divided into **ATC sequences** (arrival
clock runs continuously) and **STC sequences** (system clock runs continuously); a PlayItem's
`ref_to_STC_id` selects an STC sequence. The **EP_map** in CPI relates presentation time to
source packet number for random access, and a player seeking to a PlayItem's IN time uses it to
find the first packet to read. EP_map entries mark I-frames, so a clip's final GOP lies **after** the last entry point: the
last entry is not the end of the clip, and a PlayItem whose OUT_time is the clip's presentation
end lies past it. These structures' binary layouts are not specified on this page.
Reading a clip whole, from byte 0, and discarding material outside IN/OUT by timestamp does not
require them.

## M2TS

A clip stream file is a sequence of **source packets** of **192 bytes**:

| Bytes | Content |
|---|---|
| 0-3 | **TP_extra_header** |
| 4-191 | One **188-byte MPEG-2 transport stream packet**, beginning with sync byte `0x47` at offset 4 |

**TP_extra_header** is a 32-bit big-endian word:

| Bits | Field |
|---|---|
| 31-30 | **copy_permission_indicator**: `11b` when the data is encrypted, `00b` when it is not |
| 29-0 | **arrival_time_stamp (ATS)**, 30 bits, on the 27 MHz clock |

A clip's source packets begin at file offset 0, so **packet N starts at `192 × N`**, and the
sync byte of every packet is at `192 × N + 4`. A byte stream cut off this grid has no sync
bytes at the expected offsets. A stream may contain zero-filled regions or lost packets; a lost packet shows as a
continuity-counter gap.

### Aligned units

**32 source packets = 6144 bytes = 3 sectors** form an **aligned unit**. AACS encrypts at this
granularity: the first 16 bytes of each unit are a clear seed and the rest is the encrypted
region. Aligned units are counted **from the start of the clip file**, and a clip file ends on
a whole unit (unlike an HD DVD `.EVO`, which need not). The first byte of an unencrypted unit has its two top bits (the
copy_permission_indicator of the unit's first packet) `00`; in an encrypted unit they are
non-zero. See [AACS](/docs/aacs/).

### Transport stream packet

| Byte | Bits | Field |
|---|---|---|
| 0 | | `0x47` |
| 1 | 7 | transport_error_indicator |
| 1 | 6 | **payload_unit_start_indicator** (PUSI) |
| 1-2 | 12-0 | **PID** (13 bits: `(byte1 & 0x1F) << 8 \| byte2`) |
| 3 | 5-4 | **adaptation_field_control**: `01` payload only, `10` adaptation only, `11` both, `00` reserved |
| 3 | 3-0 | **continuity_counter** |

When an adaptation field is present its first byte is its length (at most 183) and the next
byte holds flags; **bit 7 is the discontinuity_indicator**. PID `0x1FFF` is the null PID.
Continuity counters increment on each payload-carrying packet of a PID; a packet repeating the
previous CC with the same payload is a legal duplicate, and other jumps require checking the discontinuity indicator and transport errors before
concluding that packets were lost.
A packet with the transport_error_indicator set is damaged.

### PES

Elementary streams are carried in PES packets: `00 00 01`, `stream_id`, `u16` length, flag
bytes, `u8` header data length at byte 8, then the optional fields. Video PES may have length
`0` (unbounded). The header can span more than one transport packet (it is up to 9 + 255
bytes), so the start of the elementary data can be in the second packet of a PES.

| Stream | `stream_id` |
|---|---|
| Video | `0xE0` (video range `0xE0`-`0xEF`) |
| Audio, PGS, and other streams in `private_stream_1` | `0xBD` |

PES header flags byte 7 bits 7-6 are the PTS_DTS_flags: `10` PTS only, `11` PTS and DTS. Each
timestamp is **5 bytes**, 33 bits at **90 kHz**:

```
ts = ((b0 >> 1) & 7) << 30 | b1 << 22 | (b2 >> 1) << 15 | b3 << 7 | b4 >> 1
```

Bit 0 of `b0`, `b2` and `b4` are marker bits that must be 1. Stream ids with no header
extension (no flags, no timestamps; the packet is 6 bytes of header and then payload):
`0xBC`, `0xBE`, `0xBF`, `0xF0`, `0xF1`, `0xF2`, `0xF8`, `0xFF`.

### PAT and PMT

PSI sections travel on PID `0` (PAT) and the program-map PID. The first payload byte of a
PUSI packet is the **pointer_field**; the section starts that many bytes later, and a section
may continue into following packets of the same PID.

| Section | table_id | Notable fields |
|---|---|---|
| PAT | `0x00` | `section_length` 12 bits at bytes 1-2; program entries from **offset 8**, 4 bytes each (`program_number`, `0xE000 \| PID`); `program_number 0` names the network PID, not a program |
| PMT | `0x02` | `program_info_length` 12 bits at bytes 10-11; the stream loop starts at `12 + program_info_length`; each entry is `stream_type` (1), `0xE000 \| elementary_PID` (2), `ES_info_length` (2, 12 bits), descriptors |

A section ends with a CRC-32; its `current_next_indicator` (bit 0 of byte 5) is `1`. A BD PMT
carries an **HDMV registration descriptor** (tag `0x05`, length 4, `HDMV`) in its program-info
loop, which declares that stream types of `0x80` and above are BD-ROM's. The `stream_type` byte
takes the codes in the table above. A PMT may also carry MPEG audio (`0x03`, `0x04`), AAC
(`0x0F`), PES private data (`0x06`) and MPEG-1 video (`0x01`) on transport streams not
authored as retail BD-ROM, and `0x87` for E-AC-3.

### PIDs

BD-ROM uses fixed PID conventions in place of the free allocation used by broadcast. Their
bases are:

| PID | Use |
|---|---|
| `0x0000` | PAT |
| `0x1001` | PCR (adaptation-field-only packets); no elementary stream uses it |
| `0x1011` | **Primary video**; the video range is `0x1011`-`0x101F` |
| `0x1100` | Primary audio base |
| `0x1200` | PG (subtitle) base |
| `0x1400` | IG (menu) base |
| `0x1A00` | Secondary audio base |
| `0x1B00` | Secondary video base |

A usable elementary PID is in `0x0010`-`0x1FFE`. In a 3D clip the **MVC dependent view** takes
the PID after the base view (`0x1012` when the base is `0x1011`). The PMT's PID is whatever the
PAT names.

The same PID values appear in many clips on one disc: **a PID identifies a stream only together
with its clip**.

### Resynchronization

After a slipped or damaged region, a packet boundary is a position where byte 4 is `0x47` and
byte 196 (192 bytes later) is `0x47` again; a lone `0x47` inside payload is not a boundary.

## Elementary streams

### Video

| Codec | Coding type | Elementary-stream facts |
|---|---|---|
| **MPEG-2** | `0x02` | Start codes after `00 00 01`: sequence header `0xB3`, extension `0xB5`, GOP `0xB8`, picture `0x00`. One coded picture can span several PES packets; only the first carries a PTS. Picture coding type 1 is I. `frame_rate_code`: `1` 23.976, `2` 24, `3` 25, `4` 29.97, `5` 30, `6` 50, `7` 59.94, `8` 60. `aspect_ratio_information`: `1` square pixel, `2` 4:3, `3` 16:9, `4` 2.21:1. 1080i and 480i/576i appear |
| **VC-1** | `0xEA` | Start codes: sequence header `0x0F`, entry point `0x0E`, frame `0x0D`. Advanced profile when the profile field (bits 7-6 of the first byte after the sequence-header start code) is `3`. A random-access point is signalled by a **sequence header present in the PES**. Advanced-profile picture types come from a PTYPE variable-length code; an interlaced sequence uses an FCM/FPTYPE code first. Emulation-prevention bytes (`00 00 03`) can occur inside headers |
| **H.264 / AVC** | `0x1B` | Annex B byte stream. NAL types used: slice non-IDR `1`, IDR `5`, SPS `7`, PPS `8`, access unit delimiter `9`. Disc AVC commonly aligns PES and access units; parse NAL boundaries rather than treating this as a general MPEG-TS rule. Random-access points include **IDR pictures** and **non-IDR recovery points** (open-GOP intra pictures); a disc can contain either. Parameter sets may be redefined mid-stream under the same id |
| **MVC** | `0x20` | See below |
| HEVC | `0x24` | [4K UHD](/docs/uhd/) |

**Open GOP.** A title or a clip join can begin on an open GOP: leading B-pictures reference a
picture before the clip and cannot be decoded, and a decoder that does not skip them shows
corrupt frames. The marker differs by codec: MPEG-2 `broken_link` in the GOP header, VC-1
`BROKEN_LINK` with an open entry point, and for H.264 an I-picture with a recovery-point SEI
and no IDR NAL (a clip, even the last one, can open on one).

**Interlace.** The video-format nibble can state an interlaced format (480i, 576i, 1080i);
field order and pairing are carried in the elementary stream.

**Frame reordering.** PTS and DTS differ for reordered pictures. A PES timestamp belongs to the first access
unit beginning in that PES; timestamp presence and packet alignment must be parsed, not
inferred from the codec alone.

#### Blu-ray 3D (MVC)

A 3D title stores one eye as an ordinary H.264 base view (`0x1B`, for example PID `0x1011`)
and the other as an **MVC dependent view** (`0x20`, PID base + 1). The playlist's `mvc_base_view_r_flag` identifies whether the base view is the right eye;
it is not always the left. The dependent view's
NAL units are **prefix NAL (type 14)**, **subset SPS (type 15)**, **coded slice extension
(type 20)** and PPS (type 8); it carries no ordinary SPS. Its access units share the base
view's DTS and PTS cadence, so each dependent access unit pairs with the base access unit of the
same time. A dependent-view intra picture is still predicted from the base view, so it is not an
independent random-access point. The disc stores the clip two ways:

| File | Content |
|---|---|
| `STREAM/NNNNN.m2ts` | Base view only (2D compatible); CLPI's source packet count covers this file |
| `STREAM/SSIF/NNNNN.ssif` | **Interleaved** blocks of base-view and dependent-view packets, the dependent-view block first in each pair; larger than the `.m2ts` |

The playlist's base STN table does not list the dependent view; the extension stream table of
the playlist does. A playlist with an SSIF file for its clips is a 3D
playlist; a playlist may mix 3D and 2D clips.

### Audio

#### LPCM (`0x80`)

Each PES payload opens with a **4-byte LPCM header**, then big-endian PCM.

| Byte | Field |
|---|---|
| 0-1 | Payload size |
| 2 | High nibble **channel assignment**, low nibble **sample rate** |
| 3 | Bits 7-6: **sample depth** (`1` 16-bit, `2` 20-bit, `3` 24-bit); remaining bits flags (start flag) |

| Channel assignment | Channels | Coded order |
|---|---|---|
| 1 | 1 | mono |
| 3 | 2 | L R |
| 4, 5 | 3 | stored in output order |
| 6, 7 | 4 | stored in output order |
| 8 | 5 | stored in output order |
| 9 | 6 | L R C Ls Rs LFE |
| 10 | 7 | L R C Ls Lrs Rrs Rs |
| 11 | 8 | L R C Ls Lrs Rrs Rs LFE |

Sample-rate nibble: `1` 48 kHz, `4` 96 kHz, `5` 192 kHz. Samples are interleaved per sample
frame, and **channels are padded to an even count per sample frame** (a 5.1 stream has 6 slots,
a 5-channel stream 6). A 20-bit stream occupies a 24-bit container. A PES holds whole sample
frames. Other codes in the nibbles are reserved.

#### Dolby Digital (AC-3) and Dolby Digital Plus (E-AC-3)

Every syncframe starts with syncword `0x0B77`.

| Field | Position |
|---|---|
| `bsid` | byte 5, bits 7-3. `bsid ≥ 11` is E-AC-3; below is AC-3 |
| AC-3: `fscod` / `frmsizecod` | byte 4, bits 7-6 / 5-0. Frame size is read from a table indexed by `frmsizecod` and `fscod`. Always 6 audio blocks × 256 = **1536 samples** |
| E-AC-3: `strmtyp`, `substreamid` | byte 2, bits 7-6 and 5-3 |
| E-AC-3: `frmsiz` | 11 bits from byte 2 (low 3 bits) and byte 3; frame size = `(frmsiz + 1) × 2` bytes |
| E-AC-3: `fscod`, `numblkscod` | byte 4, bits 7-6 and 5-4 |

`fscod` `0` / `1` / `2` is 48 / 44.1 / 32 kHz. For E-AC-3 `fscod = 3` selects a reduced rate
through `fscod2` (byte 4 bits 5-4: 24 / 22.05 / 16 kHz) with 6 blocks. `numblkscod` `0` / `1` /
`2` / `3` is 1 / 2 / 3 / 6 blocks of 256 samples. AC-3 channel count comes from `acmod` (read
from byte 6) plus the LFE flag: base channel counts per `acmod` 0..7 are 2, 1, 2, 3, 3, 4, 4, 5.
Syncframes end in a CRC-16.

An **E-AC-3 access unit is a frame set**: the independent substream with `substreamid 0`
plus every dependent substream and additional substream that follows it, all covering the same
time. `strmtyp 1` is a dependent substream; `strmtyp 0` or `2` with `substreamid ≠ 0` is an
additional substream. A new access unit starts only at the next substream `0`. A frame set may
begin with a legacy AC-3 frame (an AC-3 core for the E-AC-3 extension).

#### DTS and DTS-HD (`0x82`, `0x85`, `0x86`, `0xA2`)

A **core frame** starts with `7F FE 80 01`. Header fields from the bit stream after the
sync word: FTYPE (1), deficit samples (5; `31` in a normal frame, giving `deficit + 1 = 32`),
CRC-present (1), NBLKS (7; samples per frame = `(NBLKS + 1) × 32`, and `NBLKS + 1` is a
multiple of 8), **FSIZE (14; frame size in bytes = FSIZE + 1, at least 96)**, AMODE (6; 0-15 are
valid channel arrangements), SFREQ (4), RATE (5), reserved (1), DRC, TS, AUX, HDCD (1 each),
extension audio type (3), extension present (1), ASPF (1), LFE (2; `3` invalid), predictor
history (1), header CRC (16, only if CRC-present), filter perfect (1), encoder revision (4),
copy history (2), PCM resolution (3).

SFREQ → Hz: `1` 8000, `2` 16000, `3` 32000, `6` 11025, `7` 22050, `8` 44100, `11` 12000,
`12` 24000, `13` 48000, `14` 96000, `15` 192000 (`0`, `4`, `5`, `9`, `10` are reserved).
PCM resolution → bits: `0`, `1` 16; `2`, `3` 20; `5`, `6` 24 (`4`, `7` reserved).

**DTS-HD** adds extension substreams (**EXSS**) with sync word `64 58 20 25`, placed after the
core. An EXSS begins on a **4-byte boundary** after the core frame, so up to 3 padding bytes
may separate them. EXSS header: 8 bits user-defined, 2 bits extension substream index, 1 bit
header-size type, then header size (8 bits short form, 12 bits long form) and **frame size − 1**
(16 bits short, 20 bits long). Frame size is the total bytes including the sync word. When
static fields are present, a 2-bit reference clock code selects 32 / 44.1 / 48 kHz and a 3-bit
frame-duration code gives `512 × (code + 1)` samples per frame.

An **access unit** is the core frame plus all EXSS substreams after it, ending at the next
core sync. Lossless (`0x86`) and high-resolution (`0x85`) data live in the extension; dropping
it leaves a lossy core. A DTS Express stream (`0xA2`) can have **no core**, consisting only of
chained EXSS frames.

#### Dolby TrueHD (`0x83`)

A TrueHD PES carries **TrueHD access units interleaved with AC-3 frames** (the AC-3 core) on the
same PID.

- **AC-3 frames** start with `0B 77` and are sized as AC-3. Because `0B 77` is also a legal
  TrueHD access-unit header, an AC-3 frame is recognised only when the data right after its
  end is itself a plausible frame.
- **TrueHD access unit**: bytes 0-1 hold, in the top 4 bits, a check nibble and, in the low 12
  bits, the **length in 2-byte words** (at most 4095 words = 8190 bytes); bytes 2-3 are a timing
  value; the substream data follows. A length of 0 is padding.
- A **major sync** appears at offset 4 of an access unit: `F8 72 6F BA` (TrueHD) or
  `F8 72 6F BB` (MLP), and is a decoder re-initialization point. Its header is 28 bytes, plus
  `2 + (extension count) × 2` when bit 0 of byte 25 is set (the extension count is the high
  nibble of byte 26), and ends in a CRC-16.
- After the TrueHD sync word, a **32-bit `format_info`** (at access-unit offset 8): bits 31-28
  **rate** (`0` 48 kHz, `1` 96, `2` 192, `8` 44.1, `9` 88.2, `10` 176.4), bits 12-0 the
  **8-channel presentation channel assignment**, bits 19-15 the **6-channel presentation channel
  assignment**. Channel count is the sum of per-bit weights; bits 0..12 of the 8-channel
  mask weigh 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 1, 1 and bits 0..4 of the 6-channel mask weigh 2, 1,
  1, 2, 2; bit 2 (and bit 12 of the 8-channel mask) is an LFE.
- **`num_substreams`** is the high nibble of byte 16 of the major sync (counting the first sync
  byte as byte 0). **Four or more substreams are used by freemkv as an Atmos detection heuristic**;
  the count alone does not describe the object metadata or establish its validity.
- An access unit lasts **40 samples** of the base rate: 833 333 ns for the 48 kHz family
  (48, 96, 192 kHz) and 907 029 ns for the 44.1 kHz family.
- Each access unit has a parity check: the XOR of its 4-byte header and the substream directory,
  folded, has its two nibbles XOR to `0xF`.
- TrueHD and MLP carry decoding state **across** access units, so a corrupt unit invalidates
  decoding until the next valid major sync.

#### Secondary audio

Secondary audio (`0xA1` secondary E-AC-3, `0xA2` secondary DTS-HD) is the stream mixed over
the primary audio (commentary, interactive audio). It is announced in the STN table's
secondary-audio entries, which use the audio attribute layout, and its PIDs start at `0x1A00`.

### PGS subtitles (`0x90`)

A PGS stream is a series of **segments**. Each PES payload in a transport stream starts with a
segment (no `PG` magic and no timestamps inside the segment as in `.sup` files; timing is in
the PES header).

| Segment | Type |
|---|---|
| PDS, palette definition | `0x14` |
| ODS, object definition | `0x15` |
| **PCS, presentation composition** | `0x16` |
| WDS, window definition | `0x17` |
| **END** | `0x80` |

Segment: `u8` type, `u16` length, payload.

**PCS payload** (offsets from the segment start):

| Offset | Field |
|---|---|
| 3-4 | Video width |
| 5-6 | Video height |
| 7 | Frame rate code |
| 8-9 | Composition number |
| 10 | **Composition state**; `0x80` = **epoch start** |
| 11 | Palette update flag |
| 12 | Palette id |
| 13 | **Number of composition objects** |
| 14 | First composition object |

A composition object has an 8-byte base record: object id (2), window id (1), **flags** (1), x (2), y (2). The
**forced** flag is **bit `0x40` of the flags byte** (offset 17 for the first object).
If bit `0x80` is set, an additional 8-byte crop rectangle follows; skipping it misaligns
the next object. See [FFmpeg's PGS parser](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/pgssubdec.c).

**Display sets and lifecycle.** A **display set** is a PCS followed by its WDS, PDS and ODS
segments and an END segment. A PCS with one or more composition objects starts a visible
subtitle; a later PCS with **zero** objects (an "empty" or clear set, followed by WDS and END)
removes it. The PTS of the PCS is the time the set takes effect, so a composition remains active until a later composition replaces or clears it.
Its duration follows those presentation events, not the segment byte length. A display set can span several PES
packets; it opens at a PCS and is terminated by END. A decoder may recover a missing END
at the next PCS, but that is not the normal display-set boundary.

Other segments:

- **WDS**: one byte window count, then 9 bytes per window (id 1, x 2, y 2, width 2, height 2).
- **PDS**: palette id (1), version (1), then 5-byte entries (index, three colour components,
  alpha).
- **ODS**: object id (2), version (1), sequence flag (1; `0xC0` = first and last fragment),
  `u24` data length (width and height included), width (2), height (2), then RLE-compressed pixel
  data in which a `00 00` pair ends a line.

**Forced subtitles.** A subtitle stream is **forced** when it carries only the narrative
segments that must display even when subtitles are off (foreign-language dialogue, signs). The
composition-object forced flag marks objects that must show. Application manifests also record forced
status: in the `playlists.xml` convention a dedicated forced track and a full track containing
forced segments are both recorded (the `forced_sub` values `3` and `1`), so a manifest can supply track-level intent. It is not the only evidence: inspecting
composition-object flags also identifies forced content, though classifying an entire track
requires examining its display sets. The exact patterns of the PCS flag across
dedicated and full tracks are not established here. The playlist's stream table has no forced
indicator.

### IG (`0x91`)

Interactive Graphics carry the menus: button images, highlight states and the **HDMV button
commands** (the commands in [HDMV navigation](#movieobjectbdmv-and-hdmv-navigation)). IG
streams belong to menu clips and appear in a playlist's IG count; they are not subtitles. The
segment layout of IG is not specified on this page.

### Text subtitles (`0x92`)

TextST is a text-based subtitle stream with a character code byte (see STN attributes) and
language. Its stream layout is not specified on this page.

## Timelines

### Clocks

Three clocks are involved:

| Clock | Where | Rate |
|---|---|---|
| PTS / DTS | PES headers | 90 kHz, 33 bits |
| PlayItem IN / OUT, mark times | MPLS | 45 kHz, 32 bits |
| ATS and PCR | TP_extra_header, adaptation field | 27 MHz (ATS is the low 30 bits of the PCR clock) |

A PCR appears on the PCR PID at most 100 ms apart.

### Within one clip and across clips

Inside a clip, PTS runs forward except for B-picture reordering (a backward step of at most a
few frames, well under a second). **Across clips, the numbering is independent**: each clip has
its own STC, and its first PTS is whatever the clip's authoring set. Consequences a consumer
must handle:

- The PTS at the start of one clip bears no relation to the end of the previous clip. A
  **backward step larger than the reorder depth** (several seconds) at a join is a clock reset,
  not reordering.
- A clip's stream file is **not trimmed to its PlayItem**. Packets before IN and after OUT are
  in the file; the playlist presents only the interval between IN and OUT. IN and OUT need not
  fall on a random-access picture: a player decodes from an earlier random-access point and
  begins display at IN, and a picture before IN that is needed as a reference is decoded but not
  shown.
- PlayItems can **overlap or skip** in the clip clock when the same clip file is reused or when
  a playlist is a seamless branch. In a seamlessly branched playlist, the next PlayItem's IN can
  be earlier than the previous item's OUT.
- Different tracks cross a join at different moments: the previous clip's **audio tail arrives
  after the next clip's first video**, because audio is multiplexed behind video.
- The **same clip can be referenced by several PlayItems** of one playlist, with different
  intervals. The bytes of the file exist once.

### Building a continuous timeline

For a playlist of PlayItems *i* = 0..n−1 with durations `d_i = OUT_i − IN_i` (45 kHz ticks):

```
offset_i = (d_0 + … + d_{i−1}) − IN_i          (in the common clock)
output_time = clip_time + offset_i
```

A frame belongs to PlayItem *i* only if its clip time is between `IN_i` and `OUT_i`; frames
outside every interval are not part of the playlist. The total timeline length is `Σ d_i`.

To tell which PlayItem a packet belongs to, a reader that knows each clip's **byte range in
the concatenated stream** can resolve it by position; clip time alone is ambiguous when
intervals overlap or one clip serves several items. 
A **continuity break inside a clip** (a lost packet, a damaged region, a null-PID packet carrying
a discontinuity indicator) can cut a picture in two. Inter-coded video after the gap may
reference lost pictures, so a decoder resumes at the next random-access picture. Audio and
subtitles are independently decodable, except TrueHD/MLP, which resumes at the next valid major
sync.

## Title identification

A disc usually holds far more playlists than titles. Playlist numbering carries no meaning, and
the properties below are useful evidence for title selection. They are heuristics, not
proof of editorial intent: short films, chapterless titles and deliberately misleading
navigation are all possible.

**Playlists can reuse clips.** A playlist is a list of references; clips are shared. One clip
can appear in many playlists, and several times in one. A playlist's **byte size**
(clip sizes added once per distinct clip, from `source packets × 192` or from the file extents)
and its **duration** (sum of `OUT − IN` over items, which counts a reused clip each time) are
different quantities. A playlist that references one clip many times has a duration far above
its size.

**Play-all playlists.** A "play all" playlist lists every episode or chapter clip of the disc
in order. Its clips are exactly the clips of the individual episode playlists, so its extents
**contain the extents of the other titles** (same sector ranges, not merely the same
runtime), and its duration is about the **sum** of its parts. A play-all can also include an
item that has no playlist of its own, in which case its duration exceeds that sum by that item. A play-all
may be larger than the disc's physical capacity as counted by playlist (shared clips count
again). Distinguishing properties:

- A playlist whose clip set is a proper subset of another playlist's, and whose runtime is
  much shorter, is part of the larger one. A near-full-length subset is not: a seamless-branch
  feature (body plus intro, credits and branch segments) has a clip set that is a superset of its
  single-clip body playlist, whose runtime is most of the feature's but whose size is smaller,
  because the branch segments add bytes more than runtime.
- Two **identical** playlists hold exactly the same clips; neither contains the other and
  neither is a play-all.
- The same episode **authored twice with different audio or subtitles** holds the same video
  clip, so the two begin at the same sector.
- Episodes often **share an opening clip**, so a clip set alone does not make two titles
  duplicates; the whole ordered extent list plus the duration does.

**Duplicate and obfuscated playlists.** A disc may hold **many playlists** that
differ only in the order or repetition of the same few clips, which makes the real one hard to
find (a play-all of over two hundred clips, or a decoy of ninety reused clips, are both
possible).
Typical forms:

- A **decoy** that repeats many short clips so that its duration looks like a feature's, but
  whose byte size is a small fraction of the feature's: typically hundreds of items drawn from
  two clips, with a long duration and a small size.
- A playlist with **no video** (or no stream table entries) whose runtime or size was inflated
  by repeated references.
- **Seamless-branch siblings**: playlists with the same body that differ in one or more
  substituted clips, either a pre-roll or many branch clips spread through the whole film;
  their sizes can differ, and their ids are often adjacent.
- A **wrapper**: a playlist that contains a bumper, the feature and an outro in one list. It is
  longer than the feature and its clip set is a superset of the feature's.

**Properties that separate a feature from these.**

- Real **video** is present in the stream table (a title with no video stream cannot be the
  feature, however long). A playlist whose first PlayItem is a non-video bumper has a stream
  table that describes only that bumper, so stream presence must be judged over items, not the
  first alone.
- A complete feature often has a **chapter table**: several entry marks whose span covers most of the
  runtime. A bare body subset or a branch carries one mark or none; marks that cluster in the
  early part of a playlist are not a chapter table.
- A feature's **byte size** is large and a decoy's is small, because a decoy reuses clips.
- Very short playlists are menus, logos or stubs.
- A disc's own **navigation** (First Playback for HDMV discs, or a manifest naming the feature
  playlist for BD-J discs) can identify the intended playlist more reliably than size alone, but can depend on
  runtime state, menu choices or obfuscation. A referenced playlist is not automatically the feature.

**Episodes.** On a TV disc the titles are expected to be the episodes, a play-all, and extras;
this layout is not established here. The disc's
structure suggests a play-all when its extents contain the extents of at least two other,
shorter titles that begin at different sectors; runtimes alone prove nothing, since unrelated
titles can have equal lengths.

## Stream labels and language

Because the playlist states only coding type, language and format, the stream table alone cannot
tell a commentary from the main track, or an SDH track from a normal one. A consumer that wants
these distinctions combines three sources, in decreasing certainty:

1. **Application resources**, as listed in [BD-J](#bd-j). A positional list (`aud=`, `sub=`)
   can be matched to a playlist by comparing its language sequence with the languages of the
   playlist's streams in order; a list of one stream matches almost any playlist and proves
   nothing. Stream identity is then the clip and PID of the matched playlist's first item.
2. **The playlist and clip stream tables**: language, codec and channel layout for every stream
   of every playlist, with no editorial labels.
3. **Codec and layout only**, where neither source gives a label: a stream can then be
   described only by its coding type, channel layout and sample rate (or, for video, codec,
   format, interlacing and dynamic range).

Languages on a disc can disagree in form between sources: playlists keep the ISO 639-2 code as
authored (bibliographic or terminologic), while application resources typically name languages
in plain text or in 639-2/T codes. An empty language is unknown, not a contradiction.

## Glossary

| Term | Meaning |
|---|---|
| **AACS** | The encryption layered on Blu-ray; see [AACS](/docs/aacs/) |
| **Aligned unit** | 32 source packets (6144 bytes, 3 sectors), the AACS encryption block, counted from the start of a clip file |
| **ATC / ATS** | Arrival time clock / stamp: 27 MHz, 30 bits in the TP_extra_header |
| **BD-J** | The Java application layer: `.bdjo` object files and `.jar` applications |
| **BDMV** | The top-level directory holding the disc's navigation and streams |
| **Clip** | One `.m2ts` stream file with its `.clpi` clip-information file |
| **CLPI** | Clip information: packet count, program/stream table, CPI |
| **Connection condition** | PlayItem field: non-seamless (`1`) or seamless (`5`, `6`) join to the previous item |
| **CPI / EP_map** | Characteristic point information: presentation time → source packet number for seeking |
| **Dependent view** | The MVC view predicted from the base view; eye assignment comes from the playlist |
| **Display set** | A PGS PCS plus its window, palette, object and END segments |
| **Entry mark** | A PlayListMark of type 1: a chapter point |
| **First Playback** | The title object that runs when the disc starts |
| **GPR / PSR** | General purpose / player status register of the HDMV virtual machine |
| **HDMV** | The command-based navigation mode: `index.bdmv` + `MovieObject.bdmv` + menu button commands |
| **IG / PG** | Interactive Graphics (menus) / Presentation Graphics (subtitles) |
| **IN / OUT time** | PlayItem interval in the clip's clock, 45 kHz |
| **M2TS** | The BD transport stream: 192-byte source packets |
| **MPLS** | Playlist file |
| **MVC** | Multiview Video Coding: the H.264 extension used for 3D |
| **PlayItem** | One clip reference with IN/OUT times in a playlist |
| **PTS** | Presentation timestamp, 90 kHz, 33 bits |
| **Play-all** | A playlist that plays every episode or title clip in sequence |
| **SPN** | Source packet number |
| **SSIF** | The interleaved stereoscopic file of a 3D clip |
| **STC** | System time clock sequence within a clip |
| **STN table** | The per-PlayItem stream number table |
| **SubPath** | A playlist component that plays streams from a clip other than the PlayItem's |
| **TP_extra_header** | The 4-byte prefix of a source packet: copy permission and ATS |
| **UDF 2.50** | The filesystem of BD-ROM, with a metadata partition |

## Not specified on this page

These structures exist on discs but their layouts are not described above:

- MPLS: the AppInfoPlayList block between the header and PlayList(); the internal layout of the
  ten-byte multi-angle records; the SubPath and SubPlayItem structures; the layout of the
  extension data blocks, including the 3D stream table (STN_table_SS) and other extension
  entries; the UO mask and PlayItem flag bits.
- CLPI: the SequenceInfo layout (ATC/STC sequence tables); the CPI structure and EP_map
  coarse/fine entry encodings and the PTS-to-SPN lookup; the ClipMark block; the extension data.
- `index.bdmv`: the AppInfo block, the BD-J object reference form of a title entry, and the
  extension data. `MovieObject.bdmv`: the flag bits of an object header.
- IG segment layout (button, highlight and command encoding) and TextST layout.
- The semantics of player registers not named above, and the SETSYSTEM operations.
- The contents of `CERTIFICATE/` and the file inventory of `BACKUP/` (beyond
  `BDJO`) and `META/TN/`.
- AC-3 frame-size tables, DTS core field semantics beyond framing, and the full RLE encoding
  of PGS object data (only the line terminator is given).

## References

Specifications define the formats; implementation links document concrete parser and recovery behavior. Research and community sources are identified separately. Observations from particular discs are not universal format guarantees.

### Specifications

- ECMA-167, Volume and File Structure of Write-Once and Rewritable Media: <https://ecma-international.org/publications-and-standards/standards/ecma-167/>
- [UDF 2.50, ECMA TR/112-3](https://ecma-international.org/wp-content/uploads/ECMA_TR-112-3_1st_edition_december_2023.pdf) — partition maps, allocation descriptors and media constraints
- AACS, Blu-ray Disc Pre-recorded Book: <https://aacsla.com/wp-content/uploads/2019/02/AACS_Spec_BD_Prerecorded_Final_0_953.pdf>
- ITU-T H.222.0 / ISO/IEC 13818-1, MPEG-2 Systems: <https://www.itu.int/rec/T-REC-H.222.0>
- ITU-T H.264, Advanced video coding: <https://www.itu.int/rec/T-REC-H.264>
- ETSI TS 102 114, DTS Coherent Acoustics: <https://www.etsi.org/deliver/etsi_ts/102100_102199/102114/01.06.01_60/ts_102114v010601p.pdf>
- ISO 639-2 code list (Library of Congress): <https://www.loc.gov/standards/iso639-2/php/code_list.php>
- [ITU-T H.262 / ISO/IEC 13818-2, MPEG-2 Video](https://www.itu.int/rec/T-REC-H.262)
- SMPTE ST 421, VC-1 — licensed specification; [SMPTE standards catalog](https://www.smpte.org/standards)
- [ATSC A/52:2018, AC-3 and E-AC-3](https://www.atsc.org/wp-content/uploads/2021/04/A52-2018.pdf)
- [BDA format specifications](https://blu-raydisc.info/format-spec/rom4-spec.php) — licensed BD-ROM books; [book/version overview](https://blu-raydisc.info/docs/Spec_Info/AllBooksAugust-14-2020.pdf)

### Open-source implementations

**Filesystem access and decryption**

- [libudfread](https://code.videolan.org/videolan/libudfread) — UDF filesystem access and extent traversal.
- libaacs, key-file lookup and bus decryption: <https://code.videolan.org/videolan/libaacs/-/blob/master/src/libaacs/aacs.c>

**Navigation and metadata**

- [freemkv / libfreemkv](https://github.com/freemkv/libfreemkv) — BDMV navigation, playlists and stream metadata; implementation limits are identified in the text.
- libbluray, playlists: <https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/bdnav/mpls_parse.c>
- libbluray, clip information: <https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/bdnav/clpi_parse.c>
- libbluray, index table: <https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/bdnav/index_parse.c>
- libbluray, disc-library metadata: <https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/bdnav/meta_parse.c>
- libbluray, movie objects: <https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/bdnav/mobj_parse.c>
- libbluray, HDMV virtual machine: <https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/hdmv/hdmv_vm.c>
- libbluray, player registers: <https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/register.c>
- libbluray, BD-J objects: <https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/bdj/bdjo_parse.c>
- libbluray, public stream-format codes: <https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/bluray.h>
- MediaInfo, BDMV parsing: <https://github.com/MediaArea/MediaInfoLib/blob/master/Source/MediaInfo/Multiple/File_Bdmv.cpp>

**Elementary streams and codecs**

- FFmpeg, Blu-ray LPCM: <https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/pcm-bluray.c>
- FFmpeg, MLP/TrueHD parsing: <https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/mlp_parse.c>
- FFmpeg, AC-3/E-AC-3 parsing: <https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/ac3_parser.c>
- FFmpeg, DTS decoding: <https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/dcadec.c>
- FFmpeg, PGS subtitles: <https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/pgssubdec.c>
- FFmpeg, MPEG-TS demuxing: <https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/mpegts.c>

**Extraction and output**

- [freemkv](https://github.com/freemkv/freemkv) — disc extraction application built on libfreemkv.
- [FFmpeg](https://github.com/FFmpeg/FFmpeg) — demuxing, decoding and remuxing.
- [MKVToolNix](https://mkvtoolnix.download/) — Matroska muxing and inspection.

### Research and community references

- ffmpeg-devel, Blu-ray PID assignments: <https://ffmpeg.org/pipermail/ffmpeg-devel/2010-July/088844.html>
