---
title: AACS
description: AACS is an encryption scheme, not a disc format. A reference for how it is applied across Blu-ray (AACS 1.0), 4K UHD (AACS 2.0 or 2.1, the forensic FMTS layer), and HD-DVD. The shared key hierarchy, the on-disc structures, and what is confirmed versus still under investigation.
---

AACS (Advanced Access Content System) is an encryption scheme, not a disc format. It is the
content protection applied across several optical disc formats, at different versions. The
formats (Blu-ray, 4K UHD, HD-DVD) are the physical and filesystem layout of the disc. AACS is
the encryption layered on top. Keeping the two separate is the whole basis for reasoning about
this page: one scheme, several versions, several formats.

Only part of AACS is public. AACS 1.0 is documented well enough to reason about. The AACS 2.0
additions are partly public. The AACS 2.1 forensic (FMTS) layer is essentially undocumented
anywhere. This page builds the reference from the disc up. It reads top to bottom as a
progression: first what all AACS versions share, then what each of 1.0, 2.0, and 2.1 adds on
top.

:::caution[Work in progress]
The AACS 2.1 / FMTS material here is an active investigation — a current working model, not a
finished specification, and it changes as more is learned. The page carries no secret key
material (no device keys, processing keys, host private keys or real VUKs), only formats,
structures and algorithms. The public AACS constants that the algorithms need (`iv0`, the AES-G3
seed `s0`, the Verify Media Key plaintext prefix) are stated. Items are marked **Confirmed** (checked against retail discs or genuine
certificates), **Working model**, or **Unconfirmed**. DVDs use CSS, not AACS; see
[Decryption Keys](/docs/decryption-keys/).
:::

## One scheme, several versions, several formats

The disc format and the AACS version are independent axes. A format picks which AACS version
it carries. The key hierarchy below is identical regardless of format. What differs is the
version.

| Disc format | AACS version |
|---|---|
| Blu-ray | AACS 1.0 |
| 4K UHD | AACS 2.0 or AACS 2.1 (both are in the field; 2.1 adds the forensic FMTS layer) |
| HD-DVD | first-generation AACS (the 1.0 key ladder and cipher; see the [HD DVD page](/docs/hddvd/)). Its files differ from Blu-ray: `MKBROM.AACS`, `VTKF*.AACS`, `CONTENT_CERT.AACS` |

4K UHD is not one AACS version. A UHD disc carries either 2.0 or 2.1, and the two are distinct
(see the per-version sections below). HD-DVD uses first-generation AACS, with a different file
set and container (program stream, not transport stream). DVDs are the odd one out: they use
CSS, a different and older scheme, not AACS at all.

## The invariant: one key hierarchy

Every AACS disc, in all three generations, uses the same chain of keys. Each key derives the
next. This ladder is the thing that does not change. Generations differ only in how one or
two of these steps are computed, not in the ladder itself.

<figure>
<svg viewBox="0 0 620 660" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="The AACS key hierarchy as a vertical ladder: Device Keys derive the Processing Key by walking the MKB, then the Media Key with the MKB media-key data, then the Volume Unique Key with the disc Volume ID, then the Unit and Title Keys by decrypting Unit_Key_RO.inf, then the content.">
<defs>
<marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="currentColor"/>
</marker>
</defs>
<style>
.bx{fill:none;stroke:currentColor;stroke-width:1.4;rx:8}
.ti{fill:currentColor;font:600 15px system-ui,sans-serif}
.su{fill:currentColor;font:12px system-ui,sans-serif;opacity:.7}
.ar{stroke:currentColor;stroke-width:1.4}
.lb{fill:currentColor;font:12.5px system-ui,sans-serif;opacity:.85}
.lb2{fill:currentColor;font:11.5px system-ui,sans-serif;opacity:.6}
</style>
<rect class="bx" x="40" y="16" width="300" height="44" rx="8"/>
<text class="ti" x="56" y="38">Device Keys (DK)</text>
<text class="su" x="56" y="53">the player's licensed secrets, never on the disc</text>
<line class="ar" x1="190" y1="60" x2="190" y2="122" marker-end="url(#ah)"/>
<text class="lb" x="356" y="90">walk the MKB</text>
<text class="lb2" x="356" y="106">the subset-difference revocation tree</text>
<rect class="bx" x="40" y="126" width="300" height="44" rx="8"/>
<text class="ti" x="56" y="148">Processing Key (PK)</text>
<text class="su" x="56" y="163">one per non-revoked subset in the tree</text>
<line class="ar" x1="190" y1="170" x2="190" y2="232" marker-end="url(#ah)"/>
<text class="lb" x="356" y="200">+ the MKB media-key data</text>
<text class="lb2" x="356" y="216">on 2.1, with a per-variant layer on top</text>
<rect class="bx" x="40" y="236" width="300" height="44" rx="8"/>
<text class="ti" x="56" y="258">Media Key (MK)</text>
<text class="su" x="56" y="273">one per MKB (per device group on 2.1)</text>
<line class="ar" x1="190" y1="280" x2="190" y2="342" marker-end="url(#ah)"/>
<text class="lb" x="356" y="310">+ the disc Volume ID</text>
<text class="lb2" x="356" y="326">off the disc via the drive, not a file</text>
<rect class="bx" x="40" y="346" width="300" height="44" rx="8"/>
<text class="ti" x="56" y="368">Volume Unique Key (VUK)</text>
<text class="su" x="56" y="383">binds the key to this physical disc</text>
<line class="ar" x1="190" y1="390" x2="190" y2="452" marker-end="url(#ah)"/>
<text class="lb" x="356" y="420">decrypt AACS/Unit_Key_RO.inf</text>
<text class="lb2" x="356" y="436">stride 48 bytes on 1.0, 64 on 2.x</text>
<rect class="bx" x="40" y="456" width="300" height="44" rx="8"/>
<text class="ti" x="56" y="478">Unit / Title Keys (UK)</text>
<text class="su" x="56" y="493">one key per CPS content unit</text>
<line class="ar" x1="190" y1="500" x2="190" y2="562" marker-end="url(#ah)"/>
<text class="lb" x="356" y="530">AES-CBC over each unit</text>
<text class="lb2" x="356" y="546">only the units flagged encrypted</text>
<rect class="bx" x="40" y="566" width="300" height="44" rx="8"/>
<text class="ti" x="56" y="588">Content</text>
<text class="su" x="56" y="603">6144-byte aligned units (32 source packets)</text>
</svg>
</figure>

- **Device Keys (DK).** A set of secret keys licensed to each player model. They are not on
  the disc; a decoder must already hold them to begin the ladder.
- **Processing Key (PK).** What a compliant, non-revoked device gets by walking the MKB. A
  revoked device cannot reach a usable PK.
- **Media Key (MK).** The PK plus the MKB's media-key data yields the MK. On 2.1 a per-variant
  key layer sits on top of this ladder (see below).
- **Volume Unique Key (VUK).** The MK combined with the disc's Volume ID, a 16-byte value that
  lives on the disc but is delivered by the drive over the SCSI handshake rather than stored in
  a file. With no Volume ID the chain stops here, which is a drive or handshake problem, not a
  missing key.
- **Unit / Title Keys (UK).** The VUK decrypts `AACS/Unit_Key_RO.inf`, giving the
  per-CPS-unit keys that decrypt the actual content. The file is a table of fixed-width
  entries: a 48-byte stride on AACS 1.0, a 64-byte stride on AACS 2.x.
- **Aligned units.** Content is encrypted in 6144-byte aligned units (32 source packets of
  192 bytes). The top two bits of byte 0 are the Copy Permission Indicator (CPI). Non-zero
  means the unit is encrypted, and AES-CBC covers bytes 16 through 6144. Zero means clear.
  The first 16 bytes are always clear. This CPI flag is the correct test for whether a unit
  is encrypted on M2TS and FMTS, whereas checking transport sync bytes is not. HD DVD EVO
  program streams start every pack with `00 00 01 BA`, so byte 0 is always zero there and the
  CPI says nothing; see the HD DVD note below.

What changes between the three generations is the size of the device tree the MKB walk
covers, whether the drive-to-host link is itself encrypted, and, on 2.1, a per-variant key layer plus a
second forensic layer below the Unit Keys.

## Files, notation, and the derivation arithmetic

### AACS files on a Blu-ray or UHD disc

These are ordinary files in the disc's UDF filesystem and read like any other file; no AACS
command is involved. Only the Volume ID and the bus key need the drive.

| Path | Role |
|---|---|
| `/AACS/MKB_RO.inf` | the Media Key Block (next section) |
| `/AACS/Unit_Key_RO.inf` | the encrypted CPS unit keys and the title-to-CPS-unit map (layout below). The disc hash is the SHA-1 of the whole file (20 bytes), and is how a disc is identified in key lookups |
| `/AACS/Content000.cer`, `Content001.cer`, `Content002.cer` | the Content Certificate, one file per physical layer: `Content000.cer` for layer 0, `Content001.cer` for layer 1, and `Content002.cer` as well on a triple-layer disc (layout below) |
| `/AACS/DUPLICATE/` | a backup copy of each managed file (`MKB_RO.inf`, `Unit_Key_RO.inf`). A failed read of the primary falls through to the copy |
| `/AACS/MKB_RW.inf` | the recordable-media MKB, a *different* block. It is never a substitute for `MKB_RO.inf` |
| `/AACS/IndividualSegment.tbl`, `/AACS/SegmentKeyNNNNN.tbl` | 2.1 only (see [FMTS](#fmts-versus-m2ts-the-forensic-layer)) |

HD DVD uses a different set (`MKBROM.AACS`, `VTKF*.AACS`, `CONTENT_CERT.AACS`); see the
[HD DVD page](/docs/hddvd/). On a disc as pressed the directory is `/AACS`, with an
`AACS_BAK` copy beside it, and `MKBROM.AACS` is the identifying file. Modified,
already-decrypted copies can carry it under another name (such as `ANY!` or `AAC!`); a
directory without `MKBROM.AACS` is not it.

A small file such as `Unit_Key_RO.inf` can be recorded inline in its UDF file-entry ICB
(allocation-descriptor type 3) rather than as extents, so its bytes are the ICB payload, not a
list of descriptors.

### Notation

All multi-byte integers are big-endian. `AES-128E(k, x)` and `AES-128D(k, x)` are single-block
AES-128 ECB encryption and decryption. `AES-G(x1, x2) = AES-128D(x1, x2) XOR x2`. Every AACS
CBC operation uses the fixed IV `iv0 = 0BA0F8DD FEA61FB3 D8DF9F56 6A050F78`.

### The derivation arithmetic, rung by rung

| Step | Computation |
|---|---|
| Processing Key `Kp` to Media Key `Km` (1.0, 2.0) | `Km = AES-128D(Kp, C)`, then XOR the 4-byte `uv` of that subset into `Km[12..16]`. `C` is the 16-byte `0x05` value for the same slot index as the `uv`, see [Walking the tree](#walking-the-tree) |
| Verify `Km` | `AES-128D(Km, mk_dv)[0..8] == 01 23 45 67 89 AB CD EF`, where `mk_dv` is the first 16 body bytes of the `0x81` / `0x86` record. This is the only cryptographic check in the chain that says a Media Key is right |
| Volume Unique Key `Kvu` | `Kvu = AES-G(Km, VID)`, i.e. `AES-128D(Km, VID) XOR VID` with the 16-byte Volume ID |
| Unit (title) Key `Ku` | `Ku = AES-128D(Kvu, Kue)` for each 16-byte encrypted key `Kue` in `Unit_Key_RO.inf`. One block, ECB |
| Per-unit Block Key `Kb` | `Kb = AES-128E(Ku, seed) XOR seed`, where `seed` is the first 16 bytes of the aligned unit |
| Content | AES-128-CBC decrypt of the unit bytes `16..6144` under `Kb` and `iv0` |

**Confirmed** for 1.0 and 2.0 against retail discs. HD DVD uses the same `Kvu` to title-key
unwrap. On 2.1 a per-variant key layer sits on top of this ladder; see below.

The arithmetic is deterministic downward and one-way upward, which fixes what each key is good
for:

- Any single rung is enough to reach everything below it. A Unit Key opens its CPS unit. A VUK
  yields all the Unit Keys of its disc. A Media Key plus the VID yields the VUK. A Processing
  Key yields the Media Key of any MKB that carries a slot for its subset, and only of those.
  Device Keys yield Processing Keys through the walk.
- The **Media Key is scoped to the MKB**, not to a disc: discs carrying the same MKB share it.
  The **VUK is per disc** because it mixes in the Volume ID. Everything from the VUK down is
  disc-specific.
- Every rung above the VUK needs the VID to get to the VUK. The VID is not stored in any file
  on the disc: it comes from the drive. A disc image (a folder or ISO) therefore carries no VID,
  and from an image a Media Key reaches the content only if the VID is supplied from elsewhere;
  a VUK or a Unit Key needs no VID.
- A disc is identified by the SHA-1 of `Unit_Key_RO.inf`, so identification still works when
  the MKB cannot be read.

### `Unit_Key_RO.inf`

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | `uk_pos`: offset of the key storage area |
| 16 | 1 | application type (`1` = BD-ROM) |
| 17 | 1 | number of BDMV directories |
| 18 | 1 | bit 7: use Sequence Key Blocks / Unified MKB |
| 20 | 2 | CPS unit number for First Playback |
| 22 | 2 | CPS unit number for Top Menu |
| 24 | 2 | number of titles |
| 26 + 4*i | 4 | title `i`: 2 bytes (not interpreted), then 2 bytes CPS unit number |
| `uk_pos` | 2 | number of unit keys `n` |
| `uk_pos + 48 + stride*k` | 16 | encrypted unit key `k` (`k` = 0..`n`-1) |

The stride is **48 bytes on AACS 1.0 and 64 bytes on 2.0 / 2.1**. The generation that selects the
stride comes from the MKB Type field (or the Content Certificate type), not from this file. Unit key `k` is CPS unit `k + 1`, in
on-disc order. A CPS unit number outside `1..n` is invalid. `n = 0` means no keys. A file that
declares more keys or titles than its length holds is truncated and unusable. **Confirmed** for
the fields above. The bytes between the count and the first key, and the stride bytes after each
16-byte key (32 on 1.0, 48 on 2.x), are present but not interpreted here.

### The Content Certificate

| Offset | Size | Field |
|---|---|---|
| 0 | 1 | type: `0x00` (AACS 1.0, also seen on HD DVD) or `0x10` (AACS 2.x). Other values are not recognised |
| 1 | 1 | bit 7: Bus Encryption Enabled (BEE). It is bit 7, not bit 0 |
| 14 | 6 | Content Certificate ID |

A 2.1 disc still carries a type `0x10` certificate, so the certificate alone cannot tell 2.0 from
2.1; the MKB Type field does. A 2.0 Content Certificate is signed with ECDSA on P-256 with SHA-256:
the signed region runs from byte 0 for `26 + L + 8 * N` bytes (`L` = the u16 at offset 24, the
length of the format-specific section; `N` = the u16 at offset 12, the number of digests),
followed by a 64-byte signature (`r` then `s`, 32 bytes each), checked against the published
AACS 2.0 content-certificate key. (A 1.0 certificate uses the same layout with a 40-byte
signature.) The full field list beyond the three above is not used and not documented
here.

### Aligned-unit encryption, in full

- **Geometry.** A unit is 6144 bytes: 3 sectors of 2048, or 32 source packets of 192. A source
  packet is a 4-byte `TP_extra_header` (2-bit CPI, then a 30-bit arrival timestamp) and a 188-byte
  transport packet. The unit grid starts at the first byte of the clip *file*, not at an absolute
  disc sector: a file need not start on a sector divisible by 3, so alignment is always taken
  from the file's own start.
- **Seed.** The first 16 bytes are never encrypted. They hold the first packet's
  `TP_extra_header`, its sync byte `0x47` at byte 4, and the next 11 bytes of the transport packet.
- **Flag.** The top two bits of byte 0 are the CPI. `11b` is encrypted, `00b` is clear (the Blu-ray
  book); any non-zero value is treated as encrypted. On a 2.1 feature the units inside forensic
  segments carry `01b` or `10b` instead of `11b` (see the FMTS section). The CPI is meaningful only inside Clip AV
  stream files: the bytes of UDF and navigation sectors are arbitrary, and about three in four
  of them have a non-zero top two bits. After encryption is removed, the CPI of the
  packets should read `00b`.
- **Cipher.** Bytes 16 to 6143 (6128 bytes, 383 AES blocks) form one CBC chain per unit, started
  fresh at `iv0` for every unit, under the Block Key from the arithmetic table. Units are
  independent of each other.
- **No MAC.** AACS gives no cryptographic confirmation that a Unit Key opened a unit. A key shows
  itself by structure: packet 0's sync lies in the clear seed and proves nothing, while in
  packets 1 to 31 the byte at offset 4 of a source packet is `0x47` only when the key is right.
  A correct key can still produce structurally broken content.
- **Off-grid reads.** Because the seed holds a sync at byte 4, an encrypted unit read off its
  file grid starts mid-unit on ciphertext and byte 4 is not `0x47`. A chunk with CPI `00b` passes
  this check about 1 time in 4, so only multi-unit reads catch a wrong grid reliably.
- **Trailing fragment.** A file's last unit can be shorter than 6144 bytes. A clear tail stays
  clear. A fragment whose seed is flagged encrypted cannot be decrypted (its CBC chain is cut).
- **HD DVD.** There is no aligned unit. Content is a program stream in which each 2048-byte
  sector is one pack, and encryption is per pack (HD DVD book §4.3). Every pack starts with
  `00 00 01 BA`, so byte 0 is zero and the CPI bits are not the encryption flag for EVO. The
  flag is `PES_scrambling_control` (bits 5-4 of the PES header flags byte, at offset 20 of the
  pack): a value of `01` marks an encrypted pack. In an encrypted pack, bytes 0-127 are clear and
  bytes 128-2047 are encrypted with AES-128-CBC under a per-pack key derived from the title key
  and the 16-byte CPI (at pack offset 60 of the navigation pack). There is no 16-byte seed and no
  chain across packs. Encrypted packs keep their pack start code, so its presence says nothing
  about whether a key is right. Navigation packs and `ADV_PCK` packs are never encrypted.
- **Extents.** A stream file is one or more extents. Dual-layer discs split files across layers,
  an extent can be unrecorded (a hole that still takes up file offset), and a 3D `.ssif` file
  re-lists the extents of the `.m2ts` files it interleaves, so two files can name the same
  sectors. In an `.ssif` the segments of the two clips alternate and every segment boundary is
  aligned to an aligned-unit boundary (Blu-ray book). The unit grid runs over the file's bytes and is carried across extents by file offset.
  When extents are not whole multiples of three sectors, one unit's sectors can lie in two
  non-adjacent extents.
- **Damage stays inside a unit.** Each unit is its own CBC chain with its own seed, so a damaged
  sector spoils at most its own 6144-byte unit. A damaged seed (one that no longer has its sync
  at byte 4) means the unit opens under no key. A wrong key is different: it fails *every* unit
  it is applied to, while damage fails isolated units.

### CPS units, and which key opens which stream file

- A **CPS unit** is a group of stream files under one Unit Key. `Unit_Key_RO.inf` declares how
  many there are (the `n` above, `Num_of_CPS_Unit` in the Blu-ray book), and that declared count,
  not the number of keys anyone holds, is how many keys the disc needs. Per the Blu-ray book, all
  AV stream files referred to by one title are in the same CPS unit.
- `Unit_Key_RO.inf` maps only First Playback, Top Menu and the index titles to CPS units. It
  maps no clip or playlist, and a BD-J title can play arbitrary playlists, so the file alone
  cannot give a clip's CPS unit. Per the Blu-ray book, titles that share a clip are in the same
  CPS unit; so clips of one playlist share a unit, and clips of different playlists need not.
- With `n = 1`, one key opens every encrypted stream file. With `n > 1`, nothing in a stream
  names its unit. A file shorter than one whole unit holds no encrypted unit.
- On a 2.1 feature, units inside forensic segments are *not* under the Unit Key, so they
  cannot be used to test it; the base key is tested on units outside the segments.
- A disc can carry a complete AACS directory (an MKB, `Unit_Key_RO.inf`, a Content Certificate)
  while its stream files are not encrypted at all (every unit's CPI is `00b`). A 2.1 disc can
  likewise have a segment map whose segments are clear. The per-unit flag, not the presence of
  AACS files, says whether content is encrypted.
- Stream files that no playlist references still sit under `/BDMV/STREAM`, and are encrypted
  (and bus-encrypted) like the rest.
- **HD DVD** keeps its title keys in `VTKF*.AACS` files, each bound to one playlist, and a disc
  can carry several (for example `VTKF090.AACS` and `VTKF100.AACS`). A slot's 1-based position is
  its CPS unit number, and an unused slot is skipped, not a terminator. A `VTKF` file is 2480
  bytes: the magic `DVD_HD_V_TKF` at 0, the file size (u32, 2480) at 12, the associated playlist
  name (`VPLST%%%.XPL`) at 16, reserved up to 0x80, then 64 entries of 36 bytes (`BIFO` (1,
  bit 7 `AV_FLG` = this slot holds a key), reserved (3), the encrypted title key (16), a binding
  MAC (16, `0xFF`-filled on pre-recorded discs)), and a final 16-byte MAC at 0x9A0 that is keyed
  by the VUK and is not a key. The per-pack encryption layout of HD DVD content is described in the
  aligned-unit notes above.

## The MKB and the subset-difference tree

`AACS/MKB_RO.inf` is the Media Key Block. It is a sequence of records. Each record is a
1-byte type, a 3-byte big-endian length that covers the 4-byte header and the body, then the
body. The record walk ends with the End of Media Key Block record (`0x02`, carrying the AACS LA
signature), followed by zero padding; the first `00 000000` after it is the end marker. A
retail MKB is often allocated to a fixed region (as large as 128 MiB on UHD) with the records at
the front and the rest zero padding. The real length of an MKB is the end of the last framed
record.

Framing edge cases, all **Confirmed**: the length is a full 24-bit field (records larger than
64 KiB, such as the cvalue and variant tables, use the high byte); a length of 4 is a valid
header-only record; a length under 4, or one that runs past the end of the file, ends the walk;
and *only* the exact four zero bytes end it, so a type-0 record with a non-zero length is an
ordinary record. An MKB can be read from the drive as well as from the file: `READ DISC
STRUCTURE` (`0xAD`) with byte 1 = `0x01`, format `0x83`, the pack number as a 32-bit value in
bytes 2 to 5, and a 32772-byte allocation length. Each response has a 4-byte header (a 16-bit
data length that includes 2 header bytes, then the pack count at byte 3), then up to 32768 bytes
of MKB. The MKB is the concatenation of packs `0..count-1`.

At the heart of the MKB is a **subset-difference tree**, the broadcast-encryption revocation
mechanism. Think of every licensed device as a leaf on a large binary tree. The MKB encrypts
the media-key data so that every leaf *except* a revoked set can reach it. A compliant device
finds the one subset it belongs to, walks to its Processing Key, and reads out the Media Key.
A revoked device is excluded by construction and never reaches a usable key. Revocation is
not a blocklist check. It is a property of how the block is built.

<figure>
<svg viewBox="0 0 820 400" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="A binary device tree. Every leaf is a licensed device. One leaf is revoked and marked with a red cross. A highlighted path runs from one non-revoked leaf up through its subset node to the root; a dashed arrow leaves that subset node for a Media Key box labelled one wrapped copy per subset. The revoked leaf reaches no subset that holds a valid copy, so it is excluded by construction.">
<defs>
<marker id="ahsd" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="currentColor"/>
</marker>
</defs>
<style>
.sdt{fill:currentColor;font:600 13px system-ui,sans-serif}
.sdc{fill:currentColor;font:12px system-ui,sans-serif;opacity:.78}
.sde{stroke:currentColor;stroke-width:1.2;opacity:.45;fill:none}
.sdh{stroke:#3ba55d;stroke-width:2.4;fill:none}
.sdb{fill:none;stroke:currentColor;stroke-width:1.4}
.sdl{fill:currentColor;font:600 12.5px system-ui,sans-serif}
.sdk{fill:currentColor;font:11.5px system-ui,sans-serif;opacity:.62}
.sdd{stroke:#3ba55d;stroke-width:1.4;fill:none;stroke-dasharray:4 4}
</style>
<text class="sdt" x="60" y="34">One device tree, one revocation</text>
<line class="sde" x1="290" y1="70" x2="170" y2="130"/>
<line class="sde" x1="290" y1="70" x2="410" y2="130"/>
<line class="sde" x1="410" y1="130" x2="350" y2="190"/>
<line class="sde" x1="410" y1="130" x2="470" y2="190"/>
<line class="sde" x1="170" y1="130" x2="230" y2="190"/>
<line class="sde" x1="110" y1="190" x2="80" y2="250"/>
<line class="sde" x1="230" y1="190" x2="200" y2="250"/>
<line class="sde" x1="230" y1="190" x2="260" y2="250"/>
<line class="sde" x1="350" y1="190" x2="320" y2="250"/>
<line class="sde" x1="350" y1="190" x2="380" y2="250"/>
<line class="sde" x1="470" y1="190" x2="440" y2="250"/>
<line class="sde" x1="470" y1="190" x2="500" y2="250"/>
<line class="sdh" x1="140" y1="250" x2="110" y2="190"/>
<line class="sdh" x1="110" y1="190" x2="170" y2="130"/>
<line class="sdh" x1="170" y1="130" x2="290" y2="70"/>
<circle cx="290" cy="70" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="410" cy="130" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="170" cy="130" r="6" fill="#3ba55d"/>
<circle cx="110" cy="190" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="230" cy="190" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="350" cy="190" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="470" cy="190" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="80" cy="250" r="6" fill="#3ba55d"/>
<circle cx="140" cy="250" r="6.5" fill="#3ba55d"/>
<circle cx="200" cy="250" r="6" fill="#3ba55d"/>
<circle cx="260" cy="250" r="6" fill="#3ba55d"/>
<circle cx="320" cy="250" r="6.5" fill="#e5484d"/>
<line x1="316.5" y1="246.5" x2="323.5" y2="253.5" stroke="#fff" stroke-width="1.5"/>
<line x1="323.5" y1="246.5" x2="316.5" y2="253.5" stroke="#fff" stroke-width="1.5"/>
<circle cx="380" cy="250" r="6" fill="#3ba55d"/>
<circle cx="440" cy="250" r="6" fill="#3ba55d"/>
<circle cx="500" cy="250" r="6" fill="#3ba55d"/>
<text class="sdk" x="140" y="278" text-anchor="middle">this device</text>
<text class="sdk" x="320" y="278" text-anchor="middle" fill="#e5484d" opacity="0.85">revoked</text>
<text class="sdk" x="196" y="120" text-anchor="start">its subset node</text>
<path class="sdd" d="M176 126 C 220 92 470 92 606 120" marker-end="url(#ahsd)"/>
<rect class="sdb" x="608" y="104" width="196" height="58" rx="8"/>
<text class="sdl" x="706" y="129" text-anchor="middle">Media Key</text>
<text class="sdk" x="706" y="147" text-anchor="middle">one wrapped copy per subset (0x05)</text>
<text class="sdc" x="60" y="316">A device finds the one subset it belongs to, walks to that subset&#39;s Processing Key, and opens its copy of the Media Key.</text>
<text class="sdc" x="60" y="336">The revoked leaf sits so that no subset it can reach holds a valid copy. Exclusion is structural, not a blocklist lookup.</text>
<circle cx="66" cy="366" r="6" fill="#3ba55d"/><text class="sdc" x="80" y="370">reaches the Media Key</text>
<circle cx="300" cy="366" r="6.5" fill="#e5484d"/><text class="sdc" x="314" y="370">revoked (excluded by construction)</text>
</svg>
</figure>

### How the Media Key reaches a device

The tree does two things, and it helps to keep them separate. The `0x04` Subset-Difference
record *indexes the subsets*: it carves the whole device population into groups. The `0x05`
Media Key Data record then *distributes the key*: it stores an encrypted copy of the Media Key
once per subset, one value per group. Each copy is encrypted so that only the devices in that
one subset can open it.

So a device does this. From its device keys it derives the Processing Key for the single subset
it belongs to. It uses that Processing Key to AES-decrypt that subset's value in the `0x05`
record, recovering the Media Key. Then it checks the result against the Verify record (`0x81`
on 1.0, `0x86` on 2.x), which fails a wrong derivation rather than letting a bad key through.

This is exactly how revocation works, and it is worth stating plainly. The Media Key is
broadcast to every non-revoked device at once, as one encrypted copy per subset. A device can
only open the copy sitting at its own subset. A revoked device is positioned in the tree so
that no subset it can reach carries a valid copy. The `0x05` record is, literally, the Media
Key wrapped once for each group of still-allowed devices. This mechanism is **confirmed**: every
2.0 disc decrypts through it.

The record types that matter. Every record is `type (1) | length (3, covers the 4-byte header) |
body`; the offsets below are body offsets.

| Type | Name | Body layout and notes |
|---|---|---|
| `0x10` | Type and Version | first record. `0` MKB Type (u32), `4` MKB version (u32). Version 1 is a real value (an early HD DVD carries MKB version 1), so a low version is not an error |
| `0x04` | Explicit Subset-Difference | the per-slot table of `(u_mask_shift, uv)`: **5 bytes per slot**, `u_mask_shift` (1 byte) then `uv` (u32). Starts at body offset 0 with no header. The table ends at the first entry whose first byte has either of its top two bits (`0xC0`) set. An entry with `u_mask_shift` of 32 or more, or `uv == 0`, is unusable but still occupies its slot index |
| `0x05` | Media Key Data | the cvalue table: **16 bytes per slot**, body offset 0, slot `i` at `16*i`. Slot `i` pairs with slot `i` of `0x04` (1:1). The cvalue table on 1.0 (type 3 and 4 MKBs) and 2.0 |
| `0x07` | Subset-Difference Index | a search index into `0x04`. **Not** a cvalue table, and not needed by the walk below |
| `0x81` | Verify Media Key (1.0) | `0` `mk_dv` (16 bytes). Record length at least 20 |
| `0x86` | Verify Media Key (2.x) | same layout as `0x81` |
| `0x0c` | Media Key Variant Data | 16 bytes per slot, slot-aligned with `0x04`. Takes the place of `0x05`: defined in the common book for Class II (type `0x000A1003`) MKBs, and carried by 2.1 UHD MKBs. See the 2.1 section |
| `0x2d` | Variant Data and Nonce | 2.1 only. A per-slot table of 2-byte entries followed by a 16-byte Nonce. See the 2.1 section |
| `0x2f` | Variant Key Data table | 2.1 only. A table of 16-byte entries (65,535 of them), indexed by a 16-bit value. See the 2.1 section |
| `0x20` | Drive Revocation List | a 4-byte total entry count, a 4-byte count for signature block 1, then 8-byte entries (2-byte range, 6-byte Drive ID), each signature block followed by a 40-byte signature. Not needed for a decrypt |
| `0x21` | Host Revocation List | same layout as `0x20`, with Host IDs. Not needed for a decrypt |
| `0x02` | End of Media Key Block | the AACS LA signature over the preceding records |

On a 2.0 UHD MKB the `0x05` cvalue table is large: one cvalue per subset-difference entry, so it
grows with the tree. (On 2.1 this per-subset table is `0x0c` rather than `0x05`, as the 2.1
section explains.) Reading cvalues from the wrong record, in particular from the `0x07` index
rather than `0x05`, under-covers the tree and the walk fails to find the matching subset.

### Walking the tree

This is the player-side algorithm that takes a device from its Device Keys to a Processing Key.
It is the standard AACS broadcast-encryption walk and is **Confirmed** against retail 1.0 and 2.0
discs.

A **device key** is a 16-byte secret held with its position in the tree: a device node number (`d`, the device number shifted left one bit with the low bit set), a
`uv` (u32), and a `u_mask_shift` (the number of low-order zero bits in its u-mask).

1. For each slot `i` of the `0x04` table, form `u_mask = 0xFFFFFFFF << u_mask_shift` and
   `v_mask = 0xFFFFFFFF << (p + 1)`, where `p` is the position of the lowest set bit of that slot's
   `uv`. Slots with `uv == 0` or a shift of 32 or more are skipped (but still count in the slot
   numbering).
2. The slot's subset applies to the device when `(d & u_mask) == (uv & u_mask)` **and**
   `(d & v_mask) != (uv & v_mask)`.
3. The device key that serves the slot is the one with the same u-mask and with
   `(uv & dev_v_mask) == (dev_uv & dev_v_mask)`, where `dev_v_mask` is computed from the device
   key's own `uv` as in step 1.
4. **Descend** from the device key to the slot's node. Set `node` to the device key and
   `cur_v_mask` to `dev_v_mask`. While `cur_v_mask != v_mask`: take the highest bit position `b`
   at which `cur_v_mask` is 0; take the left child if bit `b` of the slot's `uv` is 0 and the right
   child if it is 1 (`node = AES-G3(node, 0)` or `AES-G3(node, 2)`); then shift `cur_v_mask` right
   by one with sign extension. The tree is at most 32 levels deep, so a walk that has not
   converged after 32 steps is corrupt and must stop.
5. The Processing Key is `Kp = AES-G3(node, 1)`.
6. Open slot `i`'s `0x05` value with `Kp` (the Media Key arithmetic above) and check it against
   the Verify record. If the check fails, this slot is not the device's.

`AES-G3(k, inc)` is the Triple AES Generator: take the 16-byte seed
`s0 = 7B103C5D CB08C4E5 1A27B017 99053BD9`, add `inc` to its last byte (wrapping), then
`AES-G3(k, inc) = AES-128D(k, seed) XOR seed`. `inc = 0` yields the left child's key, `1` the
Processing Key, `2` the right child's key.

A Processing Key that is already terminal (one for a specific subset) needs no descent: try it
directly against every slot as in step 6. A device whose position does not satisfy step 2 for any
slot is revoked.

### Detecting the generation

The `0x10` Type-and-Version record carries a 32-bit MKB Type field at body offset 0. Only the
first few bytes of the MKB are needed to classify a disc.

| MKB Type field | Generation | Disc format |
|---|---|---|
| `0x00041003` | AACS 1.0 (Blu-ray pre-recorded) | Blu-ray |
| `0x48141003` | AACS 2.0 (UHD Category C) | 4K UHD |
| `0x48151003` | AACS 2.1 (UHD Category C, variant) | 4K UHD (FMTS) |

Two further type values are recognised and both fall in the 1.0 generation (not UHD):
`0x00031003` (recordable media) and `0x000A1003` (Class II / unified). Any unrecognised value is
kept verbatim and is also treated as 1.0; only the two Category C values are UHD. The generation
decides the `Unit_Key_RO.inf` stride (48 on 1.0, 64 on 2.x).

**Confirmed** against retail discs. One nuance: a 2.1 disc carries a content certificate that
still reads as 2.0. The `0x48151003` MKB Type field is the reliable signal, additionally
confirmed by finding the `0x2d` / `0x2f` variant records during the walk. These
two signals have been checked across a library of discs and always agree: the 2.1 type value
coincides with the variant records, the 2.0 type value never does.

Other facts the generation and encryption status rest on:

- The Type-and-Version record is the first record, so the first 64 bytes of `MKB_RO.inf` are
  enough to classify a disc.
- A disc with a `BDMV` tree and **no** MKB (and no `AACS` directory) is simply unencrypted, not
  damaged. A disc whose MKB prefix is missing or unreadable can still be recognised as UHD from
  `BDMV/index.bdmv`: its first 8 bytes read `INDX0300` (`0300` is the UHD version value).
- Bus encryption is declared by the Content Certificate's BEE flag. When that certificate is
  missing or unparseable, BEE is unknown, and on a UHD disc the absence of the certificate cannot
  be read as "no bus encryption".
- Bus encryption is removed with the read data key only when the BEE flag is set **and** the
  drive's certificate reports BEC. With BEE clear a disc reads in the clear over the bus, and a
  failed authentication blocks nothing (the VID is still needed to turn a Media Key into a VUK).
- A host certificate is revoked *from* a given MKB version onward: it is unusable against a disc
  whose MKB version is that value or higher, and still usable below it.

## The drive link: Volume ID, authentication, and bus encryption

Two inputs to the ladder do not come from files: the **Volume ID** (VID) and, on discs with bus
encryption, the **read data key**. Both are delivered by the drive. There are two ways to obtain
them: a host-certificate mutual authentication (AKE) that ends in a shared **bus key**, or a drive
whose bus protection has already been lifted by other means ([Unlocked drives](/docs/drives-unlocked/)),
which answers the same Volume ID read with no authentication.

### SCSI framing

All commands are 12-byte CDBs.

| Command | Opcode | Fields |
|---|---|---|
| REPORT KEY | `0xA4` | byte 7 = `0x02` (AACS key class); bytes 8-9 = allocation length; byte 10 = `(AGID << 6) \| key format` |
| SEND KEY | `0xA3` | same layout as REPORT KEY, parameter length in bytes 8-9 |
| READ DISC STRUCTURE | `0xAD` | byte 1 = `0x01` (Blu-ray); byte 7 = format; bytes 8-9 = allocation length; byte 10 = `AGID << 6` (AGID 0 when no authentication) |

An **AGID** is a 2-bit authentication-grant ID. A drive has four. Every AGID that is allocated
must be released (REPORT KEY format `0x3F`), or the drive's pool leaks.

### Authentication (AACS 1.0, ECDSA on the AACS 160-bit curve with SHA-1)

| Step | Command | Payload |
|---|---|---|
| 1 | REPORT KEY format `0x3F`, 2 bytes, AGID 0 to 3 | invalidate every AGID |
| 2 | REPORT KEY format `0x00`, 8 bytes | the AGID is in bits 7-6 of response byte 7 |
| 3 | host side | generate a 20-byte random nonce `Hn` and an ephemeral key pair (private `Hk`, public point `Hkp`) |
| 4 | SEND KEY format `0x01`, 116 bytes | `0` length `0x0072` (u16), `4` `Hn` (20), `24` host certificate (92) |
| 5 | REPORT KEY format `0x01`, 116 bytes | `4` drive nonce `Dn` (20), `24` drive certificate (92). The drive certificate must have type `0x01` and a valid LA signature |
| 6 | REPORT KEY format `0x02`, 84 bytes | `4` drive key point `Dkp` (x 20, y 20), `44` signature (r 20, s 20) over `Hn \|\| Dkp` (60 bytes), verifiable with the key in the drive certificate |
| 7 | SEND KEY format `0x02`, 84 bytes | `0` length `0x0052`, `4` `Hkp` x (20), `24` `Hkp` y (20), `44` r (20), `64` s (20): signature over `Dn \|\| Hkp` (60 bytes) with the host certificate's private key |
| 8 | host side | **bus key** = the low 128 bits of the x-coordinate of `Hk × Dkp` (the last 16 of its 20 big-endian bytes). `Dkp` must lie on the curve and the product must not be the point at infinity |

Signatures are ECDSA over SHA-1 of the signed bytes, `r` and `s` each 20 bytes. **Confirmed**:
the certificate layout below verifies genuine LA-signed host certificates, and the exchange is the
one a real drive completes.

### Certificate layouts

| Offset | Size | AACS 1.0 certificate (92 bytes) |
|---|---|---|
| 0 | 1 | type (`0x01` for a 1.0 drive certificate) |
| 1 | 1 | flags. On a drive certificate, bit 0 is **Bus Encryption Capable** (BEC) |
| 2 | 2 | not interpreted here |
| 4 | 6 | Host / Drive ID |
| 10 | 2 | reserved |
| 12 | 20 | public key x |
| 32 | 20 | public key y |
| 52 | 20 | LA signature r |
| 72 | 20 | LA signature s |

The signature covers bytes `0..52` and is checked against the Licensing Administrator's
published public key. A host certificate is paired with a private key (20 bytes). A pair whose
private key times the curve generator is not the certificate's public key can never establish a
bus key, however genuine the certificate is.

| Offset | Size | AACS 2.0 certificate (132 bytes), **Unconfirmed / provisional** |
|---|---|---|
| 0 | 1 | type `0x11` |
| 1 | 1 | version |
| 4 | 32 | public key x (P-256) |
| 36 | 32 | public key y |
| 68 | 32 | signature r |
| 100 | 32 | signature s |

The 2.0 signature covers bytes `0..68` (ECDSA, P-256, SHA-256). These offsets have been exercised
only against emulated drives; no genuine 2.0 drive or host certificate has confirmed them, and
the position of the BEC flag in a 2.0 certificate is unknown. (The P-256 / SHA-256 signature
check itself is confirmed, on a retail 2.0 Content Certificate.) The native 2.0 exchange uses the same steps as above with these
sizes: 20-byte nonces; SEND/REPORT KEY format `0x01` of 156 bytes (length `0x009A`, nonce at 4,
certificate at 24); format `0x02` of 132 bytes (length `0x0082`, point x at 4, y at 36, r at 68,
s at 100) with signed data of 84 bytes (`nonce || x || y`); and a bus key taken from the last 16
of the 32 bytes of the shared x. A type `0x11` drive certificate cannot complete the 1.0
exchange; any other type byte (an all-zero certificate, for example) is invalid. A 2.0 drive does
accept the 1.0 exchange as a compatibility path, but the bus key it yields cannot authenticate the
Volume ID, so the VID MAC below fails.

### Reading the Volume ID and the data keys

| What | Command | Response (36 bytes) |
|---|---|---|
| Volume ID | READ DISC STRUCTURE format `0x80`, 36 bytes | `4` VID (16), `20` MAC (16) |
| Read / write data keys | READ DISC STRUCTURE format `0x84`, 36 bytes | `4` encrypted read data key (16), `20` encrypted write data key (16) |

- The **VID MAC** is `AES-128-CMAC` keyed by the bus key over the 16-byte VID (a single full
  block: subkey `K1` from `AES-128E(bus key, 0)`, no padding). A mismatch means the VID is not
  trustworthy. An all-zero VID is an unfilled response and invalid.
- The **data keys** are each `AES-128D(bus key, value)` (one block, ECB). There is no MAC on this
  structure. An all-zero response is unfilled and invalid. The read data key is only requested
  from a drive whose certificate reports BEC.
- Without authentication, a drive whose bus protection is already lifted returns the same format
  `0x80` structure with AGID 0. The MAC cannot be checked there and is ignored.
- A host certificate revoked by the Host Revocation List is refused by the drive when the
  certificate is sent (step 4), as a CHECK CONDITION with sense key ILLEGAL REQUEST and ASC
  `0x6F`, ASCQ `0x00` (copy-protection key-exchange failure). **Unconfirmed** on real drives; this
  is the shape modelled.

### Bus encryption

When the Content Certificate's BEE flag is set, the drive encrypts data on the drive-to-host link.
It applies to Clip AV stream files only, and only to aligned units whose CPI is `11b`; filesystem
and navigation sectors are never bus-encrypted. Within such a unit, **each 2048-byte sector** is
encrypted separately: bytes `16..2048` of the sector are AES-128-CBC under the **read data key**
with `iv0`, the chain restarting at every sector, and the first 16 bytes of every sector are
clear. A sector's flag comes from the CPI in byte 0 of the unit's *first* sector (clear on the
wire), so all three sectors of a unit are treated alike.

Bus encryption is removed first. Only then is the unit's own encryption (the Unit Key and Block
Key, above) removed, over bytes `16..6144` of the unit as it reads after de-bussing. Reading an
encrypted unit without the read data key gives double ciphertext, which no Unit Key opens.

## What each generation adds

The rest of this page is the delta per generation. Read it in order. Each section assumes the
ladder above and describes only what is new.

### AACS 1.0, Blu-ray: the plain chain

The ladder with nothing extra. Walk the tree to the Processing Key, read the Media Key,
verify it against the `0x81` record, derive the VUK, decrypt the Unit Keys, decrypt the
content. `Unit_Key_RO.inf` uses a 48-byte per-key stride. Bus encryption is defined for 1.0 as well,
but it is optional and controlled by the Content Certificate's BEE flag; with BEE clear the drive
hands back ciphertext straight from the disc.

The 1.0 and 2.x subset-difference trees use the same 32-bit `uv` and mask encoding. A 1.0 MKB
carries a few hundred subsets, so it is small and cuts the device space into a few coarse
subtrees.

### AACS 2.0, 4K UHD: bigger tree, encrypted bus

The same ladder over a larger MKB, with bus encryption in use.

**A larger MKB.** The tree has the same 32-bit shape as 1.0, but a 2.0 MKB carries far more
subset-difference entries (about 181,000, against about 560 on a Blu-ray). Its subsets are
shallower, not deeper: the device space is cut into many more, smaller subtrees, so one
compromised UHD player can be revoked without collateral damage to unrelated models. The
number of entries drives the size of `MKB_RO.inf`, which is why UHD MKBs are far larger than
Blu-ray ones.

**Bus encryption.** The drive re-encrypts read data on the drive-to-host link. That layer has
to be removed before you can even read ciphertext off the disc. It comes off one of two ways:
a firmware-unlocked drive that strips it in place, or the AACS host-certificate handshake. See
[The drive link](#the-drive-link-volume-id-authentication-and-bus-encryption) for the message
formats and the per-sector layout, and [Unlocked drives](/docs/drives-unlocked/).

Everything from the Media Key down (VUK, Unit Keys, aligned units) is unchanged from 1.0.
`Unit_Key_RO.inf` moves to a 64-byte stride, and the Verify record is `0x86` instead of
`0x81`.

### AACS 2.1: a per-variant key layer

AACS 2.1 adds a per-variant key layer on top of the 2.0 hierarchy, and a second forensic layer
below the Unit Keys (the FMTS variant segments, covered next). The `0x86` Verify record still
gates the Media Key.

#### What 2.1 adds, concretely

Two kinds of addition distinguish a 2.1 disc from a 2.0 disc: extra files in the `AACS/`
directory, and extra records inside `MKB_RO.inf`.

On-disc `AACS/` files that exist **only** on 2.1. Their mere presence is the fingerprint of a
2.1 disc:

- **`IndividualSegment.tbl`**, the forensic segment map (where the variant segments live).
  Format covered in the FMTS section below.
- **`SegmentKey00001.tbl`**, the per-segment variant keys. There is one `SegmentKey` file per
  CPS unit, numbered. Its container structure is covered in the FMTS section; the record's
  internal layout is not documented.

Inside `MKB_RO.inf`, the change from 2.0 to 2.1 is best read at the record level, against the
`0x05` Media Key Data record described above.

- **`0x0c` replaces `0x05`.** On 2.0, `0x05` holds one value per subset. On 2.1, `0x05` is gone
  and `0x0c` sits in its place with the *same shape*: one 16-byte value per subset of the tree,
  1:1 with the subset index. (`0x0c` is not new to 2.1 as a record type: the AACS common book
  defines it as the Media Key Variant Data record of Class II / type `0x000A1003` MKBs, which
  likewise carry it instead of `0x05`.)
- **`0x2f` is new: the variant key pool.** A large per-variant key table indexed by a 16-bit
  selector. Its entry count is one short of the full selector space (65,535).
- **`0x2d` is new: per-disc variant data.** A smaller, structured record: a per-slot table of
  2-byte entries followed by a 16-byte nonce.

| Version | MKB records for the Media Key |
|---|---|
| 2.0 | `0x05` = one encrypted value per subset |
| 2.1 | `0x0c` = one value per subset (replaces `0x05`); `0x2f` = large variant key pool indexed by the selector; `0x2d` = per-disc variant data |

The revocation tree these ride on is unchanged in kind from 2.0: the `0x04` Subset-Difference
record plus the `0x07` index record. The verify record is `0x86`, as on all AACS 2.x.

These records are exclusive to 2.1 among UHD discs. A 2.0 disc lacks all three, and the 2.1 MKB
Type field (`0x48151003`) always coincides with the presence of the variant records, while the
2.0 type value never does. So detecting a 2.1 disc by its type field and detecting it by these
records give the same answer.


## FMTS versus M2TS: the forensic layer

On a normal Blu-ray or 2.0 UHD the main feature is a `.m2ts` file: an MPEG-2 transport stream
of 192-byte source packets, one coherent version of the movie.

On a 2.1 disc the main feature is a `.fmts` file, `BDMV/STREAM/00001.fmts`. It is still a
192-byte transport stream, and everything that applies to M2TS applies here, but it carries
**interleaved variant segments**: short stretches where the same frames are authored several
slightly different ways. Only one variant is meant for any given player.

<figure>
<svg viewBox="0 0 820 250" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="A normal M2TS stream is one solid bar of content. An FMTS stream is mostly identical content with short highlighted variant segments spaced across it. Each variant segment is authored several ways and a player can decrypt only one.">
<style>
.hd{fill:currentColor;font:600 13px system-ui,sans-serif}
.cp{fill:currentColor;font:12px system-ui,sans-serif;opacity:.75}
.base{fill:currentColor;opacity:.14}
.frame{fill:none;stroke:currentColor;stroke-width:1.2;opacity:.55}
</style>
<text class="hd" x="40" y="38">M2TS (Blu-ray, AACS 2.0 UHD)</text>
<rect class="base" x="40" y="48" width="740" height="34"/>
<rect class="frame" x="40" y="48" width="740" height="34"/>
<text class="cp" x="410" y="70" text-anchor="middle">one coherent stream, decrypted with the Unit Key</text>
<text class="hd" x="40" y="130">FMTS (UHD, AACS 2.1)</text>
<rect class="base" x="40" y="140" width="740" height="34"/>
<rect class="frame" x="40" y="140" width="740" height="34"/>
<rect x="128" y="140" width="15" height="34" fill="#f5a623"/>
<rect x="236" y="140" width="15" height="34" fill="#f5a623"/>
<rect x="345" y="140" width="15" height="34" fill="#f5a623"/>
<rect x="447" y="140" width="15" height="34" fill="#f5a623"/>
<rect x="551" y="140" width="15" height="34" fill="#f5a623"/>
<rect x="654" y="140" width="15" height="34" fill="#f5a623"/>
<rect x="735" y="140" width="15" height="34" fill="#f5a623"/>
<line x1="135" y1="174" x2="135" y2="196" stroke="#f5a623" stroke-width="1.4"/>
<rect x="70" y="196" width="130" height="40" rx="6" fill="none" stroke="#f5a623" stroke-width="1.2"/>
<text class="cp" x="135" y="214" text-anchor="middle">variant segment:</text>
<text class="cp" x="135" y="229" text-anchor="middle">N variants, encrypted</text>
<text class="cp" x="510" y="210" text-anchor="middle">most of the stream is ordinary content under the Unit Key;</text>
<text class="cp" x="510" y="226" text-anchor="middle">the highlighted segments use per-segment keys, one variant per player</text>
</svg>
</figure>

:::note[A note on names]
The terms here are grounded in what the disc itself calls things, not invented. **Segment Key**
and **Individual Segment** are the disc's own terms: the on-disc filenames `SegmentKey00001.tbl`
and `IndividualSegment.tbl`. Keep the two 2.1 variant layers distinct: **Media Key Variant**
(Layer 1, in the MKB, where "Variant" and "Variant Key Data" belong) versus the **segment keys**
(Layer 2, in the content). They meet at the 16-bit selector.
:::

On the disc, the 2.1 main feature is `BDMV/STREAM/00001.fmts` rather than a `.m2ts`: a playlist
item's clip ID resolves to `<id>.m2ts`, `<id>.fmts` (2.1), or, on 3D discs,
`STREAM/SSIF/<id>.ssif`. The `.ssif` carries both eyes interleaved, so the clip information
file's packet count (base view only) understates what its extents hold.

Two files in `AACS/` describe the segments, and only 2.1 discs have them.

- **`IndividualSegment.tbl`**, the segment map. **Confirmed** format, big-endian, laid out in
  the table below. The `index` field is the forensic-variant
  tag, not a running index: a retail 2.1 disc has **792 records of 16 bytes** with the
  `variant` field cycling `1, 2, …, 32, 1, 2, …` down the table in file order — **25 groups (24
  full cycles of 32 plus a final partial cycle of 24)**, one record per variant per cycle. Each
  segment is a **2560-source-packet (~480 KB)** range; `start_spn` increases monotonically down
  the table, the segments spread **~68 MB apart** across the ~54 GB feature. The offsets are
  source-packet numbers, so a byte offset is `spn * 192`. The number of segments is not fixed by
  the scheme. It is an authoring choice: more segments means finer-grained tracing. The segments
  are spread across the whole feature rather than clustered, and together cover a small
  fraction of it (under 1%).
- **`SegmentKey00001.tbl`**, the per-segment variant keys. One per CPS unit, numbered. The
  container structure is **confirmed**, laid out in the table below: an 8-byte
  header (a selector `count` and a `record_size`) followed by one fixed-size record per value of
  the 16-bit selector. The header's
  count field reads `0xffff`, a sentinel for the **full 65536-value selector space** — a retail 2.1 disc
  has **65536 records of 536 bytes each**, which the total file size confirms
  exactly: `8 + 65536 × 536 = 35,127,304` bytes. A ~35 MB store. Each record opens with an 8-byte sub-header, then a 528-byte
  payload of high-entropy (encrypted) key material. The record's *internal* layout is **not yet
  reversed**; `528 = 33 × 16` suggests **33 sixteen-byte slots**, but that is an inference from the
  size, not a parsed structure. Either way it is a **small fixed set, far fewer than the 792
  segments** in the feature. The record size itself is a fixed structural constant — a decoder
  validates the table by checking it against a constant — so it is the same on every 2.1 disc. That
  is the confirmed, structural half of the grouping model in
  [Where the sizes come from](#where-the-sizes-come-from): a device carries a handful of variant
  keys, not one per segment. How that key material maps onto the segments is a **working model** —
  within the store each forensic segment would carry a key per variant it is authored in, and a
  device uses the one matching its variant — and is not documented.

`IndividualSegment.tbl` (**Confirmed**, retail 2.1):

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | type (`0x01000000`) |
| 4 | 2 | `count`: number of records |
| 6 | 2 | `record_size`, always 16 |
| 8 + 16*i | 4 | record `i`: marker (`0x01000000`) |
| +4 | 2 | `index`: forensic tag, 1 to 32 |
| +6 | 2 | flag (`1`) |
| +8 | 4 | `start_spn`: first source packet of the segment, **inclusive** |
| +12 | 4 | `end_spn`: last source packet of the segment, **inclusive** |

`SegmentKeyNNNNN.tbl` (**Confirmed** container, retail 2.1):

| Offset | Size | Field |
|---|---|---|
| 0 | 4 | tag (`0x01000000`) |
| 4 | 2 | `index_space`: record count, where `0xffff` means the full 65536 |
| 6 | 2 | `record_size`: 536 on 2.1 discs |
| 8 + 536*s | 536 | record for selector value `s`: an 8-byte sub-header (`01 00 00 00 00 20 01 02`), then 528 bytes of encrypted key material whose internal layout is not reversed |

Rules that hold for both tables, all **Confirmed**: a file whose declared size does not match its
length exactly (`8 + count * record_size` for the key file; at least that much for the segment
map) is truncated or foreign and is rejected, not partly read; a segment map whose
`record_size` is not 16 is rejected; a segment's packet count is `end_spn - start_spn + 1`, so
2560 on the retail disc; a record with `start_spn > end_spn` is invalid and cannot be mapped. Segments
typically begin on a multiple of 32 source packets (one aligned unit), and a
unit that only partly overlaps a segment at either edge still belongs to it. `SPN`s are relative
to the forensic clip: the single `.fmts` file in `/BDMV/STREAM`. With two or more `.fmts` files
the byte space is ambiguous, and records that begin past the end of that clip are stale and are
dropped. A segment that straddles two non-adjacent extents of the clip file cannot be mapped to a
sector range. A table that is present but unparseable must be refused, since ignoring it would
treat forensic units as ordinary content. Every tag `1..32` that appears in the map needs its
index key; a segment whose tag has none would fall back to the Unit Key and decrypt to noise.
Outside the segments, units are ordinary content under the file's own Unit Key.

How a decoder *finds* the segments: the stream marks them. Every unit inside a segment has a
CPI of `01b` or `10b`, while every ordinary encrypted unit, including the units just before and
after a segment, has `11b`. Within a segment the even-numbered units (0, 2, ..., 78) are `01b`
and the odd-numbered units are `10b`, so the stream itself labels the two interleaved halves.
`IndividualSegment.tbl` still gives the exact ranges and the index tag of each segment. A unit's
byte offset against the segment ranges decides whether that unit takes the ordinary Unit Key
or a segment key. The map carries more than positions: each record names a range of source
packets and its index tag, so the decoder can select the right key for a given unit. There is
no explicit group field: the group a record belongs to is its position in the table, one cycle
of 32 tags per group.

What the disc tells us: each segment's variants are encrypted under **segment keys**, not the
Unit Key. A player derives the key for exactly one variant per segment, and which variant it
can decrypt is a fingerprint of that player. That is the second traitor-tracing layer, and it
is the actual forensic watermark. A leaked rip carries, in which variants it contains, the
identity of the machine that made it.

Working model: the units in a segment use the same 6144-byte aligned-unit geometry and a clear
16-byte seed with `0x47` at byte 4, and are taken to use the same AES-CBC as any encrypted unit,
differing only in where the per-unit key comes from: the ordinary unit-key derivation or a
segment-key derivation. The unit key covers a whole CPS content unit, while a segment key
covers only its one forensic segment, and only for the device's variant.

The per-unit content key is also deterministic. A compliant player derives it through an
obfuscated computation, so the intermediate value it carries is randomized per session and
differs from one play of the disc to the next. The key that derivation finally produces does
not. For a fixed disc and a fixed unit the AES key is fixed, the same on every play, because
the ciphertext on the disc is fixed and AES is deterministic. The obfuscation conceals how the
key is reached, not the key itself.

### Inside a segment: the interleave, confirmed by decode

A note on terms first, because two different things both get called "variant" loosely. The
**variant** proper is the AACS 2.1 Media Key Variant — a device's position in the 65536-value
selector space (Layer 1, in the MKB), which decides *which set* of keys a device receives. That
layer is not what a ripper touches. What the segment map deals with is the **index**: the `1..32`
tag each `IndividualSegment.tbl` record carries, selecting one of **32 index keys**. All 32 index
keys belong to a single variant, whose number is unknown and irrelevant to the decode.

With a full set of the 32 index keys in hand, the inside of a segment can be read straight off
the disc, and it is simpler than the ~35 MB key store suggests. Each `IndividualSegment.tbl`
record spans **2560 source packets = 80 aligned units** (6144 bytes each). Those 80 units are not
uniform: they **interleave in two stride-2 halves**, 40 units each. Applying the segment's index
key — the key whose number equals the record's `index` tag — decrypts one half to a full, clean
transport stream (sync `0x47` restored on all 32 packets of each unit). Units are numbered from the
segment start: unit `u` begins at byte `start_spn * 192 + u * 6144`, and each unit is its own CBC
chain. The half that opens is either every **even-numbered** unit or every **odd-numbered** unit.
The stream labels the halves by CPI: even units are `01b` and odd units are `10b`. Which parity
a given tag's key opens may differ from tag to tag. The other half decrypts to noise under that
key and is left untouched. Working model: it belongs to a
different device group's variant. The index-1 segment's units open under index key 1, the
index-2 segment's under key 2, and so on as the tag cycles `1..32` down the map. The second
interleaved half is not yet identified.

Two facts fall out, both **confirmed**:

- The whole feature's forensic content is covered by **32 index keys plus the ordinary Unit
  Key**: one index key per tag, reused across every segment that carries that tag, and the Unit
  Key for the more than 99% of the feature outside any segment. That is **40 of every segment's
  80 units** decrypting cleanly under the tag's key, the other 40 belonging to the second half.
- A plausible reading of the earlier 32-versus-33 question is 33 = 32 index keys + 1 base
  (`528 = 33 × 16`). But that is an **inference from the record size**, not a parsed layout — the
  528-byte record's internals are not yet reversed. What is proven is that **32 index keys**
  (obtained from a key source, not derived on-disc) decode the segments; how they sit inside the
  record is open.

Because the tag alone picks the key, a decoder needs nothing from the stream to route a forensic
unit. It reads the segment's `index` from `IndividualSegment.tbl`, applies index key = tag to the
units the segment covers, and the Unit Key everywhere else — the same "map decides per unit" rule
already described, now with the key selection pinned to a single field.

What is confirmed here is the **structure and the mapping**: given the 32 index keys, precisely
which units open under which key, verified to full transport-stream sync. What is still a working model is the makeup of the second interleaved half.

### Why the forensic layer exists

The purpose of the segments is to watermark the leaker into the decoded *video*, not into the
keys. The bulk of the movie decrypts with the ordinary Unit Key and is identical on every
copy of the title. The forensic segments are the exception: each needs a variant segment key,
and any given licensed device can decrypt only one variant per segment. Which one is fixed by
that device's place in the key tree.

So every licensed device produces a subtly different decoded video. The movie is the same, but
the specific variant chosen at each segment differs from device to device. That per-segment
choice pattern is a fingerprint, like a barcode running the length of the film. One segment
narrows the source. All the segments together pin the device group.

That is the reason the design exists. The identity is carried in the decoded frames
themselves, so a leaked rip is self-incriminating. AACS can read the variant pattern out of a
leaked file, map it back to the device group that must have produced it, and revoke that
group in future MKBs, with the leaked video as the proof. It shifts enforcement from chasing
leaked keys around the internet to reading the source device straight off the leaked frames.
Working model of the mechanism: no key or ID is embedded in the picture. The frames reveal a
device-determined *selection* pattern, one choice per segment, and that pattern is what
identifies the source.


### Where the sizes come from

The interesting property of this scheme is that a device holds only a **small, fixed set of
variant keys**, yet that small set covers **all** the segments in a feature, and the on-disc
key store is nonetheless enormous. Both facts follow from the same design, as a working model that is
not documented.

Start from the segments. A title has some number of forensic segments. That count is an
authoring choice, not a constant: more segments give finer-grained tracing. The size of a
device's key set is the opposite, a constant fixed by the format: the per-device record has one
layout on every 2.1 disc, so the number of variant keys a device holds does not vary from title
to title even as the segment count does. A device is not given one key per segment, that would
not scale. Instead the segments are **partitioned into groups**, one group per variant key the
device holds, so the device's small key set covers every segment. Conceptually:

> number of segments = (variant keys per device) x (segments per group)

<figure>
<svg viewBox="0 0 820 210" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="Illustrative grouping: the forensic segments are partitioned into groups, one group per variant key a device holds. A device's few keys together cover every segment. Not to scale.">
<style>
.gt{fill:currentColor;font:600 13px system-ui,sans-serif}
.gc{fill:currentColor;font:12px system-ui,sans-serif;opacity:.75}
.gk{font:600 12px system-ui,sans-serif}
.gbr{fill:none;stroke-width:1.4}
</style>
<text class="gt" x="40" y="34">the segments of one feature, partitioned into groups</text>
<g>
<rect x="40" y="52" width="32" height="26" fill="#3ba55d" opacity="0.75"/>
<rect x="76" y="52" width="32" height="26" fill="#3ba55d" opacity="0.75"/>
<rect x="112" y="52" width="32" height="26" fill="#3ba55d" opacity="0.75"/>
<rect x="148" y="52" width="32" height="26" fill="#3ba55d" opacity="0.75"/>
<path class="gbr" stroke="#3ba55d" d="M40 88 L40 96 L180 96 L180 88"/>
<text class="gk" x="110" y="114" text-anchor="middle" fill="#3ba55d">variant key 1</text>
</g>
<g>
<rect x="204" y="52" width="32" height="26" fill="#4c8dff" opacity="0.75"/>
<rect x="240" y="52" width="32" height="26" fill="#4c8dff" opacity="0.75"/>
<rect x="276" y="52" width="32" height="26" fill="#4c8dff" opacity="0.75"/>
<rect x="312" y="52" width="32" height="26" fill="#4c8dff" opacity="0.75"/>
<path class="gbr" stroke="#4c8dff" d="M204 88 L204 96 L344 96 L344 88"/>
<text class="gk" x="274" y="114" text-anchor="middle" fill="#4c8dff">variant key 2</text>
</g>
<g>
<rect x="368" y="52" width="32" height="26" fill="#f5a623" opacity="0.8"/>
<rect x="404" y="52" width="32" height="26" fill="#f5a623" opacity="0.8"/>
<rect x="440" y="52" width="32" height="26" fill="#f5a623" opacity="0.8"/>
<rect x="476" y="52" width="32" height="26" fill="#f5a623" opacity="0.8"/>
<path class="gbr" stroke="#f5a623" d="M368 88 L368 96 L508 96 L508 88"/>
<text class="gk" x="438" y="114" text-anchor="middle" fill="#f5a623">variant key 3</text>
</g>
<g>
<rect x="532" y="52" width="32" height="26" fill="#b36ae2" opacity="0.8"/>
<rect x="568" y="52" width="32" height="26" fill="#b36ae2" opacity="0.8"/>
<rect x="604" y="52" width="32" height="26" fill="#b36ae2" opacity="0.8"/>
<rect x="640" y="52" width="32" height="26" fill="#b36ae2" opacity="0.8"/>
<path class="gbr" stroke="#b36ae2" d="M532 88 L532 96 L672 96 L672 88"/>
<text class="gk" x="602" y="114" text-anchor="middle" fill="#b36ae2">variant key 4</text>
</g>
<text class="gc" x="40" y="150">A device holds one key per group (four here). Its few keys together cover every segment.</text>
<text class="gc" x="40" y="170">The disc stores a full key set for every possible device path, so the table dwarfs any one device's set.</text>
<text class="gc" x="40" y="194" opacity="0.55">Illustrative, not to scale. Real features have far more segments and groups.</text>
</svg>
</figure>

Now the on-disc key store. `SegmentKey.tbl` does not store one device's keys. It stores a
key set for **every possible device path**, one record per value of the selector, across the
full selector space. So its size is not the per-device key count. Conceptually:

> table size = (selector space) x (variant keys per device)

That is why the store is far larger than any one player needs. Every player reads only the one
record its selector points at and holds only that set. Which set it holds is precisely its
fingerprint. The table is large by design: it has to carry a distinct fingerprint for every
device the scheme can address.


### Decoding FMTS

A variant segment decrypted under the ordinary Unit Key produces garbage, which a decoder may
report as HEVC reference-frame errors. Correct
handling decrypts each segment under its index key and splices one coherent variant back into a
single-variant stream.

The segment map ties every unit range to its forensic index tag, and with the 32 index keys the
routing from a unit to the right key is fixed. The internal layout of the 528-byte `SegmentKey`
record is not documented: that a record holds 33 sixteen-byte slots is an inference
(`528 = 33 × 16`), not a parsed fact. Whether the per-segment key set is one unmarked base version
plus a fixed number of forensic variants is likewise a plausible reading, not a confirmed fact.
Within a segment only one half of the units opens under a given index key, and a stream assembled
from the opened half is a clean single variant; the other half is never decrypted.


## Confirmed versus theorized

| Element | Status |
|---|---|
| Key hierarchy (DK, PK, MK, VUK, UK) for 1.0 and 2.0 | **Confirmed.** Retail 1.0 and 2.0 discs decrypt end to end |
| Standard 2.1 content: decodes with a Unit Key (from a VUK, no device keys) | **Confirmed.** Works today, bulk of the movie |
| CPI (byte 0) encrypted-unit test on M2TS and FMTS (not EVO) | **Confirmed** |
| `Unit_Key_RO.inf` stride: 48 (1.0), 64 (2.x) | **Confirmed** |
| MKB record framing (24-bit length, end marker) and record types `0x10` / `0x04` / `0x05` / `0x81` / `0x86`, with their body layouts | **Confirmed** |
| `0x05` Media Key Data: the Media Key wrapped once per subset, opened by that subset's PK | **Confirmed.** Every 2.0 disc decrypts through it |
| `0x0c` replaces `0x05` on 2.1 in the same per-subset shape | **Confirmed. Structure, verified against real discs** |
| MKB Type field to generation (`0x00041003` / `0x48141003` / `0x48151003`) | **Confirmed** against retail discs |
| `IndividualSegment.tbl` format | **Confirmed.** Parses a retail disc |
| 2.1 disc fingerprint: `AACS/` carries `IndividualSegment.tbl` + `SegmentKey00001.tbl` | **Confirmed** on retail 2.1 discs |
| 2.1 variant records `0x0c` / `0x2d` / `0x2f` are exclusive to 2.1 (absent on 2.0) | **Confirmed. Structure, verified across a library of discs** |
| MKB Type value and the variant records always agree (2.1 has both, 2.0 has neither) | **Confirmed. Structure, verified across a library of discs** |
| The wrapped key-group table, indexed by the selector across the selector space | **Confirmed. Structure, verified against real discs** |
| `SegmentKey.tbl` container: file header + one fixed-size record per selector value | **Confirmed** against retail discs |
| Units inside a forensic segment carry CPI `01` (even units) or `10` (odd units), against `11` for ordinary encrypted units | **Confirmed** |
| Normal and forensic units share one decrypt path: the same AES-CBC over the same aligned unit, differing only in the key source (unit key vs segment key) | **Working model.** The geometry and clear seed match; the cipher itself is not confirmed |
| The per-unit content key is deterministic: a fixed function of (disc, unit), reproducible across plays, even though the derivation is obfuscated | **Confirmed** |
| The `SegmentKey` per-device record is a fixed-size structure defined by the format (record size checked against a constant), identical across 2.1 discs | **Confirmed** (container + record size). The record's internal key-set size is inferred (528 = 33 × 16), not parsed |
| The record payload is a small fixed key set, far fewer than the number of segments (the grouping); segment count is a per-disc authoring choice, the per-device key-set size is not | **Confirmed** |
| The key store holds one key per variant for each forensic segment; a device uses the key matching its own variant | **Inferred.** The container geometry is known, but the 528-byte record's internal key layout is not yet reversed |
| The segment map ties each source-packet range to an index tag (1 to 32), not just to a location. There is no explicit group field | **Confirmed** |
| Content-key selection per unit: a normal unit uses the unit key (whole CPS unit), a forensic unit uses the segment key (one segment, the device's variant) | **Working model** |
| Whether the per-segment key set is one unmarked base version plus forensic variants | **Theory.** A plausible reading, not confirmed |
| Variant selection back to a clean single-variant stream | **Confirmed.** Within a segment only every second unit opens under a given index key; a stream built from those units is a clean, single-variant stream, checked on retail 2.1 discs |
| Aligned-unit cipher: block key `AES-128E(Ku, seed) XOR seed`, then AES-128-CBC of bytes 16 to 6143 under `iv0`, one chain per unit | **Confirmed** |
| Media Key arithmetic `AES-128D(Kp, C)` with `uv` XORed into the last 4 bytes, verified by `AES-128D(Km, mk_dv)` against a fixed 8-byte prefix | **Confirmed** |
| `Unit_Key_RO.inf` header, title map and key-storage layout; key `k` is CPS unit `k + 1` | **Confirmed** |
| Content Certificate: type byte, BEE at bit 7 of byte 1, ID at 14 to 19; 2.0 certificate signed P-256 / SHA-256 over bytes `0..26+L+8N` | **Confirmed** |
| Subset-difference applicability test and the AES-G3 descent to the Processing Key | **Confirmed** against retail 1.0 and 2.0 discs |
| 1.0 AKE: certificate layout (92 bytes), message layouts, ECDSA / SHA-1 on the 160-bit curve, bus key from the shared x | **Confirmed** |
| VID read (format `0x80`) with its CMAC, and the data-key read (format `0x84`) | **Confirmed** |
| AACS 2.0 certificate (132 bytes, type `0x11`) offsets, the native P-256 exchange, and the position of the BEC flag in a 2.0 certificate | **Unconfirmed / provisional.** Only emulated drives have exercised them |
| Revoked host certificate refused by the drive with sense ILLEGAL REQUEST, ASC `0x6F`, ASCQ `0x00` | **Unconfirmed.** The modelled shape |
| Bus encryption per 2048-byte sector (bytes 16 to 2047, CBC under the read data key, restarting each sector), gated by the unit's CPI | **Confirmed** |
| HD DVD `VTKF` layout (2480 bytes, 64 entries of 36 bytes) | **Confirmed** |
| Within a forensic segment the two halves are the even units (CPI `01`) and the odd units (CPI `10`); which half a tag's key opens is not in the table | **Confirmed** as the structure |
| Segments cover under 1% of the feature | **Confirmed** |
| HD DVD EVO: per-pack encryption where `PES_scrambling_control` is `01`; bytes 0-127 clear, 128-2047 AES-128-CBC under a key from the title key and the CPI | **Confirmed** (HD DVD book §4.3) |
| 2.x MKBs carry far more subset-difference entries than 1.0 and use the same 32-bit tree with shallower subsets | **Confirmed** |
| Every MKB ends with a `0x02` record followed by zero padding | **Confirmed** |

## References

*Further reading on the topics covered here. These sources discuss related material; they are not cited claim by claim, and not every statement in them is endorsed here.*

### Specifications

- [AACS Common Book, revision 0.953](https://www.aacsla.com/wp-content/uploads/2019/02/AACS_Spec_Common_Final_0953.pdf)
- [AACS Blu-ray Disc Pre-recorded Video Book, revision 0.953](http://aacsla.com/wp-content/uploads/2019/02/AACS_Spec_BD_Prerecorded_Final_0_953.pdf)
- Advanced Access Content System (AACS): HD DVD and DVD Pre-recorded Video Book, Final Revision 0.952 (no longer publicly available)
- [T10 additional sense code list](https://www.t10.org/lists/asc-num.txt)

### Open-source implementations

- libaacs: [mkb.c](https://code.videolan.org/videolan/libaacs/-/blob/master/src/libaacs/mkb.c), [unit_key.c](https://code.videolan.org/videolan/libaacs/-/blob/master/src/libaacs/unit_key.c), [content_cert.c](https://code.videolan.org/videolan/libaacs/-/blob/master/src/libaacs/content_cert.c), [mmc.c](https://code.videolan.org/videolan/libaacs/-/blob/master/src/libaacs/mmc.c), [aacs.c](https://code.videolan.org/videolan/libaacs/-/blob/master/src/libaacs/aacs.c)

### Community references

- [Doom9: AACS 2.1 file analysis](https://forum.doom9.org/showthread.php?p=1859747)
- [Doom9: BackupHDDVD discussion](https://forum.doom9.org/showthread.php?t=119871)
- [MakeMKV forum: FMTS and M2TS](https://forum.makemkv.com/forum/viewtopic.php?t=21014)
