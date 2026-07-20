---
title: The HD DVD Format (and its AACS layer)
description: A reference for the HD DVD-Video disc format — the UDF filesystem, the HVDVD_TS and ADV_OBJ trees, the EVO program stream, and the AACS content protection applied on top. The on-disc structures, and what is confirmed versus still uncertain.
---

HD DVD is a **disc format**; AACS is the **encryption** layered on top of it. The two are
independent, exactly as they are for Blu-ray and 4K UHD: the format is the physical medium,
the filesystem, and the stream layout; AACS is the key hierarchy and the content cipher. This
page documents the format first, then the AACS layer, cross-referencing the shared key
hierarchy on the [AACS reference](/docs/aacs/) rather than repeating it.

:::note[Confidence]
Claims tie to what has been **verified on real discs** versus what remains a **working model**
or **unconfirmed**. Where a real disc departs from the nominal format, both are stated. The
content-encryption details in particular are a working model, not yet exercised against an
encrypted HD DVD — see the summary table at the end.
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

The signature of an Advanced-Content-driven disc is a Primary Video Set with **no First-Play
domain and no VMG-menu domain** — navigation is handled by the application layer, not by
in-stream DVD commands.

## HVDVD_TS — the Primary Video Set

The **Primary Video Set (PRMVS)** is the umbrella object in `HVDVD_TS`: a VMG, one or more
Standard VTSs, and one **Advanced VTS** (the title-set the interactive engine plays).

### The EVO container

The A/V objects are **Enhanced Video Objects** (`.EVO`, also written EVOB) — an extension of
the DVD VOB. An EVO is an **MPEG-2 Program Stream**: a run of **2048-byte packs**, each
beginning with a `00 00 01 BA` pack-start code — one pack per logical sector. **Confirmed** on
real discs. Packs are grouped into **EVOB Units (EVOBU)**, each led by a **Navigation Pack
(NV_PCK)**, directly analogous to DVD's VOBU + NV_PCK. The pack types:

| Pack | Contents |
|---|---|
| `NV_PCK` | Navigation (PCI + DSI), on `private_stream_2` (`0xBF`) — never encrypted |
| `VM_PCK` / `VS_PCK` | Main / sub video |
| `AM_PCK` / `AS_PCK` | Main / sub audio |
| `SP_PCK` | Sub-picture (bitmap subtitles) |
| `ADV_PCK` | Advanced-Content files multiplexed inline — never encrypted |

Clip filenames follow a fixed `HVnnnTnn.EVO` pattern, though retail discs also carry
human-named clips (`FEATURE_1.EVO`, `MAINMENU.EVO`, `MENULOOP.EVO`, …).

### Navigation sidecars: .MAP, .VTI, .IFO

- **`.MAP`** — a time map (the VTS_TMAP data) pairing chapter/timestamp to EVO pack, enabling
  seek. Playlists reference the `.MAP`, not the `.EVO` directly.
- **`.VTI`** — Video Title Information, the Advanced-VTS control block that references the
  EVOBs; the HD DVD analogue of DVD's `VTS_xx_0.IFO`. Example name `HVA00001.VTI`.
- **`.IFO` / `.BUP`** — some discs use a DVD-style IFO/BUP navigation instead: `HV000I01.IFO`
  as the VMG analogue, `HV0nnI01.IFO` as per-VTS. AVC-video EVOs cannot play standalone; they
  depend on the IFO pair, exactly as DVD VOBs depend on their IFO.

The DVD → HD DVD analogue map: `VIDEO_TS/`→`HVDVD_TS/`; `VIDEO_TS.IFO`(VMG)→`HV000I01.IFO` or
`VPLST000.XPL`; `VTS_xx_0.IFO`→`.VTI`/`HV0nnI01.IFO`; `VTS_xx_n.VOB`→`.EVO`; plus the new
`.MAP` time map (no DVD equivalent).

## ADV_OBJ — the Advanced Content tree

`ADV_OBJ` holds the interactive layer:

- **`VPLST%%%.XPL`** — the **playlist(s)**, an XML document in the `HDDVDVideo/Playlist`
  namespace. It is a `<Playlist>` → `<Configuration>` → `<TitleSet>` → `<Title>`, each `<Title>`
  naming its `<PrimaryAudioVideoClip>` clips (referenced by `file:///dvddisc/HVDVD_TS/…MAP`
  URIs, i.e. the `.MAP` sidecar) in playback order with `titleTimeBegin`/`titleTimeEnd`, a
  `titleDuration`, a `displayName`, and a `<ChapterList>`. The `TitleSet` carries `tickBase`
  (the timecode frequency).
- **`DISCID.DAT`** — disc identification/configuration.
- **`.ACA`** — a packaged resource container.
- Loose interactive resources when not packed into an ACA: `.xmu` markup, `.js` ECMAScript,
  `.xas` subtitles, plus images/fonts.

### Layer-break feature splitting

A feature spanning the disc's layer break (single-layer 15 GB / dual-layer 30 GB) is authored
as **multiple EVO segments** — commonly `FEATURE_1.EVO` + `FEATURE_2.EVO` — with the playlist
stitching them into one seamless title via ordered `<PrimaryAudioVideoClip>` entries; the
segments are concatenated in playlist order. The naming variants `FEATURE_1`/`FEATURE_2` and
`feature`/`feature_Divide` both appear in the wild.

## Streams and codecs

HD DVD-Video mandates three video codecs — **VC-1, H.264/AVC, and MPEG-2** — all decodable by
every player; in practice the great majority of releases are VC-1. Inside the EVO program
stream they are routed by `stream_id`:

- **VC-1** rides the **extended stream-id `0xFD`** with `stream_id_extension = 0x55` — composite
  `0xFD55`.
- **H.264 and MPEG-2 video** use ordinary video stream-ids **`0xE0`–`0xEF`** (the payload is
  probed to tell them apart).
- **Audio** rides `private_stream_1` (`0xBD`), keyed by the first payload byte (sub-stream id):

  | sub-stream id | Codec |
  |---|---|
  | `0x80`–`0x87` | AC-3 (Dolby Digital) |
  | `0x88`–`0x8F`, `0x98`–`0x9F` | DTS / DTS-HD |
  | `0xA0`–`0xAF` | Linear PCM or MLP |
  | `0xB0`–`0xBF` | Dolby TrueHD (MLP) |
  | `0xC0`–`0xCF` | Dolby Digital Plus (E-AC-3) — and AC-3 in EVOB |

- **Navigation** rides `private_stream_2` (`0xBF`) — PCI + DSI, as in VOB.

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

### The AACS directory: nominal versus observed

Nominally the AACS key material lives in a directory named **`AACS`** with a parallel
**`AACS_BAK`** backup, and the boot paths are `/AACS/MKBROM.AACS` and the like.

Real retail discs deviate. Observed AACS directories: **`ANY!`** and **`AAC!`**, each with a
`<name>!_BAK` mirror. The trailing `!` and the per-authoring-house token are **observed on
disc, not part of the published format**. The consequence for any implementation is concrete:
**the AACS directory must be found by discovery** — scan the root for the directory that
contains `MKBROM.AACS`, ignoring the `!_BAK` mirror — because the nominal `/AACS/` path does
not exist on these discs.

:::caution[Observed deviation]
The `ANY!` / `AAC!` naming is an open question. The `!` (0x21) sorts ahead of letters and
digits in the UDF namespace and is not a valid ISO 9660 filename character, so a renamed AACS
directory would exist only in the UDF view and sort first — consistent with mastering-tool
behavior, but **unconfirmed**. It is inference, not fact.
:::

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
- **Structure — a fixed 2480-byte file, verified byte-exact on real discs:**
  - a **128-byte header**: magic `DVD_HD_V_TKF` (bytes 0–11), `HD_VTKF_SIZE`=2480 (12–15),
    `PLAYLIST_NAME` (16–27), version (32–33);
  - **64 title-key entries of 36 bytes each**, starting at byte 128 — each entry is 1 byte
    `BIFO` + 3 reserved + a 16-byte encrypted title key + a 16-byte binding MAC. Entry #1's key
    is at offset 132; entry #2 begins at 164; and so on. `BIFO` bit 7 (`AV_FLG`) set = the slot
    holds a key; the entry index (1-based) is the CPS unit number;
  - a trailing **16-byte `TKF MAC`** (bytes 2464–2479), a CMAC over the file keyed by the
    Volume Unique Key — which lets an implementation *verify a candidate key is correct*.
  - For pre-recorded discs the binding type is "Volume-ID only" and the 16-byte binding MAC is
    filled with `0xFF`.
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
encryption is **per-pack**, CSS-style:

- The **pack header and PES header stay in the clear**; only the **PES payload** is encrypted.
  (Directly observable on a decrypted rip: the pack header `00 00 01 BA …` and the clear PES
  header — e.g. `00 00 01 FD … 55` for VC-1 — are intact, and only the elementary-stream
  payload is opaque.)
- **Whether a pack is encrypted** is signaled by the MPEG-2 **`PES_scrambling_control`** field
  — the 2-bit field in the first PES-flags byte, at **offset 20** of the pack (14-byte pack
  header + 4-byte PES start code + 2-byte PES length). The value `01` (`byte[20] & 0x30 == 0x10`)
  marks an encrypted pack.
- **Pack-type overrides:** `NV_PCK` (navigation) and `ADV_PCK` (advanced) are **never**
  encrypted; `HL_PCK` (highlight) **must** be decrypted even when the scrambling flag is clear.
- Each encrypted pack derives a **per-pack Content Key**: `Kc = AES-G(Kt, D_tk ‖ CPI_lsb96)`,
  where `Kt` is the title key from the VTKF, `D_tk` is 32-bit Title Key Data, and `CPI_lsb96`
  is the low 96 bits of the CPI carried in the pack's control information. The payload is then
  AES-128-CBC decrypted under `Kc` with a **fixed, format-constant IV**. Interleaved (ILVU)
  packs use a Sequence Key in place of `Kt`.

:::note[Working model]
The per-pack model is a working reconstruction, not yet exercised end-to-end against an
encrypted HD DVD. Two points remain open: exactly when `Kc`/Sequence-Key derivation is
*required* versus when the plain title key `Kt` suffices, and the precise clear-versus-encrypted
byte boundary inside a pack. Both settle the moment an encrypted disc is available to decrypt
and verify.
:::

## What is confirmed, and what is not

| Area | Status |
|---|---|
| UDF 2.5, 2048-byte packs, `HVDVD_TS` + `ADV_OBJ` layout | **Confirmed.** Every disc |
| EVO = MPEG-2 Program Stream; stream-id routing (VC-1 `0xFD/0x55`, video `0xE0–0xEF`, audio `0xBD`) | **Confirmed.** Muxes end to end |
| First-generation AACS, crypto identical to Blu-ray AACS 1.0 | **Confirmed** |
| `.AACS` file inventory and each file's role; VTKF↔playlist binding | **Confirmed** |
| VTKF layout: 2480-byte file, 128-byte header, 64 × 36-byte entries, trailing MAC | **Confirmed. Verified byte-exact on real discs** |
| Per-2048-pack CBC, clear headers, `PES_scrambling_control` flag, `Kc = AES-G(Kt, …)`, constant IV | **Working model.** Not yet verified against an encrypted disc |
| The `ANY!` / `AAC!` directory name and the trailing `!` | **Observed on real discs.** The reason for the naming is unconfirmed |
| When `Kc` derivation is mandatory vs when plain `Kt` suffices; exact in-pack clear/encrypted boundary | **Open** |
