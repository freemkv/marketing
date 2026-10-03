---
title: Pioneer Optical-Drive Firmware
description: A technical reference for the Renesas H8SX generation of Pioneer Blu-ray writer firmware - its processor and software stack, the two-component image model, the distribution envelope, the drive's command surfaces, the boot-time validation contract and the generation-marker mechanism.
---

:::caution[Work in progress]
This is an active investigation: a current working model of how Pioneer firmware is built, packaged
and updated, not a finished specification. It is revised as we learn more, and parts of it may be
corrected or removed.
:::

*A complete technical reference for the Renesas H8SX generation of Pioneer
Blu-ray writer firmware: its processor and software stack, the two-component
image model, the distribution envelope and its cryptography, the drive's raw
and update command surfaces, the boot-time validation contract, the
cross-model compatibility rules, and the generation-marker mechanism that
governs downgrades.*

---

## Abstract

Pioneer's Blu-ray recorder families — the BDR-2xx, S0x, S1x, X1x, XD, XS, XU,
UD, and WX series, together with their OEM-badged variants — share a single
firmware architecture built on a Renesas H8SX microcontroller running a layered
Hitachi/MiSPO real-time software stack. This document describes that
architecture end to end. It treats the firmware as the object of study: what
the image contains, how it is divided into a **Kernel** and a **Normal**
component, how each component is wrapped in a signed, LCG-encoded distribution
**envelope**, how the drive authenticates and installs an envelope over its
vendor SCSI command set, how the two components validate one another at boot,
how firmware revisions are paired and constrained across models, and how a
one-byte **generation marker** in the Kernel body governs which revisions a
receiver will accept — the pivot on which firmware downgrade turns.

The description is grounded in the binary itself: fixed offsets, opcode bytes,
instruction addresses within the decoded images, cryptographic parameters, and
corpus-wide structural statistics. Where drive-side behaviour has been observed
or traced to specific firmware code it is stated as such; where the firmware's
behaviour is inferred but not yet proven at the silicon level, it is deferred to
Chapter 21 (Open Problems) rather than asserted.

---

## Notation and conventions

- **Addresses.** Hexadecimal, `0x`-prefixed. Unless a section says otherwise,
  addresses in running-firmware discussions are absolute addresses in the
  drive's runtime address space, where the Kernel occupies `0x400000` and the
  Normal `0x410000`. Envelope-relative offsets are stated as "envelope offset"
  and image-relative offsets as "image offset" or "body offset".
- **Endianness.** The processor is big-endian. Instruction operands and the
  additive checksum are therefore big-endian. The body-encoding keystream, by
  contrast, operates on **little-endian** 32-bit words (a deliberate
  peculiarity, discussed in Chapter 7). Each multi-byte quantity below states
  its byte order where it matters.
- **Sizes.** `0x10000` = 64 KiB; `0x11200` is the canonical Kernel envelope
  size; Normal images are of variable size declared in their own header.
- **Evidence levels.** Three qualifiers are used deliberately. *Observed* — a
  captured drive response with a known stimulus. *Code-backed* — a behaviour
  traced to specific instructions at named addresses in a decoded image.
  *Inferred* — a model consistent with the evidence but not yet discriminated
  from alternatives; all material inferences are collected in Chapter 21.
- **Reference platform.** Most concrete examples use the BDR-UD04 (hardware
  code `SAT 8A10`), the most completely characterised member of the family,
  with siblings cited where they differ.

---

## Part I — Platform

### 1. Introduction and scope

A Pioneer optical drive of this generation is, from the firmware's point of
view, three things stacked together: a Renesas H8SX system-on-chip with its
peripherals and servo hardware; a layered real-time operating system; and
Pioneer's own application code implementing the optical stack, the AACS content
path, the SCSI/MMC command interface, and — the subject of much of this
document — a firmware self-update receiver.

The firmware ships to the field as one or two **envelopes**: encoded, signed
container files (conventionally carrying an `.enc`-style body) that the drive's
own update receiver decodes, validates, and writes to its persistent store. The
two envelopes correspond to the two firmware components, the **Kernel** and the
**Normal**. Understanding the firmware therefore means understanding four
distinct but interlocking things:

1. the **runtime image** — what code and data live where when the drive is
   running (Part I);
2. the **envelope format** — how that image is packaged, encoded, and signed
   for distribution (Part II);
3. the **command surface** — how a host reads drive memory and drives the
   update state machine (Part III);
4. the **lifecycle rules** — how the two components validate each other, how
   revisions are paired across models, and how the generation marker gates
   updates and downgrades (Part IV).

Older DVR- and BDC-series drives predate the H8SX/SAT design and use related
but distinct envelope layouts and checksums; these are treated separately in
Part V. The scope here is the firmware itself, not any host software that might
produce or consume it.

### 2. The H8SX processor

The application processor is a **Renesas H8SX** core: a big-endian architecture
with a variable-length instruction encoding (16-, 32-, and 64-bit instruction
words), descended from the Hitachi H8 line. Two structural fingerprints
identify the ISA unambiguously in an image whose provenance is unknown:

- **Return-opcode frequency.** The code regions are dense with the byte pair
  `54 70`, which is the H8 `RTS` (return from subroutine) opcode; a
  representative 64 KiB Kernel plus its Normal contains many thousands of these.
  The SH-2 return encoding (`00 0B`) does not appear, ruling out that ISA, which
  earlier superficial analyses had mistakenly assumed.
- **Reset-vector shape.** The reset vector points into a table of `5E xx xx xx`
  and `5A xx xx xx` words. In H8SX these are the `JSR @@aa:24` (jump to
  subroutine, 24-bit absolute) and `JMP @@aa:24` forms — exactly the shape of a
  dispatch/relocation table at a reset entry.

Several instruction forms recur throughout this document because the firmware's
control logic is built from them, and reading the firmware means reading them:

| Mnemonic (H8SX) | Encoding note | Role in this firmware |
|---|---|---|
| `RTS` | `54 70` | subroutine return; the density fingerprint |
| `JSR @@aa:24` | `5E xx xx xx` | absolute call; dispatch tables, wrappers |
| `JMP @@aa:24` | `5A xx xx xx` | absolute jump; entry thunks |
| `CMP.L #imm,ERn` | 32-bit immediate compare | control-word and marker checks |
| `CMP.B #imm,RnL` | byte immediate compare | buffer-id (`FE`/`F0`/`FF`) dispatch |
| `BSET`/`BCLR #b,@aa:16` | bit set/clear, absolute-16 | permission/state-bit management |
| `EXTU.L ERn` | zero-extend long | operand preparation |
| `RTE` / `RTE/L` | `56 70` / `56 0x`–`56 3x` | exception return |

The variable-length encoding matters for anyone disassembling the image:
linear sweep is prone to false cross-references because a mis-synchronised
decode can produce plausible but spurious instructions, so control flow must be
followed from verified entry points rather than swept blindly.

The reset configuration is a stack pointer initialised to `0x007A0036` — placing
the initial stack near the 8 MiB mark in the runtime address view — and a reset
entry at `0x00552696`. The primary exception vector table sits at address `0`
and holds the stack pointer plus 63 exception program counters, most defaulting
to a common handler at `0x00552696`. A **duplicate** vector table appears at
`0x8000` with a stack pointer shifted by `+0x1C00`, consistent with a
RAM-relocated second execution context; a near-copy of the boot-time code block
`0x4000..0x8000` also appears at `0xC000` (differing in 154 byte positions in a
representative capture — a near-mirror, not an exact one).

### 3. The layered software stack

Three software layers sit above the silicon, each independently identifiable by
a fixed marker string in the image:

- **Hitachi AzHI2000/3** — the low-level microkernel: peripheral bring-up,
  exception dispatch, timers, and the basic hardware abstraction. It is marked
  by the string `AzHI2000/3 Ver. 1.0 (c)Hitachi, Ltd. 1998.` and occupies a
  block near `0x100000` in the runtime map. This is the "kernel" in the RTOS
  sense — not to be confused with the Pioneer **Kernel** *component* (Chapter
  5), which is a Pioneer-authored firmware unit that happens to share the word.
- **NORTi** — a commercial real-time operating system from MiSPO Corporation,
  widely used in Japanese consumer electronics, layered above the microkernel to
  provide task scheduling. It is marked by `jNORTi(c)MiSPO`. This string is a
  reliable family fingerprint for Pioneer/Renesas firmware.
- **Pioneer application code** — the drive's own optical, servo, AACS, and SCSI
  logic, plus the firmware update receiver, running as tasks above NORTi. Within
  this layer, the AACS content path identifies itself as
  `Indigo5 AACS Kernel Driver ver.5.0.0`, and the boot path prints the banner
  `----- Kernel Power ON -----`.

The presence and fixed positions of these markers are exploited elsewhere in
this document as anchors: they let a decoded image be recognised as Pioneer
firmware, and they bound the regions in which each layer's code lives.

### 4. Runtime memory map

When the drive is running, its address space is laid out as follows. The table
combines the coarse region structure with the specific landmarks that later
chapters reference. Sizes and identifications are for the BDR-UD04 `SAT 8A10`
reference platform; the region *structure* is family-general, while exact
addresses of application landmarks shift between models and revisions.

| Range | Size | Contents |
|---|---:|---|
| `0x000000–0x000FFF` | 4 KiB | Primary vector table: stack pointer + 63 exception PCs (mostly `0x00552696`). |
| `0x001000–0x003FFF` | 12 KiB | Boot descriptor and peripheral I/O map. |
| `0x004000–0x007FFF` | 16 KiB | Boot-time code/data (mirrored near `0x00C000`). |
| `0x008000–0x00BFFF` | 16 KiB | Duplicate vector table + descriptor (RAM-relocation copy, SP shifted `+0x1C00`). |
| `0x00C000–0x00FFFF` | 16 KiB | Near-copy of `0x004000` block; differs in 154 bytes in a representative capture. |
| `0x010000–0x0FFFFF` | ~960 KiB | Sparse configuration / state tables, largely zero-padded. |
| `0x100000–0x102FFF` | 12 KiB | Hitachi AzHI2000/3 microkernel core. |
| `0x103000–0x10FFFF` | 52 KiB | Kernel/OS bring-up code. |
| `0x110000–0x3FFFFF` | ~2.94 MiB | Servo tuning and calibration tables (per-media laser coefficients). |
| `0x400000–0x40FFFF` | 64 KiB | **Kernel component**: startup, update receiver, low-level writers, identity reporting; carries the AACS/RTOS markers. |
| `0x410000–…` | declared | **Normal component**: application code and data; end given by the declared size in its header (e.g. `0x5D7500` for a `0x1C7500`-byte image). |
| `0x59BB4E` | — | Canonical identity string `PIONEER BD-RW   BDR-UD04 1.14 20/06/15`. |
| `0x59D474–0x59D573` | 256 B | SHA-256 constant (K) schedule: all 64 FIPS-180-4 words, byte-exact big-endian. |
| `0x5A0000–0x5B69C0` | ~92 KiB | Command-tag tables (`AS`/`AN`/`AO`/`AP`/`AQ`/`AR`/`AT`/`AU` tags), temperature-monitor markers. |
| `0x5B69C4–0x5B6B3F` | 380 B | 95-entry address table (candidate SCSI dispatch). |
| `0x5B7000–0x5C0000` | 36 KiB | Additional dispatch and auxiliary tables. |
| `0x5C0000–0x5D0000` | 64 KiB | Servo/OPC calibration table: dense 16-byte records with a repeating `00 00 db XX YY 00 00` skeleton — structural high entropy, not ciphertext — lying *inside* the declared Normal image. |
| `0x5D0000–0x5FFFF7` | ~192 KiB | Dense and structured non-`FF` data beyond the declared Normal image. |
| `0x5FFFF8–0x5FFFFF` | 8 B | Factory footer `87 65 FE DC 43 21 00 5C`. |

Two landmarks in this map recur in the cryptographic discussion. The **SHA-256
K schedule** at `0x59D474` is the full set of 64 round constants, present
byte-exact and big-endian; it establishes that a SHA-256 implementation exists
in the image, though the routine that consumes it and its callers are a
remaining trace target. The **factory footer** is an eight-byte sentinel at the
very top of the mapped region. Neither the copyright banner that opens every
distribution envelope (Chapter 6) nor the embedded original filenames of the
distributed components appear anywhere in a running-memory capture — the
persistent envelope is consumed at install time and is not retained verbatim in
the runtime image.

---

## Part II — The firmware image and its packaging

### 5. The component model: Kernel and Normal

Every drive of this generation carries **two** separately versioned firmware
components. They are distributed as separate envelopes, transferred by separate
phases of the update protocol, and validated against each other at boot.

#### 5.1 Roles

**The Kernel** is the smaller, foundational component: a decoded body of exactly
`0x10000` bytes (64 KiB), occupying `0x400000–0x40FFFF` at runtime. It contains:

- the startup/boot path, including the Normal-validation contract (Chapter 13)
  and the `----- Kernel Power ON -----` banner;
- the **firmware update receiver** — the state machine that interprets the
  vendor `WRITE BUFFER` update commands, stages incoming envelope bytes, decodes
  and validates them, and drives the low-level flash writers (Chapter 12);
- the **low-level writers** that program the persistent store via the
  controller's flash-program registers;
- **identity reporting** for the Kernel-mode command responses;
- a set of **service routines** exported to the Normal component at fixed slots.

**The Normal** (also called the "main" or "General" image) is the large
application component: a variable-size body, declared in its own header,
typically on the order of 1.4–1.9 MiB, occupying `0x410000` upward. It contains
the optical/servo/AACS application stack, the main SCSI/MMC command processing,
and compressed application data (Chapter 9).

#### 5.2 Runtime coupling

The two components are **not** independent at runtime. The Normal image imports
a fixed run of Kernel **service slots** in the address range
`0x400A00–0x400A5C`. In the BDR-UD04 Normal this import surface is a byte-exact
102-byte block of **17 wrapper calls** to those slots, and — importantly for the
compatibility analysis in Chapter 14 — that block is **identical between the
UD04 Normal 1.11 and 1.14 revisions**. The imported slots implement reset/init
helpers, state-bit operations, and shared-RAM accessors. The Kernel therefore
remains a live dependency of the Normal after boot: a Normal cannot execute
correctly against a Kernel whose export layout or semantics differ.

The Normal's **entry address** — where the Kernel transfers control after boot
validation — is itself generation-dependent. Across the decoded corpus, three
entry conventions are observed: the large majority of modern Normals are entered
at `0x412000`; a smaller group at `0x410028`; and a couple of images at
`0x410014`. This "entry ABI" split (106 / 13 / 2 in a representative census of
recognised images) is one of several respects in which the interface between the
two components has drifted across generations.

#### 5.3 Independent versioning

Because the two components are versioned independently, **their revision numbers
need not agree**. A drive can legitimately ship a Kernel revision older than its
Normal — the canonical example being a Kernel labelled `1.00` co-shipped with a
Normal labelled `1.14`. Equal revision numbers are therefore not a valid pairing
criterion; the actual pairing rules are the subject of Chapter 14. Moreover, a
great many field updates ship a **Normal only**, leaving the installed Kernel in
place: the Kernel changes far less frequently than the application image.

### 6. The distribution envelope

Each firmware component is distributed as an **envelope**: a fixed `0x200`-byte
plaintext header followed by an encoded body. The envelope is the unit the
update receiver ingests. Every envelope opens, within its 96-byte preamble
region, with the same fixed 57-byte copyright banner:

```
********  Copyright(c) 2000 Pioneer Corporation  ********
```

The header proper is `0x160` bytes of banner-plus-labeled-fields, followed by a
`0xA0`-byte trailer of opaque, validation, extension, and filename regions, for
a total header of `0x200` bytes before the body begins.

#### 6.1 Header structure: five regions

The `0x200`-byte header decomposes into five functional regions. This structure
is corpus-general; the *values* in each region vary by component, model, and
generation, but the region boundaries do not.

| Offset | Size | Region | Description |
|---|---:|---|---|
| `0x000` | 96 | **Banner / preamble** | The fixed copyright banner. Invariant across the entire corpus. |
| `0x060` | 256 | **Identity / release fields** | Eight labelled ASCII fields plus separators (§6.2). Highly stable across the corpus. |
| `0x160` | 16 | **Opaque** | Additional bytes present in some generations; zero on others (all-zero for the UD04 samples, non-zero elsewhere). |
| `0x170` | 80 | **Validation block** | Four 20-byte operands. On signed generations, an ECDSA signature plus public point (§8.2); on older generations, all-zero (unsigned) or a hash-based check. This is the least invariant region in the header. |
| `0x1C0` | 48 | **Extension** | Generation-dependent extension bytes; all-zero for UD04, populated on other generations. |
| `0x1F0` | 16 | **Embedded filename** | The 12-character original resource basename, including the dot-version (e.g. `S8A10001.114`). |

#### 6.2 The eight labelled fields

Within the `0x060–0x15F` identity region, eight fields occupy fixed offsets.
Each is an ASCII field in a fixed-width slot. The table gives the offset, the
field's label/role, and a representative value from the UD04 Normal envelope.

| Offset | Field | UD04 Normal example | Notes |
|---|---|---|---|
| `0x60`  | Model | `PIONEER BD-RW   BDR-UD04` | The marketing model string. |
| `0x90`  | Revision | `1.14` | The advertised release revision. |
| `0xB0`  | Hardware | `SAT 8A10` | The platform/hardware code (§10). |
| `0xD0`  | Kernel Version | `GENERAL` | A version/identity label (an `IDxx` value on ID-keyed models). |
| `0xF0`  | Destination | `GENERAL` | A distinct label, even when its string equals Kernel Version. |
| `0x110` | File Type | `Normal` | `Kernel`, `Normal`, or the legacy `Plane`. |
| `0x130` | Generated Date | `20/06/15` | `YY/MM/DD` (older DVR uses `MmmDD,YYYY`). |
| `0x150` | Kernel Version2 | `0000` | A third distinct version field. |

Three subtleties are important because they are routinely conflated:

- **Kernel Version, Destination, and Kernel Version2 are three separate
  fields.** They frequently share a value (e.g. all reading `ID43`, or the pair
  reading `0000`), but the firmware and the packaging treat them independently,
  and a compatibility judgement that collapses them is wrong.
- **Field alignment drifts.** Older DVD-era headers sometimes right-align the ID
  text within its 24-byte slot with leading spaces, whereas modern BDR headers
  (e.g. UD04) have no leading spaces. Any parser must reproduce the exact
  padding, because the header is covered by the signature (§8.2).
- **File Type is the authoritative role.** The `0x110` field, not the filename
  or any container name, declares whether the envelope is a Kernel, a Normal, or
  a legacy Plane component.

#### 6.3 Header invariance across the corpus

The division of the header into a stable identity region and a volatile
validation region is visible statistically. Across a corpus of several hundred
distinct Normal envelopes:

- all eight ASCII labels occupy identical offsets, and the first `0x60` bytes
  (the banner) are byte-identical everywhere;
- across the full `0x200`-byte header, on the order of 289 byte positions are
  invariant and ~310 hold the same value in at least 90% of files;
- the `0x60–0x16F` text/identity region shows ~90.3% mean modal-byte agreement;
- the `0x170–0x1BF` validation region shows only ~13.1% — because it carries a
  per-release cryptographic proof rather than identity text;
- the `0x1C0–0x1EF` extension region is all-zero in the large majority of files
  (≈309/440 in one census) but is populated by some generations;
- every sampled Normal has a distinct `0x1F0–0x1FF` filename block.

The practical reading of these statistics is that the header is **one generic
layout with per-release values**, not a per-model byte template: a parser or
generator can rely on the field positions universally, but must derive — not
assume — the validation and filename bytes.

### 7. The body codec

The encoded body of an envelope is protected by a reversible **keystream**
transform, not by a block cipher. The transform has three parts: a linear
congruential keystream generator, a per-word XOR-and-rotate, and a placement
convention for the key relative to the ciphertext.

#### 7.1 The LCG keystream

The keystream is produced by the classic Microsoft C-runtime linear
congruential generator, run over a **24-bit** state:

```
state ← (state · A + C)  mod 2^24
key_byte ← (state >> 16) & 0xFF
```

with

```
A = 214013        (0x000343FD)
C = 2531011       (0x00269EC3)
modulus = 2^24    (mask 0x00FFFFFF)
```

The generator is seeded with a 24-bit value and iterated to fill a key table of
`0x1000` bytes (Kernel) or up to `0x10000` bytes (Normal), which then repeats
over the body as needed. The seed is **not a secret and not a signing key**: it
merely selects which keystream is used, and the same plaintext under two
different seeds is equally valid firmware.

A property of this generator that the firmware relies on is that it is
**invertible**. The multiplier `A` has a modular inverse

```
A⁻¹ = 0x00B33155   (214013⁻¹ mod 2^24)
```

so the state sequence can be rolled *backward* as well as forward. This is what
allows a *derived-key* Kernel envelope (§7.3) to carry a trailing slice of the
keystream and have the decoder reconstruct the seed — and hence the whole key
table — by running the generator in reverse from that slice.

#### 7.2 The word transform

The body is processed as a sequence of **little-endian 32-bit words** (note the
endianness inversion relative to the big-endian processor — the codec is a
data-processing convention, not instruction data). For each ciphertext word `c`
and the corresponding key word `k` drawn from the repeating key table, the
plaintext word `p` is:

```
p = ROR32( c XOR k ,  k & 0x1F )
```

that is: XOR with the key word, then **rotate right** by the number of bit
positions given by the low five bits of the *same* key word. Encoding is the
inverse: rotate left by `k & 0x1F`, then XOR with `k`.

One model, **BDR-WX01DM** (specifically its Normal envelope), uses the
mirror-image variant: the rotation runs in the *opposite* direction —
`ROL32(c XOR k, k & 0x1F)` on decode — while the XOR and key derivation are
otherwise identical. It is the only rotation-direction exception observed in the
modern corpus.

The decisive point is that **the envelope carries no indication of which
direction applies.** The header (Chapter 6) is a single uniform structure across
every model; it contains no codec-variant byte, no rotation flag — nothing a
reader could consult to choose the direction in advance. Nor is the choice
recoverable from the model string, because the header field layout is identical
regardless of direction. The direction is therefore **intrinsic to the model's
own decoder**: the drive's firmware is simply compiled with the rotate
instruction for its platform (an H8SX `ROTR` on the common models, `ROTL` on
WX01DM) and never needs to be told which to use, since it only ever decodes its
own firmware. There is no in-band signal because, from the drive's point of
view, none is needed.

This leaves an offline reader — decoding a foreign envelope without that model's
decoder — to **resolve the direction empirically**, and the resolution is
unambiguous and cheap. The decoded body always begins with the ASCII magic
`PIONEER ` at its payload header (offset `0x14` carries the declared size
immediately after). So the procedure is: decode the first word or two each way,
and keep the direction whose output starts with `PIONEER `:

```
for direction in {right, left}:
    candidate ← transform(first 64 bytes of payload, key, direction)
    if candidate starts with b"PIONEER ":
        accept this direction for the whole body
```

Exactly one direction produces the magic (the other yields high-entropy
garbage), so a 64-byte trial decode at the payload start decides it before any
full-image work. This is a general disambiguation strategy, not a WX01DM special
case: the same trial over the two candidate key offsets and the two rotation
directions classifies every Normal envelope — the standard `normal` layout and
the `normal-reverse` (WX01DM) layout alike — without a per-model table. The
rotation flip is thus of no cryptographic consequence; it costs an offline
reader one extra 64-byte trial and nothing more.

#### 7.3 Key placement: three envelope body layouts

The header is uniform, but the arrangement of key table and ciphertext within
the body differs by component and generation. Three modern layouts exist (the
legacy DVR layouts are treated in Part V).

**Normal layout.** Header `0x200`, then a key region, then the encrypted
payload. The payload begins `0x10000` bytes after the key region. A raw
(unsigned staging) Normal places its payload at envelope offset `0x10200`.

**Kernel — front-key (`kernel-front`).** Total envelope `0x11200` bytes for a
`0x10000` body. The layout is:

```
0x00000  header            0x200
0x00200  key table         0x1000   (explicit LCG key)
0x01200  encrypted body    0x10000
0x11200  (end)
```

**Kernel — derived-key (`kernel-derived`).** Same total size, but the key is not
stored explicitly; it is *derived* from a trailing keystream slice:

```
0x00000  header            0x200
0x00200  encrypted body    0x10000
0x10200  key trailer       0x1000   (continuous LCG stream)
0x11200  (end)
```

The trailer at `0x10200–0x11200` is one continuous run of the LCG keystream; the
decoder recovers the seed by taking the trailer's final 16 bytes, inverting the
generator (§7.1) to find the state that would have produced them, and rolling
back to the seed. Concretely the recovery treats the trailer as the keystream at
position `envelope_len − 0x200 − 16 + 0x1000` and reverses to the origin.

Crucially, **the Kernel code itself records which layout it expects**. A
derived-key Kernel body contains an adjacent instruction pair `CMP.B #FE,RnL`
followed six bytes later by `CMP.B #F0,RnL`; a front-key body does not contain
that adjacent pair (at most an isolated `FE`-like compare). This is not
incidental — it is the same buffer-id dispatch (Chapter 12) that the receiver
uses to distinguish Kernel from Normal transfers, and its presence or absence is
a reliable, code-intrinsic discriminator of the two layouts. In a census of 121
distinct decoded Kernel envelopes the split is **63 front-key and 58
derived-key**, with the code-signature discriminator correctly classifying 106
and returning "unknown" only for 15 of the oldest SAT-10xx images (with **zero
misclassifications**).

#### 7.4 Seed distribution

Because the seed only selects the keystream, a given model can appear under
several seeds across its release history. In a census of 179
model/hardware/destination/role/layout groups with reproducible LCG tables, 64
groups used more than one seed. Two seeds dominate the corpus: seed `0x47D001`
reproduces the key tables of 212 distinct envelopes and seed `1` reproduces
those of 47; other seeds occur in smaller numbers. (A small number of images,
including the UD04 Kernel and the SAT1003 scaled-key tables, do not reproduce
under this default-seeded LCG at all and use distinct seeds or geometries; the
SAT1003 family is treated in Part V.) The consequence for anyone
reasoning about the format is that **a single per-model seed cannot regenerate
all of a model's OEM envelopes**, and the seed carries no authentication weight.

### 8. Integrity: checksum and signature

A decoded image is protected by two independent integrity mechanisms: an
additive checksum that every image satisfies, and — on modern generations — an
ECDSA signature over the envelope.

#### 8.1 The additive checksum

The decoded image's **big-endian 32-bit words sum to zero modulo 2³²**. The sum
is made to vanish by a single **compensation word** whose value is set to the
additive inverse of all the others:

- in the **Normal** image the compensation word is the big-endian word at
  decoded image offset `+0x10`;
- in the **Kernel** image the balance word sits near image offset `0x1020`.

Kernel and Normal each satisfy the zero-sum property **independently**. In a
representative capture, the live Kernel span `0x400000–0x40FFFF` and the carved
Normal span `0x410000–0x5D7500` each sum to zero, with the Normal's `+0x10` word
observed as `0xDB8E7E50` — the additive inverse of the sum of the remaining
words. (A decoded OEM Normal whose compensation word had not been recomputed
would sum to a non-zero constant instead; the zero-sum is thus a positive
integrity signal for a coherent image.) Some older boot paths additionally
verify an additive sum spanning the Kernel and Normal *together*, a fact that
becomes relevant to substitution safety in Chapter 14.

This checksum is central to the downgrade transform of Chapter 15: any edit to
the decoded body must be accompanied by a compensating adjustment to the balance
word, or the image no longer sums to zero and the receiver rejects it.

#### 8.2 The ECDSA signature

On modern BDR/SAT generations the 80-byte validation block at header
`0x170–0x1BF` is an **ECDSA signature and its public key**, laid out as four
big-endian 20-byte (160-bit) operands:

```
0x170  r    (20 B)   signature scalar
0x184  s    (20 B)   signature scalar
0x198  Qx   (20 B)   public-point x-coordinate
0x1AC  Qy   (20 B)   public-point y-coordinate
```

The scheme is ECDSA over **SHA-1** on a single fixed 160-bit prime curve, the
same curve for the entire modern corpus. The curve is defined over the prime
field 𝔽ₚ by `y² = x³ + ax + b (mod p)`, with parameters (all hexadecimal,
big-endian):

```
p = e14639330258ef519cfe5fc1ad99284502874d2b
a = 48fa0f23b610f399a80fbc0abe9cecd73c5d1e12
b = 2794e57cf726ec2b17ff8ef71016038776faac60

n = e14639330258ef519cfc7f76cbc2926029906bb5      (group order, prime)

G = ( 75a35b281dee9b185654896f6d60b18d9ff954dc ,
      b2c7fbc50a2e8b4b1a8a38577058ba4a005b6208 )   (generator)
```

The order `n` is prime, so the group has no small-subgroup structure; the public
point `Q = (Qx, Qy)` in the header lies on the curve, and the signature `(r, s)`
verifies against `Q` in the standard ECDSA manner (compute
`u₁ = H·s⁻¹ mod n`, `u₂ = r·s⁻¹ mod n`, check that the x-coordinate of
`u₁·G + u₂·Q` reduces to `r mod n`), where `H` is the SHA-1 digest of the signed
range.

The first-40/last-40 split of the validation block has a clear structural
signature across the corpus: in a census of recognised-curve Normal envelopes,
the **last 40 bytes** (the public point) tend to persist across revisions of the
same embedded model — the two UD04 samples 1.11EU and 1.14 share their last 40
bytes while differing in the first 40 — whereas the **first 40 bytes** (the
signature) change every release. The first 40 bytes are always two nonzero
sub-`p` 20-byte values, consistent with signature scalars; across 286 distinct
sampled pairs every one satisfied that shape, and across the recognised-curve
population every envelope verified with its last 40 bytes as the public point.

#### 8.3 Signed-range selection

The SHA-1 digest `H` covers the envelope from a start offset to EOF, and **the
start offset depends on the envelope layout**:

- envelopes are signed either over `0x200..EOF` (header excluded, key table plus
  ciphertext included) or over `0x10200..EOF` (ciphertext only);
- the choice tracks the Kernel layout distinction of §7.3: a **front-key**
  arrangement signs from `0x200` (key table plus ciphertext), whereas a
  **derived-key** arrangement signs from `0x10200` (ciphertext only);
- in a corpus split, 228 envelopes used the `0x200` form and 58 used the
  `0x10200` form; the UD04 1.11EU and 1.14 Normals both use the `0x200` form.

The signed range is therefore not a free parameter: it is determined by the same
generational layout choice that determines key placement, and the two must agree
for verification to succeed.

#### 8.4 The hardware validation engine and SHA-1

The digest and signature verification are not purely software. The Kernel
supplies the header's 80-byte validation block, and specifically the public
point, into a **hardware validation engine** mapped at `0xFF3FF000`, and does so
*before* decoding the body. The Kernel loads the five standard SHA-1 initial
words (the FIPS-180-1 `H0..H4` constants) into that engine — establishing SHA-1
as the digest stage — and checks a hardware status result. The 80-byte block is
validated against the encrypted body via this engine; the changing 40 bytes are
not simply the body's SHA-1, and the engine's exact trust policy (whether it
accepts the supplied public point as-is or checks it against a stored value) is
one of the central open problems of Chapter 21.

The independent presence of the SHA-256 K schedule at `0x59D474` (Chapter 4)
indicates a SHA-256 implementation elsewhere in the image; it is distinct from
the SHA-1 signature stage and its consumer has not been tied to the update path.

#### 8.5 Older validation policies

Not every envelope is ECDSA-signed. Across the older SAT generations three
distinct validation policies are observed, and — critically — **the policy is
selected by the receiver's own code path, not inferred from whether the
validation block happens to be zero**:

- **Unsigned.** Some early SAT receivers (e.g. SAT1005, SAT1014) accept a body
  whose `0x170–0x1BF` block is 80 zero bytes. Sampled SAT1005/1014 Normal
  envelopes indeed carry an all-zero validation block rather than a signature.
  Acceptance of a zero block is only valid where the receiver code recognises
  that unsigned path.
- **Hash-based checksum.** Other receivers validate with `SHA1(key ‖ ciphertext)`
  or `SHA1(ciphertext)` rather than an elliptic-curve signature.
- **Modern ECDSA.** As in §8.2; e.g. SAT1030 and SAT1050 samples verify on the
  modern curve even though their SAT-generation siblings do not.

The generalisation "a zero validation block means unsigned" is therefore false
in the strong sense: it is only unsigned if the *receiver* implements the
unsigned path. This is why signed and unsigned generations coexist in the same
`SAT10xx` numbering band.

### 9. The compressed payload (`COMP`)

A decoded Normal image is not a flat memory picture; it commonly contains a
**`COMP` directory** describing compressed sub-streams. The directory sits at a
fixed image offset:

```
0x1000  "COMP"                     4-byte magic
0x1004  directory entries          (start,end) address pairs, through 0x1100
```

Each directory entry is a pair of runtime addresses `(start, end)` locating a
zlib stream elsewhere in the image; the stream is stored as a 4-byte prefix
followed by the compressed data, and it expands to occupy `[start, end)` at its
intended absolute address. Observed stream counts are **six** (the common case)
or **nine**. In one corpus survey, 167 supported distinct envelopes carried a
`COMP` directory (150 with six streams, 17 with nine).

The consequence is that the decoded envelope body is the **compressed update
payload after outer decoding**, not the fully expanded runtime image: the
receiver (or boot path) expands each stream to its target address so that code
and data land where the runtime map (Chapter 4) expects them. A modification
confined to the last expanded stream can be recompressed and re-placed, adjusting
the directory's end address and the image's declared length, while leaving the
preceding streams untouched — but any such change still has to satisfy the
size-alignment and checksum rules of Chapter 8.

---

## Part III — Identity and the command surface

### 10. Identity reporting

The drive advertises its identity through two independent response paths, whose
fields must be kept distinct because they carry different meaning and are used
for different purposes.

#### 10.1 Standard INQUIRY

The standard SCSI `INQUIRY` returns the product identification, for the
reference platform:

```
PIONEER BD-RW  BDR-UD04         revision 1.14   date 20/06/15
```

One subtlety matters for anything that reconstructs an envelope header: the
**INQUIRY spacing can differ from the envelope's model field**. The live drive
reports `PIONEER BD-RW  BDR-UD04 ` (two interior spaces plus a trailing space)
where the envelope model field at `0x60` reads `PIONEER BD-RW   BDR-UD04` (three
interior spaces). The correct spacing for a given envelope is recoverable from an
identity literal inside the firmware image, not from INQUIRY alone.

#### 10.2 The vendor identity block (READ BUFFER 02/F1)

The vendor identity is obtained with `READ BUFFER` mode `02`, buffer id `F1`:

```
3C 02 F1 00 00 00 00 00 30 00        →  48-byte identity block
```

The 48-byte block is structured as follows:

| Bytes | Field | UD04 value |
|---|---|---|
| `[16..23]` | Hardware / platform code | `SAT 8A10` (space + four platform chars) |
| `[24..31]` | Kernel type | e.g. `GENERAL ` / `ID43` region |
| `[32..39]` | Normal type | e.g. `ID43` |
| `[40..43]` | Kernel version | four chars |

The four characters after `SAT ` are the platform code — `8A10` for BDR-UD04,
`9201` for BDR-S13, `8F01` for BDR-212U, `8600`/`8601` for BDR-209M variants,
and so on. Bytes `[0x20..0x27]` of this `F1` response additionally serve as an
**update-mode status window**: eight ASCII spaces there signify that update mode
is already active (Chapter 12). The separate "entry succeeded" indication — the
ASCII `000` at bytes `[0x20..0x23]` — is reported on the standard `INQUIRY`
response, not on this block (§12.3).

In Kernel mode the drive assembles this response from fixed sources: it copies
16 bytes from `0x401000` to response offset `0x10`, eight blank bytes from a
fixed source to offset `0x20`, and eight bytes from `0x401010` to offset `0x28`,
yielding a raw identity block of the form:

```
SAT 8A10GENERAL 0000
```

That is, the Kernel-mode identity reports `0000` for the Kernel Version2 field
and does **not** report the Kernel envelope's own advertised revision (`1.00`)
or generated date (`17/02/10`). Those envelope labels are not retained verbatim
anywhere in the running image — a point developed in §10.4.

#### 10.3 The identity field taxonomy

Six identity concepts must be tracked separately; conflating any two of them
produces incorrect compatibility conclusions:

1. **INQUIRY product** — what the host OS sees (`PIONEER BD-RW BDR-UD04`).
2. **Envelope model** — the `0x60` header field of a firmware component.
3. **Hardware / SAT code** — the platform identifier (`SAT 8A10`), reported in
   the `F1` block and carried in the `0xB0` header field.
4. **Kernel Version** (`0xD0`), a version/identity label.
5. **Destination** (`0xF0`), a distinct label even when its string matches
   Kernel Version.
6. **Kernel Version2** (`0x150`), a third version field.

The `ID`-style numbers (`ID43`, `ID60`, `ID81`, …) are variant labels, **not** a
release ordering and **not** by themselves a compatibility proof. A displayed
firmware name that differs from another drive's is not, on its own, evidence of
cross-flashing; and a recognition-table display name must never be presented as
an extracted envelope model without independent corroboration.

#### 10.4 Non-recoverability of Kernel release labels

A structural fact with practical consequences: the **installed Kernel does not
retain its own release revision, generated date, or original filename** in a form
recoverable from the flashed bytes. Three independent observations establish
this:

- The Kernel-mode identity response reports `0000`, not the envelope's `1.00`
  (§10.2).
- The strings `1.00`, `17/02/10`, and the embedded filenames (`S8A10000.100`,
  `S8A10001.114`) do not occur as byte sequences anywhere in a full runtime
  capture.
- Distinct decoded Kernel *bodies* are shipped under **different** advertised
  labels — for example one BDR-212M decoded Kernel image is packaged both as
  `1.04 / 22/12/20` and as `1.05 / 23/08/01` — so no unique release label can be
  reconstructed from a decoded image alone.

The Kernel's write path confirms the mechanism: the writer loop copies only the
decoded body (envelope header and key table excluded, §12.8), so the release
label — which lives in the header — is never persisted with the image.

### 11. The vendor memory-read surface and its address gate

Beyond standard MMC, the firmware answers a small set of vendor commands on the
`READ BUFFER` (`3C`) and `WRITE BUFFER` (`3B`) opcodes. All are 10-byte CDBs
carrying, after the opcode, a mode nibble, a buffer-id byte, a 24-bit big-endian
offset, a 24-bit big-endian length, and a control byte. This chapter covers the
raw-memory surface and its permission logic; Chapter 12 covers the update
protocol.

#### 11.1 The vendor memory read and its address gate

The drive's memory is read with `READ BUFFER` mode `02`, buffer id `B0`. This
reads the drive's **runtime memory map** — SRAM, the running Kernel and Normal
code images, calibration tables, and a live disc-content buffer — at an arbitrary
24-bit address. It does *not* read the persistent flash partition, which is not
mapped into this space (§11.4).

```
3C 02 B0 <off[3 BE]> <len[3 BE]> 00
```

By default the command can only reach a small low address window; the bulk of the
memory map — including the firmware-image regions at `0x400000` (Kernel) and
`0x410000` (Normal) — is **gated by address** and refused until an enable command
(§11.2) is issued. Two behaviours coexist on the same drive:

1. **Low offsets are served without the enable.** A fresh drive returns data for
   `RB @0x000004` (the vector-table region) with no precondition; low-offset
   readability is a platform-identity property, not an unlock indicator. (This is
   the behaviour on the generations where it was characterised; newer read
   helpers instead reject offsets below `0x8000` outright — see §11.3 — so "low"
   here means the readable sub-`0x8000` region on drives that expose it.)
2. **High offsets require an enable.** On a fresh drive `RB @0x500000` is refused
   with sense `key=0x5 ASC=0x24 ASCQ=0x00` (ILLEGAL REQUEST / INVALID FIELD IN
   CDB). After the enable command (§11.2) the identical CDB returns GOOD.

Individual reads are bounded: newer receivers cap a single `B0` read at 4096
bytes, and a conservative fallback of 164 bytes (`length = 0xA4`) is safe across
generations. The high address ceiling is `0x880300`: reads at or above that
offset are rejected outright, and a transfer that would cross it is clipped.

#### 11.2 The extended-read enable ("knock")

The enable — the command that lifts the address gate so `02/B0` can reach the
full memory map — is a zero-length `WRITE BUFFER` mode `02`, buffer id `41`
(informally, the "knock"):

```
3B 02 41 A5 AA AA 00 00 00 00        (no data phase)
```

It is **idempotent** — issuing it twice on an already-enabled drive leaves the
drive enabled — and its effect **persists until power cycle** (a bus replug
resets it; the effect of a software reset on the same bus has not been
characterised). The `0xA5AAAA` field is the offset position of the CDB.

Two state bits in a receiver RAM byte govern this, and their interaction is the
important part:

- **bit 1 — the permission bit.** When set, high-offset `02/B0` reads are
  allowed (§11.3). This is the bit the enable turns *on*.
- **bit 5 — the lockout bit.** When set, it **blocks the enable from ever
  succeeding again** until the drive is power-cycled. This is the anti-tamper
  latch.

In newer receivers the `41` handler behaves as follows (code-backed):

- **A correct enable** — offset exactly `A5AAAA`, and the low 16 bits of the
  transfer length zero — succeeds *only if the lockout bit 5 is clear*, and then
  **sets the permission bit 1**. The drive is now in extended-read mode.
- **A malformed enable** — wrong offset or a non-zero low length word — is
  rejected: it **clears the permission bit 1**, and, when the low offset word is
  non-zero, additionally **sets the lockout bit 5**.

The consequence is a one-way trap. Once a bad enable has tripped the lockout, the
receiver is latched: **a subsequent, correctly formed enable no longer clears bit
5 and no longer grants permission** — the `41` handler now refuses because bit 5
is set. Nothing in the command path resets that latch. It is cleared only by a
full firmware startup (§11.3) — in practice, a power cycle or bus replug. So a
single malformed `3B 02 41 …` attempt can lock a drive out of extended-read mode for
the rest of that power session, and no amount of correct enables will recover it
until the drive is rebooted.

#### 11.3 The permission/lockout state and its reset

The read path consults the same permission state. In the running Normal, the
opcode dispatch table maps `3B` (WRITE BUFFER) to a RAM descriptor slot and `3C`
(READ BUFFER) to another; for UD04 these are slots `0xE1C` and `0xE20`
respectively, whose `+0x24` callback entries are the WRITE-BUFFER handler at
`0x44B8D8` and the READ-BUFFER handler at `0x445506`. The READ-BUFFER handler
loads CDB byte 2, recognises `B0`, and calls a bounds/permission helper
(`0x43EDA8` for UD04) with the requested offset and length. That helper:

- requires **permission bit 1** (at RAM `0x24F8` for UD04, `0x2544`/`0x2592` for
  other models) to be set when `0x8000 < offset < 0x880000`;
- rejects offsets at or above `0x880300` and clips transfers crossing that
  bound;
- serves offsets below `0x8000` without the permission check on some generations
  and rejects addresses below `0x8000` on newer read helpers.

A subtlety that has misled prior analysis: the WRITE-BUFFER handler has its own
`B0` arm that calls the same helper with a *bypass* flag, whereas the
READ-BUFFER arm passes zero and is gated. The read gate is therefore real; it is
only the write-side arm that is unconditional. The bypass must not be read as a
read bypass.

The **lockout bit 5** is cleared only by full firmware initialisation, not by
the enable handler. Two independent boot traces show this: on SAT9401, the
Normal entry at `0x412000` jumps to `0x4B1160`, and a wrapper at
`0x4B11B2..0x4B11C0` byte-fills the RAM interval `[0x7A8, 0x28C8)` with zero
(via the fill routine `0x583554`), which includes the state byte `0x2592`; on
SAT8F01, entry `0x412000` jumps to `0x4AF06E`, and `0x4AF0C0..0x4AF0CE` fills
`[0x764, 0x287A)` with zero, clearing its permission byte `0x2544`. Thus a full
startup clears both the permission and lockout bits; a mere bus reset, tray
operation, or reconnect is not established to rerun startup, and special
offset-1 helper branches must not be assumed to reset the state.

In Kernel mode the read dispatch is analogous but separate: an opcode comparison
selects `3C` and returns a descriptor slot (`0x774` for UD04) into which
initialisation installs a table (`0x406716`); the table's handler
(`0x4029DA`) reads CDB byte 2 into a register, bytes 3–5 into the offset and
bytes 6–8 into the length, and for id `B0` branches to a routine that rejects
offsets `≥0x880300`, clips crossing requests, maps `0x880000..0x880300`
specially, and passes lower addresses to a transfer-buffer copy helper. No
service-state test appears within this bounded Kernel-mode `B0` branch — the
gating described above is a property of the running Normal, not the Kernel-mode
path.

#### 11.4 What the memory-read surface is and is not

The `02/B0` window exposes a **post-boot runtime view** of drive memory: SRAM
and stack, the Kernel and Normal code, calibration and configuration tables,
and, in a distinct high region, a live AACS/BD disc-content buffer. It does
**not** expose the persistent firmware store in a form suitable for a
byte-restorable backup. A symmetric `READ BUFFER 3C 04 FF` query — the read-side
mirror of the flash-write CDB (Chapter 12) — is refused with sense `05/24/00` at
every offset, i.e. the flash chip is not memory-mapped into the `02/B0` address
space, and the distribution-envelope banner (`Copyright(c) 2000 Pioneer`) never
appears anywhere in a runtime capture. The memory-read surface is thus an inspection
interface, categorically distinct from both the persistent store and the update
protocol.

Two consequences follow for backup. First, the enable is a **prerequisite for
reading the firmware images at all**: the Kernel (`0x400000`) and Normal
(`0x410000`) regions sit far above the `0x8000` gate, so without the enable every
read of them is refused and no image can be captured — image capture depends on
first lifting the gate (§11.2). Second, even with the gate lifted, what is
captured is the *running* image in mapped memory, not the persistent flash bytes;
so a capture obtained this way is a runtime reconstruction of the images, not a
proven byte-for-byte copy of what is stored in flash. The gap between those two —
a runtime image versus a guaranteed-restorable flash backup — is one of the open
problems of Chapter 21.

### 12. The firmware update protocol

Firmware installation is driven entirely through the vendor `WRITE BUFFER`
opcode (`3B`), in a fixed sequence of phases distinguished by their mode nibble
and buffer id. This chapter describes the host-visible protocol and the
receiver-side handling that has been traced to Kernel code.

#### 12.1 The phases

The protocol has three logical phases — enter, transfer, finish — with the
transfer phase carrying up to two components (Kernel then Normal). All CDBs are
ten bytes; the 24-bit offset and length are big-endian.

| Phase | Mode / id | CDB (UD04) | Data-out |
|---|---|---|---|
| **Enter update mode** | `04/FF` | `3B 04 FF 00 00 00 00 01 00 00` | 256-byte control buffer |
| **Transfer Kernel** | `07/FE` | `3B 07 FE <off:3> <len:3> 00` | raw Kernel envelope bytes |
| **Transfer Normal** | `07/F0` | `3B 07 F0 <off:3> <len:3> 00` | raw Normal envelope bytes |
| **Finish / commit** | `05/FF` | `3B 05 FF 00 00 00 00 01 00 00` | 256-byte control buffer |

The buffer id on the `07` transfer distinguishes the component: **`FE` selects
the Kernel, `F0` selects the Normal.** The raw envelope bytes are sent verbatim,
with no per-chunk header and no host-side transform applied in the transfer
loop. A drive that carries no Kernel in a given update simply omits the `07/FE`
phase and performs the Normal transfer alone; a Normal-only release is the
common case (§5.3).

#### 12.2 The control buffer and the control word

The 256-byte data-out that accompanies both the enter (`04/FF`) and finish
(`05/FF`) phases is a fixed structure:

```
0x00  16-byte internal model string     (e.g. "PIONEER BDR-US04")
0x10   4-byte control word              (little-endian on the wire)
0x14  236 zero bytes
```

The 16-byte model string is the *internal* model (for UD04 this is
`PIONEER BDR-US04`, distinct from the marketing `BDR-UD04`; for BDR-213 it is
`PIONEER BDR-213T`). The four-byte **control word** at offset `0x10` —
historically called the "kernel-mode-entry key" — is a plain per-model 32-bit
immediate. It is **not** an HMAC, a derivation, or a challenge/response: it is a
constant baked per model, stable across that model's firmware revisions. Observed
values include:

| Model / descriptor | Control word |
|---|---|
| UD04 `GENERAL` | `0xFD236642` |
| BDR-S09 | `0xCE1F2B98` |
| BDR-209D (FW120–FW151) | `0xB7E4F43E` |
| BDR-213T | `0xB60AC2CC` |

The receiver validates the control word against a firmware immediate. In the
UD04 Kernel the comparison is a `CMP.L` against the byte-order form
`0x426623FD` of `0xFD236642`, at the control-validator around `0x44BBC8`,
preceded by a length comparison against `0x100`. Notably an **alternate word is
also accepted**: a prior comparison `CMP.L #0x9A782361,ER0` at `0x44BBB4` (the
on-wire form of `0x6123789A`) branches directly to the same state-setting
continuation, so at least two distinct control words reach the accepted path.
Both accepted words converge on the same continuation, which passes a `1` through
carry into two bits (6 and 7) of a RAM state byte at `0x0144`; a later Kernel
predicate returns "true" only for bit6=1 and bit7=0.

The control word is model-specific, so the same wire bytes that clear the UD04
comparison would not clear another model's; the receiver's acceptance is bound to
its own baked immediate.

#### 12.3 Entry precondition and completion polling

Update-mode entry is conditional on drive state, reported through the `F1`
identity window (§10.2): if bytes `[0x20..0x27]` of the `02/F1` response are
eight ASCII spaces, update mode is already active and entry may be skipped;
otherwise the host issues `04/FF`, re-reads identity, and requires the active
state before transferring. After a successful entry, the standard INQUIRY
response bytes `[0x20..0x23]` read ASCII `000`.

After the final `05/FF`, completion is polled with a rotation of `GET EVENT
STATUS NOTIFICATION`, `TEST UNIT READY`, and conditional `INQUIRY`, using the
returned status and sense to decide whether to continue polling or stop. The
receiver may also cycle power state via `START STOP UNIT` variants
(`1B 00 00 00 20 00`, `1B 00 00 00 00 00`, `1B 00 00 00 02 00`). A pre-transfer
identity/verification pass additionally uses `READ BUFFER` variants `02/F1`,
`01/F2`, `02/F2`, and `02/A0`.

#### 12.4 Transfer schedules

Because a Kernel envelope is `0x11200` bytes and each transfer chunk is capped at
`0x8000` bytes, the Kernel transfer decomposes deterministically. Two schedules
exist across the family.

**Three-write schedule** (front-key generations):

```
07/FE  offset 0x00000  length 0x8000
07/FE  offset 0x08000  length 0x8000
07/FE  offset 0x10000  length 0x1200
```

**Four-stage generated-block schedule** (derived-key generations): the Kernel is
preceded by a `0x1200`-byte `07/F0` prefix, then a generated 512-byte block via
`07/FE`, then `07/FE` body writes of `0x8000`, `0x8000`, and `0x1000` bytes. The
choice of schedule **correlates with the
Kernel envelope layout** — front-key ↔ three-write, derived-key ↔ generated
block — which is the same distinction the Kernel encodes in its `CMP.B #FE/#F0`
instruction pair (§7.3). A transitional three-slice variant appears in some of
the oldest updaters.

The Normal transfer is a straightforward loop of `07/F0` chunks of at most
`0x8000` bytes over the declared image length; for a `0x1D7000`-byte Normal
envelope this is 58 full `0x8000` chunks plus one `0x7000`-byte final chunk (59
transfers total). A short delay (~100 ms) follows each successful chunk.

#### 12.5 Receiver dispatch

Inside the Kernel, the update receiver dispatches on the buffer id of the
incoming `WRITE BUFFER`. The three ids map to three processing phases:

- **`FE` → Kernel reception (phase 0)**
- **`F0` → Normal reception (phase 1)**
- **`FF` → control (phase 2)**

This is the same `FE`/`F0` distinction visible as the adjacent `CMP.B` pair in
derived-key Kernel bodies (§7.3). In a traced SAT8301 receiver, `F0`, `FE`, and
`FF` reach processing phases 1, 0, and 2 respectively; the phase-2 handling
includes a model-marker comparison that classifies plain-looking versus
scrambled payloads and, on mismatch, selects signature validation rather than an
outright rejection, while a matching marker skips the validation step. Both
successful paths then join a common transformation and write-preparation stage.

#### 12.6 Chunk reception and staging

The chunk-receive path reads the CDB's 24-bit offset and length (for UD04 at
`0x402E40..0x402E58`). The **`FE` (Kernel) arm** (`0x402F6E`) adds the CDB offset
to a Kernel **staging base at `0x10200`**, requires 64-byte destination
alignment, resets the accumulated length when the CDB offset is zero, receives
the chunk into the computed address, adds the chunk length to the accumulator,
and invokes a per-chunk callback. No envelope-field interpretation occurs in this
arm — it is a pure staging copy.

The receive destination is resolved through a registered transfer object: startup
registers an object whose vtable entry constructs a 16-byte transport descriptor
from the supplied buffer and length and calls a lower transport routine, which
copies the descriptor into a controller RAM object, programs the destination
buffer address into controller register `0xFC9C`, and computes the transfer
subdivision into registers `0xFCA0`, `0xFF24`, and `0xFF20`. None of these
setup steps dereferences the incoming envelope to inspect its revision, date, or
filename — confirming (with §10.4) that release metadata is neither examined nor
preserved during reception.

#### 12.7 Kernel finalisation

When the Kernel transfer completes, a finalisation arm (`0x404C5C..0x404CFC`
for UD04) applies the acceptance checks:

1. it requires exactly **`0x11200`** accumulated bytes;
2. it treats staging **`+0x200`** as the key and staging **`+0x1200`** as the
   image, passing both to the decoder;
3. it verifies the **zero additive checksum**, summing big-endian words over the
   staged image `[0x1200, 0x11200)` (a fallback checksum routine sums the same
   range);
4. it **optionally compares the entire decoded image against current flash**;
5. it invokes the relocated writer.

The Kernel branch of the payload classifier inspects image offset `+0x1000` for
its signature/identity; it does **not** inspect the envelope's release fields.
This arm therefore contains no release/date/filename preservation step — the
negative finding underpinning §10.4.

#### 12.8 The writers and controller programming

The physical write is performed by relocated writer routines that address the
controller's flash interface directly. The two components target distinct
controller offset ranges:

- the **Kernel writer** targets controller offsets `0x0000..0xFFFF`;
- the **Normal writer** targets `0x10000 + offset`.

These are controller **target** offsets, distinct from the runtime mapping
addresses `0x400000`/`0x410000` at which the components are read. At startup the
low writer is relocated from `0x4004C8..0x400900` into RAM at `0x0190` (so, for
example, relocated address `0x03E2` corresponds to `0x40071A`). The write
routine (reached via the relocated code) issues **program opcode `0x02`** to
controller register `0xFF3F1000` and sends address bytes to
`0xFF3F1010..0xFF3F1012`.

The Kernel commit's data loop (`0x400ABC..0x400AE2`, reached from the commit
preparation at `0x404FF8` selecting the relocated writer `0x400A60..0x400B0A`)
reads its source from `staging_base + 0x1200 + offset` in `0x100`-byte chunks for
exactly `0x10000` bytes. The image thus starts *after* the envelope header and
key table, neither of which enters the write loop — which is the mechanism behind
the non-persistence of the release label (§10.4).

---

## Part IV — Boot, compatibility, and versioning

### 13. The boot-time validation contract

Before the Kernel transfers control to the Normal, it validates that the two
components belong together. This "boot contract" is a sequence of gates in the
Kernel's startup path; the reference trace is the UD04 Kernel, with the
generation-dependent variations noted.

#### 13.1 The gates

Three checks run in sequence in the UD04 Kernel startup at `0x4001C0` onward:

1. **Model identity (`0x4001C0..0x4001E0`).** Sixteen bytes at Normal address
   `0x410000` are compared byte-for-byte against a Kernel constant at
   `0x40644E`. The value is the internal model string `PIONEER BDR-US04`. A
   mismatch calls the error path at `0x400258`.
2. **General-tag equality (`0x4001E4..0x400210`).** Eight bytes at Normal
   `0x410018` are compared against Kernel `0x401008`; both are `GENERAL `. A
   mismatch likewise diverts to `0x400258`. This is a **tag-equality** test, not
   a revision-ordering test.
3. **Capacity (`0x400222..0x40024C`).** The Normal's declared length at
   `0x410014` is loaded, an address ceiling of `0x5DFFFF` or `0x7CFFFF` is
   selected from another routine's result, the Normal base is subtracted, and
   the length is checked against that capacity. This path is **conditional**: a
   test of RAM `0x0144` bit 5 at `0x400214` skips the capacity check entirely
   when the bit is clear. The numeric comparison is a size bound and must not be
   mistaken for a version comparison.

The mismatch continuation at `0x400258`/`0x405222` prepares a region at
`0xA00000..0xA00C0E`, calls further routines, and jumps into a recovery/transport
path whose full meaning is a remaining trace target — i.e. an identity or tag
mismatch is handled, not silently ignored.

#### 13.2 The startup marker comparison (newer firmware)

Newer firmware adds a further startup gate that older firmware lacks, and it is
central to Chapter 15. At `0x400212..0x400222` the startup compares the Normal
byte at `0x410028` against the Kernel byte at `0x4000FE` (the "marker"; see
§15.1). On **mismatch** it calls an initialisation routine at `0x40026A`, runs
initialisation, and jumps to `0x4057DE`, printing `----- Kernel Power ON -----`
and entering a processing loop that waits on RAM `0x014D` and invokes RAM
`0x2800`. On **equality** it continues to the ordinary checks of §13.1. Older
Kernels (UD04 1.00, S09 SAT8600 ID43 1.54) do **not** contain this marker
equality block between their type and size checks.

#### 13.3 The runtime import contract

Passing the boot gates is necessary but not sufficient for a Normal to run: it
must also match the Kernel's **export ABI**. As described in §5.2, the Normal
imports Kernel service slots `0x400A00..0x400A5C` through a fixed run of wrapper
calls. A census of decoded Normal images finds three distinct import target sets
across generations; among co-shipped pairs with recognised import/export runs,
all show complete slot coverage. This import surface, together with the
generation-dependent Normal entry address (`0x412000` / `0x410028` / `0x410014`,
§5.2), constitutes an interface contract between the two components that is
independent of, and additional to, the header-identity gates.

### 14. Pairing and cross-model compatibility

A firmware release supplies a Kernel and a Normal as a **co-shipped pair**. This
chapter states what makes a pair valid, what the drive actually enforces, and the
corpus evidence for the pairing rules.

#### 14.1 The co-shipped pairing invariants

Across the corpus of unambiguous co-shipped pairs, the following identity fields
match within a pair: hardware (`SAT`), embedded model / full identity, file type,
Destination, and Kernel Version2. In a census of 170 unambiguous distinct
co-shipped pairs, **all 170** matched on hardware, embedded model/full identity,
type, Destination, and Version2; **169** also shared the advertised release
revision, the sole exception being the Kernel-1.00/Normal-1.14 UD04 pair where
the Kernel legitimately lags. Equal metadata is thus a *necessary observed
pattern* within a genuine pair — but it is not a *sufficient* rule for declaring
two independently chosen components compatible.

#### 14.2 What the drive enforces versus what merely correlates

The distinction between enforced and correlated compatibility is the crux of the
whole compatibility question.

- **Enforced at boot:** model identity and General-tag equality (§13.1), and —
  on newer firmware — the marker relationship (§13.2). A Normal whose embedded
  model or type tag does not match the Kernel is rejected by the boot contract.
  For example BDR-208M and BDR-208D share the same internal boot-family identity
  but carry *different* type tags, so the type comparison rejects a crossed
  Normal between them.
- **Correlated but not proven enforced:** the advertised release revision, and
  the exact Kernel-Version2 relationship. Kernel Version2 is treated as a
  component-compatibility field — a matching Version2 is part of what defines a
  co-shipped pair — but no receiver code has been shown to *enforce* a Version2
  or revision-ordering comparison as a precondition of installation.

#### 14.3 Decoded-body sharing across models

The decoded Kernel *bodies* reveal how Pioneer factored the firmware across
models. Two facts stand out:

- **Bodies are shared across marketing aliases but not across embedded models.**
  A single decoded Kernel body hash appears under several *public* model names —
  for instance one body appears under BDR-208, BDR-208M, and BDR-208XJ — but no
  decoded Kernel body spans two distinct *embedded* header models. In a census of
  89 distinct decoded Kernel bodies across 66 catalogue model labels, 23 body
  hashes occurred under multiple labels, always within one embedded
  model/hardware line. Marketing-name equality is therefore not a licence to
  interchange; embedded identity and type are what matter.
- **Near-identical bodies differ only in data, not code.** Pairs of decoded
  Kernels from different models can exceed 95% byte identity while differing by
  fewer than 32 bytes. In a study of 120 such cross-model pairs across 12
  hardware labels, 114 differed only in three places: the boot-type ASCII at
  image `0x1008`, the checksum-compensation word at `0x1020`, and the 24-byte
  commercial identity string; three further pairs additionally changed one
  executable immediate at `0x40B8FC` (`0x3700` versus `0x36E0`, purpose
  unresolved). This is strong evidence of **shared executable implementations
  parameterised by model/type data** — the same code, stamped with different
  identity and its compensating checksum.

Even cross-*hardware* comparisons show this pattern: among 94 decoded bodies on
34 hardware labels, 43 pairs exceeded 95% identity, the closest (SAT8D31/ID05 vs
SAT8E21/ID05) differing in only seven bytes — all accounted for by
hardware/model/diagnostic text and checksum compensation, with the same boot
identity `PIONEER BDR-BDS7` and the same `ID05` type. Hardware-label inequality
does not by itself imply different executable code.

#### 14.4 The checksum is not a substitution barrier

Because every decoded Kernel independently sums to zero as big-endian 32-bit
words (§8.1), **replacing one complete zero-sum Kernel span with another zero-sum
span does not change a combined Kernel+Normal additive sum**. The additive
checksum that some boot paths compute over the two components together is
therefore not, by itself, an obstacle to substituting one Kernel for another of
the same summing property. The remaining obstacles are the identity/type gates
(§13.1) and the import-ABI contract (§13.3), not the checksum.

#### 14.5 Pair recovery by date

Given a Normal and a pool of Kernels sharing its hardware and type, the correct
co-shipped Kernel is recovered by a simple rule: **take the newest Kernel whose
advertised date is not later than the Normal's date.** Across 170 known original
pairings this rule recovers the exact original Kernel uniquely in **170/170**,
with no ties; adding Kernel-Version2 to the match key gives the same result.
Weaker rules do worse — "newest overall" recovers only 89/170 on hardware+type,
and type-only-with-date-cutoff yields 56 ties — establishing that **hardware is
material** to the query. This is a recovery rule for *known* pairings; it is not
a proof of compatibility for arbitrary unseen combinations, and later-dated
Kernels are excluded from it rather than proven incompatible.

### 15. The generation marker and downgrade

Firmware downgrade — installing an older revision over a newer one — turns on a
single byte in the decoded Kernel body and the receiver logic that inspects it.
This chapter describes that byte, the two code sites that gate on it, the
transform that enables a downgrade, and the boundaries of what the transform
establishes.

#### 15.1 The marker byte and its chronology

The decoded Kernel body carries a **generation / "incoming" marker at body offset
`0xFE`** (runtime address `0x4000FE`). Two values dominate, split cleanly by era:

- **`01`** — newer Kernels. All 91 decoded `01`-marker Kernels in a corpus census
  carry advertised dates from 2022-12-12 through 2024-10-09.
- **`FF`** — older Kernels. The 78 decoded `FF`-marker Kernels carry dates from
  2003-08-01 through 2022-05-31.

The transition is visible *within* hardware/type lines as firmware advances: S09
`1.54→1.55`, S11 `1.53→1.54`, XD05 ID34 `3.10→3.11`, and XD07U ID05 `1.04→1.05`
all flip `FF→01`. A handful of other raw `0xFE`-position values occur in
individual older or undecoded images (`00`, `0C`, `0D`, `18`, `55`); these are
not established as named generation classes and should be retained as raw
observations rather than interpreted.

The marker is **not** a copy of the advertised release number or of Kernel
Version2. All five held `SAT 9201` Kernels carry marker `01` but Version2 `0000`
across releases 1.04/1.05 and IDs 43/58/72 — so the marker is a coarse
*generation* indicator, not a literal version. The date ranges above are observed
spans, not proven global release boundaries.

#### 15.2 The two gate sites

Two distinct code sites read the marker, and distinguishing them is essential.

**Site 1 — the incoming-marker gate (newer receiver).** When a newer drive
*receives* a Kernel update, the receiver reads the *incoming* Kernel's marker
from the receive buffer. In the S13 1.05 receiver this is at `0x405266`, reading
receive-buffer + `0x12FE` (i.e. decoded body offset `0xFE` at the `0x1200`
staging image base). Its ordinary predicate **returns rejection for `FF` or
`00`, and success otherwise**; the caller at `0x404D42` branches to the error
path `0x404D8A` on rejection. The gate therefore rejects the two specific values
`FF` and `00` — it does **not** require exactly `01`. (A conditional exception
involving receiver state and installed Normal length remains partly untraced.)

**Site 2 — the startup equality (newer firmware).** As in §13.2, newer firmware
compares the Normal byte at `0x410028` against the installed Kernel marker at
`0x4000FE` during startup; mismatch diverts to the `Kernel Power ON` service
path. This is a *separate* predicate from the incoming gate, operating at boot on
the already-installed pair rather than on an incoming envelope.

Older receivers contain neither predicate. Direct traces of older UD04/S09
startup code lack the equality block, and the S09 line brackets the change
precisely: S09 1.55 contains the newer signatures, S09 1.54 does not. No older
receiver that *requires* an incoming `FF` has been demonstrated; equally, absence
of the exact newer signatures in an old image does not prove it performs no
equivalent check.

The four exact instruction signatures of the newer generation (startup equality,
`FF`/`00` rejection, and the two incoming-marker lookups) co-occur: in a corpus
scan they appear together in 91 Kernel envelopes across 26 hardware labels, **all
91 of which carry marker `01`**, and in **none** of the 78 decoded `FF`-marker
envelopes. This supports a genuine *generation barrier* implemented by the newer
receiver, not a literal release-number or Version2 mapping.

#### 15.3 The downgrade transform

A newer drive refuses an older Kernel because that older Kernel carries marker
`FF`, which Site 1 rejects. A downgrade therefore requires editing the *incoming*
(older) Kernel so that it passes the gate, while keeping the image otherwise
valid. The transform, applied to the target Kernel's **decoded** body, is:

1. **Flip the marker.** Change decoded body offset `0xFE` from `FF` to `01`.
2. **Compensate the checksum.** Because one big-endian-word position changed, the
   zero additive sum (§8.1) is disturbed; restore it by adding **`0xFE00`**
   (mod 2³²) to the big-endian balance word at decoded offset **`0x1020`**. (The
   `0xFE00` follows from the byte change `0xFF→0x01` in its word position.)
3. **Re-encode.** Re-apply the LCG word transform (§7.2) using the *original* key
   table; only the two edited words differ in ciphertext.
4. **Transfer.** Stream the edited Kernel via the `07/FE` schedule (§12.4), then
   the target Normal via `07/F0`, with entry and finish as usual. The finish
   commit carries the source-personality control buffer: the 16-byte internal
   model string, the source control word, and 236 zero bytes.

The edit makes the older Kernel acceptable to a newer receiver's Site-1 gate. The
transform is deterministic: flipping `0xFE` and compensating `0x1020` yields a
single well-defined patched image and, after re-encoding, a single well-defined
envelope for a given target Kernel. The same marker/checksum operation applies
across an adaptation set spanning UD04, the SAT8800/8801 211M targets, S12U, and
XD07U, with the S13/213 family using the same operation within its own multi-stage
transaction.

#### 15.4 Boundaries and the restoration question

Two boundaries must be stated plainly.

First, **the transform addresses the incoming gate, not every check.** It makes
an older Kernel pass Site 1; it does not by itself satisfy the identity/type
gates (§13.1), the import-ABI contract (§13.3), or any per-image bounds. A
downgrade is a *compatible-pair* operation with the marker edit layered on top,
not a licence to install arbitrary firmware.

Second, **the end state after a downgrade is not fully established.** Whether the
drive, once running the marker-edited older pair, then behaves as the older
firmware depends on the *old* Kernel's own startup behaviour — and the older
Kernel lacks the Site-2 startup equality block, so changing an old Kernel's
marker does not, on the available evidence, force it into a service mode. A
completion trace of a representative downgrade transaction shows the host sending
the source-personality commit, polling for completion, treating certain sense
combinations as authentication refusal or restart evidence, reacquiring the
drive, and verifying the target-Normal identity twice — but with **no subsequent
Kernel transfer or marker-reset command**. The host therefore leaves the
marker-edited Kernel installed unless the drive itself changes it; whether the
drive ultimately runs cleanly, and whether the *original* older marker ought to
be restored for a genuine OEM state, is a design objective rather than a settled
mechanism (Chapter 21).

### 16. Release packages versus complete flash state

A firmware release package is evidence for **which envelopes that release
supplies**, not a snapshot of every region resident on a drive. Across releases
the shipped set varies: many carry one Normal only; others carry a Normal plus a
Kernel; a few carry two hardware-variant Normals; and older drives may carry only
the legacy `Plane` role. In one census of 456 source-matched release bundles, 248
carried exactly one Normal, 140 carried at least one Kernel, six carried two
Normals but no Kernel, and 62 carried only the older Plane role. **Normal-only
releases are genuine omissions** — the drive retains its installed Kernel — not
evidence of a hidden or algorithmically generated Kernel: an exhaustive
same-layer search of Normal-only sources found no concealed Kernel resource at
any nesting layer, and every firmware-sized resource matched an already-extracted
Normal.

A *complete flash state* — the explicit Kernel-and-Normal pair actually written,
including for a downgrade or cross-flash — is therefore a **derived** artifact,
distinct from any single release package. When a release provides only a Normal, a
Kernel candidate from a prior release may be proposed only after matching hardware
identity, model/controller family, and type, with the date rule of §14.5
selecting among candidates; equal revision numbers alone do not establish a valid
pairing, and multiple candidates or none must remain unresolved rather than
silently guessed. The pairing invariants of Chapter 14 are precisely the
constraints such a derived complete-state package must honour.

---

## Part V — Legacy families

The modern H8SX/SAT envelope described in Parts II–IV is not universal. The older
DVR- and BDC-series drives, and the earliest SAT drives, use related but distinct
body layouts, checksums, and — where known — validation policies. These families
are decodable to varying degrees; several remain only partially characterised.
This part records what is established about them, precisely because a
whole-format description must not silently over-generalise the modern rules.

### 17. Scaled-key SAT100x and BDC layouts

The earliest SAT drives (`SAT1003`, `SAT1005`, `SAT1014`, `SAT1030`, `SAT1050`)
and the related BDC/Optiarc mechanisms use the same LCG word transform (§7.2) but
a **scaled** key geometry rather than the fixed `0x1000`-byte Kernel key or the
`0x10000`-key Normal.

For the scaled-key Normal the key length is **one sixteenth of the payload
length**. The BDC-S02 1.07EU envelope is the worked example: its receiver
requires a total Normal size of `0x1CB200`, decodes a `0x1B0000`-byte image, and
places the payload at envelope offset `0x1B200` (header `0x200` + key `0x1B000`),
with `0x1B000 = 0x1B0000 / 16`. The decoder is invoked with an explicit
image/key address pair rather than the modern fixed offsets:

```
BDC-S02 receiver (0x4037C6):  total size          = 0x1CB200
                              decoded image length = 0x1B0000
                              staging address      = 0x2B400
                              key base             = 0x10400
                              payload at envelope offset 0x1B200
```

Two properties distinguish this family from the modern one. First, **validation is
by additive checksum, not ECDSA**: the older completion arm sums the decoded
payload and branches on the sum before writing, with no header-signature operands
supplied. The `0x170–0x1BF` block is not interpreted as a signature on these
receivers. Second, **raw offset `0x14` is code, not a declared-size field**: an
offline sample transform at the scaled offset yields the model banner (e.g.
`PIONEER  BDR-102`), and the position that in a modern image holds the declared
size instead holds executable bytes. The identity tag is a `PIO_ADV`-style value,
not an `IDxx` destination, and the OEM filename mapping (which uses code `43`) is
not recoverable from a single sample.

The writer confirms the geometry independently: the BDC-S02 writer (`0x409100`)
loads destination `0x410000`, erases up to `0x5C0000` in `0x10000` increments,
and (`0x40911C`) writes `0x1B00` iterations of `0x100` bytes from source
`0x2B400` (staging `0x10200` + header `0x200` + key `0x1B000`) — agreeing with
the decoder's `0x1B0000` image length. The old image's *missing* modern
declared-length field is thus a parsing consideration, not evidence that the image
resides at a different base.

The SAT100x receivers differ among themselves in validation policy: SAT1005 and
SAT1014 accept an **unsigned** body (80 zero bytes at `0x170–0x1BF`) via an
explicit receiver path, while SAT1030 and SAT1050 use the **modern ECDSA curve**.
The Kernel decoder arguments for SAT1005/1014/1030/1050 select length `0x10000`,
key address `0x10400`, and payload address `0x11400` (staging base `0x10200`
gives envelope key `0x200`, payload `0x1200`); the signed SAT1030/1050 variants
additionally pass a validation pointer (e.g. `0xA10370`) into a validator before
decoding, whereas the unsigned SAT1005/1014 pass none.

### 18. Legacy little-endian DVR Kernels (ATA0006 family)

The DVR-era 64 KiB Kernels (identities `ATA0006`, `ATA0007`, `ATA0008`; e.g.
DVR-106) use a differently framed but algorithmically related codec:

```
0x00000  header/text
0x00200  0xFF fill
0x09000  key table          0x0500
0x09500  0xFF fill
0x0B000  encrypted body     0x5000
0x10000  (end)
```

The transform is the **same** XOR-and-rotate on little-endian 32-bit words as the
modern codec (§7.2): for each ciphertext word, XOR with the corresponding
little-endian key word (the `0x500`-byte table repeating), then rotate right by
the low five bits of that key word. The decoded image carries the DVR-106 model
banner and the ATA0006 identity, and satisfies a **little-endian** zero-sum
checksum: its first little-endian word (`0x761851CA` for the sample) added to the
wrapping little-endian sum of decoded offsets `0x1000..0x5000` yields exactly
zero, with the `0x4..0x1000` `0xFF` padding excluded from the sum. This same
unique geometry appears across all nine distinct 64 KiB ATA0006/0007/0008
Kernels; all nine decode with padding, checksum, Pioneer-identity, and
byte-exact inverse-transform consistency.

The five 1 MiB and other early ATA/SCSI Kernels do **not** match that encrypted
framing. The four ATA0004 files carry visible identity strings and code-like bytes
beginning at file offset `0xC000`, with all bytes after `0x10000` erased to `0xFF`
and first-instruction sequences matching those recovered from the ATA0006
transform. The SCSI0001 file has non-erased blocks at `0x8000..0xDE00` and
`0xFF00..0x10000`, carrying DVR-S301/DVR-303 identity strings. These are
file-relative observations; the CPU instruction set of these earliest images and
their live flash addresses are not identified.

### 19. The sparse 128 KiB legacy layout

A distinct sparse layout appears in the 35 distinct 128 KiB samples of the
ATA0009/0010/0011/0064/0068/0070 families:

```
0x00000  text/header            0x200
0x00200  0xFF fill              through 0x8000
0x08000  LE32 checksum word     additive inverse of the LE32 sum over 0x10000..0x20000
0x08004  0xFF fill              through 0x10000
0x10000  data                   through 0x20000
```

The `0x8000` word is the additive inverse of the wrapping little-endian sum over
`0x10000..0x20000`, making that region's checked sum vanish. This wrapper is
shared by **both** Kernel and Normal roles: in a survey of 124 older ATA/SCSI
Normal envelopes, 56 exhibited the exact erased gaps plus the zero wrapping
checksum (ATA0009/0010/0011/0012/0064/0068/0070/0412/0812). Whether the final
64 KiB is itself transformed, and whether a drive read returns those bytes, is
not established for this family; probing for a lane/rotation/bit-permutation
transform on ATA0009 found no Pioneer identity markers, and absence of markers
does not by itself establish encryption. The DVR-109 `R9100009.158` Kernel is a
further distinct case at exactly `0x20000` bytes including its text header —
structurally unlike the `0x11200` SAT wrappers.

### 20. Taxonomy of body layouts

The following table consolidates the body layouts across the whole family, from
the modern signed SAT envelopes to the earliest DVR images. "Validation" is the
integrity mechanism the receiver applies; "status" reflects how completely the
layout is characterised.

| Family / identity | Component | Body layout | Key | Validation | Status |
|---|---|---|---|---|---|
| Modern SAT (front-key) | Kernel | header, key `0x200`, body `0x1200` (`0x11200` total) | explicit `0x1000` | ECDSA `0x200..EOF` | fully decoded |
| Modern SAT (derived-key) | Kernel | header, body `0x200`, trailer `0x10200` (`0x11200` total) | derived from trailer | ECDSA `0x10200..EOF` | fully decoded |
| Modern SAT | Normal | header, key, payload at key+`0x10000` | `0x10000` (fixed) | ECDSA + BE32 zero-sum | fully decoded |
| SAT1005 / SAT1014 | Kernel/Normal | scaled geometry, payload at key+scaled | scaled | unsigned (zero block) + checksum | decoded; older rules |
| SAT1030 / SAT1050 | Kernel/Normal | scaled geometry | scaled | modern ECDSA + checksum | decoded; older rules |
| SAT1003 / BDC-S02 | Normal | key = payload/16, payload at `0x1B200` | payload/16 | BE32 checksum only | decoded; distinct identity |
| ATA0006/0007/0008 (DVR-106) | Kernel | 64 KiB, key `0x9000`, body `0xB000` | `0x500` | LE zero-sum | decoded |
| ATA0009…/128 KiB sparse | Kernel/Normal | header, FF gaps, checksum `0x8000`, data `0x10000` | — | LE wrapping zero-sum | partially decoded |
| ATA0004 / SCSI0001 (earliest DVR) | Kernel | visible identity + code from `0xC000`/`0x8000` | — | unknown | undecoded ISA |

Of a broad census of ~175 distinct Kernel envelopes, roughly 121–130 decode under
the recognised modern and scaled codecs, while ~45–49 (the ATA0004/0007/0008/
0009/0010/0011/0064/0068/0070 and SCSI0001 groups) remain outside the proven
codecs. Their being "undecoded" is a limit of characterisation, not evidence that
the images are corrupt.

> **A note on the population counts used throughout this document.** The
> corpus figures cited here and in Chapters 7, 14, and 15 come from several
> snapshots of the archived firmware population taken as it grew (on the order
> of 170, 175, and 237 distinct Kernel envelopes), and they count different
> things — *distinct envelopes* (e.g. the 63/58 front/derived-key split),
> *distinct decoded bodies* (e.g. 89–94, since one body ships under several
> envelopes), and *co-shipped pairs* (e.g. 170). The marker census of §15.1
> (91 `01` + 78 `FF` = 169 decoded Kernels) is drawn from the largest snapshot,
> in which ~185 of 237 envelopes decode, and is therefore consistent with the
> "121–130 decode" figure above, which is from a smaller earlier snapshot. The
> figures are best read as orders of magnitude and proportions, not as a single
> reconciled ledger.

---

## Part VI — Synthesis

### 21. Open problems

The description above is deliberately conservative: where the firmware's
behaviour has not been traced to code or observed on a drive, it is deferred here
rather than asserted. The following are the material open problems, roughly in
order of how load-bearing they are.

1. **Signature trust policy (the central question).** The Kernel supplies the
   header's public point into the hardware validation engine at `0xFF3FF000`
   before decoding, but it has **not** been established whether the engine accepts
   the supplied point as-is or checks it against a stored, trusted value. The two
   possibilities have opposite consequences: if the point is accepted as
   supplied, a freshly generated key pair could sign a new body that the drive
   would accept; if it is pinned, only the genuine OEM private key — or a
   different validated receiver path — could produce an acceptable envelope. The
   bounded software trace shows the Kernel loading the point and checking a
   hardware status bit, with no *software* equality test against a fixed point,
   but hardware key pinning or an earlier gate remains possible. This is the
   single most consequential unknown in the entire format.

2. **Modified-image acceptance.** No receiver rule has been traced that decides
   whether an arbitrarily resized or content-edited (but correctly checksummed
   and, where required, re-signed) envelope is accepted. The host update loop
   applies no body transform and loops over a variable length, and the offline
   codec round-trips edited images exactly, but drive-side acceptance of a
   non-OEM image is unproven. The complete acceptance path — every gate from
   `04/FF` entry through `05/FF` commit, including the transitive callees of the
   control-word validator — is not fully mapped.

3. **Restorable backup and the persistent store.** The `02/B0` memory-read window exposes
   a post-boot runtime view, not the persistent update store; the symmetric
   `3C 04 FF` read is refused, and the envelope banner is absent from any runtime
   capture. No verified command reads back the exact on-flash Kernel/Normal
   bytes, and no per-unit personalisation boundary has been mapped. Whether a
   captured runtime image plus a re-signed envelope constitutes a byte-restorable
   backup is therefore unproven.

4. **The hardware validation engine.** The exact operation of the engine at
   `0xFF3FF000`, its use of the SHA-1 stage (whose initial words the Kernel
   loads), and the generation of the 40 changing header bytes are not fully
   traced. The independent SHA-256 K schedule at `0x59D474` implies a SHA-256
   implementation whose consumer has not been tied to the update or content path.

5. **The extended-read enable semantics.** Whether the drive actually checks the
   `0xA5AAAA` offset in the enable command, or ignores it (comparing only that
   the low length word is zero and the permission bit is clear), is not settled;
   the newer handler checks `offset == A5AAAA`, but whether an arbitrary offset
   also enables the read on all generations is untested. The precise partition
   between the always-readable low range and the gated high range has not been
   mapped exhaustively.

6. **Alternate and multiple control words.** At least two control words reach the
   accepted entry path (§12.2), and several models circulate with more than one
   control word (e.g. `PIONEER  BDR-208` and `PIONEER BDR-212T` each with
   multiple keys). No envelope field has been shown to select which word a given
   receiver requires, so a bare pair of `.enc` files cannot unambiguously
   determine the control word from the envelopes alone.

7. **Downgrade end state and restoration.** Whether a marker-edited older Kernel,
   once installed on a newer drive, boots cleanly as the older firmware — and
   whether the *original* older marker should be restored for a genuine OEM state
   — is not established. The old receiver's acceptance, its required control
   identity, its Kernel-only transfer/commit behaviour, and the final cold-boot
   readback are all open.

8. **The 236-byte control-buffer tail.** Only the 16-byte model string and the
   4-byte control word are established as meaningful in the 256-byte control
   buffer; whether the trailing 236 zero bytes are ignored by the receiver is not
   proven.

9. **The earliest DVR/BDC families.** The undecoded ATA0004/SCSI0001-class
   images (Part V) have no identified CPU instruction set, live flash map, or
   receiver validation routine. The 128 KiB sparse family is decodable as a
   checksum wrapper but its final-region transform (if any) is uncharacterised.

### 22. Summary

Pioneer's H8SX-generation firmware is a two-component system — a small,
slow-changing **Kernel** that boots the drive and hosts the update receiver, and
a large **Normal** application image that depends on the Kernel's exported
services at runtime. Both are distributed as `0x200`-header **envelopes** whose
bodies are protected by a reversible Microsoft-LCG keystream with a per-word
XOR-and-rotate, made tamper-evident by a big-endian zero-sum checksum and, on
modern generations, an ECDSA-over-SHA-1 signature on a single fixed 160-bit prime
curve carried in the header. Installation is a fixed `WRITE BUFFER` state machine
— `04/FF` enter, `07/FE` Kernel and `07/F0` Normal transfer, `05/FF` commit —
gated by a per-model 32-bit control word and, on newer drives, by a one-byte
generation marker at Kernel body offset `0xFE` whose `FF→01` transition defines
the barrier that downgrades must cross. At boot the Kernel enforces model and tag
identity against the Normal, and across the corpus the executable bodies are
shared across marketing aliases while remaining strictly partitioned by embedded
model and type. What remains open is almost entirely on the drive's *trust* side:
whether the signature's public key is pinned, whether non-OEM images are
accepted, and whether the persistent store can be read back for a true backup —
the questions on which any move from reading the firmware to safely rewriting it
ultimately depends.

---

## Appendices

## Appendix A — Envelope header map

```
0x000  ┌──────────────────────────────────────────────┐
       │ Banner: "********  Copyright(c) 2000          │  96 B, fixed,
       │ Pioneer Corporation  ********"                │  corpus-invariant
0x060  ├──────────────────────────────────────────────┤
       │ Eight labelled identity/release fields:       │
       │   0x60  Model             0x90  Revision      │  256 B
       │   0xB0  Hardware (SAT)    0xD0  Kernel Version│  (highly stable
       │   0xF0  Destination       0x110 File Type     │   across corpus)
       │   0x130 Generated Date    0x150 Kernel Ver2   │
0x160  ├──────────────────────────────────────────────┤
       │ Opaque (16 B; zero on some generations)       │
0x170  ├──────────────────────────────────────────────┤
       │ Validation block (80 B):                      │
       │   0x170  r   (20 B)    0x184  s   (20 B)      │  ECDSA (r,s)
       │   0x198  Qx  (20 B)    0x1AC  Qy  (20 B)      │  public point Q
       │   (all-zero on unsigned older generations)    │
0x1C0  ├──────────────────────────────────────────────┤
       │ Extension (48 B, generation-dependent)        │
0x1F0  ├──────────────────────────────────────────────┤
       │ Embedded filename (16 B, e.g. S8A10001.114)   │  incl. dot-version
0x200  └──────────────────────────────────────────────┘  body begins
```

## Appendix B — Vendor CDB catalogue

All CDBs are 10 bytes; 24-bit offsets and lengths are big-endian.

| Purpose | CDB | Data |
|---|---|---|
| Vendor identity | `3C 02 F1 00 00 00 00 00 30 00` | in: 48 B identity block |
| Memory read (gated) | `3C 02 B0 <off3> <len3> 00` | in: ≤4096 B (164 B safe) |
| Extended-read enable | `3B 02 41 A5 AA AA 00 00 00 00` | (none) |
| Enter update mode | `3B 04 FF 00 00 00 00 01 00 00` | out: 256 B control |
| Transfer Kernel chunk | `3B 07 FE <off3> <len3> 00` | out: raw envelope bytes |
| Transfer Normal chunk | `3B 07 F0 <off3> <len3> 00` | out: raw envelope bytes |
| Finish / commit | `3B 05 FF 00 00 00 00 01 00 00` | out: 256 B control |
| Completion polling | `4A …` GES, `00 …` TUR, `12 …` INQUIRY | — |
| Power-state cycling | `1B 00 00 00 {20,00,02} 00` | — |

Refusal of a gated read before the enable: sense `key=0x5 ASC=0x24 ASCQ=0x00`
(ILLEGAL REQUEST / INVALID FIELD IN CDB). High address ceiling for `02/B0`:
`0x880300`.

## Appendix C — Constants and algorithms

```
Body keystream (Microsoft C-runtime LCG, 24-bit state):
    state ← (state · 214013 + 2531011) mod 2^24        A=0x343FD, C=0x269EC3
    key_byte ← (state >> 16) & 0xFF
    inverse multiplier A⁻¹ = 0x00B33155   (for backward rolling / derived key)

Word transform (little-endian 32-bit words):
    decode: p = ROR32(c XOR k, k & 0x1F)
    encode: c = ROL32(p, k & 0x1F) XOR k
    reverse-rotation variant: BDR-WX01DM only

Additive checksum:
    Σ (big-endian 32-bit words of decoded image) ≡ 0  (mod 2^32)
    compensation word: Normal image +0x10 ; Kernel image ~0x1020

ECDSA signature (modern generations):
    curve  y² = x³ + ax + b (mod p), 160-bit prime field
      p = e14639330258ef519cfe5fc1ad99284502874d2b
      a = 48fa0f23b610f399a80fbc0abe9cecd73c5d1e12
      b = 2794e57cf726ec2b17ff8ef71016038776faac60
      n = e14639330258ef519cfc7f76cbc2926029906bb5     (prime order)
      G = (75a35b281dee9b185654896f6d60b18d9ff954dc,
           b2c7fbc50a2e8b4b1a8a38577058ba4a005b6208)
    digest = SHA-1 over signed range (0x200..EOF front-key ; 0x10200..EOF derived)
    header layout: 0x170 r | 0x184 s | 0x198 Qx | 0x1AC Qy   (each 20 B, big-endian)
    validation performed via hardware engine at 0xFF3FF000

Sizes:
    Kernel envelope 0x11200 ; decoded Kernel body 0x10000
    Kernel staging base 0x10200 ; key staging +0x200 ; image staging +0x1200
    transfer chunk cap 0x8000

Update control buffer (256 B, data-out for 04/FF and 05/FF):
    0x00  16-B internal model string
    0x10   4-B control word (LE on wire)
    0x14  236 zero bytes
  example control words:
    UD04 GENERAL 0xFD236642 · S09 0xCE1F2B98 · 209D 0xB7E4F43E · 213T 0xB60AC2CC
    UD04 alternate accepted word 0x6123789A (wire CMP form 0x9A782361)

Generation marker:
    decoded Kernel body offset 0xFE : 01 (newer, 2022-12+) / FF (older, ≤2022-05)
    newer receiver incoming gate rejects FF and 00 (does not require exactly 01)
    startup equality compares Normal 0x410028 vs Kernel 0x4000FE (newer only)
    downgrade: 0xFE FF→01, then +0xFE00 to BE word at 0x1020, re-encode, stream

Controller flash programming:
    program opcode 0x02 → register 0xFF3F1000 ; address bytes → 0xFF3F1010..12
    Kernel writer target offsets 0..0xFFFF ; Normal writer 0x10000+offset

Runtime landmarks (UD04 SAT 8A10):
    Kernel 0x400000..0x40FFFF ; Normal 0x410000..
    identity 0x59BB4E ; SHA-256 K schedule 0x59D474 ; factory footer 0x5FFFF8
```

## Appendix D — Embedded filename convention

The 12-character embedded filename at envelope offset `0x1F0` follows a
deterministic scheme for the modern (SAT-generation) envelopes:

```
S  +  <4-char SAT hardware suffix>  +  <2-char destination>  +  <role>  .  <revision without dot>
```

where the 2-char destination is `00` for `GENERAL` (otherwise the two characters
after `ID`), and the role digit is `0` for Kernel, `1` for Normal. Worked
examples: UD04/`SAT 8A10` Normal 1.14 → `S8A10001.114`; BDR-208/`SAT 8301`
`GENERAL` 1.50 → `S8301001.150`; `ID81` 1.51 → the `81` destination form. The
field is a strong candidate for the original resource basename but is **not** a
unique storage key by itself: two distinct BDR-XD04 1.30 files both claim
`S8130001.130` while differing in content. Older DVR formats do not follow the
`0`/`1` role-suffix pattern universally.

## Appendix E — Glossary

- **Kernel** — the 64 KiB boot/receiver/services firmware component; hosts the
  update receiver and the low-level flash writers; occupies `0x400000` at
  runtime. Distinct from the *AzHI2000/3 microkernel* (an RTOS layer).
- **Normal** — the large application firmware component ("main"/"General");
  depends on the Kernel's exported service slots; occupies `0x410000` at runtime.
- **Plane** — a legacy component role on older DVR/BDC drives.
- **Envelope** — the distributed component file: `0x200`-byte header + encoded
  body.
- **Front-key / derived-key** — the two Kernel body layouts (§7.3): an explicit
  leading key table, versus a key reconstructed from a trailing keystream slice.
- **Scaled-key** — the older SAT100x/BDC layout whose key length is a fixed
  fraction (one sixteenth) of the payload.
- **Control word** — the per-model 32-bit immediate in the update control buffer
  gating entry into update mode; historically the "kernel-mode-entry key".
- **Marker byte** — the decoded Kernel byte at offset `0xFE`; the generation gate
  (`01` newer / `FF` older) on which downgrade turns.
- **Hardware / SAT code** — the platform identifier (`SAT 8A10`, `SAT 9201`, …)
  reported in the `F1` identity block and carried in the `0xB0` header field.
- **Kernel Version / Destination / Kernel Version2** — three distinct
  identity/version header fields (`0xD0` / `0xF0` / `0x150`) that must not be
  conflated.
- **The enable ("knock")** — the zero-length `3B 02 41 A5 AA AA` command that sets
  the extended-read permission bit, opening the gated `02/B0` address range.
- **Permission bit / lockout bit** — receiver state bits (bit 1 / bit 5)
  controlling and disabling raw high-offset reads; cleared only by full startup.
