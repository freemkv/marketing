---
title: Firmware tools
description: freemkv-fw and freemkv-flash — the two CLI tools for building and installing freemkv firmware — plus the full command ABI the resulting firmware answers to on the wire.
---

freemkv firmware turns a supported optical drive into a faster, unlocked drive. Two small
command-line tools do the work: **freemkv-fw** builds and checks firmware images, and
**freemkv-flash** writes them to a drive. Both are also documented on the public
[Firmware](/firmware/) pages, which cover finding a base image, building it, and flashing it
step by step; this page is the detailed reference — for the tools themselves, for identifying
your drive, and for the command ABI the firmware they build actually implements.

## freemkv-fw

`freemkv-fw` turns a base MediaTek firmware image into freemkv firmware, and checks whether a
file or a live drive is already freemkv.

### create

```bash
freemkv-fw create <input.bin> [output.freemkv.bin]     # default output: <input-stem>.freemkv.bin
freemkv-fw create <input.bin> --json                   # machine-readable per-capability report
freemkv-fw create <input.bin> --audit                  # verify every applied patch actually landed
```

Takes one stock (OEM) image and produces one freemkv image. It **auto-detects the chipset**
(MediaTek MT1959 or MT1939) from the image, then applies **every capability that drive supports
and reports each one individually** — it is never all-or-nothing. A capability whose signature
isn't found on that particular image is reported and skipped; the rest still apply. Each
capability comes back as one of four states:

| Report | Meaning |
|---|---|
| **applied** | the patch was added on this run |
| **already set** | the feature is already present (e.g. re-running on freemkv firmware) — a safe no-op |
| **n/a** | out of scope for this drive (e.g. Raw Read on a DVD-only drive) |
| **skipped** | in scope, but the signature wasn't found on this image (nothing is written) |

Running `create` on freemkv firmware again is **idempotent**: every capability reports *already
set* and the output is byte-identical to the input. `--audit` (also `create --audit`) re-derives
the exact expected patch bytes and confirms each applied capability actually landed at its hook
site — an automated correctness check, no drive required. The drive stays completely stock until
the freemkv command is sent — see [Command reference](#command-reference) below.

| Capability | What it does | Status |
|---|---|---|
| Identity | Answers the "are you freemkv?" ping | ready |
| Speed | Sets the read-speed / riplock ceiling — a settable cap, not just on/off | ready |
| Region-free | Every DVD reads as region-free (DVD-only) | ready |
| Raw Read | Approves the host certificate so the drive drops AACS drive↔host authentication. The drive then releases the Volume ID (and the other AACS-gated values) to a normal `READ DISC STRUCTURE`, and because no AKE handshake ran there's no bus key, so reads come back exactly as they sit on the disc — bus encryption is off for free (content stays AACS-at-rest encrypted; the host applies title keys) | ready |
| Diagnostic Dump | Reads 64-byte windows of firmware RAM | ready (diagnostic use) |

These map 1:1 to the sub-functions in the [command reference](#command-reference) below. Which
capabilities apply to a given image depends on the chipset and generation, so `create` reports
them per image rather than assuming. Every build is **statically verified** (integrity re-signs,
structural audit passes); on-drive hardware validation is the one remaining step for newer
drive families.

### verify

```bash
freemkv-fw verify <file-or-device>
```

Answers one question two ways. Point it at a **file** to check the firmware image's own
internal integrity. Point it at a **live drive** (e.g. `/dev/sg0`) to send the Identity command
over SCSI and report what the drive itself says back.

## freemkv-flash

`freemkv-flash` is a generic MediaTek (MT19xx) optical-drive flasher and dumper. It isn't
specific to freemkv — it can read and write any compatible firmware image. It always backs up
before writing, and reads back every write to confirm it took.

### info

```bash
freemkv-flash info <device>        # identify a live drive
freemkv-flash info <image.bin>     # classify a firmware file
```

`info` works on **either a live drive or a firmware file** — it auto-detects which. On a
**device** it reports the drive's **vendor**, **product**, and **firmware revision** (from the
drive's own SCSI `INQUIRY` data). On a **file** it classifies the image: chipset (MT1959 /
MT1939), vendor/model/revision, media capability (BD / UHD / DVD), whether the tool can flash it,
and whether its integrity tables are valid. Both use the **same detection**, which is exactly
what the flasher's file↔drive safety check compares. Read-only and safe.

### dump

```bash
freemkv-flash dump <device>
```

Reads the drive's current firmware to a file. Always dump and keep a backup before flashing
anything.

### flash

```bash
# dry-run (default — plans the write, changes nothing):
freemkv-flash flash --input <image.bin> <device>

# actually write it:
freemkv-flash flash --input <image.bin> <device> \
    --execute --i-understand-risk --backup <backup.tar>
```

Writes an image to the drive. **It is dry-run by default** — without `--execute` it only prints
the plan and writes nothing. A real write requires `--execute` and `--i-understand-risk`, and
takes a **mandatory pre-flash backup** first (`--backup`), then reads the image back to verify.
Before flashing it runs the same file↔drive check as `info`, refusing an image whose chipset
family doesn't match the connected drive.

Executable writes are supported today for **MediaTek MT1959**; other families are catalogued and
can be planned (dry-run) but are gated off real writes until validated on hardware. `flash` is
newer and less battle-tested than `info`/`dump` — always keep your own separate dump as well.

:::caution[Crossflash is experimental]
`--allow-crossflash` waives the drive-*model* match (but **never** the chipset-family match, and
never the backup/risk gates) to flash one MT1959 drive's firmware onto a different MT1959 drive.
It is **experimental and not hardware-validated**, warns on capability mismatches (e.g. UHD vs
non-UHD), and can brick an incompatible drive. Same-chipset only; different chipsets are always
refused.
:::

## How do I tell what drive I have?

Before building or flashing anything, confirm what you're working with — vendor, model, and
firmware revision:

- **`freemkv-flash info <device>`** — the quickest path; prints the drive's vendor, product,
  and firmware revision straight from its `INQUIRY` data.
- **Linux, `lsscsi`** — lists attached SCSI/ATAPI devices, including the vendor and model
  string, without touching the drive.
- **Linux, `sg_inq <device>`** (from `sg3-utils`) — issues a standard `INQUIRY` directly and
  prints the same vendor/product/revision fields `freemkv-flash info` reads.
- **The label on the drive itself**, or on Windows, **Device Manager → DVD/CD-ROM drives** — the
  model string printed there usually matches the `INQUIRY` product field.

Once you have vendor + model + firmware revision, check it against the base images in the
firmware index (see the [Firmware → Find](/firmware/) page) before building.

## Supported firmwares

freemkv-flash's `create`/`verify` tooling targets **freemkv** firmware, but the flasher itself
is generic and can also identify drives running other unlock firmwares:

| Firmware | Support |
|---|---|
| **[FreeMKV](#command-reference)** | Fully supported — freemkv builds, verifies, and identifies it |
| **MK** | Partial |
| **OmniDrive** | Untested |

See [Unlocked drives](/docs/drives-unlocked/) for which physical drive families these firmwares
target.

## Command reference

Every `freemkv-fw` command is a **hijack of the standard SCSI `READ BUFFER` (`0x3C`)** command,
discriminated by an OEM-unused mode byte plus a 2-byte knock. `READ BUFFER` is used because it's
a standard opcode that USB/UAS bridges pass through unmodified (a bare vendor opcode gets
rejected by the bridge), and it returns data through an existing transfer path. freemkv claims
an OEM-unused mode byte and hands every other mode straight back to the stock handler, so normal
`READ BUFFER` behavior stays byte-identical until the knock arrives.

The full discriminator is the 4-byte prefix **`3C 0E C0 DE`**: standard opcode + OEM-unused mode
+ knock. There is no separate vendor opcode and no persistent mode — control rides one command
every optical drive already answers, and the drive stays **100% OEM** until that exact prefix
shows up.

`freemkv-fw create` wires these sub-functions into the firmware image it builds, and
`freemkv-fw verify /dev/…` sends the **Identity** command to test a live drive.

### CDB layout

```
byte:  0     1     2  3     4       5        6   7   8       9
       0x3C  0x0E  C0 DE    <subfn> <state>  <alloc_len 24-bit BE>  <ctrl>
```

| Field | Bytes | Offset | Meaning |
|---|---|---|---|
| Opcode | 1 | `cdb[0]` | `0x3C` — `READ BUFFER`, the command freemkv hijacks |
| Knock mode | 1 | `cdb[1]` | `0x0E` — an OEM-unused `READ BUFFER` mode |
| Knock | 2 | `cdb[2..4]` | `C0 DE`; a defence-in-depth signature behind the mode byte |
| Sub-function | 1 | `cdb[4]` | selects the command (see table below) |
| State | 1 | `cdb[5]` | toggle state — `00` = OEM behavior, `01` = patched/enabled. Two exceptions: for **Speed** (`0x02`) this byte **is** the cap value, and for the **Diagnostic Dump** (`0x09`) it carries the top byte of the 32-bit address |
| Alloc length | 3 | `cdb[6..8]` | 24-bit big-endian allocation length — the native `READ BUFFER` position, so the transport sizes the transfer correctly |
| Control | 1 | `cdb[9]` | `0x00` |

`build_cdb()` (the host-side helper) assembles exactly this 10-byte frame. Without the `3C 0E
C0 DE` prefix, every byte is interpreted by the OEM's normal `READ BUFFER` handler — nothing
about a bare `READ BUFFER` command changes.

### Sub-function table

| CDB prefix | Command | Sub-function | Status |
|---|---|---|---|
| `3C 0E C0 DE 01` | Identity | `0x01` | ready |
| `3C 0E C0 DE 02 <cap>` | Speed | `0x02` | ready |
| `3C 0E C0 DE 03 01/00` | Region-free | `0x03` | ready |
| `3C 0E C0 DE 04 01/00` | Raw Read | `0x04` | ready |
| `3C 0E C0 DE 05`–`08` | *(reserved)* | `0x05`–`0x08` | reserved (future capabilities) |
| `3C 0E C0 DE 09 <addr32>` | Diagnostic Dump | `0x09` | ready (diagnostic use) |

**Toggle polarity is uniform:** state `00` = OEM behavior, state `01` = patched/enabled. This
holds for every toggle (`0x03`, `0x04`), with two documented exceptions — **Speed**
(`0x02`), where the state byte **is** the read-speed cap value, and the **Diagnostic Dump**
(`0x09`), where `cdb[5..9]` carry a 32-bit address. With any toggle set to `00` (or Speed set to
`00` = OEM), the drive behaves byte-identically to stock OEM firmware — that OEM-compatibility
guarantee is the point of the design.

#### What each command does

- **Identity (`0x01`, read-only).** Returns the ASCII `freemkv` magic plus a 1-byte firmware
  version. Send it first, and only treat a drive as freemkv-flashed if it answers with the magic.
  Changes nothing.
- **Speed (`0x02`, settable cap).** Sets the read-speed / riplock ceiling. The **state byte is
  the cap value** — this is a settable cap, not a simple on/off: `00` = OEM (the stock speed
  ramp), `01`–`FF` set the ceiling to that value, and `FF` = max / uncapped. Use it to lift the
  playback-speed riplock so discs read back at the drive's full rate for ripping.
- **Region-free (`0x03`, toggle).** State `01` makes every DVD read as region-free (RPC-free),
  regardless of the disc's region code or the drive's region setting; state `00` = OEM.
  **DVD-only** — it does not affect Blu-ray or UHD, which aren't RPC-region-locked.
- **Raw Read (`0x04`, toggle).** State `01` approves the host certificate, so the drive stops
  enforcing AACS drive↔host authentication; state `00` = OEM. One unlock, two consequences: the
  drive **releases the Volume ID** (and the other AACS-gated values) to a normal `READ DISC
  STRUCTURE` request, and because no AKE handshake ever ran there is **no bus key**, so `READ(10)`
  returns sectors exactly as they sit on the disc — **bus encryption is off for free**. This only
  removes the drive's transport / access-control policing; sectors are still AACS-encrypted at
  rest and the host applies the title keys. VID release and bus-encryption-off are not separate
  toggles — they both follow from this one command.
- **Sub-functions `0x05`–`0x08` — reserved.** Held reserved for future capabilities and wire-ABI
  stability; not advertised as capabilities today. These slots will not be reused or renumbered.
- **Diagnostic Dump (`0x09`, read-only).** Returns a fixed 64-byte window read from the 32-bit
  address packed big-endian across `cdb[5..9]` (`cdb[5]` = address bits 31:24 … `cdb[8]` =
  address bits 7:0). The host iterates in 64-byte steps to dump any RAM region. This is a
  read-only diagnostic tool (used by the `fw09_dump` helper script), not a drive-facing
  capability toggle.

### How the firmware is built

freemkv firmware is **not tied to any one OEM image**. Every firmware address a patch needs is
located by **signature at build time** — nothing is hardcoded — so the same builder works across
MediaTek **MT1959** and **MT1939** OEM images, auto-detecting the chipset and applying the
capabilities that drive supports (reported per image). Once the patches are applied, the image's
integrity table is **re-signed with CMAC using the known key** so the drive accepts it, and the
**DE (downgrade-enable) byte is always set** on every build.

**Downgrade-enable — flash over any existing version.** By default a drive refuses to accept an
older firmware than the one it's running (anti-rollback). freemkv sets the DE byte
(`0x1EC056 = 0xDE`) in every image it builds, which flips that gate off — so a freemkv image
installs cleanly **over any existing firmware version**. This is proven on hardware: with the DE
byte set the drive accepts a lower version;
with it cleared the same downgrade is rejected (`ILLEGAL REQUEST / INVALID FIELD IN CDB`) and
nothing is written.

### Response conventions

Responses are **not** uniform — read each command's response by its own rule:

- **Identity (`0x01`)** returns the ASCII `freemkv` magic followed by a 1-byte version. This is
  the command to use to confirm you're talking to freemkv-flashed firmware.
- **Diagnostic Dump (`0x09`)** returns exactly **64 raw bytes** from the requested address.
- **Toggles (`0x02`, `0x03`, `0x04`)** return a 1-byte status (`01` = ok, `00` = fail). Once
  **Raw Read (`0x04`)** is on, read the released Volume ID with a normal `READ DISC STRUCTURE`
  request — it does not come back in the toggle's own response.

### Safety

:::note[Reversible by design]
**Identity (`0x01`) and the Diagnostic Dump (`0x09`) are read-only and safe** — they report
a value and change no drive state. Start with `0x01` to confirm the drive is freemkv-flashed.

The runtime commands (`0x02`, `0x03`, `0x04`) are **reversible**: state `01` enables the
patched behavior (for Speed, any cap value enables it), and sending the command again with state
`00` reverts to byte-identical OEM behavior. Nothing they change is meant to be permanent, and
nothing requires reflashing.
:::

### Examples (`sg_raw` on Linux)

The `sg3-utils` package provides `sg_raw`, which sends a raw CDB and prints the bytes read
back. Pass the 10-byte `READ BUFFER` CDB and use `-r <n>` to request enough bytes for the
response; keep the `cdb[6..9]` allocation length consistent with `-r`. Replace `/dev/sg0` with
your drive.

Identity probe — expect the response to lead with `freemkv`:

```bash
sg_raw -r 96 /dev/sg0 3C 0E C0 DE 01 00 00 00 60 00   # Identity → "freemkv" + version
```

Speed — set the read-speed ceiling to max / uncapped (`FF`), or back to OEM (`00`):

```bash
sg_raw -r 1 /dev/sg0 3C 0E C0 DE 02 FF 00 00 00 00    # Speed → uncapped
sg_raw -r 1 /dev/sg0 3C 0E C0 DE 02 00 00 00 00 00    # Speed → OEM ramp
```

Region-free on:

```bash
sg_raw -r 1 /dev/sg0 3C 0E C0 DE 03 01 00 00 00 00    # Region-free → on
```

Raw Read on — approve the host cert; the drive then releases the Volume ID to a normal `READ
DISC STRUCTURE` and returns sectors unencrypted on the bus:

```bash
sg_raw -r 1 /dev/sg0 3C 0E C0 DE 04 01 00 00 00 00    # Raw Read → on
```

Diagnostic Dump at an address of your choice (`0xAABBCCDD` shown as a placeholder) — expect
64 raw bytes:

```bash
sg_raw -r 64 /dev/sg0 3C 0E C0 DE 09 AA BB CC DD 00   # dump → 64 bytes at 0xAABBCCDD
```

The allocation length lives in `cdb[6..8]` big-endian (three bytes, e.g. `00 00 60` = 96 bytes
for Identity), with `cdb[9]` the control byte. For the Diagnostic Dump the address instead
occupies `cdb[5..9]`.

## See also

- [Firmware](/firmware/) — the public Find / Modify / Flash walkthrough
- [Unlocked drives](/docs/drives-unlocked/) — which drives freemkv firmware targets
