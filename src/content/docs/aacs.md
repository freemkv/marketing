---
title: How AACS Works (1.0 / 2.0 / 2.1)
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
finished specification, and it changes as we learn more. It carries no key material or algorithm
constants, only format and structure. DVDs use CSS, not AACS; see [Decryption Keys](/decryption-keys/).
:::

## One scheme, several versions, several formats

The disc format and the AACS version are independent axes. A format picks which AACS version
it carries. The key hierarchy below is identical regardless of format. What differs is the
version.

| Disc format | AACS version |
|---|---|
| Blu-ray | AACS 1.0 |
| 4K UHD | AACS 2.0 or AACS 2.1 (both are in the field; 2.1 adds the forensic FMTS layer) |
| HD-DVD | AACS, version to be confirmed from our own discs |

4K UHD is not one AACS version. A UHD disc carries either 2.0 or 2.1, and the two are distinct
(see the per-version sections below). HD-DVD also uses AACS. We have not yet confirmed which
version off our own discs, so the exact version is left open here rather than guessed. DVDs are
the odd one out: they use CSS, a different and older scheme, not AACS at all.

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
<text class="lb2" x="356" y="216">on 2.1, via the Media Key Precursor step</text>
<rect class="bx" x="40" y="236" width="300" height="44" rx="8"/>
<text class="ti" x="56" y="258">Media Key (MK)</text>
<text class="su" x="56" y="273">one per disc (per device group on 2.1)</text>
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
- **Media Key (MK).** The PK plus the MKB's media-key data yields the MK. This is where 2.1
  inserts an extra step (see below).
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
  is encrypted. It works the same for M2TS, FMTS, and program-stream EVO, whereas checking
  transport sync bytes does not.

What changes between the three generations is the size of the device tree the MKB walk
covers, whether the drive-to-host link is itself encrypted, and, on 2.1, one extra step
between the PK and the MK plus a second forensic layer below the Unit Keys.

## The MKB and the subset-difference tree

`AACS/MKB_RO.inf` is the Media Key Block. It is a sequence of records. Each record is a
1-byte type, a 3-byte big-endian length that covers the 4-byte header and the body, then the
body. The walk stops at the first `00 000000` end marker. A retail MKB is often allocated to a
fixed region with the records at the front and the rest zero padding.

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
Key wrapped once for each group of still-allowed devices. This mechanism is **confirmed**: it
is implemented and every 2.0 disc decrypts through it.

The record types that matter:

| Type | Name | Notes |
|---|---|---|
| `0x10` | Type and Version | first record. Carries the 32-bit MKB Type field at body offset 0 |
| `0x02` | Host Revocation List | |
| `0x04` | Subset-Difference index | a compact fixed-width index of the subsets the walk uses |
| `0x05` | Media Key Data | the encrypted Media Key, one value per subset. 1:1 with `0x04` |
| `0x07` | Explicit Subset-Difference | a smaller structure, not the main cvalue table |
| `0x81` | Verify Media Key | AACS 1.0. Authenticates the derived key |
| `0x86` | Verify Media Key | AACS 2.x |
| `0x0c` | Variant cvalues | 2.1 only. Replaces `0x05`, same per-subset shape; value is a Precursor |
| `0x2d` | Encrypted Media Key Variant Data | 2.1 only. Per-disc variant seed |
| `0x2f` | Variant Key Data table | 2.1 only. Large variant key pool indexed by the selector |

On a 2.0 UHD MKB the `0x05` cvalue table is large. It carries one cvalue per subset-difference
entry, so it grows with the tree, 1:1 with the `0x04` index. (On 2.1 this per-subset table is
`0x0c` rather than `0x05`, as the 2.1 section explains.) The `0x07` record is a much smaller
table and is not the main cvalue set. This distinction matters in practice: reading cvalues
from `0x07` instead of `0x05` under-covers the tree and the walk fails to find the matching
subset.

### Detecting the generation

The `0x10` Type-and-Version record carries a 32-bit MKB Type field at body offset 0. Only the
first few bytes of the MKB are needed to classify a disc.

| MKB Type field | Generation | Disc format |
|---|---|---|
| `0x00041003` | AACS 1.0 (Blu-ray pre-recorded) | Blu-ray |
| `0x48141003` | AACS 2.0 (UHD Category C) | 4K UHD |
| `0x48151003` | AACS 2.1 (UHD Category C, variant) | 4K UHD (FMTS) |

**Confirmed** against retail discs. One nuance: a 2.1 disc carries a content certificate that
still reads as 2.0. The `0x48151003` MKB Type field is the reliable signal, additionally
confirmed by finding the `0x2d` / `0x2f` variant records during the walk. These
two signals have been checked across a library of discs and always agree: the 2.1 type value
coincides with the variant records, the 2.0 type value never does.

## What each generation adds

The rest of this page is the delta per generation. Read it in order. Each section assumes the
ladder above and describes only what is new.

### AACS 1.0, Blu-ray: the plain chain

The ladder with nothing extra. Walk the tree to the Processing Key, read the Media Key,
verify it against the `0x81` record, derive the VUK, decrypt the Unit Keys, decrypt the
content. `Unit_Key_RO.inf` uses a 48-byte per-key stride. There is no bus encryption, so the
drive hands back ciphertext straight from the disc.

The 1.0 subset-difference tree addresses a smaller device space than 2.0's. Its MKB is
smaller and the walk covers fewer subsets. In practice that means less revocation headroom:
the system can single out fewer individual devices before it runs out of tree.

### AACS 2.0, 4K UHD: bigger tree, encrypted bus

The same ladder over a much larger tree, with bus encryption added.

**A larger tree.** 2.0's device tree is far bigger than 1.0's, so its MKB is far larger and
can address and revoke many more individual devices. A single compromised UHD player can be
revoked without collateral damage to unrelated models. The MKB size follows the tree: a bigger
device space means more subset-difference entries and a correspondingly larger `MKB_RO.inf`,
which is why UHD MKBs are far larger than Blu-ray ones. The two trees
below are illustrative, not to scale, but they make the point: 2.0 reaches more leaves and
goes deeper, so revoking one device costs less of the tree.

<figure>
<svg viewBox="0 0 980 444" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="A small AACS 1.0 subset-difference tree next to a much larger AACS 2.0 tree. Green leaves reach the Processing Key. Red leaves are revoked. The 2.0 tree has more leaves and is deeper.">
<style>.tl{fill:currentColor;font:600 13px system-ui,sans-serif}.cap{fill:currentColor;font:12px system-ui,sans-serif;opacity:.75}.ed{stroke:currentColor;stroke-width:1.2;opacity:.5;fill:none}</style>
<line class="ed" x1="180.0" y1="46.0" x2="111.4" y2="108.0"/>
<line class="ed" x1="180.0" y1="46.0" x2="248.6" y2="108.0"/>
<line class="ed" x1="111.4" y1="108.0" x2="77.1" y2="170.0"/>
<line class="ed" x1="111.4" y1="108.0" x2="145.7" y2="170.0"/>
<line class="ed" x1="248.6" y1="108.0" x2="214.3" y2="170.0"/>
<line class="ed" x1="248.6" y1="108.0" x2="282.9" y2="170.0"/>
<line class="ed" x1="77.1" y1="170.0" x2="60.0" y2="232.0"/>
<line class="ed" x1="77.1" y1="170.0" x2="94.3" y2="232.0"/>
<line class="ed" x1="145.7" y1="170.0" x2="128.6" y2="232.0"/>
<line class="ed" x1="145.7" y1="170.0" x2="162.9" y2="232.0"/>
<line class="ed" x1="214.3" y1="170.0" x2="197.1" y2="232.0"/>
<line class="ed" x1="214.3" y1="170.0" x2="231.4" y2="232.0"/>
<line class="ed" x1="282.9" y1="170.0" x2="265.7" y2="232.0"/>
<line class="ed" x1="282.9" y1="170.0" x2="300.0" y2="232.0"/>
<circle cx="180.0" cy="46.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="111.4" cy="108.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="248.6" cy="108.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="77.1" cy="170.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="145.7" cy="170.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="214.3" cy="170.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="282.9" cy="170.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="60.0" cy="232.0" r="6" fill="#3ba55d"/>
<circle cx="94.3" cy="232.0" r="6" fill="#3ba55d"/>
<circle cx="128.6" cy="232.0" r="6" fill="#3ba55d"/>
<circle cx="162.9" cy="232.0" r="6" fill="#3ba55d"/>
<circle cx="197.1" cy="232.0" r="6" fill="#3ba55d"/>
<circle cx="231.4" cy="232.0" r="6.5" fill="#e5484d"/>
<line x1="228.4" y1="229.0" x2="234.4" y2="235.0" stroke="#fff" stroke-width="1.4"/>
<line x1="234.4" y1="229.0" x2="228.4" y2="235.0" stroke="#fff" stroke-width="1.4"/>
<circle cx="265.7" cy="232.0" r="6" fill="#3ba55d"/>
<circle cx="300.0" cy="232.0" r="6" fill="#3ba55d"/>
<text class="tl" x="180.0" y="26" text-anchor="middle">AACS 1.0 device tree</text>
<line class="ed" x1="680.0" y1="46.0" x2="546.7" y2="108.0"/>
<line class="ed" x1="680.0" y1="46.0" x2="813.3" y2="108.0"/>
<line class="ed" x1="546.7" y1="108.0" x2="480.0" y2="170.0"/>
<line class="ed" x1="546.7" y1="108.0" x2="613.3" y2="170.0"/>
<line class="ed" x1="813.3" y1="108.0" x2="746.7" y2="170.0"/>
<line class="ed" x1="813.3" y1="108.0" x2="880.0" y2="170.0"/>
<line class="ed" x1="480.0" y1="170.0" x2="446.7" y2="232.0"/>
<line class="ed" x1="480.0" y1="170.0" x2="513.3" y2="232.0"/>
<line class="ed" x1="613.3" y1="170.0" x2="580.0" y2="232.0"/>
<line class="ed" x1="613.3" y1="170.0" x2="646.7" y2="232.0"/>
<line class="ed" x1="746.7" y1="170.0" x2="713.3" y2="232.0"/>
<line class="ed" x1="746.7" y1="170.0" x2="780.0" y2="232.0"/>
<line class="ed" x1="880.0" y1="170.0" x2="846.7" y2="232.0"/>
<line class="ed" x1="880.0" y1="170.0" x2="913.3" y2="232.0"/>
<line class="ed" x1="446.7" y1="232.0" x2="430.0" y2="294.0"/>
<line class="ed" x1="446.7" y1="232.0" x2="463.3" y2="294.0"/>
<line class="ed" x1="513.3" y1="232.0" x2="496.7" y2="294.0"/>
<line class="ed" x1="513.3" y1="232.0" x2="530.0" y2="294.0"/>
<line class="ed" x1="580.0" y1="232.0" x2="563.3" y2="294.0"/>
<line class="ed" x1="580.0" y1="232.0" x2="596.7" y2="294.0"/>
<line class="ed" x1="646.7" y1="232.0" x2="630.0" y2="294.0"/>
<line class="ed" x1="646.7" y1="232.0" x2="663.3" y2="294.0"/>
<line class="ed" x1="713.3" y1="232.0" x2="696.7" y2="294.0"/>
<line class="ed" x1="713.3" y1="232.0" x2="730.0" y2="294.0"/>
<line class="ed" x1="780.0" y1="232.0" x2="763.3" y2="294.0"/>
<line class="ed" x1="780.0" y1="232.0" x2="796.7" y2="294.0"/>
<line class="ed" x1="846.7" y1="232.0" x2="830.0" y2="294.0"/>
<line class="ed" x1="846.7" y1="232.0" x2="863.3" y2="294.0"/>
<line class="ed" x1="913.3" y1="232.0" x2="896.7" y2="294.0"/>
<line class="ed" x1="913.3" y1="232.0" x2="930.0" y2="294.0"/>
<circle cx="680.0" cy="46.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="546.7" cy="108.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="813.3" cy="108.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="480.0" cy="170.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="613.3" cy="170.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="746.7" cy="170.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="880.0" cy="170.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="446.7" cy="232.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="513.3" cy="232.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="580.0" cy="232.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="646.7" cy="232.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="713.3" cy="232.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="780.0" cy="232.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="846.7" cy="232.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="913.3" cy="232.0" r="4" fill="currentColor" opacity="0.6"/>
<circle cx="430.0" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="463.3" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="496.7" cy="294.0" r="6.5" fill="#e5484d"/>
<line x1="493.7" y1="291.0" x2="499.7" y2="297.0" stroke="#fff" stroke-width="1.4"/>
<line x1="499.7" y1="291.0" x2="493.7" y2="297.0" stroke="#fff" stroke-width="1.4"/>
<circle cx="530.0" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="563.3" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="596.7" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="630.0" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="663.3" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="696.7" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="730.0" cy="294.0" r="6.5" fill="#e5484d"/>
<line x1="727.0" y1="291.0" x2="733.0" y2="297.0" stroke="#fff" stroke-width="1.4"/>
<line x1="733.0" y1="291.0" x2="727.0" y2="297.0" stroke="#fff" stroke-width="1.4"/>
<circle cx="763.3" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="796.7" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="830.0" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="863.3" cy="294.0" r="6.5" fill="#e5484d"/>
<line x1="860.3" y1="291.0" x2="866.3" y2="297.0" stroke="#fff" stroke-width="1.4"/>
<line x1="866.3" y1="291.0" x2="860.3" y2="297.0" stroke="#fff" stroke-width="1.4"/>
<circle cx="896.7" cy="294.0" r="6" fill="#3ba55d"/>
<circle cx="930.0" cy="294.0" r="6" fill="#3ba55d"/>
<text class="tl" x="680.0" y="26" text-anchor="middle">AACS 2.0 / 2.1 device tree</text>
<text class="cap" x="180" y="360" text-anchor="middle">fewer leaves, less revocation headroom</text>
<text class="cap" x="680" y="360" text-anchor="middle">more leaves, deeper: revoke individual devices cheaply</text>
<circle cx="150" cy="424" r="6" fill="#3ba55d"/><text class="cap" x="164" y="428">reaches the Processing Key</text>
<circle cx="470" cy="424" r="6.5" fill="#e5484d"/><text class="cap" x="484" y="428">revoked (excluded by construction)</text>
</svg>
</figure>

**Bus encryption.** The drive re-encrypts read data on the drive-to-host link. That layer has
to be removed before you can even read ciphertext off the disc. It comes off one of two ways:
a firmware-unlocked drive that strips it in place, or the AACS host-certificate handshake. See
[Unlocked drives](/drives-unlocked/).

Everything from the Media Key down (VUK, Unit Keys, aligned units) is unchanged from 1.0.
`Unit_Key_RO.inf` moves to a 64-byte stride, and the Verify record is `0x86` instead of
`0x81`.

### AACS 2.1: the Media Key Precursor

2.1 is where the public record runs out. It keeps the whole ladder but inserts one step
between the Processing Key and the Media Key, and it adds a second forensic layer below the
Unit Keys (the FMTS variant segments, covered next).

On 1.0 and 2.0 the walk yields the Media Key directly, and that step is identical between the
two. On 2.1 the same walk yields a **Media Key Precursor** instead: the device opens its subset's
`0x0c` value with its Processing Key and folds in its media-key-**variant number**. The precursor
is then corrected into the real Media Key using the disc's **Variant Key Data** (the `0x2f`
table, picked by the selector) and a fixed algorithm constant, the **Key Correction Data (KCD)**.
Even the *base*, non-variant 2.1 Media Key goes through this insert. The `0x86` Verify record
still gates the *final* Media Key, so a wrong derivation fails cleanly rather than emitting a bad
key.

This is the only place 2.1 differs. Below the Media Key the ladder is **identical across all
three generations** — Media Key → VUK → Unit Key → block key → content — down to just cosmetic
differences (the `Unit_Key_RO.inf` stride, 48 on 1.0 versus 64 on 2.x, and the verify record,
`0x81` versus `0x86`). 1.0 and 2.0 even share the Processing-Key-to-Media-Key step; 2.1 inserts
exactly **one rung**, the precursor plus KCD, between the Processing Key and the Media Key.

#### What 2.1 adds, concretely

Two kinds of addition distinguish a 2.1 disc from a 2.0 disc: extra files in the `AACS/`
directory, and extra records inside `MKB_RO.inf`. Both have been confirmed against retail 2.1
discs.

On-disc `AACS/` files that exist **only** on 2.1. Their mere presence is the fingerprint of a
2.1 disc:

- **`IndividualSegment.tbl`**, the forensic segment map (where the variant segments live).
  Confirmed format, covered in the FMTS section below.
- **`SegmentKey00001.tbl`**, the per-segment variant keys. There is one `SegmentKey` file per
  CPS unit, numbered. Its container structure and internal record layout are confirmed (see the
  FMTS section); only the cryptographic step that turns the stored key material into a usable key
  remains open.

Inside `MKB_RO.inf`, the change from 2.0 to 2.1 is best read at the record level, against the
`0x05` Media Key Data record described above.

- **`0x0c` replaces `0x05`.** On 2.0, `0x05` holds one value per subset and the device decrypts
  its subset's value to get the Media Key directly. On 2.1, `0x05` is gone and `0x0c` sits in
  its place with the *same shape*: one value per subset of the tree, measured 1:1 against the
  subset index. The difference is what the decrypted value is. On 2.1 it is a Media Key
  *Precursor*, not the final Media Key. The disappearance of `0x05` and the appearance of `0x0c`
  in the same per-subset shape is **confirmed structure**. That the value is a precursor is the
  **theory** (the variant chain).
- **`0x2f` is new: the variant key pool.** A large per-variant key table indexed by the
  selector. Its entry count is nearly the selector space, one entry short of the full space,
  which is a property of the selector rather than a per-disc number. This is the pool the
  selector indexes into during the Media Key derivation.
- **`0x2d` is new: per-disc variant seed.** A smaller, structured record: the per-disc seed data
  that feeds the derivation. It is the least understood of the three. Call it structured per-disc
  seed data.

| Version | MKB records for the Media Key |
|---|---|
| 2.0 | `0x05` = Media Key, one encrypted value per subset |
| 2.1 | `0x0c` = Precursor, one value per subset (replaces `0x05`); `0x2f` = large variant key pool indexed by the selector; `0x2d` = per-disc variant seed |

The revocation tree these ride on is unchanged in kind from 2.0: the `0x04` Subset-Difference
record plus the `0x05` / `0x07` cvalue records. The verify record is `0x86`, as on all AACS 2.x.

These records are **exclusive to 2.1**, and that is now confirmed by measurement across a
library of discs, not inferred from one. Every 2.0 disc checked lacks all three records. Only
2.1 discs carry them. And the two signals never disagree: the 2.1 MKB Type field
(`0x48151003`) always coincides with the presence of the variant records, and the 2.0 type
value never does. So detecting a 2.1 disc by its type field and detecting it by these records
give the same answer every time.

Draw the line carefully here, because it is the crux of what is and is not known about 2.1.
The **structure** is confirmed: which records exist, that they are 2.1-only, their internal
shape, and the wrapped key-group table indexed by the selector. All of that is verified against
real discs. What is still theory is the **derivation**: what those records do cryptographically,
how a device's keys pick and unwrap its key group to reach the Media Key. That is the
Media Key Precursor model, and it has not been run end to end. The block is a
test key database holding only per-disc VUKs, not device or processing keys, so there is no
covering Processing Key to feed the chain and check against the `0x86` verify. Structure proven,
derivation not yet executed.

<figure>
<svg viewBox="0 0 860 220" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="The AACS 2.1 Media Key Precursor step. The MKB walk yields a Media Key Precursor. Combining it with Variant Key Data and the Key Correction Data constant yields the Media Key, which the 0x86 Verify record checks.">
<defs>
<marker id="ah2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="currentColor"/>
</marker>
</defs>
<style>
.b2{fill:none;stroke:currentColor;stroke-width:1.4}
.t2{fill:currentColor;font:600 13.5px system-ui,sans-serif}
.a2{stroke:currentColor;stroke-width:1.4}
.l2{fill:currentColor;font:12px system-ui,sans-serif;opacity:.85}
.n2{fill:currentColor;font:11.5px system-ui,sans-serif;opacity:.6}
</style>
<rect class="b2" x="20" y="70" width="150" height="46" rx="8"/>
<text class="t2" x="95" y="90" text-anchor="middle">Processing Key</text>
<text class="n2" x="95" y="106" text-anchor="middle">from the MKB walk</text>
<line class="a2" x1="170" y1="93" x2="338" y2="93" marker-end="url(#ah2)"/>
<text class="l2" x="254" y="84" text-anchor="middle">walk</text>
<rect class="b2" x="340" y="70" width="176" height="46" rx="8"/>
<text class="t2" x="428" y="90" text-anchor="middle">Media Key Precursor</text>
<text class="n2" x="428" y="106" text-anchor="middle">2.1 only</text>
<line class="a2" x1="516" y1="93" x2="686" y2="93" marker-end="url(#ah2)"/>
<text class="l2" x="601" y="72" text-anchor="middle">+ Variant Key Data</text>
<text class="l2" x="601" y="86" text-anchor="middle">+ KCD constant</text>
<rect class="b2" x="688" y="70" width="150" height="46" rx="8"/>
<text class="t2" x="763" y="90" text-anchor="middle">Media Key</text>
<text class="n2" x="763" y="106" text-anchor="middle">verified by 0x86</text>
<path class="a2" d="M95 70 C95 30 428 30 428 24" fill="none" stroke-dasharray="4 4" marker-end="url(#ah2)"/>
<text class="n2" x="260" y="20" text-anchor="middle">on 1.0 / 2.0 the walk yields the Media Key directly (no Precursor)</text>
<line class="a2" x1="763" y1="116" x2="763" y2="150" marker-end="url(#ah2)"/>
<text class="n2" x="763" y="170" text-anchor="middle">wrong derivation fails the verify,</text>
<text class="n2" x="763" y="184" text-anchor="middle">never emits a bad key</text>
</svg>
</figure>

The point of the Precursor step is that different device groups arrive at *different* Media
Keys for the same disc. That is the first of 2.1's two traitor-tracing layers: the key you can
derive already narrows down which player group you belong to.

:::note[Working model]
The model of the Precursor-to-Media-Key step is pinned against real variant MKBs. It has not
yet been run end to end, for lack of a covering 2.1 Processing Key to test against the `0x86`
verify. The record and field *sizing* is fixed against a retail 2.1 `MKB_RO.inf`: the
`0x0c` variant cvalues are 1:1 with the subset-difference slots, the `0x2f` Variant Key Data
table is a fixed-size 16-byte-entry table, and the `0x2d` record carries a per-slot table plus
a trailing per-disc nonce. What is still unconfirmed is the exact per-slot selection inside
`0x2d`, whether the nonce sits at the head or the tail, and one field width. Because the final
`0x86` verify gates the result, a wrong pick can only produce an error, never a silently bad
key. The KCD constant itself is not published here.
:::

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
(Layer 2, in the content). They are not two separate secrets: both descend from the same Media
Key Precursor, and they meet at the 16-bit selector.
:::

Two files in `AACS/` describe the segments, and only 2.1 discs have them.

- **`IndividualSegment.tbl`**, the segment map. **Confirmed** format, parsed against a retail disc: an
  8-byte header (`type`, a segment `count`, `record_size`), then that many fixed-size records,
  each `{marker, segment_number, flag, start_spn, end_spn}`. The offsets are source-packet
  numbers, so a byte offset is `spn * 192`. The number of segments is not fixed by the scheme.
  It is an authoring choice: more segments means finer-grained tracing. The segments are spread
  across the whole feature rather than clustered.
- **`SegmentKey00001.tbl`**, the per-segment variant keys. One per CPS unit, numbered. The
  container structure is **partly confirmed**: a small file header followed by a fixed-size
  record for every possible device path, one record for every value of the selector across the
  full selector space. The header ends in the record size and carries the selector-space field.
  Each record opens with an identical sub-header, then a fixed-size payload of high-entropy
  (encrypted) key material. That payload holds a **small fixed set of key values, far fewer than
  the number of segments** in the feature. The record is a fixed-size structure defined by the
  format, not a per-disc quantity: a decoder validates the table by checking its record size
  against a constant, so the layout, and with it the size of the small key set each record
  carries, is the same on every 2.1 disc. That is the confirmed, structural half of the grouping
  model in [Where the sizes come from](#where-the-sizes-come-from): a device carries a handful of
  variant keys, not one per segment. How that key material maps onto the segments is now
  confirmed too: within the store each forensic segment has its own set of keys, one key for each
  variant that segment is authored in, and a device uses the single key that matches its own
  variant. What is still open is the cryptographic step that turns the Media Key Precursor and
  this stored key material into a usable per-variant key.

How a decoder *finds* the segments is worth stating, because it is not from the stream. A
forensic unit carries the **same encryption signature** as any ordinary encrypted unit: the
same CPI bits set, the same scrambled transport syncs. Inspecting the bitstream cannot tell a
forensic unit apart from a normal one. The only locator is `IndividualSegment.tbl`. The decoder
maps a unit's byte offset against the segment ranges to decide whether that unit takes the
ordinary Unit Key or a segment key. This is **confirmed by measurement**: units inside the
segments are indistinguishable, by CPI and by sync state, from the encrypted content around
them, so the map is not an optimization, it is the only way to route a unit correctly. The map
carries more than positions. Each entry names a range of units, the segment group that range
belongs to, and which variant that range is. So the interleaved variants are not merely present
in the stream; the map spells out, range by range, which group and which variant each one holds,
which is exactly what a decoder needs to select the right key for a given unit.

What the disc tells us: each segment's variants are encrypted under **segment keys**, not the
Unit Key. A player derives the key for exactly one variant per segment, and which variant it
can decrypt is a fingerprint of that player. That is the second traitor-tracing layer, and it
is the actual forensic watermark. A leaked rip carries, in which variants it contains, the
identity of the machine that made it.

Those two routes are one decrypt path underneath. Whether a unit takes the ordinary Unit Key or
a segment key, the decoder ends up holding a single per-unit content key and runs the same
AES-CBC over the same 6144-byte aligned unit it runs on any encrypted unit. The paths differ in
exactly one place: where that per-unit key comes from, the ordinary unit-key derivation or a
segment-key derivation. The cipher does not change, the unit geometry does not change, and the
choice between the two is made per unit by the segment map rather than by anything in the
stream. The forensic path is not a second decryptor sitting below the Unit Keys. It is the
ordinary decrypt with the key substituted for the units the map flags. The two key sources also
differ in reach: the unit key covers a whole CPS content unit, while a segment key covers only
its one forensic segment, and only for the device's variant. The map decides, per unit, which of
the two applies.

The per-unit content key is also deterministic. A compliant player derives it through an
obfuscated computation, so the intermediate value it carries is randomized per session and
differs from one play of the disc to the next. The key that derivation finally produces does
not. For a fixed disc and a fixed unit the AES key is fixed, the same on every play, because
the ciphertext on the disc is fixed and AES is deterministic. The obfuscation conceals how the
key is reached, not the key itself.

### Why the forensic layer exists

The purpose of the segments is to watermark the leaker into the decoded *video*, not into the
keys. The bulk of the movie decrypts with the ordinary Unit Key and is identical on every
copy of the title. The forensic segments are the exception: each needs a variant segment key,
and any given licensed device can decrypt only one variant per segment. Which one is fixed by
that device's place in the key tree, through the per-variant derivation below.

So every licensed device produces a subtly different decoded video. The movie is the same, but
the specific variant chosen at each segment differs from device to device. That per-segment
choice pattern is a fingerprint, like a barcode running the length of the film. One segment
narrows the source. All the segments together pin the device group.

That is the reason the design exists. The identity is carried in the decoded frames
themselves, so a leaked rip is self-incriminating. AACS can read the variant pattern out of a
leaked file, map it back to the device group that must have produced it, and revoke that
group in future MKBs, with the leaked video as the proof. It shifts enforcement from chasing
leaked keys around the internet to reading the source device straight off the leaked frames.
To be precise about the mechanism: nothing embeds a key or an ID into the picture. The frames
reveal a device-determined *selection* pattern, one choice per segment, and that pattern is
what identifies the source.

### How the two forensic layers connect

The two layers are joined at the **Media Key Precursor**. The same Kmp the MKB walk yields for
standard content is also the input to the variant branch: run through the 2.1 variant algorithm
(the `0x2f` variant key data and the `0x2d` seed), it produces a **per-variant Media Key**. That
per-variant Media Key is the shared root of both forensic layers. In Layer 1 it is the variant
media key the MKB's 2.1-only variant records describe; in Layer 2 it cascades to a per-variant
VUK and the per-segment keys in the content. One Precursor, one per-variant chain, driving both —
there is no separate second secret and no separate block to walk.

Which variant a device lands on follows from its place in the subset-difference tree: its subset
gives its Processing Key, its Processing Key gives its Kmp, and the variant branch off that Kmp
is what fingerprints it. What is not yet demonstrated end to end is the crypto: with no covering
Processing Key in hand, the exact algorithm from Kmp to the per-variant Media Key — and from the
selected `SegmentKey00001.tbl` material to a working per-segment key — is still a working model.

### Where the sizes come from

The interesting property of this scheme is that a device holds only a **small, fixed set of
variant keys**, yet that small set covers **all** the segments in a feature, and the on-disc
key store is nonetheless enormous. Both facts follow from the same design, without needing any
specific disc's numbers.

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

### The decode requirement, and why this layer has teeth

The two layers demand different keys, and that difference is the design's teeth.

Standard content needs only the **Unit Key**. A Unit Key can come from a Volume Unique Key,
which is what a key database supplies. No device keys are involved. That is why the bulk of a
2.1 movie decodes with only a VUK: it is enough for everything outside the forensic segments.

The forensic segments need the **Media Key Precursor**. The per-variant keys branch off Kmp —
run through the 2.1 variant algorithm — and reaching Kmp needs the **Processing Key** from the
ordinary MKB walk, an AACS-issued player credential. A leaked VUK or Unit Key sits below the
Media Key; it never reaches the Precursor, so it never reaches the variant branch.

Two consequences follow, and they are the whole point of the design. First, the forensic layer
cannot be bypassed with leaked disc keys alone. You need a real player's device keys, meaning an
actual player. Second, if you do rip with a real player's keys, the output carries that player's
selection pattern, so the act of defeating the forensic layer is also the act of signing your
name to the leak. Leaking disc keys does not defeat it. Leaking a player self-incriminates.

This is also exactly why an end-to-end 2.1 decode is blocked with disc keys alone. A key
database of VUKs, with no covering Processing Key, decodes the bulk of the movie but cannot run
the Precursor's variant branch to the per-variant Media Key that unlocks the segments. The wall
is not a missing algorithm, it is a missing class of key.

### How a segment key is derived

Putting the whole chain in one place. This is the working-model answer to "how do you get a
segment key," and it is one ladder, not two. The forensic keys branch off the **Media Key
Precursor** — the same Kmp the MKB walk already produces for standard content.

<figure>
<svg viewBox="0 0 720 620" role="img" xmlns="http://www.w3.org/2000/svg" aria-label="One key ladder with a branch. Device Keys walk the MKB to the Processing Key and then the Media Key Precursor. The Precursor branches two ways. The standard branch goes Media Key, Volume Unique Key, Unit Key, ordinary content. The variant branch runs the Precursor through the 2.1 variant algorithm using the 0x2f variant key data and 0x2d seed to a per-variant Media Key, then a per-variant Volume Unique Key, a per-variant Unit Key, and decrypts the forensic segment with the same cipher as ordinary content. A VUK sits below the Media Key and reaches neither the Precursor nor the variant branch.">
<defs>
<marker id="ah3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0 0 L10 5 L0 10 z" fill="currentColor"/>
</marker>
</defs>
<style>
.sbx{fill:none;stroke:currentColor;stroke-width:1.4}
.sti{fill:currentColor;font:600 13.5px system-ui,sans-serif}
.ssu{fill:currentColor;font:11px system-ui,sans-serif;opacity:.7}
.sar{stroke:currentColor;stroke-width:1.4}
.slb2{fill:currentColor;font:11px system-ui,sans-serif;opacity:.62}
</style>
<rect class="sbx" x="210" y="16" width="300" height="44" rx="8"/>
<text class="sti" x="360" y="35" text-anchor="middle">Device Keys</text>
<text class="ssu" x="360" y="50" text-anchor="middle">issued to a licensed player</text>
<line class="sar" x1="360" y1="60" x2="360" y2="96" marker-end="url(#ah3)"/>
<text class="slb2" x="370" y="82">walk the MKB</text>
<rect class="sbx" x="210" y="100" width="300" height="44" rx="8"/>
<text class="sti" x="360" y="127" text-anchor="middle">Processing Key</text>
<line class="sar" x1="360" y1="144" x2="360" y2="180" marker-end="url(#ah3)"/>
<text class="slb2" x="370" y="166">read out the Precursor</text>
<rect class="sbx" x="210" y="184" width="300" height="44" rx="8"/>
<text class="sti" x="360" y="203" text-anchor="middle">Media Key Precursor (Kmp)</text>
<text class="ssu" x="360" y="218" text-anchor="middle">2.1 only — the branch point</text>
<line class="sar" x1="330" y1="228" x2="205" y2="286" marker-end="url(#ah3)"/>
<text class="slb2" x="150" y="262" text-anchor="middle">standard</text>
<line class="sar" x1="390" y1="228" x2="515" y2="286" marker-end="url(#ah3)"/>
<text class="slb2" x="600" y="256" text-anchor="middle">variant branch: fold in the variant no.,</text>
<text class="slb2" x="600" y="270" text-anchor="middle">via 0x2f (VKD) + KCD</text>
<rect class="sbx" x="50" y="290" width="250" height="44" rx="8"/>
<text class="sti" x="175" y="317" text-anchor="middle">Media Key</text>
<rect class="sbx" x="420" y="290" width="250" height="44" rx="8"/>
<text class="sti" x="545" y="317" text-anchor="middle">per-variant Media Key</text>
<line class="sar" x1="175" y1="334" x2="175" y2="368" marker-end="url(#ah3)"/>
<line class="sar" x1="545" y1="334" x2="545" y2="368" marker-end="url(#ah3)"/>
<rect class="sbx" x="50" y="372" width="250" height="44" rx="8"/>
<text class="sti" x="175" y="399" text-anchor="middle">Volume Unique Key</text>
<rect class="sbx" x="420" y="372" width="250" height="44" rx="8"/>
<text class="sti" x="545" y="399" text-anchor="middle">per-variant VUK</text>
<line class="sar" x1="175" y1="416" x2="175" y2="450" marker-end="url(#ah3)"/>
<line class="sar" x1="545" y1="416" x2="545" y2="450" marker-end="url(#ah3)"/>
<rect class="sbx" x="50" y="454" width="250" height="44" rx="8"/>
<text class="sti" x="175" y="481" text-anchor="middle">Unit Key</text>
<rect class="sbx" x="420" y="454" width="250" height="44" rx="8"/>
<text class="sti" x="545" y="481" text-anchor="middle">per-variant Unit Key</text>
<line class="sar" x1="175" y1="498" x2="175" y2="532" marker-end="url(#ah3)"/>
<line class="sar" x1="545" y1="498" x2="545" y2="532" marker-end="url(#ah3)"/>
<rect class="sbx" x="50" y="536" width="250" height="48" rx="8"/>
<text class="sti" x="175" y="558" text-anchor="middle">Ordinary content</text>
<text class="ssu" x="175" y="573" text-anchor="middle">a VUK is enough to reach here</text>
<rect class="sbx" x="420" y="536" width="250" height="48" rx="8"/>
<text class="sti" x="545" y="558" text-anchor="middle">Decrypt the forensic segment</text>
<text class="ssu" x="545" y="573" text-anchor="middle">same AES-CBC over the aligned unit</text>
</svg>
<figcaption><em>The working model. One ladder: Device Keys walk the MKB to the Processing Key and
the Media Key Precursor. Standard content descends the ordinary Media Key → VUK → Unit Key. The
forensic segments branch off the same Precursor — through the 2.1 variant algorithm — into a
per-variant Media Key → per-variant VUK → per-variant Unit Key. A VUK sits below the Media Key,
so it reaches neither the Precursor nor the variant branch. The exact Precursor-to-variant step
has not been run end to end.</em></figcaption>
</figure>

The pivot to notice is that there is **one player secret, not two**: the Device Keys. The
forensic system does not add a second key set — it adds a branch off the Media Key Precursor. The
ordinary walk takes DK → PK → Kmp and, for standard content, Kmp → Media Key → VUK → Unit Key.
The variant branch takes the same Kmp and runs it through the 2.1 variant algorithm (the `0x2f`
variant key data and `0x2d` seed) to a **per-variant Media Key**, then a per-variant VUK and a
per-variant Unit Key. Because a device's Kmp depends on its place in the subset-difference tree,
different devices arrive at different variants — which is exactly what fingerprints them. That
chain settles who can and cannot reach a segment key:

- A **licensed player** holds the Device Keys, so it walks to its Kmp and takes the variant
  branch to its own per-variant keys, one variant per segment, which is exactly what
  fingerprints it.
- Someone holding a player's **extracted Device Keys** can do the same, and their rip is
  fingerprinted too.
- A ripper holding only a **VUK or Unit Key** cannot, because a VUK sits below the Media Key —
  it never reaches the Precursor, so it never reaches the variant branch. It decrypts the
  standard content and stops there.

There is no disc-key shortcut. The route runs through the Processing Key and the Media Key
Precursor, a player-issued credential, before the variant branch can yield a per-variant Media
Key and, from it, a segment key. Every 2.1 rip that clears the forensic layer walks that path,
and walking it is what stamps the player's identity into the result.

This is also why a straight rip is not enough on 2.1. The ordinary keys yield a decoded
stream, but decrypting a variant segment with the ordinary Unit Key produces garbage. On a
real 2.1 disc that shows up as HEVC reference-frame errors
(`Could not find ref with POC ...`) exactly at the segment offsets. Handling FMTS correctly
means decrypting each segment with its segment key and splicing one coherent variant back into
a clean single-variant stream.

The internal layout is now settled: the key store holds one key per variant for each forensic
segment, and the segment map ties every unit range to its group and its variant, so the routing
from a unit to the right key is confirmed. The open questions:

1. The exact algorithm from the Media Key Precursor to the per-variant Media Key, and from the
   selected `SegmentKey00001.tbl` material to a working per-segment key. The layout is known;
   the cryptographic step is not.
2. Whether the per-segment key set is one unmarked base version plus a fixed number of forensic
   variants. A plausible reading, not a confirmed fact.
3. How a decoder picks one coherent variant per segment and writes it back to a clean,
   single-variant stream.

## Confirmed versus theorized

| Element | Status |
|---|---|
| Key hierarchy (DK, PK, MK, VUK, UK) for 1.0 and 2.0 | **Confirmed.** Rips work end to end |
| Standard 2.1 content: decodes with a Unit Key (from a VUK, no device keys) | **Confirmed.** Works today, bulk of the movie |
| Forensic 2.1 segments: the per-variant keys branch off the Media Key Precursor (needs the Processing Key), which a VUK never reaches | **Confirmed** as the requirement. The wall: a keydb of VUKs stops at the Media Key |
| CPI (byte 0) encrypted-unit test | **Confirmed** |
| `Unit_Key_RO.inf` stride: 48 (1.0), 64 (2.x) | **Confirmed** |
| MKB record framing and record types `0x04` / `0x05` / `0x81` / `0x86` | **Confirmed** |
| `0x05` Media Key Data: the Media Key wrapped once per subset, opened by that subset's PK | **Confirmed.** Implemented; every 2.0 disc decrypts through it |
| `0x0c` replaces `0x05` on 2.1 in the same per-subset shape | **Confirmed. Structure, verified against real discs** |
| That the `0x0c` value is a Media Key Precursor (not the final Media Key) | **Theory. Derivation under investigation** |
| MKB Type field to generation (`0x00041003` / `0x48141003` / `0x48151003`) | **Confirmed** against retail discs |
| `IndividualSegment.tbl` format | **Confirmed.** Parses a retail disc |
| 2.1 disc fingerprint: `AACS/` carries `IndividualSegment.tbl` + `SegmentKey00001.tbl` | **Confirmed** on retail 2.1 discs |
| 2.1 variant records `0x0c` / `0x2d` / `0x2f` are exclusive to 2.1 (absent on 2.0) | **Confirmed. Structure, verified across a library of discs** |
| MKB Type value and the variant records always agree (2.1 has both, 2.0 has neither) | **Confirmed. Structure, verified across a library of discs** |
| The wrapped key-group table, indexed by the selector across the selector space | **Confirmed. Structure, verified against real discs** |
| The Media Key Precursor step: how the records pick and unwrap a key group | **Theory. Derivation under investigation, not yet executed** (no covering Processing Key) |
| `0x2d` per-slot selection, nonce position, one field width | **Unconfirmed.** Needs a covering 2.1 key |
| `SegmentKey.tbl` container: file header + one fixed-size record per selector value | **Confirmed** against retail discs |
| A forensic unit is indistinguishable (CPI, sync state) from ordinary encrypted content; the segment map is the sole locator | **Confirmed. Measured** |
| Normal and forensic units share one decrypt path: the same AES-CBC over the same aligned unit, differing only in the key source (unit key vs segment key), routed per unit by the segment map | **Confirmed. Measured** |
| The per-unit content key is deterministic: a fixed function of (disc, unit), reproducible across plays, even though the derivation is obfuscated | **Confirmed. Measured** |
| The `SegmentKey` per-device record is a fixed-size structure defined by the format (record size checked against a constant), so the per-device key-set size is a scheme constant, identical across 2.1 discs | **Confirmed. Code-proven** |
| The record payload is a small fixed key set, far fewer than the number of segments (the grouping); segment count is a per-disc authoring choice, the per-device key-set size is not | **Confirmed** |
| The key store holds one key per variant for each forensic segment; a device uses the key matching its own variant | **Confirmed. Code-proven** |
| The segment map ties each unit range to a segment group and a variant, not just to a location | **Confirmed. Code-proven** |
| The forensic keys branch off the Media Key Precursor (Kmp), not a second player secret | **Working model.** One player secret: the Device Keys |
| A device's variant follows from its subset / Processing Key → its Media Key Precursor | **Working model.** Not run end to end |
| The Precursor, run through the `0x2f` / `0x2d` variant algorithm, yields a per-variant Media Key; a different Kmp gives a different variant (traitor tracing) | **Working model** |
| Content-key selection per unit: a normal unit uses the unit key (whole CPS unit), a forensic unit uses the segment key (one segment, the device's variant), both feeding the same per-unit cipher | **Confirmed / spec** |
| Link between the layers: one per-variant Media Key, from the Kmp variant branch, drives both the MKB variant data and the SegmentKey selection | **Working model.** Not executed against our discs |
| The cryptographic derivation of a usable segment key from its stored key material | **Unknown.** Active work |
| Whether the per-segment key set is one unmarked base version plus forensic variants | **Theory.** A plausible reading, not confirmed |
| Variant selection back to a clean single-variant stream | **Unknown.** Active work |
