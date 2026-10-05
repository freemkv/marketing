---
title: Ultra HD Blu-ray (4K UHD)
description: A reference for what Ultra HD Blu-ray adds to or changes in the Blu-ray disc format — UHD BD-ROM media, the 0300 version stamp, HEVC Main 10 at 2160p, HDR10 / HDR10+ / Dolby Vision signalling, the Dolby Vision enhancement layer in the STN table, audio carriage, and the AACS 2.x file layout as it appears on disc.
---

Ultra HD Blu-ray is a **delta on Blu-ray**, not a new container. The filesystem, the `BDMV`
tree, playlists, clip information and the 192-byte-packet transport stream are the Blu-ray
structures unchanged; the [Blu-ray reference](/docs/bluray/) documents them and this page does
not repeat them. What follows is only what UHD adds or changes: higher-capacity media, the
version stamp, the video coding and its colour/HDR signalling, a second video stream for Dolby
Vision, a few audio-carriage notes, and an AACS generation (2.x) whose on-disc files and
sector-level framing differ from AACS 1.0. The cryptography itself is on the
[AACS reference](/docs/aacs/).

:::note[Scope]
Offsets and values below are given only where they are defined. Where a field is known to exist
but its layout or value is not pinned down, the page says so rather than guessing; the final
section lists what is out of scope.
:::

## Summary of differences from Blu-ray

| Area | Blu-ray | Ultra HD Blu-ray |
|---|---|---|
| Media | 25 / 50 GB (BD-25, BD-50) | 50 / 66 GB (two layers) and 100 GB (three layers) |
| `index.bdmv` version | `0200` | `0300` |
| Video | MPEG-2, H.264/AVC, VC-1 | HEVC (H.265), Main 10, 3840x2160 |
| Colour | BT.709 | BT.2020 primaries (BT.709 is also signalled, for SDR), 10-bit |
| HDR | none (SDR) | HDR10 (PQ); Dolby Vision; HDR10+ |
| Second video layer | none (PiP aside) | Dolby Vision enhancement layer, STN category 7 |
| AACS generation | 1.0 | 2.0 or 2.1 |
| Sector-level protection | AACS aligned-unit encryption; optional bus encryption | AACS aligned-unit encryption; optional bus encryption |
| Key-storage stride in `Unit_Key_RO.inf` | 48 bytes | 64 bytes |
| Feature clip extension | `.m2ts` | `.m2ts`, or `.fmts` on AACS 2.1 |
| Region | A / B / C | region-free |

## Media

### BD-ROM capacity

UHD BD-ROM supports **50 GB**, **66 GB** and **100 GB** media. The BDA
[format-book overview](https://blu-raydisc.info/docs/Spec_Info/AllBooksAugust-14-2020.pdf)
lists these capacities separately from recordable BDXL. A 100 GB disc commonly exposes
48,878,592 logical sectors of 2048 bytes; query the actual medium rather than hardcode that
count. The filesystem is UDF with 2048-byte logical sectors.

A large `.m2ts` can have many allocation descriptors even when its extents are physically
contiguous: an extent length has only 30 bits. Extent boundaries do not establish layer
boundaries. Layers are invisible above the logical sector address space. A reader sizes a disc by the volume's sector count and does not address layers
separately.

### How a UHD disc identifies itself

There is no single "UHD" flag. Three independent markers agree on a UHD disc:

| Marker | Where | Value |
|---|---|---|
| Index version | `BDMV/index.bdmv`, bytes 0-7 | ASCII `INDX0300` (Blu-ray: `INDX0200`) |
| MKB generation | `AACS/MKB_RO.inf`, Type-and-Version record | MKBType `0x48141003` (AACS 2.0) or `0x48151003` (AACS 2.1) (Blu-ray: `0x00041003`) |
| Video stream | playlist STN table | HEVC, video format code 8 (2160p) |

`index.bdmv` begins with the ASCII magic `INDX` followed by a four-character ASCII version at
bytes 4-7. Playlist (`MPLS`) and clip-information (`HDMV`) files use the same layout: a four-byte
magic, then a four-byte ASCII version at bytes 4-7. Common structures remain recognizable, but readers must validate the version, section
lengths and version-specific fields and extensions. An unknown version is not permission
to parse every structure as an older version.

The MKB's generation is the most reliable discriminator: the MKB record framing is one type byte
plus a 3-byte big-endian length that includes the 4-byte header, and the Type-and-Version record
(type `0x10`) carries the 32-bit MKBType in bytes 4-7 of the record. The three values above map
as 2.1 = UHD with forensic `.fmts` content, 2.0 = UHD, 1.0 = Blu-ray.

When the MKB is absent, freemkv can use 2160p video as a classification fallback. This is
a heuristic, not proof that an arbitrary BDMV folder conforms to the UHD disc specification.

### Drive implications

Reading UHD media requires a drive that supports the particular UHD BD-ROM medium;
recordable BDXL support alone does not establish UHD compatibility. In addition to the media, the
protection layer places a requirement on the drive path: when the content certificate asks for
**bus encryption** (see below), stream data crosses the drive interface already encrypted under
a session key, and the host cannot interpret the content until that layer is removed. That
layer is removed in one of two ways, and a disc is unreadable if neither is available:

- **at the drive**, by a drive whose firmware lifts the bus barrier; or
- **by the host**, after the drive and host complete AACS authentication (an elliptic-curve
  key exchange using a host certificate). The exchange yields the disc's **Volume ID** and a
  session **read-data key**; the key is what removes the bus layer.

A drive reports AACS support through MMC feature `0x010D`. A disc image or folder copy that was
made without removing the bus layer still carries it in the data, and the image can only be
used if the same key is available to the reader. Drives commonly also throttle reads on a
protected disc until they are told otherwise, so a UHD disc read at full speed needs the
drive's maximum read speed requested explicitly.

The drive's error-correction block on UHD is the Blu-ray one: **64 KiB, 32 sectors of 2048
bytes**. This does not require every read failure to affect exactly 32 sectors; an AACS aligned unit
(3 sectors) lies wholly inside one block or spans two adjacent blocks.

## Video

UHD video is **HEVC (H.265)**, coding type `0x24`, carried as an Annex B byte stream in the
transport stream exactly as the Blu-ray page describes for other video.

| Property | UHD value |
|---|---|
| Codec | HEVC, STN `stream_coding_type` `0x24` |
| Resolution | 3840 x 2160, progressive (video format code 8) |
| Bit depth / chroma | 10-bit 4:2:0 (HEVC Main 10) |
| Colour primaries | BT.2020 (CICP code 9) |
| Matrix | BT.2020 non-constant luminance (CICP code 9) |
| Range | limited ("TV") |
| Transfer, HDR10 / HDR10+ / Dolby Vision | SMPTE ST 2084 PQ (CICP code 16) |
| Transfer, HLG | ARIB STD-B67 (CICP code 18) |
| Transfer, SDR BT.2020 | BT.2020 10-bit (CICP code 14) |

The STN video attribute byte pairs a **format** nibble and a **rate** nibble:

| Format nibble | Resolution | | Rate nibble | Frame rate |
|---|---|---|---|---|
| 1 | 480i | | 1 | 23.976 |
| 2 | 576i | | 2 | 24 |
| 3 | 480p | | 3 | 25 |
| 4 | 1080i | | 4 | 29.97 |
| 5 | 720p | | 5 | unassigned |
| 6 | 1080p | | 6 | 50 |
| 7 | 576p | | 7 | 59.94 |
| **8** | **2160p** | | 8 | unassigned |

The UHD-specific value is format 8. The rate codes are the shared Blu-ray set (23.976, 24, 25, 29.97, 50 and 59.94 are defined; libbluray leaves codes 5 and 8 unassigned, and code 8 does occur in a
UHD playlist, with no meaning established here). Pixels are
square; the display aspect equals the 3840x2160 grid.

### HEVC parameter sets and the SPS fields a reader needs

The decoder-configuration data comes from three non-VCL NAL units: VPS (type 32), SPS (33) and
PPS (34). An AUD (35) may also appear and carries no information a container needs. From the SPS
a reader derives:

- **General profile/tier/level**: `profile_tier_level()` is a fixed 96 bits (profile space,
  tier flag and profile_idc in the first 8; 32 compatibility flags; 48 bits of constraint and
  reserved flags; `general_level_idc` in the last 8), followed by optional per-sub-layer blocks
  (88 bits for a sub-layer profile, 8 bits for a sub-layer level).
- **`chroma_format_idc`** (0 mono, 1 4:2:0, 2 4:2:2, 3 4:4:4) and **`bit_depth_luma_minus8` /
  `bit_depth_chroma_minus8`**. UHD streams are `chroma_format_idc = 1` with both depth fields
  equal to 2 (10-bit). A record that assumed 8-bit 4:2:0 would be wrong for essentially every
  UHD stream.
- **Reorder depth** (`sps_max_num_reorder_pics`) and the VUI picture period
  (`num_units_in_tick / time_scale`). This ratio is a clock tick; deriving a picture
  period also requires the applicable POC timing and HRD syntax. It is not universally
  the duration of one picture.
- **VUI colour description**, when present (`video_full_range_flag` plus colour primaries,
  transfer characteristics and matrix coefficients as three 8-bit CICP codes), which is the
  authoritative statement of PQ vs HLG for a stream.

The SPS NAL payload on the wire is an **EBSP** and can contain emulation-prevention
bytes (`00 00 03`). Remove them to obtain the **RBSP** before reading syntax fields.

A VPS, SPS or PPS may be repeated in-band at random-access points, and a stream may **redefine**
a parameter set under the same id partway through a title (a PPS id 0 redefined mid-title is
known). A reader that re-emits parameter sets must compare against the currently active set, not
merely the first one seen; a decoder that keeps applying the initial set decodes the later
segment against the wrong PPS and desynchronises (CABAC / `cu_qp_delta` errors with intact NAL
framing). Parameter sets appear at the head of the access unit in VPS, SPS, PPS order.

The bit position of `slice_type` in a slice header depends on `num_extra_slice_header_bits` in
the PPS the slice references (via `slice_pic_parameter_set_id`); streams use several PPS ids
(0-63) with differing values.

### NAL-unit header and the types that matter

An HEVC NAL header is two bytes; the type is bits 1-6 of byte 0, i.e. `(byte0 >> 1) & 0x3F`.
Types 0-31 are coded slices (VCL); 32-63 are non-VCL.

| NAL type | Name | Role on UHD |
|---|---|---|
| 16, 17, 18 | BLA_W_LP, BLA_W_RADL, BLA_N_LP | random-access points |
| 19, 20 | IDR_W_RADL, IDR_N_LP | random-access points |
| 21 | CRA | random-access point; typical clip start |
| 6-9 | RADL_N/R, RASL_N/R | leading pictures |
| 32 / 33 / 34 | VPS / SPS / PPS | parameter sets |
| 35 | AUD | access-unit delimiter |
| 39 / 40 | prefix SEI / suffix SEI | HDR10 static metadata, HDR10+ |
| **62** | **UNSPEC62** | **Dolby Vision RPU** |

RADL pictures (types 6, 7) decode from their IRAP picture alone; RASL pictures (8, 9) depend on
pictures before it. Types 16-23 are IRAP pictures (keyframes). **Types 39/40/62 must be preserved**: the SEI and the
RPU are the only carriers of HDR metadata inside the elementary stream.

## HDR signalling

UHD carries HDR in three places that are read independently: a 4-bit field in the playlist
STN table, SEI messages in the HEVC stream, and (for Dolby Vision) RPU NAL units in the enhancement-layer stream.
They do not all agree by construction; each answers a different question.

### Playlist level: the HEVC attribute byte

For an HEVC video stream the STN stream-attributes block has a **third byte** (after
`coding_type` and the format/rate byte). It exists **only for HEVC (`0x24`)**; non-HEVC video
has no such byte and a reader must not read one.

| Bits | Field | Values |
|---|---|---|
| 7-4 | `dynamic_range` | 0 = SDR, 1 = HDR10, 2 = Dolby Vision |
| 3-0 | `color_space` | 0 = unspecified, 1 = BT.709, 2 = BT.2020 |

Example: `0x12` = HDR10, BT.2020. This byte is a coarse label. Other dynamic-range values are
not defined here; HLG is not distinguishable through it (see below). The next byte opens with two
flag bits: `cr_flag` (bit 7, meaning not defined here) and `hdr_plus_flag` (bit 6), which labels an
HDR10+ stream. The authoritative
colour statement is in the stream itself (the SPS VUI colour description and the HDR SEI); a
playlist can label a stream more coarsely than its bitstream, and every HDR format on disc
uses BT.2020 primaries.

### HDR10: static metadata in SEI

HDR10 uses PQ transfer (CICP 16), BT.2020 signalling and static mastering metadata.
The two relevant SEI payloads are described below; content light level information can be
absent. They are normally carried in prefix SEI (type 39). Preserve their applicable scope
and process later updates, especially across clip joins: the first value in a title need
not describe every subsequent sequence. The SEI NAL has the
usual two-byte header, then a sequence of messages, each with `payloadType` and `payloadSize`
in **0xFF-extension coding** (a run of `0xFF` bytes plus a final byte, summed), then the
payload. Emulation-prevention bytes (`00 00 03`) are removed before reading payloads.

**Mastering Display Colour Volume**, `payloadType` 137 (H.265 D.2.28), 24 bytes, all big-endian:

| Offset | Size | Field |
|---|---|---|
| 0 | 2 | `display_primaries_x[0]` |
| 2 | 2 | `display_primaries_y[0]` |
| 4 | 2 | `display_primaries_x[1]` |
| 6 | 2 | `display_primaries_y[1]` |
| 8 | 2 | `display_primaries_x[2]` |
| 10 | 2 | `display_primaries_y[2]` |
| 12 | 2 | `white_point_x` |
| 14 | 2 | `white_point_y` |
| 16 | 4 | `max_display_mastering_luminance` |
| 20 | 4 | `min_display_mastering_luminance` |

Primaries are in the SEI's component order 0 = green, 1 = blue, 2 = red. Chromaticity values are
in units of **0.00002**; luminance values are in units of **0.0001 cd/m2**. (This is the SMPTE
ST 2086 mastering-display description.)

**Content Light Level Information**, `payloadType` 144 (H.265 D.2.35), 4 bytes:

| Offset | Size | Field |
|---|---|---|
| 0 | 2 | `max_content_light_level` (MaxCLL), cd/m2 |
| 2 | 2 | `max_pic_average_light_level` (MaxFALL), cd/m2 |

Both values are integers in cd/m2. The content light level message can be absent: some HDR10
streams carry the mastering display message alone. An SDR stream carries neither.

### HDR10+: dynamic metadata (ST 2094-40)

HDR10+ is HDR10 plus **per-frame dynamic metadata** (SMPTE ST 2094-40) carried in SEI. It shares
HDR10's transfer (PQ) and primaries (BT.2020), so neither the playlist `dynamic_range` nibble
(values 1/2 above) nor a container's CICP code points identify it; the playlist's `hdr_plus_flag`
is set on HDR10+ discs and labels it coarsely, and the SEI payload is authoritative. The
ST 2094-40 SEI is carried on the base layer, on every access unit, and not on the enhancement layer.
The payload's exact byte layout is not described on this page.

### HLG

A Hybrid Log-Gamma stream would be signalled by the VUI/CICP **transfer characteristics = 18**.
The playlist `dynamic_range` nibble has no HLG value, and HLG is not established here as a UHD
disc format.

### Dolby Vision

Dolby Vision on disc (**profile 7**, dual layer) is carried as **two HEVC streams plus metadata**:

| Component | Carried as |
|---|---|
| Base layer (BL) | the primary video stream: HEVC Main 10, 3840x2160, PQ/BT.2020. Plays as HDR10 without the rest |
| Enhancement layer (EL) | a **second HEVC video stream**, listed in the STN table as category 7 |
| RPU (Reference Processing Unit) | **NAL type 62** (UNSPEC62), in-band in the **enhancement-layer** stream only, one per EL picture |

- **MEL vs FEL.** The enhancement layer is either a *minimal* EL (MEL), which carries no
  significant residual, or a *full* EL (FEL), which carries a residual that restores the master's
  full 12-bit precision. Both are the same stream type and are signalled the same way in the
  playlist; the difference is in the EL's coded content.
- **RPU placement.** The RPU travels only on the enhancement-layer PID, one per EL picture, as
  the **last NAL** of the EL access unit; the base layer never carries one. An EL keyframe reads,
  for example, `AUD, VPS, SPS, PPS, SEI, IDR slice, RPU`, and the base-layer keyframe is the same
  without the RPU. It must pass through byte for byte; the SEI/slice filtering a reader applies
  to parameter sets must not touch it.
- **EL carriage.** The EL is a native second video elementary stream (its own PID, `0x1015`
  being typical) in the same transport stream as the base layer, with HEVC coding type `0x24`;
  it is an ordinary HEVC stream with its own VPS/SPS/PPS and may contain SEI at its keyframes.
  The disc playlist identifies the enhancement layer. Do not generalize an absent PMT
  descriptor in inspected discs to all Dolby Vision transport streams: Dolby also specifies
  a [DOVI video stream descriptor](https://professional.dolby.com/siteassets/pdfs/dolby-vision-bitstreams-in-mpeg-2-transport-stream-multiplex-v1.2.pdf).
- **EL resolution.** The base layer is always 3840x2160. The enhancement layer is frequently
  **1920x1080**, so the video stream tagged as Dolby Vision is often the lower-resolution one;
  a reader cannot infer the title's resolution from the DV-tagged stream.
- **Timestamps.** The EL repeats the base layer's presentation and decoding timestamps, and
  usually arrives later in the multiplex than the base picture it belongs to (occasionally
  earlier). Timestamps are the only association
  between the layers. The EL has its own B-frame reordering, so its timestamps regress in
  decode order; a reader must not interpret an EL timestamp regression as a playlist clip join,
  and must not let the EL advance the title timeline.

#### Dolby Vision decoder configuration record

Containers describe a Dolby Vision track with a **24-byte DOVIDecoderConfigurationRecord**
(`dvcC`). For a disc profile 7 title:

| Byte | Content |
|---|---|
| 0 | `dv_version_major` = 1 |
| 1 | `dv_version_minor` = 0 |
| 2-3 | `dv_profile` (7 bits, = 7), `dv_level` (6 bits), `rpu_present_flag`, `el_present_flag`, `bl_present_flag` (each 1) |
| 4 | `dv_bl_signal_compatibility_id` in the high nibble |
| 5-23 | reserved, zero |

Bit layout of bytes 2-3: byte 2 = `(profile << 1) | (level >> 5)`; byte 3 =
`((level & 0x1F) << 3) | (rpu << 2) | (el << 1) | bl`.

The base layer is always 2160p, so the Dolby Vision **level follows the frame rate**:

| `dv_level` | Meaning |
|---|---|
| 6 | 2160p up to 24 fps |
| 7 | 2160p up to 30 fps |
| 8 | 2160p up to 48 fps |
| 9 | 2160p up to 60 fps |

## Playlist (MPLS) and the STN table

The MPLS structure is the Blu-ray one; the UHD-relevant parts are the **STN table counts** and
the **category 7** entry. The STN table sits at PlayItem offset 32 for single-angle items; a
multi-angle item inserts a two-byte header and ten bytes per additional angle first, so the
offset is `32 + 2 + (number_of_angles - 1) * 10`. `is_multi_angle` is bit 4 of PlayItem byte 10
(the `connection_condition` is the low nibble of the same byte) and `number_of_angles` is at
byte 32. Seamless-branch UHD playlists are typically multi-angle, so reading the STN table at
the fixed offset misparses their streams. It opens with a 16-byte header:

| Offset | Size | Field |
|---|---|---|
| 0 | 2 | length |
| 2 | 2 | reserved |
| 4 | 1 | number of primary video streams |
| 5 | 1 | number of primary audio streams |
| 6 | 1 | number of PG (subtitle) streams |
| 7 | 1 | number of IG streams |
| 8 | 1 | number of secondary audio streams |
| 9 | 1 | number of secondary video streams |
| 10 | 1 | number of PiP PG streams |
| **11** | 1 | **number of Dolby Vision enhancement-layer streams** |
| 12 | 4 | reserved |

Entries follow in this order, with the counts above:

1. primary video
2. primary audio
3. PG subtitles, immediately followed by the PiP PG entries (one run, no reference block)
4. IG (skipped; never a subtitle or audio stream)
5. secondary audio (each followed by a reference block)
6. secondary video (each followed by an audio-reference block and a PG-reference block)
7. **Dolby Vision enhancement layer** (no trailing reference block)

The stream categories used when classifying entries:

| Category | Stream |
|---|---|
| 1 | primary video |
| 2 | primary audio |
| 3 | PG subtitle |
| 4 | IG |
| 5 | secondary audio |
| 6 | secondary video |
| **7** | **Dolby Vision enhancement layer** |

Each entry is `stream_entry()` (a length byte, then data) followed by `stream_attributes()` (a
length byte, `coding_type`, then format-specific bytes). The first byte of `stream_entry()` data
is the **entry type**, which fixes where the PID sits, counted from the entry's length byte:

| Entry type | Meaning | PID offset |
|---|---|---|
| `0x01` | stream in the PlayItem's clip | 2 |
| `0x02` | stream in a SubPath SubClip | 4 |
| `0x03` | stream in a SubPath clip | 3 |
| **`0x04`** | **SubPath Dolby Vision enhancement layer** | **3** |

The stream-attributes block of a category-7 entry has the same layout as a primary video
entry: `coding_type` (`0x24`), the format/rate byte, and the HEVC third byte.

A playlist's PlayItems can each carry their own STN table, and later items may list a different
codec or track set from the first. A reader that takes the track list from the first PlayItem
alone will not see tracks that exist only in later items.

## Stream identification (PIDs)

Primary HEVC video in the transport stream uses the PID range **`0x1011`-`0x101F`**: primary
video at `0x1011`, the Dolby Vision enhancement layer at a higher PID inside the range (`0x1015`
is typical). Secondary video (picture-in-picture) uses the Blu-ray range `0x1B00`-`0x1B1F`. The playlist's PID for each stream is what links the
STN entry to the transport-stream elementary stream; the enhancement layer is found by its PID in
the category-7 entry, exactly as any other stream. Audio, subtitle and graphics PID conventions
are the Blu-ray ones.

## Audio additions

UHD adds no new audio coding types. The Blu-ray coding-type values are unchanged:

| `coding_type` | Codec |
|---|---|
| `0x80` | LPCM |
| `0x81` | Dolby Digital (AC-3) |
| `0x82` | DTS |
| `0x83` | Dolby TrueHD |
| `0x84` | Dolby Digital Plus (E-AC-3) |
| `0x85` | DTS-HD High Resolution |
| `0x86` | DTS-HD Master Audio |
| `0xA1` | secondary Dolby Digital Plus |
| `0xA2` | secondary DTS-HD (DTS Express / LBR) |

**Object audio rides existing carriers**:

- **Dolby Atmos** is carried inside **Dolby TrueHD** (`0x83`) or **Dolby Digital Plus** (`0x84`).
  There is no Atmos coding type.
- **DTS:X** is carried inside **DTS-HD Master Audio** (`0x86`) or **DTS-HD High Resolution**
  (`0x85`) streams. There is no DTS:X coding type.

The playlist's audio format code 6 means only "multi-channel", with no channel count; there is
no code for 7.1 or for an object layer. Channel count, 7.1 and objects are in the bitstream, for
TrueHD in the **major sync**.

### TrueHD major sync and `format_info`

A TrueHD access unit has a 4-byte header: bytes 0-1 hold a nibble of check data and a 12-bit
access-unit length in 2-byte words; bytes 2-3 are a timing value. A major sync, when present,
starts at offset 4 with the 32-bit word **`0xF8726FBA`** (`0xF8726FBB` is the MLP variant),
followed by the 32-bit `format_info` word at offset 8, big-endian:

| `format_info` bits | Field |
|---|---|
| 31-28 | sample-rate code: `0` = 48 kHz, `1` = 96 kHz, `2` = 192 kHz, `8` = 44.1 kHz, `9` = 88.2 kHz, `0xA` = 176.4 kHz |
| 12-0 | 8-channel presentation channel assignment (13 bits) |
| 19-15 | 6-channel presentation channel assignment (5 bits) |

Per-bit channel counts for the assignments (each set bit adds this many channels):

| 8-channel mask, bit 0..12 | 2, 1, 1, 2, 2, 2, 2, 1, 1, 2, 2, 1, 1 |
|---|---|
| **6-channel mask, bit 0..4** | 2, 1, 1, 2, 2 |

If the 8-channel mask is non-zero it gives the channel count (e.g. a mask of `0x4F` is 8 channels,
7.1; `0x1F` is also 8 channels but is 5.1.2, with a front-height pair in bit 4); otherwise the 6-channel mask does. Bit 2 is LFE in both; bit 12 of the 8-channel mask is
LFE2. The substream count (`num_substreams`) is the high nibble of byte 16 of the major sync, counting
the `0xF8` sync byte as byte 0; freemkv treats a count of 4 or more as an Atmos detection heuristic. This does not parse
or validate the object metadata.
A TrueHD access unit spans 40 samples at the 48 kHz family (1/1200 s) or 40 samples at the 44.1
kHz family. TrueHD predictor state persists across access units, so decoding can only restart at
a major sync; a major sync header is 28 bytes plus an optional extension. The same TrueHD elementary stream may interleave AC-3 frames (sync `0x0B77`) on
its PID; only the TrueHD access units belong to the TrueHD track.

## Transport-stream notes

UHD uses the Blu-ray source-packet transport stream: **192-byte source packets** (a 4-byte
TP_extra_header plus a 188-byte TS packet with sync byte `0x47` at offset 4). The AACS aligned
unit is **6144 bytes = 32 source packets = 3 sectors**. The top two bits of byte 0 of each
packet's TP_extra_header are the **Copy Permission Indicator** (`11` encrypted, `00` clear; on
AACS 2.1 discs `01` and `10` also occur, see the forensic segments below); the
remaining 30 bits are the arrival timestamp.

## AACS 2.x as it appears on disc

All UHD discs carry **AACS 2.0 or 2.1**. The key hierarchy and content cipher are on the
[AACS reference](/docs/aacs/); this section records only the files, their shapes and the
sector-level framing.

### File inventory

All under the root `AACS/` directory. Every managed file also has a copy in `AACS/DUPLICATE/`.

| File | Role |
|---|---|
| `AACS/Unit_Key_RO.inf` | encrypted CPS unit keys, title-to-unit map |
| `AACS/MKB_RO.inf` | the pre-recorded Media Key Block |
| `AACS/Content000.cer` (or `Content001.cer`) | content certificate |
| `AACS/IndividualSegment.tbl` | forensic segment map (AACS 2.1 only) |
| `AACS/SegmentKeyNNNNN.tbl` | forensic segment keys, one file per CPS unit (AACS 2.1 only) |
| `AACS/MKB_RW.inf` | the recordable-media MKB, a **different** MKB, not a fallback for `MKB_RO.inf` |

Files over one extent are common on UHD media; a reader must follow all of a file's allocation
descriptors (Long-AD, 16-byte, in particular) or it will truncate these files at the first
extent.

### Content certificate

Byte 0 is the certificate type: `0x00` = AACS 1.0, **`0x10` = AACS 2.x**; other values are not
defined. Byte 1, **bit 7**, is the **bus-encryption-enabled (BEE) flag**. Bytes 14-19 are the
6-byte content certificate ID. The file is at least 20 bytes. A certificate cannot distinguish
2.0 from 2.1: both carry type `0x10`, and a 2.1 disc is recognised by the MKB (below).

### `Unit_Key_RO.inf`

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | offset of the key-storage area (`uk_pos`) |
| 16 | 1 | application type (1 = BD-ROM) |
| 17 | 1 | number of BDMV directories |
| 18 | 1 | bit 7: use SKB MKB |
| 20 | 2 | first-play CPS unit |
| 22 | 2 | top-menu CPS unit |
| 24 | 2 | number of titles |
| 26 | 4 each | title entries: 2 bytes padding + 2-byte CPS unit |

At `uk_pos`: a 2-byte key count, then encrypted unit keys of 16 bytes each starting at
`uk_pos + 48`. The **stride between consecutive keys is 48 bytes for AACS 1.0 and 64 bytes for
AACS 2.x** (48 plus 16 additional). Reading a 2.x file with the 1.0 stride misaligns every key
after the first.

### MKB generation and AACS 2.1 variant records

AACS 2.1 adds a second derivation stage on the Media Key. Its presence is signalled by three
MKB record types alongside the classical ones:

| Record type | Content |
|---|---|
| `0x05` | Media Key Data, the classical per-subset cvalue table (1.0 and 2.0) |
| `0x0C` | Media Key Variant Data: one 16-byte `C` per subset-difference slot |
| `0x2D` | Variant data and nonce: a `VARIANTS` table followed by a 16-byte nonce at the tail |
| `0x2F` | Variant Key Data table: 65,535 entries of 16 bytes |
| `0x81` / `0x86` | verify-media-key record (`0x81` for AACS 1.0, `0x86` for AACS 2.x) |

A 2.0 MKB contains `0x05` only. A disc is AACS 2.1 when it carries the `0x2D`/`0x2F` records.

### Bus encryption

When the content certificate's BEE flag is set, the **Clip AV stream files** are additionally
encrypted at the drive interface. Everything else on the disc (UDF structures, `BDMV` navigation
files, the `AACS/` files themselves) is never bus-encrypted. Within a stream file the layer is
applied per **aligned unit**, and only to units that are already AACS-encrypted:

- The unit's **Copy Permission Indicator** decides it. The CPI is the top two bits of byte 0 of
  the unit's first source packet, which lies in the unit's clear 16-byte seed and so is readable
  without any key. `11` marks an encrypted unit; `00` a clear one. Bus encryption applies to
  the units whose CPI is set and not to the others.
- For an encrypted unit, in **each of its three 2048-byte sectors**, bytes **16-2047** are
  AES-128-CBC encrypted under the session key and the **first 16 bytes of every sector are left
  in the clear**. The CBC chain restarts in every sector.
- The result is the ordinary AACS aligned-unit ciphertext; removing the bus layer yields it,
  and the AACS unit decryption (below) is applied to that.
- A disc with BEE clear has no bus layer at all.

The consequence for a sector-level reader is that the CPI must be read from the first sector of
each unit before the unit's sectors are interpreted, and that units are grouped by their
position **within the clip file**, not by disc address. A stream file whose File Entry cannot be
read cannot be mapped to its sectors, and its units stay bus-encrypted.

### The aligned unit as it appears on UHD

An AACS **aligned unit** is **6144 bytes**: 32 source packets of 192 bytes, 3 sectors. The unit
grid is anchored to the **start of the clip file**, not to a disc address or to the extent
start; a read that starts mid-unit begins on ciphertext. Two structural properties follow from
the layout:

- The first 16 bytes of a unit are a clear **seed**: the first packet's 4-byte
  TP_extra_header (carrying the CPI), the TS sync byte `0x47` at offset 4, and the start of
  the first TS packet. Bytes 16-6143 are one AES-128-CBC chain, restarted for every unit, so a
  corrupt unit cannot damage its neighbours.
- After decryption, every one of the following source packets has its sync byte `0x47` at offset
  4 within the packet (about 31 per unit). Counting these syncs is the structural test that a
  unit was decrypted correctly. A decrypted unit has its CPI bits cleared in every packet; a
  unit left as ciphertext keeps them set.

A unit whose clear seed does not show the sync at offset 4, or whose syncs do not return after
decryption, is damaged (or was cut off the grid) and cannot be recovered from that unit alone.

### AACS 2.1 forensic segments (`.fmts`)

The layouts below are reverse-engineered observations implemented in freemkv. Public
AACS 1.x books do not establish the AACS 2.1 variant tables. Keep sample dimensions and
parser assumptions separate from licensed AACS2 requirements.

The AACS 2.1 discs examined by freemkv store their **main feature in a single `.fmts` clip** in `BDMV/STREAM/` instead
of an `.m2ts`: for example `BDMV/STREAM/00001.fmts`, while the playlist still names the clip
`00001`. A BD-tree reader that looks for the clip must try `.m2ts`, then `.fmts`, then `.ssif`
(3D). The parser currently assumes one `.fmts` clip and addresses the segment map relative to
it. This is an implementation limit supported by the inspected samples, not a demonstrated
universal restriction of AACS 2.1.

The `.fmts` clip is an ordinary 192-byte-packet transport stream, **plus interleaved forensic
segments**: short runs of packets that exist in several watermarked variants, of which a given
disc's keys open only one.

#### `AACS/IndividualSegment.tbl`

Big-endian. An 8-byte header, then records:

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | type |
| 4 | 2 | record count |
| 6 | 2 | record size (= 16) |

Each 16-byte record:

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | marker (`0x01000000`) |
| 4 | 2 | **forensic index**, 1-32 |
| 6 | 2 | flag (= 1) |
| 8 | 4 | `start_spn`, first source packet of the segment (inclusive) |
| 12 | 4 | `end_spn`, last source packet (inclusive) |

Source-packet numbers count 192-byte packets **from the start of the `.fmts` clip**; the byte
offset of a segment is `start_spn * 192`. Index values cycle across the table rather than
counting up. Content outside every segment is ordinary content with no segment record.

In the inspected samples, each segment is 2,560 packets (80 aligned units) and starts and ends on an aligned-unit
boundary. A forensic unit is opened with the key for the
segment's index (one of 32 forensic index keys), not with the ordinary CPS unit key. Inside a
segment, the units of **two variants alternate**: units alternate by parity of their index within
the segment (counted from the segment's first unit), a key for one variant opens only that
parity, and the alternate units stay as ciphertext and are not part of the title. The two
variants' units come in pairs whose first TS packet header is identical. The CPI marks the
variant: `01` on even units, `10` on odd units, and `11` outside segments.

#### `AACS/SegmentKeyNNNNN.tbl`

One file per CPS unit. The device derives a 16-bit selector from the 2.1 variant chain and uses
it to index this table.

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | tag |
| 4 | 2 | index space (`0xFFFF` means the full 65,536-entry space) |
| 6 | 2 | record size |
| 8 | n | `index_space` records of `record_size` bytes each |

The file size equals 8 + (entry count x record size) exactly. With 65,536 entries of 536 bytes
the file is 35,127,304 bytes. Each record opens with an 8-byte sub-header; the layout beyond it
is not described here.

The forensic **index** (1-32) selects which of 32 index keys opens a segment; it is distinct
from the 16-bit **variant selector** (0-65535) that indexes the segment-key table.

## Edge cases and implementation policies

- **Non-seamless clip joins and CRA pictures.** A CRA (type 21) at the start of a clip can carry
  RASL pictures that reference frames from before the clip. When clips are concatenated and the
  join is non-seamless (PlayItem `connection_condition` = 1, held in the low nibble of the
  PlayItem's byte 10), those references no longer exist. freemkv handles this splice by treating the CRA as a **BLA**
  (BLA_W_LP, type 16) so that the leading RASL pictures are discarded. This is a one-shot rewrite
  of the first CRA at the join: every slice NAL of the picture changes type, using
  `byte0 = (byte0 & 0x81) | (16 << 1)`. Seamless joins (`connection_condition` 5 or 6) and the
  first PlayItem are never rewritten. Use the playlist boundary as the primary evidence; a backward PTS step alone can also
  be reordering, wrap or a discontinuity.
- **Stream start on a CRA.** A stream can open on a CRA whose RASL pictures reference pictures
  that do not exist; they are undecodable, while RADL pictures are decodable.
- **Sibling playlists differing only in streams.** Playlists of equal size, duration and audio
  can differ only by an extra video stream (the Dolby Vision EL) or an extra subtitle, so one
  sibling may lack the Dolby Vision layer.
- **PTS wrap.** PTS is 33 bits at 90 kHz and wraps at 2^33; the apparent huge backward step is the
  same continuous clip, not a join.
- **Second video track.** Anything that tracks timeline continuity must treat the Dolby Vision EL
  as a passive rider on the base layer: it neither drives clip-join detection nor advances the
  timeline frontier, because its own reordering looks like a backward step.
- **Clips are whole files; playlists select part of them.** In/out times are in 45 kHz ticks.
  A clip file can contain material before the in-time and after the out-time; the selection is
  by presentation timestamp, not by byte position, and a clip's size is the whole file.
- **Unrecorded extents.** A UDF file can contain extents that are allocated but never recorded;
  they occupy file-offset space (a hole) and shift every later offset if dropped. Segment
  numbers and aligned-unit positions are counted over the file including holes.
- **One `.fmts` clip assumption.** freemkv's current mapping requires one forensic clip.
  Multiple files require additional association information and are not handled by that model.
- **Stale segment records.** `IndividualSegment.tbl` can contain records addressing source
  packets past the end of the clip; those cannot be located on disc.
- **Truncated parameter sets.** HEVC configuration records encode each NAL length in 16 bits; a
  parameter set longer than that cannot be recorded and is refused rather than truncated.
- **Zero-length NAL entries** are not permitted in a decoder configuration record.
- **Stream attributes.** An STN entry with coding type `0x00` is padding. The HEVC attribute byte
  must be read only for `0x24`.
- **PG entry in an audio slot.** A subtitle (`0x90`) entry may appear where an audio entry
  is expected; it uses the PG attribute layout (coding type then 3-byte language) rather than
  the audio layout.
- **Feature clip extension.** `.fmts` for AACS 2.1; do not assume `.m2ts`.
- **Capacity.** Per-layer address ranges are not exposed; use the volume's sector count.
- **Region.** UHD discs carry no region restriction.

## Glossary

| Term | Meaning |
|---|---|
| **AACS 2.0 / 2.1** | The AACS generation for UHD; 2.1 adds the forensic variant structure |
| **BDXL** | Higher-capacity recordable Blu-ray formats; distinct from UHD BD-ROM |
| **BEE** | Bus Encryption Enabled flag, bit 7 of byte 1 of the content certificate |
| **BL / EL** | Dolby Vision base layer / enhancement layer |
| **BLA / CRA / IDR** | HEVC random-access picture types (NAL 16–18, 21, 19/20) |
| **Bus encryption** | A per-sector AES layer applied between drive and host, bytes 16-2047 of each sector |
| **CICP** | ITU-T H.273 colour code points: primaries, transfer, matrix |
| **CPI** | Copy Permission Indicator, top 2 bits of each packet's TP_extra_header |
| **dvcC** | The 24-byte Dolby Vision decoder configuration record |
| **FEL / MEL** | Full / minimal Dolby Vision enhancement layer |
| **`.fmts`** | The AACS 2.1 feature-clip container: a transport stream with interleaved forensic segments |
| **Forensic index** | 1-32 tag in `IndividualSegment.tbl` selecting an index key |
| **HDR10 / HDR10+** | PQ over BT.2020 with static / dynamic metadata |
| **HLG** | Hybrid Log-Gamma, transfer characteristics 18 |
| **Main 10** | The HEVC profile for 10-bit 4:2:0 |
| **MaxCLL / MaxFALL** | Maximum content / frame-average light level, cd/m2 |
| **PQ** | SMPTE ST 2084 perceptual quantiser, transfer characteristics 16 |
| **RPU** | Dolby Vision Reference Processing Unit, HEVC NAL type 62 |
| **SEI** | HEVC Supplemental Enhancement Information NAL (types 39/40) |
| **SPN** | Source packet number, a count of 192-byte packets |
| **ST 2086** | SMPTE mastering-display metadata, carried as the mastering display colour volume SEI |
| **ST 2094-40** | SMPTE dynamic HDR metadata used by HDR10+ |

## Not covered

The following UHD properties are not specified on this page, because their layouts or values are
not defined to the level needed to reproduce them. The Blu-ray and AACS pages cover everything
shared.

- The HEVC profile/tier/level limits a UHD disc must meet (for example the maximum level).
- The ST 2094-40 (HDR10+) payload layout and its T.35 SEI framing.
- Any playlist or clip-information **extension-data** blocks that carry HDR metadata.
- The Dolby Vision RPU payload layout, and how MEL and FEL are distinguished by signalling
  (rather than by coded content).
- Variant playlists used by the AACS 2.1 forensic structure (how playlists select among variants).
- The segment-key record layout beyond its 8-byte sub-header.
- 66 GB per-layer sector counts, and any media-specific UDF constraints beyond the standard
  Long-AD/metadata-partition handling.
- The audio object-layer (Atmos / DTS:X) bitstream structure.
- The AACS 2.0 authentication exchange itself (message layout, certificate fields); see the AACS
  page.
- Full AACS 2.x conformance: the forensic layouts above describe inspected files and the
  current implementation, not a substitute for the licensed AACS2 specification.
- Typical UHD video bitrates and peak rates.

## References

Specifications define the formats; implementation links document concrete parser and recovery behavior. Research and community sources are identified separately. Observations from particular discs are not universal format guarantees.

### Specifications

- [BDA format-book overview](https://blu-raydisc.info/docs/Spec_Info/AllBooksAugust-14-2020.pdf) — UHD BD-ROM capacities and applicable book versions.

- [AACS, Blu-ray Disc Pre-recorded Book, rev. 0.953](https://aacsla.com/wp-content/uploads/2019/02/AACS_Spec_BD_Prerecorded_Final_0_953.pdf) — public AACS 1.x baseline; [AACS2 specifications are licensed separately](https://aacsla.com/license-aacs/)
- [Dolby Vision Bitstreams in MPEG-2 Transport Stream Multiplex, v1.2](https://professional.dolby.com/siteassets/pdfs/dolby-vision-bitstreams-in-mpeg-2-transport-stream-multiplex-v1.2.pdf)
- ITU-T H.265, High efficiency video coding: <https://www.itu.int/rec/T-REC-H.265>
- ITU-T H.273, Coding-independent code points for video signal type identification: <https://www.itu.int/rec/T-REC-H.273>
- ECMA-167, Volume and file structure of write-once and rewritable media: <https://www.ecma-international.org/publications-and-standards/standards/ecma-167/>
- SMPTE ST 2086, ST 2094-40, and ST 2084 (not freely available)
- ISO/IEC 14496-15, Carriage of NAL unit structured video in the ISO base media file format — licensed ISO specification

### Open-source implementations

**Filesystem access and decryption**

- [libudfread](https://code.videolan.org/videolan/libudfread) — UDF filesystem access and extent traversal.
- libaacs, AACS handling: <https://code.videolan.org/videolan/libaacs/-/blob/master/src/libaacs/aacs.c>

**Navigation and metadata**

- [freemkv / libfreemkv](https://github.com/freemkv/libfreemkv) — UHD classification, HDR metadata and forensic-stream handling; implementation limits are identified in the text.
- libbluray, playlist parsing (STN table, stream attributes, Dolby Vision entries): <https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/bdnav/mpls_parse.c>
- libbluray, public constants (video format and rate, audio format, dynamic range, colour space): <https://code.videolan.org/videolan/libbluray/-/blob/master/src/libbluray/bluray.h>

**Elementary streams and codecs**

- FFmpeg, TrueHD/MLP major-sync parsing: <https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/mlp_parse.c>
- FFmpeg, TrueHD channel tables: <https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/mlp_parse.h>
- FFmpeg, HEVC SEI parsing: <https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/hevc/sei.c>

**Extraction and output**

- [freemkv](https://github.com/freemkv/freemkv) — disc extraction application built on libfreemkv.
- [FFmpeg](https://github.com/FFmpeg/FFmpeg) — demuxing, decoding and remuxing.
- [MKVToolNix](https://mkvtoolnix.download/) — Matroska muxing and inspection.
