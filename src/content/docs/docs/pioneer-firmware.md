---
title: Pioneer Firmware
description: A technical reference for the Renesas H8S generation of Pioneer Blu-ray writer firmware - its processor and software stack, the two-component image model, the distribution envelope, the drive's command surfaces, the boot-time validation contract and the generation-marker mechanism.
---

:::caution[Work in progress]
This is an active investigation: a current working model of how Pioneer firmware is built, packaged
and updated, not a finished specification. It is revised as new findings arrive, and parts of it may be
corrected or removed.
:::

*A complete technical reference for the Renesas H8S generation of Pioneer
Blu-ray writer firmware: its processor and software stack, the two-component
image model, the distribution envelope and its cryptography, the drive's raw
and update command surfaces, the boot-time validation contract, the
cross-model compatibility rules, and the generation-marker mechanism that
governs downgrades.*

---

## Abstract

Pioneer's Blu-ray recorder families — the BDR-2xx, S0x, S1x, X1x, XD, XS, XU,
UD, and WX series, together with their OEM-badged variants — share a single
firmware architecture built on a Renesas H8S microcontroller running a layered
Hitachi/MiSPO real-time software stack. This document describes that
architecture end to end. It treats the firmware as the object of study: what
the image contains, how it is divided into a **Kernel** and a **Normal**
component, how each component is wrapped in a signed, LCG-encoded distribution
**envelope**, how the drive authenticates and installs an envelope over its
vendor SCSI command set, how the two components validate one another at boot,
how firmware revisions are paired and constrained across models, and how a
one-byte **generation marker** in the Kernel body governs which revisions a
receiver will accept — the pivot on which firmware downgrade turns.

The description covers fixed offsets, opcode bytes, instruction addresses within
the decoded images, cryptographic parameters, and structural comparisons between firmware releases. Where drive-side behaviour is established from specific firmware code
it is stated as such; where the firmware's behaviour is inferred but not yet
proven at the silicon level, it is deferred to
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
view, three things stacked together: a Renesas H8S system-on-chip with its
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

Older DVR- and BDC-series drives predate the H8S/SAT design and use related
but distinct envelope layouts and checksums; these are treated separately in
Part V. The scope here is the firmware itself, not any host software that might
produce or consume it.

### 2. The H8S processor

The application processor is a **Renesas H8S** core: a big-endian architecture
with a variable-length instruction encoding in whole 16-bit units, descended from the Hitachi H8 line. Two structural fingerprints
identify the **H8 family** unambiguously in an image whose provenance is unknown:

- **Return-opcode frequency.** The code regions are dense with the byte pair
  `54 70`, which is the H8 `RTS` (return from subroutine) opcode; a
  representative 64 KiB Kernel plus its Normal contains many thousands of these.
  The SH-2 return encoding (`00 0B`) occurs incidentally in data and operands;
  it does not form the return-instruction pattern of the executable code.
- **Reset-vector shape.** The reset vector points into a table of `5E xx xx xx`
  and `5A xx xx xx` words. These are the `JSR @aa:24` (jump to subroutine,
  24-bit absolute) and `JMP @aa:24` forms — exactly the shape of a
  dispatch/relocation table at a reset entry.

These two fingerprints identify the family and rule out SH-2 and ARM, but they
do not by themselves distinguish H8S from H8/300H or H8SX: the opcodes exist on
all of them.

**What identifies the H8S instruction set.** The firmware uses the `LDM`/`STM`
push/pop-multiple instructions, which were introduced with the H8S generation
and do not exist on the H8/300H. For example, `01 20 6D 76` decodes as
`LDM.L @ER7+,(ER4-ER6)`, while `01 20 6D F4` is
`STM.L (ER4-ER6),@-ER7`. The `01 1x`/`01 2x` prefix ahead of
`6D 7x`/`6D Fx` is the H8S multi-register form. These pairs appear throughout
function prologues and epilogues in all three firmware generations examined
(BDR-UD04 `SAT 8A10`, the newest `SAT 9401`/`X13U`, and the older `SAT 1003`),
and establish use of the H8S instruction set rather than H8/300H.

**What identifies the H8S/2600.** At the instruction-set level the H8S/2600
and H8S/2000 differ in one respect only: the 2600 has a multiply-accumulate
register (`MACH`/`MACL`) and four instructions that use it — `MAC`, `CLRMAC`,
`LDMAC` and `STMAC`. (The 2600's faster `MULXU`/`MULXS` is a timing
difference, not an encoding one.) The firmware never issues `MAC` itself, but
`LDMAC` (`03 2x`/`03 3x`) and `STMAC` (`02 2x`/`02 3x`) appear in the
low-level microkernel layer: the startup code clears `MACH`/`MACL` at reset,
and interrupt handlers save both halves on entry and restore them on exit.
This is the context-save boilerplate a compiler emits for an H8S/2600 CPU
target. Because these instructions do not exist on an H8S/2000, the code
cannot run on one.

**No H8SX features are used.** Across roughly 133,000 control-flow-verified
instructions spanning all three generations, no H8SX-exclusive instruction was
found: no `MOVA`, no `BFLD`/`BFST`, no indexed addressing and no `#imm:3`
short-immediate forms. The firmware runs in H8S **advanced mode**, with a
16 MiB (24-bit) address space, and nothing requires the H8SX's 32-bit maximum
mode. 32-bit absolute operands (`@aa:32`) are common — for RAM and data tables
as well as I/O registers — but their top byte is always `00` or `FF`. In
advanced mode only the low 24 bits reach the bus, so every such operand falls
inside the 16 MiB space.

**Silicon versus toolchain.** Because H8SX is binary-upward-compatible with
H8S, these bytes cannot rule out H8SX silicon running H8S/2600 code. They do
show that the toolchain targeted the H8S/2600, and there is no positive H8SX
evidence. Only the physical part number — or an access to an H8SX-only on-chip
peripheral register — would settle the question. External evidence is
consistent with an H8S-class part: a decap of the Renesas R8J32040FPV2 drive
controller shows controller and Flash-ROM dies, though it offers no
die-level ISA confirmation.

Several instruction forms recur throughout this document because the firmware's
control logic is built from them, and reading the firmware means reading them:

| Mnemonic (H8S) | Encoding note | Role in this firmware |
|---|---|---|
| `RTS` | `54 70` | subroutine return; the density fingerprint |
| `JSR @aa:24` | `5E xx xx xx` | absolute call; dispatch tables, wrappers |
| `JMP @aa:24` | `5A xx xx xx` | absolute jump; entry thunks |
| `LDM.L @ER7+,(ERn-ERm)` | `01 1x/2x/3x` + `6D 7x` | multi-register restore; H8S-generation marker |
| `STM.L (ERn-ERm),@-ER7` | `01 1x/2x/3x` + `6D Fx` | multi-register save; H8S-generation marker |
| `CMP.L #imm,ERn` | 32-bit immediate compare | control-word and marker checks |
| `CMP.B #imm,RnL` | byte immediate compare | buffer-id (`FE`/`F0`/`FF`) dispatch |
| `BSET`/`BCLR #b,@aa:16` | bit set/clear, absolute-16 | permission/state-bit management |
| `EXTU.L ERn` | zero-extend long | operand preparation |
| `RTE` | `56 70` | exception return |

The variable-length encoding matters for anyone disassembling the image:
linear sweep is prone to false cross-references because a mis-synchronised
decode can produce plausible but spurious instructions, so control flow must be
followed from verified entry points rather than swept blindly.

The primary vector-table region in the UD04 runtime view begins at address
`0`. Its first word, `0x007A0036`, occupies the reset-vector slot, not a
stack-pointer slot: H8S reset loads a program counter from the vector table;
software initialises `ER7` separately. The running Kernel begins at
`0x400000` with `7A 07 00 00 80 00` (`MOV.L #0x8000,ER7`). Words 1 through 42
of the low table contain handler addresses; 24 point to `0x00552696`, where
`JSR @0x40B70E` is followed by `JMP @0x40B77C`. Word 7 is `0x00551B74`.
Words 43 through 63 do not have the same handler-pointer structure and are
not counted as established exception entries.

A near-copy appears at `0x8000`. Its first word is shifted by `+0x1C00`;
the first `0x1000` bytes differ in 20 byte positions, not just that word.
The `0x4000..0x8000` block also has a near-copy at `0xC000`. These are
observations of a post-startup memory capture; they do not by themselves
establish the power-on mapping or the purpose of the copies.

### 3. The layered software stack

Three software layers sit above the silicon, each independently identifiable by
a fixed marker string in the image:

- **Hitachi AzHI2000/3** — the low-level microkernel: peripheral bring-up,
  exception dispatch, timers, and the basic hardware abstraction. It is marked
  by the string `AzHI2000/3 Ver. 1.0 (c)Hitachi, Ltd. 1998.` and has its marker
  string at `0x103018` in the runtime map. This is the "kernel" in the RTOS
  sense — not to be confused with the Pioneer **Kernel** *component* (Chapter
  5), which is a Pioneer-authored firmware unit that happens to share the word.
- **NORTi** — a commercial real-time operating system from MiSPO Corporation,
  widely used in Japanese consumer electronics, layered above the microkernel to
  provide task scheduling. It is marked by `jNORTi(c)MiSPO`, which lies inside the Pioneer Kernel component (`0x40B6D1` on the reference platform). This string is a
  reliable family fingerprint for Pioneer/Renesas firmware.
- **Pioneer application code** — the drive's own optical, servo, AACS, and SCSI
  logic, plus the firmware update receiver, running as tasks above NORTi. Within
  this layer, the AACS content path identifies itself as
  `Indigo5 AACS Kernel Driver ver.5.0.0` (at `0x40ABD0` on the reference platform), and the boot path prints the banner
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
| `0x000000–0x000FFF` | 4 KiB | Primary vector table: reset vector (`0x007A0036`) and 42 populated exception vectors, 24 of them the default handler `0x00552696`. |
| `0x001000–0x003FFF` | 12 KiB | Boot descriptor and peripheral I/O map. |
| `0x004000–0x007FFF` | 16 KiB | Boot-time code/data (mirrored near `0x00C000`). |
| `0x008000–0x00BFFF` | 16 KiB | Duplicate vector table + descriptor (first word shifted `+0x1C00`). |
| `0x00C000–0x00FFFF` | 16 KiB | Near-copy of `0x004000` block; differs in 154 bytes in a representative capture. |
| `0x010000–0x0FFFFF` | ~960 KiB | Sparse configuration / state tables, largely zero-padded. |
| `0x100000–0x102FFF` | 12 KiB | Low-level microkernel code. |
| `0x103000–0x10FFFF` | 52 KiB | Kernel/OS bring-up code; carries the Hitachi AzHI2000/3 marker string (`0x103018`). |
| `0x110000–0x3FFFFF` | ~2.94 MiB | Servo tuning and calibration tables (per-media laser coefficients). |
| `0x400000–0x40FFFF` | 64 KiB | **Kernel component**: startup, update receiver, low-level writers, identity reporting; carries the AACS/RTOS markers. |
| `0x410000–…` | declared | **Normal component**: application code and data; end given by the declared size in its header (e.g. `0x5D7500` for a `0x1C7500`-byte image). |
| `0x59BB4E` | — | Canonical identity string `PIONEER BD-RW   BDR-UD04 1.14 20/06/15`. |
| `0x59D474–0x59D573` | 256 B | SHA-256 constant (K) schedule: all 64 FIPS-180-4 words, byte-exact big-endian. |
| `0x5A0000–0x5B69C0` | ~90 KiB | Record tables: `FF FF F8 xx` markers followed by 10-byte records. |
| `0x5B69C4–0x5B6B3F` | 380 B | 95-entry address table (candidate SCSI dispatch); all 95 entries are addresses inside the Normal image. |
| `0x5B7000–0x5C0000` | 36 KiB | Additional dispatch and auxiliary tables. |
| `0x5C0000–0x5D0000` | 64 KiB | Includes the stored COMP streams, beginning at `0x5C0FA8` and extending beyond this interval to `0x5D744F` (Chapter 9). Their compressed bytes must not be classified as a flat calibration-record table. |
| `0x5D7500–0x5FFFF7` | ~162 KiB | Sparse device data beyond the declared Normal image: `0x5D7500–0x5E0000` is entirely `FF`, and `0x5E0000–0x5FFFF7` is 95–98% `FF` (it holds, for example, the drive serial text at `0x5EE552` and `0x5FE552`). |
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
validation — is generation-dependent. The large majority of decoded Normals (384 of
441 in the current codec audit) are entered at `0x412000`, through a `JMP` at image offset `0x2000`.
Two further entry conventions, at `0x410028` and at `0x410014`, apply to a small
number of images but are not established; the remaining images require their own entry-path analysis. A length word or
generation byte at image offset `0x14` or `0x28` is not an entry instruction. This "entry
ABI" split is one of several respects in which the interface between the two
components has drifted across generations.

#### 5.3 Independent versioning

Because the two components are versioned independently, **their revision numbers
need not agree**. A drive can legitimately ship a Kernel revision older than its
Normal — the canonical example being a Kernel labelled `1.00` co-shipped with a
Normal labelled `1.14`. Equal revision numbers are therefore not a valid pairing
criterion; the actual pairing rules are the subject of Chapter 14. Moreover, a
great many field updates ship a **Normal only**, leaving the installed Kernel in
place: the Kernel changes far less frequently than the application image.

#### 5.4 Decoded image headers

Once an envelope body is decoded (Chapter 7), each component is a flat image
whose first bytes carry fixed-position identity fields. The same fields are what
a running drive holds in memory at `0x400000` (Kernel) and `0x410000` (Normal).

| Image | Offset | Size | Contents |
|---|---:|---:|---|
| Normal | `0x00` | 16 | Internal model string, beginning with the ASCII magic `PIONEER ` (e.g. `PIONEER BDR-US04`). |
| Normal | `0x10` | 4 | Big-endian word that varies per release (§8.1). |
| Normal | `0x14` | 4 | **Declared image length**, big-endian. Equals the decoded body length exactly; a multiple of `0x100`. |
| Normal | `0x18` | 8 | Type tag (e.g. `GENERAL `), compared with the Kernel at boot (§13.1). |
| Normal | `0x28` | 1 | Generation byte compared with the Kernel marker at startup on newer firmware (§13.2). |
| Normal | `0x1000` | 4 | `COMP` directory magic (Chapter 9). |
| Kernel | `0xFE` | 1 | Generation marker (Chapter 15). |
| Kernel | `0x1000` | 8 | Hardware tag, ASCII `SAT xxxx` (`xxxx` is the 16-bit controller id in hex). |
| Kernel | `0x1008` | 8 | Type tag (`GENERAL`, `IDnn`, …), space padded. |
| Kernel | `0x1010` | 4 | Kernel Version2 value (`0000` on many drives). |
| Kernel | `0x1020` | 4 | Big-endian balance word of the additive checksum (§8.1). |

The modern Kernel image is exactly `0x10000` bytes. A conservative host parser
requires a Normal image's declared length to be at least `0x2000`, at most
`0x800000`, a multiple of `0x100`, and within the 24-bit address space
(`0x410000 + length ≤ 0x1000000`). These parser bounds are not a universal
receiver capacity; the boot-time limits vary by generation (§13.1). The older scaled-key
Normal (Chapter 17) has **no** declared-length field at `0x14`; its length is
fixed by the receiver instead.

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
applies across the examined releases; the *values* in each region vary by component, model, and
generation, but the region boundaries do not.

| Offset | Size | Region | Description |
|---|---:|---|---|
| `0x000` | 96 | **Banner / preamble** | The fixed copyright banner. Invariant in the examined releases. |
| `0x060` | 256 | **Identity / release fields** | Eight labelled ASCII fields plus separators (§6.2). Highly stable between releases. |
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
| `0x130` | Generated Date | `20/06/15` | `YY/MM/DD` (the Optiarc BC-5100S uses `MmmDD,YYYY`). |
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

#### 6.3 Header invariance between releases

The division of the header into a stable identity region and a volatile
validation region is visible statistically. Across 593 examined
distinct Normal envelopes:

- all eight ASCII labels occupy identical offsets, and the first `0x60` bytes
  (the banner) are byte-identical everywhere;
- across the full `0x200`-byte header, 257 byte positions are
  invariant and 309 hold the same value in at least 90% of files;
- the `0x60–0x16F` text/identity region shows ~90.5% mean modal-byte agreement;
- the `0x170–0x1BF` validation region shows only ~11.4% — because it carries a
  per-release cryptographic proof rather than identity text;
- the `0x1C0–0x1EF` extension region is all-zero in the large majority of files
  (436 of 593 Normals) but is populated by some generations;
- the `0x1F0–0x1FF` filename block is distinct in almost every Normal (589 distinct
  blocks across 593 Normals; a few filenames are shared by different files).

The practical reading of these statistics is that the header is **one generic
layout with per-release values**, not a per-model byte template: a parser or
generator can rely on the field positions universally, but must derive — not
assume — the validation and filename bytes.

#### 6.4 Exact text layout of the header

The first `0x160` bytes are a fixed-width ASCII template. Lines end in CR LF, each
`Label : value` line has a fixed offset, and each value occupies a fixed-width
slot: the value is left-aligned, the byte immediately after the slot width is
`0x00`, and every other byte up to the next label is a space.

| Offset | Content |
|---:|---|
| `0x00` | Banner `********  Copyright(c) 2000 Pioneer Corporation  ********` (57 bytes), 5 spaces, CR LF (ends at `0x3F`). |
| `0x40` | `This is microcode file.` + 2 spaces + CR LF (ends at `0x5A`). |
| `0x5B` | `ID : ` (ends at `0x5F`). |
| `0x60` | ID value: the full marketing identity (e.g. `PIONEER BD-RW   BDR-S08 `), 24-byte slot `0x60..0x77`, `0x00` at `0x78`, spaces to `0x7C`. Some older headers right-align the text, leaving leading spaces. The model is the last whitespace-separated token. |
| `0x7D` | CR LF `Revision Level : ` |
| `0x90` | Revision, 5-byte slot, `0x00` at `0x95`, spaces to `0x9A` (e.g. `1.40 `). |
| `0x9B` | CR LF `Hardware Version : ` |
| `0xB0` | Hardware, 8-byte slot, `0x00` at `0xB8`, spaces to `0xBC` (`SAT 8301`). |
| `0xBD` | CR LF `Kernel Version : ` |
| `0xD0` | Kernel Version, 8-byte slot, `0x00` at `0xD8`, spaces to `0xDF`. |
| `0xE0` | CR LF `Destination : ` |
| `0xF0` | Destination, 8-byte slot, `0x00` at `0xF8`, spaces to `0x101`. |
| `0x102` | CR LF `File Type : ` |
| `0x110` | File Type, 8-byte slot, `0x00` at `0x118`, spaces to `0x11C` (`Normal  `, `Kernel  `). |
| `0x11D` | CR LF `Generated Date : ` |
| `0x130` | Date, 10-byte slot, `0x00` at `0x13A`, space at `0x13B` (`14/03/06  `). |
| `0x13C` | CR LF `Kernel Version2 : ` |
| `0x150` | Version2, 4-byte slot, `0x00` at `0x154`, spaces to `0x15C` (`0000`). |
| `0x15D` | CR LF `0x1A` (DOS end-of-file byte); the text template ends at `0x15F`. |

A reader locates fields by the `Label : ` text, trimming spaces and the `0x00`.
Two further header facts: on modern **Kernel** envelopes the opaque (`0x160`), validation
(`0x170`) and extension (`0x1C0`) regions are all zero (a Kernel envelope carries
no signature; the exceptions are two SAT1003 BDC-202 Kernels, whose region is
`FF`-filled, and two WX01DM (`8801`) Kernels), and the embedded filename at `0x1F0`
is normally NUL-padded to 16 bytes (SAT1003 and some others pad with
`00 FF FF FF`).
On Kernel envelopes the Kernel Version and Destination slots normally repeat the
tag that the Kernel image carries at `0x1008`.

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

Precisely: the first key byte is produced *after* one step from the seed, so
`key[0] = (seed·A + C mod 2^24) >> 16`. The key table is the byte stream read as
consecutive **little-endian 32-bit words**, repeated cyclically over the body
(`k = key_word[i mod (key_length / 4)]` for body word `i`). Key length is always
a multiple of 4. To recover a seed from 16 consecutive key bytes `b0..b15`, try
each of the 65 536 values for the low 16 bits of the state that produced `b0`
(the high 8 bits are `b0`); the one for which the next 15 steps reproduce
`b1..b15` identifies that state `s1`, and the seed is
`(s1 − C) · A⁻¹ mod 2^24`. Stepping `n` places backward uses the inverse
recurrence `s ← (s − C)·A⁻¹ mod 2^24`, which composes by the usual
affine-power doubling.

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

Three framing rules complete the transform:

- **Whole words only.** The transformed span is the body truncated to a multiple
  of 4 bytes. Any trailing 1–3 bytes after the last whole word are carried
  verbatim and are not part of the image.
- **XOR exceptions in the Normal.** For a Normal body the receiver skips the XOR
  (but still applies the rotation, in the same direction) at exactly **two word
  positions** of the decoded image. Both are byte offsets within the image,
  distinct and multiples of 4. They are not stored in the envelope: they are
  immediates inside the paired Kernel's decode loop, which compares the running
  byte offset with two constants and branches over the XOR instruction
  (`CMP.L #off1,ERn / BEQ / CMP.L #off2,ERn / BEQ`, encoded `7A 2n <imm32> 47 <disp>`
  twice, both branches landing after the XOR). Several instruction arrangements
  exist, including a variant (BDR-WX01DM) whose second compare reloads the same
  offset register from the stack; the bounded recognizer requires one unambiguous branch in the paired Kernel,
  and the two offsets must differ. The BDR-UD04 1.14 Normal uses
  offsets `0x16900` and `0x77300` (image length `1 864 960` = `0x1C7500`). A
  framing-only decode can be obtained from the Normal alone, but reproducing
  these receiver-specific words requires the Kernel; the Kernel that
  ships with it supplies the two offsets. Kernel bodies have no exceptions.
- **Length check.** For a Normal with a declared length (Chapter 5.4), the
  decoded length must equal the declared length exactly. An envelope whose body
  ends early (one released BDR-XD04 file does) decodes to a shorter image and
  fails this check.

One model, **BDR-WX01DM** (specifically its Normal envelope), uses the
mirror-image variant: the rotation runs in the *opposite* direction —
`ROL32(c XOR k, k & 0x1F)` on decode — while the XOR and key derivation are
otherwise identical. It is the only rotation-direction exception observed in the
examined modern firmware.

The decisive point is that **the envelope carries no indication of which
direction applies.** The header (Chapter 6) is a single uniform structure across
every model; it contains no codec-variant byte, no rotation flag — nothing a
reader could consult to choose the direction in advance. Nor is the choice
recoverable from the model string, because the header field layout is identical
regardless of direction. The direction is therefore **intrinsic to the model's
own decoder**: the drive's firmware is simply compiled with the rotate
instruction for its platform (an H8S `ROTR` on the common models, `ROTL` on
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

**Normal layout.** Header `0x200`, then a `0x10000`-byte key table, then the
encrypted payload (the payload begins `0x10000` bytes after the key table):

```
0x00000  header            0x200
0x00200  key table         0x10000  (LCG key from a 24-bit seed)
0x10200  encrypted image   declared length (+0..3 trailing bytes)
```

The envelope length is therefore `0x10200 + image length`. A second arrangement
places the key table at `0x10200` and the payload at `0x20200`; the decoder
chooses between the two key offsets (and the two rotation directions of §7.2) by
trial-decoding 64 bytes at each candidate payload and keeping the one that
begins `PIONEER `. The scaled layout of Chapter 17 divides the body into 17 equal
units instead.

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
back to the seed. Concretely, with the LCG started at the seed, the Kernel key
table is stream bytes `0x0000..0x0FFF`, the trailer is stream bytes
`0x11000..0x11FFF`, and the `0x10000` stream bytes between them are not stored.
The last 16 trailer bytes are therefore stream bytes `0x11FF0..0x11FFF`, and the
state that precedes them is `envelope_len − 0x200 − 16 + 0x1000 = 0x11FF0` steps
after the seed; running that many steps backward from the recovered state yields
the seed.

Crucially, **the Kernel code itself records which layout it expects**. Every
receiver contains the buffer-id dispatch (Chapter 12) that distinguishes Kernel
from Normal transfers, written as an adjacent instruction pair `CMP.B #FE,RnL`
followed six bytes later by `CMP.B #F0,RnL` (encoded `An FE .. .. .. .. An F0`, where `n` is the register nibble).
The two generations compare on different byte registers: **R6L (`AE FE … AE F0`)
for front-key Kernels and R5L (`AD FE … AD F0`) for derived-key Kernels**. Exactly
one such pair, on exactly one of the two registers, is present in a decoded Kernel
of the modern generation; the earliest receivers, which call the decoder with
explicit staging addresses (Chapter 17), use the front-key framing. This is a
reliable, code-intrinsic discriminator of the two layouts. Among 195
distinct decoded modern Kernel envelopes the split is **88 front-key and 107
derived-key**: the code-signature discriminator classifies 176 (all 107 derived-key
Kernels on R5L and 69 front-key Kernels on R6L) and uses the explicit-address legacy decoder pattern for the remaining 19 front-key
images. All 195 layouts are reproduced by the current recognizer, with **zero
misclassifications** among these images.

#### 7.4 Seed distribution

Because the seed only selects the keystream, a given model can appear under
several seeds across its release history. Among 210
model/hardware/destination/role/layout groups with reproducible LCG tables, 45
groups used more than one seed. Two common seeds recur: `0x47D001`
reproduces the key tables of 278 distinct Normal envelopes and seed `1` reproduces
those of 68 front-key Kernels; other seeds occur in smaller numbers. (A small number of images,
including the UD04 Kernel and the SAT1003 scaled-key tables, do not reproduce
under this default-seeded LCG at all and use distinct seeds or geometries; the
SAT1003 family is treated in Part V.) The consequence for anyone
reasoning about the format is that **a single per-model seed cannot regenerate
all of a model's OEM envelopes**, and the seed carries no authentication weight.

### 8. Integrity: checksum and signature

A decoded image is protected by two independent integrity mechanisms: an
additive checksum on the correctly decoded modern image, and — for signed
Normal generations — an ECDSA signature over part of the envelope. The older
little-endian checksum layouts are described separately in Part V.

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
words. A framing-only Normal decode that omits the paired Kernel's two XOR
exceptions can have a nonzero sum; that is not a reason to recompute an OEM
checksum and silently change the image. The receiver-specific decode must be
reproduced first (§7.2). Some older boot paths additionally
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
same curve for the entire examined modern firmware. The curve is defined over the prime
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

Details that matter for an implementation: the 20-byte SHA-1 digest is read as one
big-endian integer `H` with no truncation (it is the same width as `n`); a
signature is `s = k⁻¹(H + r·d) mod n` with `r` the x-coordinate of `k·G` reduced
mod `n`; verification first requires `Qx, Qy < p` and `Qy² ≡ Qx³ + a·Qx + b (mod p)`,
and `0 < r, s < n`. A header whose point is off this curve is unsupported by this verifier;
that does not prove that the file is unsigned or exclude a different scheme. The BDR-UD04 OEM public point is
`Qx = 972e1cb6549e0599e69cb83a1f4718d97eb84a7b`,
`Qy = 2f289bdef9f429a15b2bfdf883a4d46795abce57`. **In the traced modern receiver paths, Normal envelopes carry the
ECDSA signature and the Kernel receive arm has no signature call.** Most modern
Kernel envelopes leave `0x170–0x1BF` zero; the exceptions in §6.4 must not be
erased by treating this as a universal header rule. The traced Kernel arm
checks the decoded additive checksum (§8.1).

The first-40/last-40 split of the validation block has a clear structural
signature in every examined release: among recognised-curve Normal envelopes,
the **last 40 bytes** (the public point) tend to persist across revisions of the
same embedded model — the two UD04 samples 1.11EU and 1.14 share their last 40
bytes while differing in the first 40 — whereas the **first 40 bytes** (the
signature) change every release. The first 40 bytes are always two nonzero
sub-`p` 20-byte values, consistent with signature scalars; across the 402 distinct
Normal envelopes that verify, every one satisfied that shape, and across the recognised-curve
population 402 envelopes verified with their last 40 bytes as the public
point. Eight further recognized-curve Normal envelopes failed verification over
both known ranges; 183 Normals were unsupported by this verifier. These outcomes
are distinct and do not certify every firmware file.

#### 8.3 Signed-range selection

The SHA-1 digest `H` covers the envelope from a start offset to EOF, and **the
start offset depends on the envelope layout**:

- envelopes are signed either over `0x200..EOF` (header excluded, key table plus
  ciphertext included) or over `0x10200..EOF` (the key table, which then sits at `0x10200`, plus ciphertext);
- the choice tracks the layout of the **paired Kernel** (§7.3), because the
  receiver in that Kernel performs the check: a Normal shipped with a
  **front-key** Kernel is signed from `0x200` (key table plus ciphertext), whereas
  one shipped with a **derived-key** Kernel is signed from `0x10200` (the key
  table at `0x10200` plus ciphertext);
- among examined Normal releases, 295 Normals verify over the `0x200` form and 107 over the
  `0x10200` form, the 107 being exactly the Normals whose key table sits at `0x10200`; the UD04 1.11EU and 1.14 Normals both use the `0x200` form.

The signed range is therefore not a free parameter: it is determined by the same
generational layout choice that determines key placement, and the two must agree
for verification to succeed.

#### 8.4 The hardware validation engine and SHA-1

The digest and signature verification are not purely software. The Kernel
supplies the header's 80-byte validation block, and specifically the public
point, into a **hardware validation engine** whose registers lie in the `0xFF3FFxxx` range, and does so
*before* decoding the body. The Kernel loads the five standard SHA-1 initial
words (the FIPS-180-1 `H0..H4` constants) into that engine — establishing SHA-1
as the digest stage — and checks a hardware status result. The 80-byte block is
validated against the encrypted body via this engine; the changing 40 bytes are
not simply the body's SHA-1, and the engine's exact trust policy (whether it
accepts the supplied public point as-is or checks it against a stored value) is
one of the central open problems of Chapter 21.

In the traced BDR-S13 1.05 receiver the signature check is a separate routine
(`0x4050C6`) that drives a hardware elliptic-curve engine at `0xA00000`. It is
reached **only** from the Normal commit arm (`0x404B96`), is given the validation
block at staging `+0x170` and the body at staging `+0x200` (the Normal staging
base is `0xA10200`, so the block is passed as `0xA10370` and the body as
`0xA10400`), and verifies envelope bytes `[0x200, end)`. A non-zero result sets
error code `0x0B` and aborts the transfer (`0x404D1E`). The check is made once, at
flash time; the boot path does not repeat it. The Kernel receive arm contains no
signature call.

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

The receiver's policy is identifiable from the Kernel's own code, which sets how
a Normal envelope must be authenticated:

| Policy | What the Normal must satisfy | Kernel code signature |
|---|---|---|
| Unsigned | `0x170–0x1BF` all zero | One fixed instruction run (staging `0x10200`, then the decoder arguments) immediately before the decoder call; no validator call. |
| Scaled checksum only | Length and 16:1 key geometry (Ch. 17); decoded image begins `PIONEER ` and sums to zero | Decoder call with explicit staging addresses and a length comparison. |
| ECDSA from `0x200` | Signature valid over `0x200..EOF` (key table plus ciphertext) | Front-key Kernel layout (§7.3); validator called with the validation block pointer before decoding. |
| ECDSA from `0x10200` | Signature valid over `0x10200..EOF` (key table at `0x10200` plus ciphertext) | Derived-key Kernel layout (§7.3). |

For the signed policies the validator receives pointers to the validation block and
the body (`mov.l #0xA10400,er0 / mov.l #0xA10370,er2 / jsr`); an unsigned receiver
never makes that call.

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

The directory is a list of big-endian 32-bit **runtime addresses** read from
`0x1004` up to the `0xFFFFFFFF` terminator (or `0x1100`), taken in `(start, end)`
pairs. The host parser accepts an even number of words and caps it at 32
(16 streams); that is a parser policy, not a proven firmware limit. Addresses are absolute
in the drive's address space, so an address maps to an image offset by
subtracting the image's load address (the Normal loads at `0x410000`; candidate bases can be checked by validating every stream). For a stream at image
offset `o = start − base`:

| Image offset | Size | Field |
|---:|---:|---|
| `o` | 4 | Expanded length, big-endian (the host inflater requires non-zero and caps it at 64 MiB). |
| `o + 4` | `end − start` | A zlib stream (first byte `0x78`); its compressed length is exactly `end − start`, and inflating it yields exactly the stated expanded length. |

Observed stream counts are **six** (the common case) or **nine**. In the 2026-10-05 codec audit, 347 decoded Normals carry a `COMP` marker.
All streams validate in 345: 315 have six streams and 30 have nine. The two
remaining marker-bearing images are not counted as validated directories.

The streams stay compressed inside the Normal: the decoded body of an envelope
(with the Kernel's XOR exceptions applied, §7.2) is byte-for-byte the image found
in drive memory at `0x410000` for the declared length (the BDR-UD04 1.14 Normal is `1 864 960` bytes in both), so the compressed
streams are present in the running image as stored. The directory entry carries the address pair, and each stored stream carries
its own length prefix; no other directory field
names the destination of the expanded bytes.

A modification confined to the **last** stream can be recompressed and re-placed
without moving earlier streams, provided: everything after the old compressed end
is `0xFF` fill; the old end address appears nowhere else in the image except the
directory entry; the new end address is `base + o + (compressed length)`; the
image is padded with `0xFF` to a multiple of `0x100`; and the declared length at
image `+0x14` and the directory's final end address are rewritten. Earlier
streams, their addresses and their expansions must stay unchanged. Any such
change still has to satisfy the size-alignment and checksum rules of Chapter 8.

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
PIONEER BD-RW   BDR-UD04        revision 1.14   date 20/06/15
```

The spacing between the media class and the model is the same in INQUIRY and in
the envelope's model field at `0x60`: `PIONEER BD-RW   BDR-UD04` has three interior
spaces in both, as in the firmware identity literal. The number of spaces varies by
model and is recoverable for a given envelope from the identity literal inside the
firmware image.

The INQUIRY CDB is `12 00 00 00 60 00` (96-byte allocation). Fields:

| Bytes | Field | Notes |
|---:|---|---|
| `[8..15]` | Vendor | `PIONEER ` |
| `[16..31]` | Product | 16 bytes, e.g. `BD-RW   BDR-S09 `; media class, a run of spaces, then the model, space padded. |
| `[32..35]` | Revision | Four ASCII characters (`1.34`). After a successful update-mode entry the first three read `000` (§12.3). |
| `[36..42]` | Vendor specific | Begins with the firmware date text (e.g. ` 16/04/`). |

A usable identity response is at least 36 bytes long (a GOOD status with a short or
empty data phase is not an identity), has bytes `[8..35]` in the printable ASCII
range `0x20–0x7E`, and a product field that is not all spaces; a drive can return
control bytes in the revision field, which then cannot be trusted as a revision.

The firmware image carries the same identity as one literal,
`<vendor> <media><1–8 spaces><model> <revision> <YY/MM/DD>`, at most 24 characters
before the revision (e.g. `PIONEER BD-RW   BDR-UD04 1.14 20/06/15`); the number of
spaces between media and model varies by model and is how an envelope's own
spacing is recovered. A Normal image also embeds its build date as an ASCII
literal, either `YY/MM/DD` or, on Optiarc images, `MmmDD,YYYY` (three-letter month, two-digit
day, comma, four-digit year), which is unique in the image when present.

Standard MMC identity is also available and is optional on a given drive:
`GET CONFIGURATION` for feature `0x010C` (`46 02 01 0C 00 00 00 01 00 00`) returns a
descriptor whose bytes `[4..15]` are the 12-character firmware creation date
`CCYYMMDDHHMI`, and feature `0x0108` (`46 02 01 08 …`) returns the serial number
text after its 4-byte feature header. A drive that lacks either feature answers
CHECK CONDITION, which means "absent", not a fault.

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
`9201` for BDR-S13U, `8F01` for BDR-212U / BDR-S12U, `8600`/`8601` for BDR-209M variants,
and so on. Bytes `[0x20..0x27]` of this `F1` response additionally serve as an
**update-mode status window**: eight ASCII spaces there signify that update mode
is already active (Chapter 12). The separate "entry succeeded" indication — the
ASCII `000` at bytes `[0x20..0x23]` — is reported on the standard `INQUIRY`
response, not on this block (§12.3).

The first 12 bytes of the block, `[0..11]`, are the drive's serial number text.
This identity read is also the platform discriminator: a Pioneer/Renesas
controller answers it with GOOD status and 48 bytes whose hardware field
`[16..23]` is printable ASCII and starts with `SAT ` (H8S/SAT generation), `ATA `
or `SCSI` (older families); bytes `[16..18]` = `SAT` alone identify the Renesas
platform. A controller of another family is inferred to refuse the command with CHECK
CONDITION (ILLEGAL REQUEST, ASC `0x20`). Firmware-image operations require the `SAT ` form.
The hardware field equals the Kernel image's `0x1000` tag (§5.4), and the four hex
digits after `SAT ` are the controller id used throughout (key table, pairing).

A second vendor read, `READ BUFFER` mode `02`, buffer id `F4`, 256 bytes
(`3C 02 F4 00 00 00 00 01 00 00`), is inferred to return a firmware/drive-flags
window on SAT-platform drives. No receiver handler for it has been identified and
its layout is not established; it may be empty or refused depending on drive state.

Known SAT controller ids and the models they appear under (marketing names are
those of the vetted same-silicon pairs in §14.6; the descriptor is the internal
model string of §12.2):

| SAT id | Models | Descriptor |
|---|---|---|
| `8231`, `8232` | BDR-XD05 | `PIONEER BDR-XD05` |
| `8301` | BDR-208 | `PIONEER  BDR-208` |
| `8510`, `8511` | BDR-UD03 | `PIONEER BDR-US03` |
| `8590` | BDR-US03 | `PIONEER BDR-US03` |
| `8600`, `8601` | BDR-209 (v1, v2) | `PIONEER  BDR-209` |
| `8800`, `8801` | BDR-211 (v1, v2) | `PIONEER  BDR-211` |
| `8A10` | BDR-UD04 | `PIONEER BDR-US04` |
| `8B30` | BDR-XD06J-UHD | `PIONEER BDR-XS06` |
| `8D30`, `8D31` | BDR-XD07, BDR-XD07U | `PIONEER BDR-BDS7` |
| `8E20`, `8E21` | BDR-XS07, BDR-XS07U | `PIONEER BDR-BDS7` |
| `8F00`, `8F01` | BDR-212, BDR-212U / BDR-S12U (also BDR-S12JX) | `PIONEER BDR-212T` |
| `9000`, `9001` | BDR-X12, BDR-X12U | `PIONEER BDR-X12T` |
| `9200`, `9201` | BDR-213M; BDR-213U / BDR-S13U / BDR-S13JX | `PIONEER BDR-213T` |
| `9330`, `9331` | BDR-XD08 / XD08B / AD08 (`9330`); BDR-XD08U (`9331`) | — |
| `9400`, `9401` | BDR-X13, BDR-X13U | `PIONEER BDR-213T` |

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

Six identity concepts are distinct:

1. **INQUIRY product** — what the host OS sees (`PIONEER BD-RW BDR-UD04`).
2. **Envelope model** — the `0x60` header field of a firmware component.
3. **Hardware / SAT code** — the platform identifier (`SAT 8A10`), reported in
   the `F1` block and carried in the `0xB0` header field.
4. **Kernel Version** (`0xD0`), a version/identity label.
5. **Destination** (`0xF0`), a distinct label even when its string matches
   Kernel Version.
6. **Kernel Version2** (`0x150`), a third version field.

The `ID`-style numbers (`ID43`, `ID60`, `ID81`, …) are variant labels, **not** a
release ordering and **not** by themselves a compatibility proof. One product or
descriptor string can map to several controller ids with different control words
(§12.2), so a control word is selected by controller id and destination tag (§12.2),
not by the marketing model string alone.

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
carrying, after the opcode, a mode, a buffer-id byte, a 24-bit big-endian
offset, a 24-bit big-endian length, and a control byte. This chapter covers the
raw-memory surface and its permission logic; Chapter 12 covers the update
protocol.

| CDB byte | `READ BUFFER` (`3C`, data-in) | `WRITE BUFFER` (`3B`, data-out) |
|---:|---|---|
| 0 | `3C` | `3B` |
| 1 | Mode in the low 5 bits (`01`, `02`, …) | Mode in the low 5 bits (`01`, `02`, `04`, `05`, `07`) |
| 2 | Buffer id (`B0`, `F1`, `F2`, `F4`, …) | Buffer id (`41`, `F0`, `F2`, `F3`, `FE`, `FF`) |
| 3–5 | Offset, 24-bit big-endian | Offset, 24-bit big-endian |
| 6–8 | Allocation length, 24-bit big-endian | Parameter-list length, 24-bit big-endian |
| 9 | `00` | `00` |

The 24-bit offset and length bound any single transfer; a component larger than
`0x1000000` bytes cannot be addressed. The OEM memory reads put the length in CDB
byte 8 alone (below `0xFF`; `0xA4` is the length that works across generations).

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

Individual reads are bounded on the oldest receiver generation (for example SAT1005), which caps a single `B0` read at 4096 bytes; newer read helpers split long requests internally and apply no length cap. A length of 164 bytes (`0xA4`) works across all generations. The high address ceiling is `0x880300`: reads at or above that
offset are rejected outright, and a transfer that would cross it is clipped.

Whether the gate applies is detected with a one-byte read inside the gated range,
`3C 02 B0 40 00 00 00 00 01 00` (offset `0x400000`, length 1):

| Result | Meaning |
|---|---|
| GOOD, one byte | Receiver is ungated (older generations); no enable is needed. |
| CHECK CONDITION `05/24/00` | Gated; the enable of §11.2 is required, then the read is retried. |
| Any other sense (e.g. `05/20/00` unsupported opcode), a transport failure, or a short response | Not the gate; the enable does not apply. |

The two standard probe windows are `3C 02 B0 00 00 04 00 00 A4 00` (low window,
offset `0x000004`, 164 bytes, readable without the enable on drives that expose
it) and `3C 02 B0 50 00 00 00 00 A4 00` (high window, offset `0x500000`, 164
bytes, refused with `05/24/00` until the enable). A drive can fall out of the
extended-read state in the middle of a long read (for example after a read error);
the enable is idempotent, so re-issuing it restores the state before the read is
retried. Two reads of the same span return identical bytes on a stable drive; a
difference between passes marks the span as unreliable.

#### 11.2 The extended-read enable ("knock")

The enable — the command that lifts the address gate so `02/B0` can reach the
full memory map — is a zero-length `WRITE BUFFER` mode `02`, buffer id `41`
(informally, the "knock"):

```
3B 02 41 A5 AA AA 00 00 00 00        (no data phase)
```

It is **idempotent** — issuing it twice on an already-enabled drive leaves the
drive enabled — and its effect **persists until a full firmware startup clears
it** (§11.3; whether startup clears it on the UD04 is not established, and a bus
reset or software reset is not established to rerun startup). The `0xA5AAAA` field is the offset position of the CDB.

Two state bits in a receiver RAM byte govern this, and their interaction is the
important part:

- **bit 1 — the permission bit.** When set, high-offset `02/B0` reads are
  allowed (§11.3). This is the bit the enable turns *on*.
- **bit 5 — the lockout bit.** When set, it **blocks the enable from ever
  succeeding again** until the drive is power-cycled. This is the anti-tamper
  latch.

In receivers dated 2022-12 onward (for example SAT9401 1.03 and later, SAT8F01
1.04) the `41` handler behaves as follows (code-backed):

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
full firmware startup (§11.3). So a single malformed `3B 02 41 …` attempt can lock
such a drive out of extended-read mode until it restarts, and no amount of correct
enables will recover it before then.

Earlier receivers have a simpler form with no lockout. The UD04 1.14 handler, and
the SAT9401 1.01 and 1.02 handlers, compare only the low 16 bits of the offset with
`0xAAAA`: a match sets bit 1 and any other value clears it. There is no check on the
high offset byte `A5` or on the length, and no bit 5.

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
byte-restorable backup. No read-side mirror of the flash-write CDB (Chapter 12) is known: a
`READ BUFFER 3C 04 FF` query is inferred to be refused with sense `05/24/00`, i.e.
the flash chip is inferred not to be memory-mapped into the `02/B0` address space,
and the distribution-envelope banner (`Copyright(c) 2000 Pioneer`) never
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

#### 11.5 Capturing the running images

The Kernel and Normal in drive memory can be read back as the decoded images of
§5.4 and then re-wrapped as envelopes:

- The Kernel is the `0x10000` bytes at `0x400000`. Its hardware field at image
  `+0x1000` must equal bytes `[16..23]` of the `F1` identity block.
- The Normal begins at `0x410000`; its first 8 bytes read `PIONEER ` and its
  length is the big-endian word at `+0x14` (read 24 bytes first). The length is
  valid if it is at least `0x2000`, a multiple of `0x100`, at most `0x800000`, and
  keeps the image below `0x1000000`. For a scaled-key Normal the length comes from
  the Kernel's receiver geometry (Chapter 17) instead.
- Both images sum to zero as big-endian words (§8.1).
- A re-wrapped envelope needs a header identity, a key seed and, for signed
  generations, a signature. Some identity fields are recoverable from the image, but the complete OEM
  release header is not (§10.4). The OEM seed and signature are not present as
  part of the decoded running image (§11.4), and a signature produced under any other key is not the OEM signature.

#### 11.6 Extended reads and the AACS content path

Host tools use a successful low-window read, or the enable followed by a
successful high-window read, as a Pioneer vendor-open probe. This establishes
memory-read access. It must not, by itself, be treated as proof that arbitrary
disc reads are clear: AACS bus encryption and the content encryption on the
disc are separate layers. Even where the drive removes bus encryption, title
content still requires AACS content decryption.

The Volume ID query is `READ DISC STRUCTURE`
(`AD 01 00 00 00 00 00 80 00 24 00 00`: Blu-ray, format `0x80`, AGID 0,
36-byte allocation). Its response has a 4-byte header, a 16-byte Volume ID at
`[4..19]`, and a 16-byte MAC at `[20..35]`. A host using the vendor-open path
without a standard authentication exchange cannot verify that MAC from the
response alone. A short or all-zero reply supplies no usable Volume ID;
CHECK CONDITION must be interpreted through its sense data. A transport failure
without sense is a transport failure, not proof of either an access refusal or
a particular drive state.

### 12. The firmware update protocol

Firmware installation is driven entirely through the vendor `WRITE BUFFER`
opcode (`3B`), in a fixed sequence of phases distinguished by their five-bit mode
and buffer id. This chapter describes the host-visible protocol and the
receiver-side handling that has been traced to Kernel code.

#### 12.1 The phases

For BDR/BDC-generation drives, the protocol has three logical phases — enter, transfer, finish — with the
transfer phase carrying up to two components (Kernel then Normal). All CDBs are
ten bytes; the 24-bit offset and length are big-endian.

| Phase | Mode / id | CDB (UD04) | Data-out |
|---|---|---|---|
| **Enter update mode** | `04/FF` | `3B 04 FF 00 00 00 00 01 00 00` | 256-byte control buffer |
| **Transfer Kernel** | `07/FE` | `3B 07 FE <off:3> <len:3> 00` | raw Kernel envelope bytes |
| **Transfer Normal** | `07/F0` | `3B 07 F0 <off:3> <len:3> 00` | raw Normal envelope bytes |
| **Finish / commit** | `05/FF` | `3B 05 FF 00 00 00 00 01 00 00` | 256-byte control buffer |

For the linear transfer schedule, the buffer id on the `07` transfer distinguishes the component: **`FE` selects
the Kernel, `F0` selects the Normal.** The raw envelope bytes are sent verbatim,
with no per-chunk header and no host-side transform applied in the transfer
loop. A drive that carries no Kernel in a given update simply omits the `07/FE`
phase and performs the Normal transfer alone; a Normal-only release is the
common case (§5.3). Derived-key updaters use the additional prefix and generated
block described in §12.4. The DVR handshake of §12.9 is a separate prelude on
older supported DVR models; it is not a prerequisite for BDR/BDC update entry.

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
| BDR-213T (`ID43`) | `0xCCC20AB6` |

The receiver validates the control word against a firmware immediate. In the
running UD04 Normal, the `04/FF` handler makes the comparison: a `CMP.L` against the
byte-order form `0x426623FD` of `0xFD236642`, at the control-validator around
`0x44BBC8`,
preceded by a length comparison against `0x100`. Notably an **alternate word is
also accepted**: a prior comparison `CMP.L #0x9A782361,ER0` at `0x44BBB4` (the
on-wire form of `0x6123789A`) branches directly to the same state-setting
continuation, so at least two distinct control words reach the accepted path.
Both accepted words converge on the same continuation, which calls Kernel routines
(through the Normal's slot imports) that pass a `1` through carry into two bits (6
and 7) of a RAM state byte at `0x0144`; Kernel startup diverts to the update service
path when bit 7 is set; a later Kernel
predicate returns "true" only for bit6=1 and bit7=0.

The control word is model-specific, so the same wire bytes that clear the UD04
comparison would not clear another model's; the receiver's acceptance is bound to
its own baked immediate.

The 16-byte string and the word that accompany a given drive follow a table in the traced Autoflasher host executable keyed
by **controller id** (the `SAT` value) and then by the **destination tag** of the
firmware (`GENERAL`, an `IDnn` code, or, on older DVD-era drives, an OEM name such
as `ACER`, `APPLE`, `ASUS`, `DELL`, `HP`, `SONY`, `TOSHIBA`):

- the 16-byte string is a per-controller descriptor (42 distinct descriptors exist
  across 860 controller ids). Several marketing names share one descriptor, and the
  descriptor can differ from the marketing model (BDR-S09 uses
  `PIONEER  BDR-209`, with two spaces);
- the 32-bit word is the entry for the destination tag; a tag with no entry takes
  the controller's **fallback word**, which is `0x6123789A` on 780 controller ids
  (the alternate word accepted by the BDR-UD04 receiver, above) and absent (`0`)
  on the 80 oldest;
- the wire word is the 32-bit value in little-endian order at offset `0x10`.

Examples (word for the stated tag; controller ids as in §10.2):

| SAT id | Tag | Word |
|---|---|---|
| `8A10` | `GENERAL` | `0xFD236642` |
| `8A10` | `ID19` | `0x25ED9753` |
| `8600` | `GENERAL` | `0xB025BEB8` |
| `8600` | `ID43` | `0xCE1F2B98` |
| `8600` | `ID61` | `0xB7E4F43E` |
| `8301` | `GENERAL` | `0x688BF58E` |
| `8301` | `ID43` | `0x490A87AA` |
| `8800`, `8801` | `GENERAL` | `0xF2125032` |
| `8F00`, `8F01` | `GENERAL` | `0xCCEBD625` |
| `8F01` | `ID43` | `0xEE9A5CDB` |
| `9201` | `ID43` | `0xCCC20AB6` |
| `8D30`, `8D31` | `GENERAL` | `0xDD53014A` |
| `8E20`, `8E21` | `GENERAL` | `0x88710AE7` |
| `8231`, `8232` | `GENERAL` | `0xCAC89138` |
| `9401` | `ID43` | `0x98C07527` |
| `8510`, `8511` | `GENERAL` | `0x87A62C65` |

The BDR-UD04 Kernel+Normal update (linear Kernel schedule, §12.4) carries the
fallback word `0x6123789A` in both control buffers. The Kernel+Normal updaters of
the BDR-208 to BDR-213 families instead carry a word that equals one tag entry of
the table (for example `0x66E133E6` = BDR-208 `ID81`, `0x20B42DB4` = BDR-208
`ID60`, `0x82FB6A59` = BDR-209 `ID81`, `0x0014D2B2` = BDR-212 `ID81`), so the word
in use is a property of the update, not of the envelope bytes.

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

The sequence, its timing and its states:

| Step | Command / state | Timing and condition |
|---|---|---|
| Precondition | Tray closed and empty (TEST UNIT READY returns NOT READY `02/3A/xx`; ASCQ `02` means tray open, any other means closed with no medium) | Reprogramming with a medium loaded or the tray open can leave the drive wedged mid-program. |
| Entry | `3B 04 FF 00 00 00 00 01 00 00` + 256-byte control buffer | The drive then settles for about 1 s. |
| Entry check | `INQUIRY` `12 00 00 00 60 00` | Bytes `[0x20..0x22]` must read ASCII `000`; otherwise no transfer is started. |
| Transfer | `3B 07 FE …` (Kernel) then `3B 07 F0 …` (Normal), chunks of at most `0x8000` | No delay between chunks; the receiver stages each chunk synchronously. Any non-GOOD status on a transfer write aborts the sequence (no retry of a write). |
| Kernel settle | After the final `07/FE` chunk, before any `07/F0` data | The drive programs its Kernel and restarts its Kernel startup at this point; the OEM updaters wait about 2 s here. |
| Finish | `3B 05 FF 00 00 00 00 01 00 00` + the same 256-byte control buffer | The drive programs the Normal after the command completes, so the host polls for completion (OEM updaters poll at 1 s intervals; they wait about 2 s only after a non-zero finish result). |
| Completion | `GET EVENT STATUS NOTIFICATION` `4A 00 00 00 10 00 00 00 08 00` (media class, 8 bytes) interleaved with `TEST UNIT READY` `00 00 00 00 00 00` | The drive answers CHECK CONDITION until programming and restart finish; the traced OEM host uses GET EVENT STATUS, TEST UNIT READY, sense data and a final INQUIRY/revision check; TEST UNIT READY alone is not its completion criterion. |

Sense semantics during this sequence: `UNIT ATTENTION` (key `6`) clears itself and
a *read* may be repeated once, but a data-out write is never repeated (re-sending a
chunk could re-trigger the program step); `RECOVERED ERROR` (key `1`) and the
no-medium state (key `2`, ASC `3A`) are benign on identity reads; `05/24/00`
(INVALID FIELD IN CDB) identifies the gate only for the bounded `02/B0` probe
of §11.1; on another CDB it may simply mean an unsupported field or command.

A transfer or finish that fails after a successful entry can leave the drive
holding partial firmware. Recovery depends on an intact, reachable receiver and
a compatible replacement component set; it is not guaranteed by the protocol.
When the Kernel is intact but the Normal fails the boot gates, the Kernel keeps its
update receiver running instead of starting the Normal (§13.2), so the drive can
still be re-flashed.

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

The CDBs are `3B 07 FE 00 00 00 00 80 00 00`, `3B 07 FE 00 80 00 00 80 00 00` and
`3B 07 FE 01 00 00 00 12 00 00`; the offset is the source offset, with no gap.

**Five-write generated-block schedule** (derived-key generations; the updaters of
the BDR-208, -209, -211, -212 and -213 families and the models built on the same
silicon, all with `0x11200`-byte Kernel envelopes). With `K` the Kernel envelope:

| Step | CDB | Length | Data |
|---:|---|---:|---|
| 1 | `3B 07 F0 00 00 00 00 12 00 00` | `0x1200` | `K[0x0000..0x1200)` (header and first `0x1000` bytes) |
| 2 | `3B 07 FE 00 00 00 00 02 00 00` | `0x200` | 512 generated bytes (below) |
| 3 | `3B 07 FE 00 12 00 00 80 00 00` | `0x8000` | `K[0x0200..0x8200)` |
| 4 | `3B 07 FE 00 92 00 00 80 00 00` | `0x8000` | `K[0x8200..0x10200)` |
| 5 | `3B 07 FE 01 12 00 00 10 00 00` | `0x1000` | `K[0x10200..0x11200)` (trailer) |

The CDB offsets `0x1200`, `0x9200` and `0x11200` of steps 3–5 are staging offsets
equal to the source offset plus `0x1000`, leaving the first `0x200` staging bytes to
step 2. The 512 generated bytes are produced by the C-runtime linear congruential
generator on a 32-bit state, `state ← state·214013 + 2531011 (mod 2^32)`, emitting
`(state >> 16) & 0xFF` per byte, seeded from the host's millisecond tick counter;
the block is not derived from the envelope. The Normal then follows as `07/F0`
chunks (the BDR-212 1.05 Normal is `0x1D7600` bytes) and the sequence ends with
`05/FF`.

The choice of schedule **correlates with the Kernel envelope layout** —
front-key ↔ three-write, derived-key ↔ generated block — which is the same
distinction the Kernel encodes in its `CMP.B #FE/#F0` register choice (§7.3). A
transitional three-slice variant appears in some of the oldest updaters.

The Normal transfer is a straightforward loop of `07/F0` chunks of at most
`0x8000` bytes over the complete envelope length; for a `0x1D7000`-byte Normal
envelope this is 58 full `0x8000` chunks plus one `0x7000`-byte final chunk (59
transfers total). There is no per-chunk delay; the only pause in the transfer is the Kernel settle of §12.3, between the last `07/FE` chunk and the first `07/F0` chunk.

#### 12.5 Receiver dispatch

Inside the Kernel, the update receiver dispatches on the buffer id of the
incoming `WRITE BUFFER`. The three ids map to three processing phases:

- **`FE` → Kernel reception (phase 0)**
- **`F0` → Normal reception (phase 1)**
- **`FF` → control (phase 2)**

This is the same `FE`/`F0` distinction visible as the adjacent `CMP.B` pair in
Kernel bodies (§7.3). In a traced SAT8301 receiver, `F0`, `FE`, and
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

These steps run inside the command that delivers the final `07/FE` chunk. Once
exactly `0x11200` bytes have accumulated, the receiver decodes the image, checks the
zero sum and compares against the current Kernel; it then masks interrupts, copies
the Kernel writer (`0x400A60..0x400B0C`) to RAM at `0x2800`, and erases and programs
the 64 KiB in `0x100`-byte pieces. The writer ends with a jump to the Kernel start
at `0x400100`, which reloads the stack pointer, re-runs the boot gates and restarts.
Bits 6 and 7 of the state byte at `0x0144` survive that restart (the start code
clears only bit 4), so update state persists and the host continues with `07/F0`
without re-entering `04/FF`.

The `F0` (Normal) chunk arm only stages the chunk and checks capacity, so it needs no
pacing. The `FF` (finish) arm decodes and checks the signature and checksum
synchronously, then copies the Normal writer to RAM at `0x2800` and sets `0x014D`
to 1; the Kernel main loop programs the Normal after the command completes.

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

#### 12.9 The DVR kernel-mode handshake (`F3` / `F2`)

The term **kernel mode** has two uses that must be kept separate. A drive can
run its Kernel update receiver because the Normal is absent or fails its boot
checks (§13.2). Older DVR host tools also use a command sequence called the
kernel-mode handshake before update entry. That handshake is a DVR mechanism;
BDR/BDC-generation drives enter their update session through `04/FF` without it.
Neither mechanism is the extended-memory-read enable of Chapter 11.

**DVR host protocol.** The traced Autoflasher selects this prelude for controller
IDs `0001`, `0003` and `0004`, associated with the earliest DVR recorders
(DVR-A03/A04/A05 and related identities). This establishes the host's routing,
not universal support on every model whose name starts with DVR. The sequence
uses the ANSI-C linear congruential generator on a 32-bit state:

```
state ← (state · 0x41C64E6D + 0x3039) mod 2^32
byte  ← (state >> 16) & 0xFF
```

| Step | Command | Data and interpretation |
|---:|---|---|
| 1. Arm | `3B 01 F3 00 00 00 00 00 00 00` | No data phase. |
| 2. Challenge | `3C 01 F2 00 00 00 00 04 00 00` | Read `0x400` bytes; the first four identify the generator seed. |
| 3. Solve | Host calculation | Try seeds `0..0xFFFF` in ascending order; choose the first whose first four generated bytes match the challenge prefix. |
| 4. Response | `3B 01 F2 00 00 00 00 01 00 00` | Write `0x100` identical bytes, each `~b & 0xFF`, where `b` is the output of step `0x401` from the recovered seed. |
| 5. Update entry | `3B 04 FF 00 00 00 00 01 00 00` | Send the ordinary 256-byte control buffer of §12.2. |

The solver restarts at the recovered seed, discards `0x400` generated bytes,
then complements the next byte; it does not continue from the four-byte seed
search state. For seed `1`, the challenge prefix is `C6 7E 81 6B`; the response
is 256 copies of `63`, the complement of output byte `0x401` (`9C`). A challenge shorter
than four bytes or with no matching 16-bit seed is not solvable by this host
algorithm. The arm and response are data-out operations that must not be
blindly retried after an ambiguous result; the challenge is a data-in command.

The command construction and solver are implemented in the `dvr` and `drive`
modules of `pioneer-optical`. Its host API selects the prelude for its DVR
class and skips it for its BD class. That software classification is broader
than the three controller IDs established in the traced executable; it does
not supply missing receiver evidence for other DVR models. The earliest DVR
receiver behavior has not been independently decoded, so its exact challenge
generator, acceptance checks and model coverage are not independently proven
from drive code here.

**Why it is not a BDR/BDC unlock.** In the examined Blu-ray firmware, the apparent
`F2/F3/F4` table belongs to an internal transfer sequencer. Its discriminant
comes from a fixed RAM structure, not the incoming SCSI CDB, and its F3 arm
requires update phase 9. In the UD04 1.14 Normal, that arm begins at
runtime `0x4218B2` with `6A 08 2C 46 A8 09 58 60`: load the phase byte at
`0x2C46`, compare it with 9, and branch away on mismatch. The arm advances the
expected transfer ID at `0x2C24`; it does not grant flash permission or bypass
the control-word or incoming-image marker checks. The actual command dispatcher
has no route from a cold `01/F3` or `01/F2` request to this sequence. Live
UD04 observations report refusal with sense `05/24/00`.

The same phase-gated structure appears across the examined Blu-ray generations,
including BDC-202 and later BDR families. Finding `0x41C64E6D` and `0x3039` in a
Normal image only identifies a general-purpose random-number routine; it does
not connect that routine to a SCSI challenge handler. Blu-ray downgrade therefore
uses the ordinary update path and the image checks of Chapter 15, not a DVR
runtime unlock.

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
   `0x410014` is loaded, an address ceiling of `0x5DFFFF` or `0x7CFFFF` (other generations use
   other ceilings, for example `0x5E7FFF` in S13 1.05) is
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

The mismatch branch is a soft failure, not a brick: the jump to `0x4057DE` never
reaches the Normal's entry call (`JSR 0x4049CA`) but keeps the Kernel's update
receiver running, so a Kernel and Normal whose marker bytes disagree leave a drive
that does not boot its application yet still accepts a new update. For a Kernel that implements this equality gate, the two marker bytes must
agree; a Normal-only or Kernel-only write across the generation
boundary can leave this state.

#### 13.3 The runtime import contract

Passing the boot gates is necessary but not sufficient for a Normal to run: it
must also match the Kernel's **export ABI**. As described in §5.2, the Normal
imports Kernel service slots `0x400A00..0x400A5C` through a fixed run of wrapper
calls. Examined Normal images show three distinct import target sets
across generations; among co-shipped pairs with recognised import/export runs,
all show complete slot coverage. This import surface, together with the
generation-dependent Normal entry address (§5.2), constitutes an interface contract between the two components that is
independent of, and additional to, the header-identity gates.

### 14. Pairing and cross-model compatibility

A firmware release supplies a Kernel and a Normal as a **co-shipped pair**. This
chapter states what makes a pair valid, what the drive actually enforces, and the
evidence for the pairing rules.

#### 14.1 The co-shipped pairing invariants

Across examined unambiguous co-shipped pairs, the following identity fields
match within a pair: hardware (`SAT`), embedded model / full identity, file type,
Destination, and Kernel Version2. Among 253 unambiguous distinct
co-shipped pairs, **all 253** matched on hardware, embedded model/full identity,
type, Destination, and Version2; **252** also shared the advertised release
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
  decoded Kernel body spans two distinct *embedded* header models. Among
  140 distinct decoded Kernel bodies across 89 catalogue model labels, 30 body
  hashes occurred under multiple labels, and none spans two embedded models. Marketing-name equality is therefore not a licence to
  interchange; embedded identity and type are what matter.
- **Near-identical bodies differ only in data, not code.** Pairs of decoded
  Kernels from different models can exceed 95% byte identity while differing by
  fewer than 64 bytes. All 291 such near pairs differ only in the boot-type ASCII at
  image `0x1008`, the checksum-compensation word at `0x1020` (with the adjacent
  bytes `0x1021..0x1023`), and the 24-byte commercial identity string. This is strong
  evidence of **shared executable implementations parameterised by model/type
  data** — the same code, stamped with different identity and its compensating
  checksum. (The one executable immediate that differs between near-identical
  bodies of a single model is at `0x40B8FC`: `0x3700` in BDR-208M 1.40 and `0x36E0`
  in 1.50, purpose unresolved.)

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
advertised date is not later than the Normal's date.** Across 252 known original
pairings this rule recovers the exact original Kernel uniquely in **252/252**,
with no ties; adding Kernel-Version2 to the match key gives the same result.
Weaker rules do worse — in a 170-pair sample "newest overall" recovered only 89/170
on hardware+type, and type-only-with-date-cutoff yielded 56 ties — establishing that **hardware is
material** to the query. This is a recovery rule for *known* pairings; it is not
a proof of compatibility for arbitrary unseen combinations, and later-dated
Kernels are excluded from it rather than proven incompatible.

#### 14.6 Same-silicon cross-model pairs

The pairs below are reported cross-model routes from community practice and
host-tool profiles. They are evidence for particular model combinations, not a
general rule that matching silicon guarantees interchangeability; physical
mechanism, peripheral configuration and firmware generation still matter. Direction is native hardware → firmware it can run, and the documented routes use a complete, self-consistent foreign Kernel and Normal pair (the Kernel
whose date is not later than the Normal's, §14.5), never a lone Normal or Kernel.

| Native SAT id (model) | Runs firmware of |
|---|---|
| `8231`, `8232` (BDR-XD05) | `8B30` (BDR-XD06J-UHD) |
| `8301` (BDR-208) | `8800` (BDR-211 v1); also reachable through `8600` |
| `8510`, `8511` (BDR-UD03 v1, v2) | `8A10` (BDR-UD04) |
| `8590` (BDR-US03) | `8591` (Asus SBC-06D2X-U) |
| `8600` (BDR-209 v1) | `8800` (BDR-211 v1) |
| `8601` (BDR-209 v2) | `8801` (BDR-211 v2) |
| `8D30` (BDR-XD07) | `8D31` (BDR-XD07U) |
| `8E20` (BDR-XS07) | `8E21` (BDR-XS07U) |
| `8F00` (BDR-212) | `8F01` (BDR-212U / BDR-S12U) |
| `9000` (BDR-X12) | `9001` (BDR-X12U) |
| `9200` (BDR-213M) | `9201` (BDR-213U / BDR-S13U) |
| `9330` (BDR-XD08) | `9331` (BDR-XD08U) |
| `9400` (BDR-X13) | `9401` (BDR-X13U) |

Nearly all pairs are a non-UHD to UHD sibling that differs only in the low nibble of
the controller id. The reason a lone Normal is unsafe is the boot gates: a
Normal-only downgrade or crossflash onto a retained newer Kernel can fail the
marker equality of §13.2, and a Kernel-only write can too. Older Kernels that
lack this equality gate must be analysed under their own boot rules.

### 15. The generation marker and downgrade

Firmware downgrade — installing an older revision over a newer one — turns on a
single byte in the decoded Kernel body and the receiver logic that inspects it.
This chapter describes that byte, the two code sites that gate on it, the
transform that enables a downgrade, and the boundaries of what the transform
establishes.

#### 15.1 The marker byte and its chronology

The decoded Kernel body carries a **generation / "incoming" marker at body offset
`0xFE`** (runtime address `0x4000FE`). Two values dominate, split cleanly by era:

- **`01`** — newer Kernels. All 107 decoded `01`-marker Kernels among examined releases
  carry advertised dates from 2022-12-12 through 2024-10-09.
- **`FF`** — older Kernels. The 69 decoded `FF`-marker Kernels carry dates from
  2003-08-01 through 2022-05-31.

The transition is visible *within* hardware/type lines as firmware advances: S09
`1.54→1.55`, S11 `1.53→1.54`, XD05 ID34 `3.10→3.11`, and XD07U ID05 `1.04→1.05`
all flip `FF→01`. A handful of other raw `0xFE`-position values occur in
individual older images (exactly `00`, `0C`, `0D`, `18`, `55`); these are
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
`FF` and `00` — it does **not** require exactly `01`. (There is one exception: when
the state bit tested at RAM `0x06C2` bit 0 is set and the installed Normal's length
word at `0x410014` is `0xFFFFFFFF` — an erased Normal — `FF` and `00` are accepted.)

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
`FF`/`00` rejection, and the two incoming-marker lookups) co-occur: in a firmware
scan they appear together in all 107 `01`-marker Kernel envelopes across 26 hardware
labels, and in **none** of the 69 decoded `FF`-marker envelopes. This supports a genuine *generation barrier* implemented by the newer
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
envelope for a given target Kernel. Adding `0xFE00` to the big-endian word at
`0x1020` changes byte `0x1022` (a carry can reach `0x1021`); for the BDR-UD04 1.00
Kernel the edited image differs from the original at exactly `0xFE` and `0x1022`.
The envelope's first `0x1200` bytes (header and key table) are unchanged. In the traced modern Kernel receive arm, the integrity check is additive
rather than ECDSA (§8.1, §8.4), so this Kernel edit needs no new signature. The
Normal remains unchanged: its generation byte is within its signed payload
(envelope offset `0x10228` in the front-key layout), and reproducing an OEM
signature on an edited Normal would require the OEM private key. The same marker/checksum operation applies
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

The DVR handshake does not provide an alternative Blu-ray downgrade route
(§12.9). The incoming marker predicate and the control-word membership test
are separate checks: accepting a fallback control word does not establish that
the marker predicate was bypassed. The erased-Normal exception in §15.2 is a
specific receiver-state condition, not a general unlock. The older target
Kernel's boot rules, the complete component pair and post-write readback remain
necessary parts of any end-to-end downgrade claim.

### 16. Release packages versus complete flash state

A firmware release package is evidence for **which envelopes that release
supplies**, not a snapshot of every region resident on a drive. Across releases
the shipped set varies: many carry one Normal only; others carry a Normal plus a
Kernel; a few carry two hardware-variant Normals; and older drives may carry only
the legacy `Plane` role. Among 456 examined release bundles (approximate figures), 248
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

The modern H8S/SAT envelope described in Parts II–IV is not universal. The older
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
length**. The BDC-S02 1.07EU envelope is the worked example; its receiver
is inferred to require a total Normal size of `0x1CB200`, decodes a `0x1B0000`-byte image, and
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

The receiver's constants satisfy fixed relations that fully determine the
geometry: `envelope length = 0x200 + key length + image length`,
`image length = 16 × key length` (and a multiple of `0x100`, at least `0x2000`),
and `payload address − 0x10400 = key length`. Equivalently the body past the header
is 17 equal units, a key unit followed by 16 image units, so `(envelope length −
0x200)` is a multiple of 17. The Normal's two XOR exceptions (§7.2) apply, the
decoded image begins `PIONEER ` and sums to zero as big-endian words, and the
envelope carries no declared length, so the lengths come from the Kernel's
constants or from the 17-unit relation.

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
The Kernel decoder arguments for SAT1005/1014/1030/1050 are inferred to select length `0x10000`,
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
unique geometry appears across all eleven distinct 64 KiB ATA0006/0007/0008
Kernels; all eleven decode with padding, checksum, Pioneer-identity, and
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

A distinct sparse layout appears in roughly 35 distinct 128 KiB samples of the
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
shared by **both** Kernel and Normal roles: in a survey of roughly 124 older ATA/SCSI
Normal envelopes, about 56 exhibited the exact erased gaps plus the zero wrapping
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

Of 259 distinct Kernel envelopes, 195 decode under the modern codecs and 11 under
the legacy little-endian codec (§18), while 53 (the ATA0004/0007/0008/
0009/0010/0011/0064/0068/0070 and SCSI0001 groups, among others) remain outside
the proven codecs. Their being "undecoded" is a limit of characterisation, not
evidence that the images are corrupt.


---

## Part VI — Synthesis

### 21. Open problems

The description above is deliberately conservative: where the firmware's
behaviour has not been traced to code or observed on a drive, it is deferred here
rather than asserted. The following are the material open problems, roughly in
order of how load-bearing they are.

1. **Signature trust policy (the central question).** The Kernel supplies the
   header's public point into the hardware validation engine (registers in the `0xFF3FFxxx` range)
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
   a post-boot runtime view, not the persistent update store; no read-side
   counterpart of the `04/FF` flash write is known, and the envelope banner is absent from any runtime
   capture. No verified command reads back the exact on-flash Kernel/Normal
   bytes, and no per-unit personalisation boundary has been mapped. Whether a
   captured runtime image plus a re-signed envelope constitutes a byte-restorable
   backup is therefore unproven.

4. **The hardware validation engine.** The exact operation of the engine
   (`0xFF3FFxxx` register range), its use of the SHA-1 stage (whose initial words the Kernel
   loads), and its key-trust policy are not fully traced. The changing 40
   bytes are ECDSA scalars (§8.2); identifying that mathematics does not
   establish the hardware's acceptance policy. The independent SHA-256 K schedule at `0x59D474` implies a SHA-256
   implementation whose consumer has not been tied to the update or content path.

5. **The extended-read enable semantics.** The examined older handler checks the low
   offset word `AAAA`, while the examined newer handler checks the complete
   `A5AAAA` value and a length condition (§11.2). Coverage of other receiver
   variants and the exact reset events that clear their state remain incomplete. The precise partition
   between the always-readable low range and the gated high range has not been
   mapped exhaustively.

6. **Alternate and multiple control words.** At least two control words reach the
   accepted entry path (§12.2), and several models circulate with more than one
   control word (e.g. `PIONEER  BDR-208` and `PIONEER BDR-212T` each with
   multiple keys). No envelope field has been shown to select which word a given
   receiver requires, so a bare pair of `.enc` files cannot unambiguously
   determine the control word from the envelopes alone. The traced Autoflasher indexes
   words by controller id and destination tag with a per-controller fallback
   (§12.2), but which fields the receiver itself keys on is not proven.

7. **Downgrade end state and restoration.** Whether a marker-edited older Kernel,
   once installed on a newer drive, boots cleanly as the older firmware — and
   whether the *original* older marker should be restored for a genuine OEM state
   — is not established. The old receiver's acceptance, its required control
   identity, its Kernel-only transfer/commit behaviour, and the final cold-boot
   readback are all open for an unverified target pair. The DVR `F3`/`F2`
   handshake is not a Blu-ray marker-gate bypass (§12.9).

8. **The 236-byte control-buffer tail.** Only the 16-byte model string and the
   4-byte control word are established as meaningful in the 256-byte control
   buffer; whether the trailing 236 zero bytes are ignored by the receiver is not
   proven.

9. **The earliest DVR/BDC families.** The undecoded ATA0004/SCSI0001-class
   images (Part V) have no identified CPU instruction set, live flash map, or
   receiver validation routine. The 128 KiB sparse family is decodable as a
   checksum wrapper but its final-region transform (if any) is uncharacterised.

### 22. Summary

Pioneer's H8S-generation firmware is a two-component system — a small,
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
identity against the Normal, and across the examined releases the executable bodies are
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
       │ Pioneer Corporation  ********"                │  fixed banner
0x060  ├──────────────────────────────────────────────┤
       │ Eight labelled identity/release fields:       │
       │   0x60  Model             0x90  Revision      │  256 B
       │   0xB0  Hardware (SAT)    0xD0  Kernel Version│  (highly stable
       │   0xF0  Destination       0x110 File Type     │   between releases)
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

The READ/WRITE BUFFER CDBs are 10 bytes; their 24-bit offsets and lengths are
big-endian. Standard commands below retain their own 6-, 10- or 12-byte formats.
The DVR handshake rows are scoped by §12.9 and are not Blu-ray update steps.

| Purpose | CDB | Data |
|---|---|---|
| Vendor identity | `3C 02 F1 00 00 00 00 00 30 00` | in: 48 B identity block |
| Memory read (gated) | `3C 02 B0 <off3> <len3> 00` | in: 164 B works on all generations (4096 B cap on the oldest receivers) |
| Extended-read enable | `3B 02 41 A5 AA AA 00 00 00 00` | (none) |
| Enter update mode | `3B 04 FF 00 00 00 00 01 00 00` | out: 256 B control |
| Transfer Kernel chunk | `3B 07 FE <off3> <len3> 00` | out: raw envelope bytes |
| Transfer Normal chunk | `3B 07 F0 <off3> <len3> 00` | out: raw envelope bytes |
| Finish / commit | `3B 05 FF 00 00 00 00 01 00 00` | out: 256 B control |
| Completion polling | `4A …` GES, `00 …` TUR, `12 …` INQUIRY | — |
| Power-state cycling | `1B 00 00 00 {20,00,02} 00` | — |
| Completion poll (exact) | `4A 00 00 00 10 00 00 00 08 00` | in: 8 B |
| Standard INQUIRY | `12 00 00 00 60 00` | in: 96 B (update-mode check: bytes `[0x20..0x22]` = `000`) |
| Low-window read | `3C 02 B0 00 00 04 00 00 A4 00` | in: 164 B |
| High-window read | `3C 02 B0 50 00 00 00 00 A4 00` | in: 164 B (gated) |
| Gate probe | `3C 02 B0 40 00 00 00 00 01 00` | in: 1 B |
| Drive-flags window | `3C 02 F4 00 00 00 00 01 00 00` | in: 256 B (layout not established) |
| DVR handshake arm | `3B 01 F3 00 00 00 00 00 00 00` | (none) |
| DVR handshake challenge | `3C 01 F2 00 00 00 00 04 00 00` | in: 1024 B |
| DVR handshake response | `3B 01 F2 00 00 00 00 01 00 00` | out: 256 B |
| Volume ID (after open) | `AD 01 00 00 00 00 00 80 00 24 00 00` | in: 36 B |
| Firmware date feature | `46 02 01 0C 00 00 00 01 00 00` | in: feature descriptor |
| Serial feature | `46 02 01 08 00 00 00 01 00 00` | in: feature descriptor |

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
    validation performed via hardware engine (registers 0xFF3FFxxx)

Sizes:
    Kernel envelope 0x11200 ; decoded Kernel body 0x10000
    Kernel staging base 0x10200 ; key staging +0x200 ; image staging +0x1200
    transfer chunk cap 0x8000

Update control buffer (256 B, data-out for 04/FF and 05/FF):
    0x00  16-B internal model string
    0x10   4-B control word (LE on wire)
    0x14  236 zero bytes
  example control words:
    UD04 GENERAL 0xFD236642 · S09 0xCE1F2B98 · 209D 0xB7E4F43E · 213T 0xCCC20AB6
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

Normal decode extras:
    XOR skipped (rotate kept) at two word offsets taken from the paired Kernel's
    CMP.L/BEQ pair ; UD04 1.14: 0x16900, 0x77300 ; envelope = 0x10200 + image
    key table 0x10000 at envelope 0x200 (or 0x10200) ; scaled: 17 units

Generated Kernel block (bounded updaters), CRT rand, 32-bit state:
    state <- state*214013 + 2531011 ; byte = (state >> 16) & 0xFF ; 512 bytes

DVR host-handshake LCG (F3/F2; not a BDR/BDC prelude):
    state <- state*0x41C64E6D + 0x3039 (mod 2^32) ; byte = (state >> 16) & 0xFF
    seed 16-bit from 4 challenge bytes ; response byte = ~byte(step 0x401)
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
- **Control word** — the controller/destination-selected 32-bit value in the update control buffer
  gating entry into update mode; historically the "kernel-mode-entry key".
- **DVR handshake** — the older `01/F3` arm, `01/F2` challenge and response
  prelude (§12.9); distinct from BDR/BDC update entry and from the read enable.
- **Kernel receiver mode** — execution of the Kernel update service without
  starting the Normal application, for example after failed boot checks.
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

## References

Specifications define the underlying instruction set and protocols. Open-source implementations document host behavior; receiver-specific findings above come from the identified firmware and traces. Community reports are not independent proof of receiver compatibility.

### Specifications

- Renesas, *H8S/2600 Series, H8S/2000 Series Software Manual* (instruction set, registers and exception handling): https://www.renesas.com/en/document/mah/h8s2600-series-h8s2000-series-software-manual
- NIST, *FIPS 180-4, Secure Hash Standard (SHA-1 and SHA-256)*: https://csrc.nist.gov/pubs/fips/180-4/upd1/final
- ANSI X9.62, *Public Key Cryptography for the Financial Services Industry: The Elliptic Curve Digital Signature Algorithm (ECDSA)* — licensed standard
- IETF, *RFC 1950, ZLIB Compressed Data Format Specification*: https://www.rfc-editor.org/rfc/rfc1950
- T10, *SCSI Primary Commands (SPC-4)* (INQUIRY, READ BUFFER, WRITE BUFFER, sense keys) and *SCSI Multimedia Commands (MMC-6)* (GET CONFIGURATION features `0x0108` and `0x010C`, READ DISC STRUCTURE format `0x80`): https://www.t10.org/
- T10, *SCSI Additional Sense Code assignments*: https://www.t10.org/lists/asc-num.txt

### Open-source implementations

**Drive access and firmware formats**

- [pioneer-optical](https://github.com/MattJackson/pioneer-optical) — envelope
  decoding, signature verification, DVR challenge solver and drive command sequences.
- [freemkv firmware tools](https://github.com/freemkv/freemkv-firmware) — host-side
  backup, flash planning and update execution; implementation policy is distinct
  from a receiver requirement.
- [freemkv](https://github.com/freemkv/freemkv) and
  [libfreemkv](https://github.com/freemkv/libfreemkv) — optical-disc extraction and
  shared SCSI access, including the Pioneer integration.

**Instruction analysis**

- [GNU binutils H8-family disassembler](https://sourceware.org/git/?p=binutils-gdb.git;a=blob;f=opcodes/h8300-dis.c)
  — instruction decoding; select the appropriate H8S machine mode.

### Research and community references

- MakeMKV forum, discussion of Pioneer BDR-212 variants and cross-model firmware: https://forum.makemkv.com/forum/viewtopic.php?t=33192
