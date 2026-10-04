---
title: HD DVD
description: A reference for the HD DVD-Video disc format — the UDF filesystem, the HVDVD_TS and ADV_OBJ trees, the EVO program stream, and the AACS content protection applied on top. The on-disc structures, and what is confirmed versus still uncertain.
---

HD DVD is a **disc format**; AACS is the **encryption** layered on top of it. The two are
independent, exactly as they are for Blu-ray and 4K UHD: the format is the physical medium,
the filesystem, and the stream layout; AACS is the key hierarchy and the content cipher. This
page documents the format first, then the AACS layer, cross-referencing the shared key
hierarchy on the [AACS reference](/docs/aacs/) rather than repeating it.

:::note[Confidence]
Claims are marked as **confirmed** or **unconfirmed**. The content-encryption model is
specified in the AACS HD DVD book (§4.3) and is confirmed. See the summary table at the end.
:::

## One format, two content models

Every HD DVD-Video disc uses **UDF 2.5** as its filesystem, with **2048-byte logical
sectors** inherited from DVD. At the disc root sit two directories:

```
/  (UDF 2.5, 2048-byte sectors)
├── HVDVD_TS/    Standard Content — the "DVD-Video on steroids" tree (.EVO .MAP .VTI/.IFO)
└── ADV_OBJ/     Advanced Content — the interactive layer (.XPL playlists, markup, script)
```

HD DVD defines two ways to author a title, and many discs ship both:

- **Standard Content** — DVD-Video's data structures scaled up: a Video Manager (VMG), one or
  more Video Title Sets (VTS), Program Chains (PGC), chapters (PTT), cells, and in-stream
  navigation/highlights (PCI + HLI). It lives entirely in `HVDVD_TS` and was cheap to author
  because it reused DVD tooling.
- **Advanced Content** — an interactive runtime layer (XML markup + ECMAScript with a DOM-like
  player API, network access, persistent storage, and a multi-plane compositor — the HD DVD
  counterpart to Blu-ray's Java layer). Playing Advanced Content is mandatory in every
  conformant HD DVD player. It spans both `ADV_OBJ` (playlists, markup, script) and `HVDVD_TS`
  (the actual A/V it plays).

### Identification, capacity and layers

- **Format identification.** The presence of a root `HVDVD_TS` directory identifies an HD DVD;
  no AACS file is needed (an unprotected disc has none).
- **Capacity.** Single-layer discs hold about 7.3 million 2048-byte sectors (15 GB), dual-layer
  about 14.6 million (30 GB), and a triple-layer 51 GB format (17 GB per layer, about 25 million
  sectors) was approved in 2007 but never released commercially.
- **Error-correction block.** Like DVD, the physical error-correction block is **32 KiB**
  (16 sectors).
- A file's data may occupy **several extents** (UDF allocation descriptors); the file is the
  extents read in order. An extent can also be marked unrecorded, or a clip can be zero length,
  and a clip in that state has no complete data.

An Advanced-Content disc (Category 2) carries no Standard Content, so it has no VMG at all. A
Category 3 disc carries both: its VMG has **no First-Play domain and no VMG-menu domain**.
Either way, navigation is handled by the application layer, not by in-stream DVD commands.

## HVDVD_TS — the Primary Video Set

The **Primary Video Set (PRMVS)** is the **Advanced VTS** alone: its control data (the `.VTI`
and the per-EVO time maps) and its presentation data (the EVOBs). The VMG and the Standard VTSs
belong to Standard Content and are not part of it.

### The EVO container

The A/V objects are **Enhanced Video Objects** (`.EVO`, also written EVOB) — an extension of
the DVD VOB. An EVO is an **MPEG-2 Program Stream**: a run of **2048-byte packs**, each
beginning with a `00 00 01 BA` pack-start code — one pack per logical sector. Packs are grouped into **EVOB Units (EVOBU)**, each led by a **Navigation Pack
(NV_PCK)**, directly analogous to DVD's VOBU + NV_PCK. The pack types:

| Pack | Contents |
|---|---|
| `NV_PCK` | Navigation (GCI + PCI + DSI), on `private_stream_2` (`0xBF`) — never encrypted; the first pack of every EVOBU |
| `HL_PCK` | Highlight information (Standard Content), `private_stream_2` sub-stream `0x08` |
| `VM_PCK` / `VS_PCK` | Main / sub video |
| `AM_PCK` / `AS_PCK` | Main / sub audio |
| `SP_PCK` | Sub-picture (bitmap subtitles) |
| `ADV_PCK` | Advanced-Content files multiplexed inline, `private_stream_2` sub-stream `0x80` — never encrypted |

Clip filenames follow a fixed `HVnnnTnn.EVO` pattern, though retail discs also carry
human-named clips (`FEATURE_1.EVO`, `MAINMENU.EVO`, `MENULOOP.EVO`, …). File names are
**case-sensitive**: a playlist names a clip with exactly the case in which it is stored, and
the playlist file itself must be named `VPLSTxxx.XPL` in upper case.

An EVO is not required to end on a 3-sector (6144-byte) boundary. Blu-ray stream files always
end on a whole 6144-byte aligned unit, but an `.EVO` (or one of its extents) can end partway
through a 3-sector group, so a trailing partial group can be a complete, valid end of clip.

#### Pack and PES layout

The program-stream syntax is plain MPEG-2 Systems (ISO/IEC 13818-1). Offsets below are from the
first byte of a pack:

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | Pack start code `00 00 01 BA` |
| 4 | 6 | Marker bits (`01` in the top two bits of byte 4) + SCR |
| 10 | 3 | `program_mux_rate` |
| 13 | 1 | `pack_stuffing_length` in the low 3 bits; that many `0xFF` bytes follow, so the pack header is 14 to 21 bytes |
| 14 | 6 | First PES packet: `00 00 01`, `stream_id`, 16-bit `PES_packet_length` |
| 20 | 1 | PES flags 1 (marker `10`, `PES_scrambling_control` in bits 5–4) — valid when the pack header carries no stuffing |
| 21 | 1 | PES flags 2: `PTS_DTS_flags` in bits 7–6; bit 0 = `PES_extension_flag` |
| 22 | 1 | `PES_header_data_length` |
| 23 | 5 / 10 | PTS, then DTS when `PTS_DTS_flags` = `11` |

Other units that appear between or ahead of PES packets: system header (`00 00 01 BB`, 16-bit
length), program stream map (`00 00 01 BC`, 16-bit length), padding stream (`0xBE`, no payload
of interest) and program end (`00 00 01 B9`, 4 bytes, no body).

- **PTS / DTS** are 33-bit values at 90 kHz in the standard 5-byte form (`0010`/`0011`/`0001`
  prefix nibble, then three marker bits, bit 0 of bytes 0, 2 and 4, all `1`). A field with a
  cleared marker bit is malformed.
- **`PES_packet_length` = 0** is used for video: the packet is unbounded and runs to the next
  *program-stream-layer* unit — a pack header, system header, program end, or the next PES
  start code with a valid `stream_id`. A raw `00 00 01 xx` inside the payload is **not** a
  boundary; elementary-stream data is full of them.
- `private_stream_2` (`0xBF`) PES packets carry no PES header extension: the payload follows
  the 6-byte prefix directly. For a navigation pack the first payload byte is a sub-stream id,
  `0x00` = PCI, `0x01` = DSI, as on DVD.
- **Which packs have a scrambling field.** The `PES_scrambling_control` test at offset 20
  applies only to packs whose first PES packet is an elementary stream. Navigation packs
  (`private_stream_2`, `0xBF`), system headers (`0xBB`) and padding (`0xBE`) are never
  scrambled, and the byte at offset 20 of such a pack is not a scrambling field. In a navigation
  pack, which begins with a system header, it is the system header's `rate_bound` byte, fixed
  at `0x82`. The `stream_id` byte (offset 17) sits in the clear header, so it is readable
  even in an encrypted stream.
- **No CSS, no TP_extra_header.** HD DVD shares the MPEG program-stream container with DVD, but
  CSS is a DVD-only scheme and does not apply. Unlike Blu-ray transport-stream sectors, an EVO
  has no 4-byte `TP_extra_header`, so there is no Blu-ray-style `Copy_permission_indicator`
  field in the stream; the first byte of each 192-byte stride is ordinary payload.

### Navigation sidecars: .MAP, .VTI, .IFO

- **`.MAP`** — a time map (TMAP) pairing timestamp to EVO pack, enabling seek. One time map
  describes one EVO and is stored as its own file. Playlists reference the `.MAP`, not the
  `.EVO` directly.
- **`.VTI`** — Video Title Information, the Advanced-VTS control block that references the
  EVOBs; the HD DVD analogue of DVD's `VTS_xx_0.IFO`. Example name `HVA00001.VTI`.
  The VTI begins with the ASCII magic **`ADVANCED-VTS`**. Its clip table is a run of
  fixed-stride records, **0x140 (320) bytes** apart, each holding a NUL-terminated ASCII
  `<name>.EVO` at one constant offset inside the record; the names appear in authored order,
  so the table is the playback order of the clips. The offset of the table within the file and of the name within a record is
  not stated here (see the end of this page).
- **`.IFO` / `.BUP`** — some discs use a DVD-style IFO/BUP navigation instead: `HV000I01.IFO`
  as the VMG analogue, `HV0nnI01.IFO` as per-VTS. These Standard Content (Category 1) discs are
  navigated through the IFO files, exactly as DVD is. The dependence is on navigation (titles,
  chapters, attributes) and applies to every codec; the EVOs themselves are ordinary
  self-describing program streams.

The DVD → HD DVD analogue map: `VIDEO_TS/`→`HVDVD_TS/`; `VIDEO_TS.IFO`(VMG)→`HV000I01.IFO` or
`VPLST000.XPL`; `VTS_xx_0.IFO`→`.VTI`/`HV0nnI01.IFO`; `VTS_xx_n.VOB`→`.EVO`; plus the
`.MAP` time map. DVD keeps its time map table inside the VTS IFO; HD DVD stores one time map
per EVO as a separate file.

## ADV_OBJ — the Advanced Content tree

`ADV_OBJ` holds the interactive layer:

- **`VPLST%%%.XPL`** — the **playlist(s)**, an XML document in the `HDDVDVideo/Playlist`
  namespace. On a genuine AACS disc the playlist is wrapped in an AACS hash header (the ASCII
  tag `AACS`, a protection-type byte `0x12`, the resource file name, then the XML, then a
  trailing hash pointer); the XML follows the header. It is a `<Playlist>` → `<Configuration>` → `<TitleSet>` → `<Title>`, each `<Title>`
  naming its `<PrimaryAudioVideoClip>` clips (referenced by `file:///dvddisc/HVDVD_TS/…MAP`
  URIs, i.e. the `.MAP` sidecar) in playback order with `titleTimeBegin`/`titleTimeEnd`, a
  `titleDuration`, a `displayName`, and a `<ChapterList>`. The `TitleSet` carries `tickBase`
  (the timecode frequency).

  | Element | Attribute | Meaning |
  |---|---|---|
  | `<Playlist>` | `xmlns` | `http://www.dvdforum.org/2005/HDDVDVideo/Playlist` |
  | `<TitleSet>` | `timeBase` | Frame rate of every title timecode, e.g. `60fps` |
  | `<TitleSet>` | `tickBase` | Markup clock rate (often equal to `timeBase`); **not** the timecode unit |
  | `<Title>` | `titleNumber` | Integer title number (not necessarily contiguous: titles `2` and `7` coexist) |
  | `<Title>` | `displayName`, `id` | Human name; `id` (e.g. `MainMovie`) is the only name on some titles |
  | `<Title>` | `titleDuration` | Total duration, timecode |
  | `<PrimaryAudioVideoClip>` | `src` | `file:///dvddisc/HVDVD_TS/<name>.MAP` |
  | `<PrimaryAudioVideoClip>` | `titleTimeBegin`, `titleTimeEnd` | Placement of the clip on the title timeline |
  | `<PrimaryAudioVideoClip>` | `clipTimeBegin` | Offset into the clip itself |
  | `<PrimaryAudioVideoClip>` | `seamless` | `true` on a clip joined seamlessly to the previous one |
  | `<Chapter>` (inside `<ChapterList>`) | `titleTimeBegin`, `displayName` | Chapter start on the title timeline |

  Child elements of a clip (`<Video track mediaAttr>`, `<Audio track streamNumber
  description>`) select and label the tracks.

  **Timecodes** are `HH:MM:SS:FF`, or `MM:SS:FF` with the hours omitted, where `FF` is a frame
  count in `timeBase` units (so `FF` runs `0`..`timeBase-1`). A `timeBase` of `60fps` is the
  60000/1001 NTSC rate, **not** an exact 60, so title times read about 0.1% short unless
  multiplied by 1.001. The rates behind other `timeBase` values (24/30/50) are unconfirmed.

  Consecutive clips of one title have contiguous timelines: in a layer-break split, the second
  clip's `titleTimeBegin` equals the first clip's `titleTimeEnd`. Several titles may name the same clip (angles, branches, seamless-join
  variants), and one title may name the same clip more than once. A real playlist nests about
  5 elements deep.
- **`DISCID.DAT`** — disc identification/configuration.
- **`.ACA`** — a packaged resource container.
- Loose interactive resources when not packed into an ACA: `.xmu` markup, `.js` ECMAScript,
  `.xas` subtitles, plus images/fonts.

### How titles are defined

The disc has no single title table; the structure that defines titles depends on the content
model:

- **With an Advanced-Content playlist**, the playlist is authoritative: each `<Title>` is one
  title, with its own clip list, duration, name and chapters. A disc can hold several playlists
  (`VPLST000.XPL`, `VPLST090.XPL`, … — each paired with its own `VTKF%%%.AACS`). A playlist can
  name a clip that is not on the disc; such a title cannot be played in full. A single `.EVO`
  can be named by many titles, and a clip can be present on the disc but named by no title.
- **Without a usable playlist** (absent, not well-formed XML, or naming nothing present), titles
  can only be derived from the clips. The ADVANCED-VTS VTI gives clip order; the segments of a
  split feature are recognised by their names (see below). Such clip-derived titles have **no duration, name or chapter list** — those exist only
  in the playlist.
- A playlist is a small document (kilobytes; about 5 nesting levels).

### Layer-break feature splitting

A feature spanning the disc's layer break (single-layer 15 GB / dual-layer 30 GB) is authored
as **multiple EVO segments** — commonly `FEATURE_1.EVO` + `FEATURE_2.EVO` — with the playlist
stitching them into one seamless title via ordered `<PrimaryAudioVideoClip>` entries; the
segments are concatenated in playlist order. Several naming variants occur:
`FEATURE_1`/`FEATURE_2`, `feature`/`feature_Divide`, and `PEVOB_1`/`PEVOB_2`. Every part must be present and fully allocated; a missing,
zero-length or unreadable part leaves a feature that is short by that part.

## Streams and codecs

HD DVD-Video mandates three video codecs — **VC-1, H.264/AVC, and MPEG-2** — all decodable by
every player; in practice the great majority of releases are VC-1. Inside the EVO program
stream they are routed by `stream_id`:

- **VC-1** rides the **extended stream-id `0xFD`** with `stream_id_extension = 0x55` — composite
  `0xFD55`. Sub video (picture-in-picture) is VC-1 on extension `0x56`.
- **H.264** uses stream-id **`0xE2`** and **MPEG-2 video** uses **`0xE0`**.
- **Audio** rides `private_stream_1` (`0xBD`), keyed by the first payload byte (sub-stream id):

  | sub-stream id | Codec |
  |---|---|
  | `0x80`–`0x87` | AC-3 (Dolby Digital) |
  | `0x88`–`0x8F`, `0x98`–`0x9F` | DTS / DTS-HD |
  | `0xA0`–`0xAF` | Linear PCM or MLP |
  | `0xB0`–`0xBF` | Dolby TrueHD (MLP) |
  | `0xC0`–`0xCF` | Dolby Digital Plus (E-AC-3) — and AC-3 in EVOB |

- **Navigation** rides `private_stream_2` (`0xBF`) — PCI + DSI, as in VOB.

#### Extended stream-id (`0xFD`) PES

`stream_id` `0xFD` is the H.222.0 escape: the real stream id is the 7-bit
`stream_id_extension` inside the PES header extension. To find it, walk the optional PES header
fields in order from offset 9 of the PES packet (offset 0 = the `00 00 01` start code):

1. PTS (5 bytes) if `PTS_DTS_flags` bit 1 is set; DTS (5 bytes) if both bits are set
2. ESCR (6), ES_rate (3), DSM_trick_mode (1), additional_copy_info (1), PES_CRC (2) — each
   present when its flag bit in PES flags 2 (`0x20`, `0x10`, `0x08`, `0x04`, `0x02`) is set
3. If `PES_extension_flag` (bit 0 of flags 2) is clear, there is no extension and no id
4. One extension-flags byte, then, per flag: `PES_private_data` (16 bytes, `0x80`),
   `pack_header_field` (1-byte length + that many bytes, `0x40`), program packet sequence
   counter (2, `0x20`), P-STD buffer (2, `0x10`); bit 0 (`PES_extension_flag_2`) must be set
5. A byte whose low 7 bits are `PES_extension_field_length`, then the id byte: when its top bit
   is `0`, its low 7 bits are the `stream_id_extension`

The elementary-stream payload follows `PES_header_data_length` verbatim; unlike
`private_stream_1` there is no sub-stream header byte. VC-1 main video is extension `0x55`
and VC-1 sub video is `0x56`. HD audio (MLP/TrueHD) is not carried on `0xFD`; it rides
`private_stream_1` (`0xBD`).

#### `private_stream_1` sub-header

The first payload byte is the sub-stream id. For AC-3/DTS (`0x80`–`0x8F`), LPCM
(`0xA0`–`0xA7`) and Dolby Digital Plus (`0xC0`–`0xCF`) it is followed by a **4-byte** sub-header
in total: sub-stream id, frame-header count, and a 16-bit first-access-unit pointer; the audio
elementary stream starts after those 4 bytes. For E-AC-3 the
sub-header is exactly 4 bytes; skipping fewer leaves sub-header bytes at the start of the first
frame. LPCM keeps a further
3-byte audio header (quantization / sample rate / channels) at the start of the ES. Dolby Digital
Plus tracks occur on sub-ids `0xC0`–`0xC7`.

#### Timestamps in the program stream

- Program-stream video is timestamped per GOP, not per picture: only one access unit per GOP
  carries a PES `PTS`. H.264 and VC-1 pictures in the rest of the GOP have no timestamp, so their
  presentation times follow from the picture type (I/P/B) and the sparse anchor `PTS`. The GOP
  structures used for HD DVD H.264 and VC-1 are non-hierarchical: an anchor picture displays
  after the previously held anchor, and a B-picture displays immediately.
- Per ISO/IEC 13818-1 §2.4.3.7, a PES `PTS` times the first access unit that *starts* in that
  PES packet. HD DVD opens a PES at each timed picture; program streams that pack pictures back
  to back do not.

#### VC-1 elementary stream

| Item | Fact |
|---|---|
| Header order | An advanced-profile random-access point is a sequence header (start code `0x0F`), then an entry-point header (`0x0E`), then the frame (`0x0D`), in that order (SMPTE 421M). The headers belong to the picture that follows them; an access unit is delimited by the next frame start code |
| Entry-point flags | The first two bits are `BROKEN_LINK` and `CLOSED_ENTRY`. With `CLOSED_ENTRY` = 0, leading B-pictures can predict from an anchor before the entry point, so they cannot be decoded at a stream start or after a join; `BROKEN_LINK` marks the same |
| Picture type, progressive | `PTYPE` is a variable-length code: `0` = P, `10` = B, `110` = I, `1110` = BI, `1111` = skipped |
| Picture type, interlaced | `FCM` precedes the picture type: `0` progressive, `10` frame-interlace, `11` field-interlace. A field-interlaced picture then carries a 3-bit `FPTYPE`: `000` I/I, `001` I/P, `010` P/I, `011` P/P, `100` B/B, `101` B/BI, `110` BI/B, `111` BI/BI |
| Interlace flag | In the advanced-profile sequence header (SMPTE 421M §6.1.1, bit 41) |
| Resolution | Only the advanced profile (`PROFILE` = 3) carries coded width and height in the sequence header; simple and main profile do not. Each is a 12-bit field holding (size ÷ 2) − 1 |
| Emulation prevention | The sequence header can contain `00 00 03` emulation-prevention bytes, to be removed before bit-level reading |

#### Identifying a codec from the elementary stream

Stream layout is a property of the clip, not the playlist: all clips of a split feature are
continuations of one layout, so the first clip's streams describe the title. The signatures
below are only readable in **clear** payload. In an encrypted pack, bytes 128–2047 are
ciphertext, so only the first ~100 bytes of PES payload in each pack are readable; the codec of
a clip whose packs are all encrypted cannot be read from later offsets until it is decrypted.

The clear head of an EVO reveals each stream's codec within its first few KiB (each elementary stream's useful sample is well under 128 KiB):

| Stream | Signature |
|---|---|
| MPEG-2 video | start code `00 00 01 B3` (sequence header) |
| VC-1 video | start code `00 00 01 0F` (sequence start code) |
| H.264 video | a `00 00 01` start code followed by a byte whose `byte & 0x9F == 0x07` (NAL type 7, SPS; `nal_ref_idc` ignored) |
| Dolby Digital Plus | 16-bit syncword `0B 77` in the sub-stream's ES |

One divergence from Blu-ray worth noting for a muxer: **Dolby TrueHD was mandatory on HD DVD**
(optional on Blu-ray), so a TrueHD track is always player-decodable; DTS-HD MA/HR were optional
(the DTS core is always present).

## AACS on HD DVD

HD DVD used **first-generation AACS** — the same generation and the same core crypto as Blu-ray
AACS 1.0 (AES-128, a subset-difference-tree MKB, and the `AES-G` derivation of the Volume
Unique Key). AACS 2.0 / 2.1 are 4K-UHD-only and never touched HD DVD. The shared
[key hierarchy is documented on the AACS page](/docs/aacs/#the-invariant-one-key-hierarchy);
this section covers only what HD DVD does *differently* — which is entirely at the file and
container layer, not the cipher.

### The AACS directory: nominal versus actual

The AACS key material lives in a root directory named **`AACS`**, with a parallel
**`AACS_BAK`** backup; the name `AACS` is reserved by the format. Boot paths are
`/AACS/MKBROM.AACS` and the like. Genuine discs use exactly these names.

Images are also seen with the directory named **`ANY!`** or **`AAC!`** (with a
`<name>!_BAK` mirror). These names are not part of the format and do not appear on retail
discs; they occur on modified copies whose content has already been decrypted. Such a directory
sits at the root, its name ends in `!`, and it contains `MKBROM.AACS`; the files inside keep
their nominal names. The AACS directory is key material, not content: it is separate from the
A/V tree, and its presence marks the disc as AACS-protected only when it carries the genuine
name and the content is actually encrypted.

### File inventory

Every file lives in the AACS directory above.

| File | Role |
|---|---|
| `MKBROM.AACS` | The one and only Media Key Block for this pressed disc. Device Keys → Processing Key → applied here → **Media Key (Km)**. |
| `MKBRECORDABLE.AACS` | A read/write MKB used by *recording* devices to update recordable media — **not** used to play this disc. The only component not mirrored into the backup. |
| `VTKF%%%.AACS` | **Title Key File** (Video). Holds the encrypted title keys. Magic `DVD_HD_V_TKF`. Bound to one playlist (see below). |
| `VTUF%%%.AACS` | **Title Usage File** (Video). Holds usage rules (copy-control), indexed from each EVOB's CPI. Magic `DVD_HD_V_TUF`. Optional. |
| `DKF.AACS` | **Directory Key File** — decrypts a content provider's directory name in persistent storage. Magic `DVD_HD_V_DKF`. Not a disc/media key; ignored on Standard-Content discs. |
| `CONTENT_CERT.AACS` | Content Certificate — the signed root of the on-disc integrity chain. |
| `CONTENT_HASH_TABLE1.AACS` | Hashes of the A/V hash units (the EVOB data). |
| `CONTENT_HASH_TABLE2.AACS` | Hashes of the navigation data (markup/script) plus the TKF/TUF/DKF/DISCID files. |
| `CONTENT_REVOCATION_LIST.AACS` | The content revocation list (distinct from the host/drive revocation lists carried inside the MKB). |
| `MNGCPY_MANIFEST.XML` | Managed Copy manifest; backed up with the other files. |
| `SKB.AACS` / `SKF.AACS` | Optional. The Sequence Key Block and the Segment Key File, used for interleaved sections. |

### VTKF — the Title Key File

The VTKF is where HD DVD diverges most visibly from Blu-ray (which keeps all title keys in one
`Unit_Key_RO.inf` indexed by CPS unit). On HD DVD:

- **The `%%%` suffix is the playlist index, not a CPS-unit number.** Each `VPLST%%%.XPL` is
  accompanied by a `VTKF%%%.AACS` — each Title Key File is bound to exactly one
  Advanced-Content playlist (a **Category 2** disc). A bare `VTKF.AACS` with no suffix denotes a
  **Category 1** disc (Standard Content, no playlist). So a disc's `VTKF090` + `VTKF100`
  correspond to playlists `VPLST090` + `VPLST100`; a disc with four VTKFs simply has four
  playlists.
- **The correct file is selected by name-match, not by trial.** The TKF header carries a
  12-byte `PLAYLIST_NAME`; a player compares it to the *currently active* playlist and, unless
  the names are identical, the title keys in that TKF must not be used. (For Standard Content,
  `PLAYLIST_NAME` is all `0xFF`.)
- **Structure — a fixed 2480-byte file:**
  - a **128-byte header**: magic `DVD_HD_V_TKF` (bytes 0–11), `HD_VTKF_SIZE`=2480 big-endian
    (12–15), `PLAYLIST_NAME` (16–27; the associated `VPLST%%%.XPL` name), version (32–33),
    with the remainder through byte 127 reserved;
  - **64 title-key entries of 36 bytes each**, starting at byte 128 — each entry is 1 byte
    `BIFO` + 3 reserved + a 16-byte encrypted title key + a 16-byte binding MAC. Entry #1's key
    is at offset 132; entry #2 begins at 164; and so on. `BIFO` bit 7 (`AV_FLG`) set = the slot
    holds a key; the entry index (1-based) is the CPS unit number;
  - bytes 2432–2463 sit between the last entry and the MAC and are not described here;
  - a trailing **16-byte `TKF MAC`** (bytes 2464–2479), a CMAC over the file keyed by the
    Volume Unique Key — which lets an implementation *verify a candidate key is correct*.
  - For pre-recorded discs the binding type is "Volume-ID only" and the 16-byte binding MAC is
    filled with `0xFF`.
- An empty slot (`AV_FLG` clear) is **not** a terminator: later slots can still hold keys, and
  the slot position, not the count of preceding keys, is the CPS unit number. A file shorter
  than 2432 bytes is truncated inside the entry table.
- A disc may carry several VTKFs (one per playlist); `%%%` is arbitrary (`000`, `001`, `002`, `090`,
  `099`, `100` all occur), so the files are enumerated by prefix `VTKF` and suffix `.AACS`, not by a fixed name.
  Only one holds keys valid for the active playlist.
- All 64 slots can be populated. The key an EVOB uses is selected by the `TITLE_KEY_PTR` in its
  CPI, not by the slot count.
- The **SHA-1 of the whole VTKF file is the per-disc DiscID** used to index a key database.

### VTUF, DKF, CONTENT_CERT

- **VTUF** (`DVD_HD_V_TUF`) carries the **usage rules**: a set of Usage Rule Sets that each
  EVOB's CPI points into via a Usage Rule Pointer. Same `%%%` playlist convention as the VTKF;
  optional; MAC-protected under the Volume Unique Key.
- **DKF** (`DVD_HD_V_DKF`) is a 64-byte file holding one encrypted **Directory Key**; a player
  derives `PROVIDER_DIR = AES-G(K_DIR, PROVIDER_ID)`, the provider's directory name in
  persistent storage, so one title's saved data cannot reach another's. No Blu-ray analogue.
- **CONTENT_CERT** is the signed root of trust. Byte 0 is the **Certificate Type (`0x00`)** —
  *not* an AACS version field; there is no version byte in the HD DVD content certificate. It
  carries an Applicant ID + Content Sequence Number (together the content ID), a Minimum CRL
  Version floor, hash-table digests, and the signature. The integrity chain runs: verify the
  certificate signature → check each hash table against the digest in the certificate → check
  the content against the tables.

### Content encryption — per-pack, not per-aligned-unit

This is the second major divergence from Blu-ray, and the one that most affects a decryptor.

Blu-ray encrypts a **6144-byte aligned unit** (three sectors): the first 16 bytes are a clear
seed, and bytes 16–6144 are AES-128-CBC encrypted under a per-unit block key, with a fresh CBC
chain per unit.

HD DVD does **not** use that model. Content is MPEG-2 Program Stream in 2048-byte packs, and
the AACS HD DVD book (§4.3) specifies encryption **per pack**:

- **Within an encrypted pack, bytes 0–127 are clear and bytes 128–2047 are encrypted.** The
  boundary is a fixed byte offset, not the end of the PES header: the clear head includes the
  pack header, the PES header and roughly the first 100 bytes of PES payload. There is no
  6144-byte unit and no 16-byte seed.
- **Encrypted packs keep their pack start code** `00 00 01 BA` in the clear head, so its
  presence says nothing about whether a pack is encrypted.
- **Whether a pack is encrypted** is signaled by the MPEG-2 **`PES_scrambling_control`** field
  — the 2-bit field in the first PES-flags byte, at **offset 20** of the pack (14-byte pack
  header + 4-byte PES start code + 2-byte PES length). The value `01` (`byte[20] & 0x30 == 0x10`)
  marks an encrypted pack.
- **Pack-type overrides:** `NV_PCK` (navigation) and `ADV_PCK` (advanced) are **never**
  encrypted, and the first pack of an EVOBU is never encrypted; `HL_PCK` (highlight) **must** be
  decrypted even when the scrambling flag is clear.
- **The per-pack Content Key** is `Kc = AES-G(Kt, D_tk ‖ CPI_lsb96)`, where `Kt` is the title
  key from the VTKF, `D_tk` is the 32-bit Title Key Data at bytes 84–87 of the pack, and
  `CPI_lsb96` is the low 96 bits (bytes 4–15) of the 16-byte **CPI**. The CPI is carried in the
  GCI packet of the EVOBU's navigation pack, at **pack offset 60**. The derivation is always
  applied: the plain title key is never the cipher key. The `KEY_VF` field of the CPI selects
  the title key (`TITLE_KEY_PTR` picks the slot) or, for interleaved sections, a **Segment Key**
  (from `SKF.AACS`) in place of `Kt`.
- Bytes 128–2047 are decrypted with AES-128-CBC under `Kc` and the AACS **fixed,
  format-constant IV**; a clear `PES_scrambling_control` is then restored.

## What is confirmed, and what is not

| Area | Status |
|---|---|
| UDF 2.5, 2048-byte packs, `HVDVD_TS` + `ADV_OBJ` layout | **Confirmed** |
| EVO = MPEG-2 Program Stream; stream-id routing (VC-1 `0xFD/0x55`, sub-video VC-1 `0xFD/0x56`, MPEG-2 `0xE0`, H.264 `0xE2`, audio `0xBD`) | **Confirmed** |
| First-generation AACS, crypto identical to Blu-ray AACS 1.0 | **Confirmed** |
| `.AACS` file inventory and each file's role; VTKF↔playlist binding | **Confirmed** |
| VTKF layout: 2480-byte file, 128-byte header, 64 × 36-byte entries, trailing MAC | **Confirmed** |
| Per-2048-byte-pack encryption: bytes 0–127 clear, 128–2047 CBC, `PES_scrambling_control` flag, `Kc = AES-G(Kt, D_tk ‖ CPI)`, CPI at pack offset 60, constant IV, Segment Key for interleaved sections | **Confirmed** (AACS HD DVD book §4.3) |
| Genuine discs use `/AACS`; `ANY!` / `AAC!` appear only on modified, already-decrypted copies | **Confirmed** |
| Title definition: playlist authoritative; clip-derived titles carry no duration or chapters | **Confirmed** |
| Capacity ↔ layers (about 7.3 M / 14.6 M / 25 M sectors), 32 KiB ECC block | **Confirmed** |
| ADVANCED-VTS VTI: magic, 0x140-byte clip-record stride, NUL-terminated `.EVO` names in authored order | Table start and in-record name offset not confirmed |
| XPL structure and attributes; `timeBase` 60fps = 60000/1001 | **Confirmed** for 60fps; other time bases unconfirmed |
| VC-1 header order, entry-point flags, picture-type codes, advanced-profile resolution; per-GOP PTS | **Confirmed** (SMPTE 421M / ISO 13818-1) |
| PES layout, unbounded video PES, `0xFD` extension parsing, 4-byte E-AC-3 sub-header | **Confirmed** |
| Frame rates behind `timeBase` values other than 60fps | **Unconfirmed** |

## References

*Further reading on the topics covered here. These sources discuss related material; they are not cited claim by claim, and not every statement in them is endorsed here.*

### Specifications

- Advanced Access Content System (AACS): HD DVD and DVD Pre-recorded Video Book, Final Revision 0.952 (no longer publicly available)
- [HD DVD-Video patent US 2008/0298219 A1 (disc categories, file naming, stream-id tables, navigation pack layout)](https://patents.google.com/patent/US20080298219A1/en)
- [HD DVD-Video patent CN 101091217 A (Advanced VTS file naming)](https://patents.google.com/patent/CN101091217A)
- ISO/IEC 13818-1, MPEG-2 Systems (program stream and PES syntax)
- SMPTE 421M, VC-1 compressed video bitstream format

### Open-source implementations

- libdvdread: [ifo_types.h](https://code.videolan.org/videolan/libdvdread/-/blob/master/src/dvdread/ifo_types.h) (DVD IFO structures, including the time map table)
- FFmpeg: [libavcodec/vc1.c](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/vc1.c) (VC-1 headers), [libavformat/mpeg.c](https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/mpeg.c) (program stream demuxer)

### Community references

- [Doom9: ANY! folder discussion](https://forum.doom9.org/archive/index.php/t-159163.html)
