---
title: The HD DVD Format (and its AACS layer)
description: A reference for the HD DVD-Video disc format — the UDF filesystem, the HVDVD_TS and ADV_OBJ trees, the EVO program stream, and the AACS content protection applied on top. What the DVD Forum and AACS specifications define, and where real discs deviate from them.
---

HD DVD is a **disc format**; AACS is the **encryption** layered on top of it. The two are
independent, exactly as they are for Blu-ray and 4K UHD: the format is the physical medium,
the filesystem, and the stream layout; AACS is the key hierarchy and the content cipher. This
page documents the format first, then the AACS layer, and cross-references the shared key
hierarchy on the [AACS reference](/docs/aacs/) rather than repeating it.

HD DVD lost the format war and stopped shipping in 2008, and the authoritative DVD Forum
"HD DVD-Video" format books were never published openly (the DVD Format/Logo Licensing
Corporation dissolved in 2025 and deposited its specifications with Japan's National Diet
Library). This reference is therefore built from the openly available substitutes — the
recovered AACS "HD DVD and DVD Pre-recorded Book," Toshiba/DVD-Forum patents, FFmpeg's EVO
demuxer, and community reverse-engineering — and cross-checked against real retail discs.

:::note[Source confidence]
Claims are tagged where it matters: **[spec]** = read from a primary specification (the AACS
HD DVD Book 0.952, the AACS Common/Pre-recorded books, or a DVD-Forum patent); **[code]** =
FFmpeg's shipping EVO demuxer; **[community]** = forum reverse-engineering; **[observed]** =
verified directly on retail discs. Where a real disc contradicts the spec, both are stated.
:::

## One format, two content models

Every HD DVD-Video disc uses **UDF 2.5** as its filesystem, with **2048-byte logical
sectors** inherited from DVD. **[spec]** At the disc root sit two directories:

```
/  (UDF 2.5, 2048-byte sectors)
├── HVDVD_TS/    Standard Content — the "DVD-Video on steroids" tree (.EVO .MAP .VTI/.IFO)
└── ADV_OBJ/     Advanced Content — the HDi interactive layer (.XPL playlists, markup, script)
```

The DVD-Forum patents spell the video directory `HDDVD_TS`, but **every shipped disc and every
authoring tool uses `HVDVD_TS`** (H-V-DVD). **[observed]**

HD DVD defines two ways to author a title, and many discs ship both:

- **Standard Content** — DVD-Video's data structures scaled up: a Video Manager (VMG), one or
  more Video Title Sets (VTS), Program Chains (PGC), chapters (PTT), cells, and in-stream
  navigation/highlights (PCI + HLI). It lives entirely in `HVDVD_TS` and was cheap to author
  because it reused DVD tooling. **[spec]**
- **Advanced Content** — the **HDi** interactive runtime (Microsoft's implementation of the
  DVD Forum's declarative *iHD* standard; the counterpart to Blu-ray's Java BD-J). It is
  XML markup + ECMAScript with a DOM-like player API, network access, persistent storage, and
  a multi-plane compositor. Playing Advanced Content is **mandatory in every conformant HD DVD
  player**. It spans both `ADV_OBJ` (playlists, markup, script) and `HVDVD_TS` (the actual
  A/V it plays). **[spec]**

The signature of an Advanced-Content-driven disc is a Primary Video Set with **no First-Play
domain and no VMG-menu domain** — navigation is handled by the HDi application, not by
in-stream DVD commands. **[spec]**

## HVDVD_TS — the Primary Video Set

The **Primary Video Set (PRMVS)** is the umbrella object in `HVDVD_TS`: a VMG, one or more
Standard VTSs, and one **Advanced VTS** (the title-set the HDi engine plays). **[spec]**

### The EVO container

The A/V objects are **Enhanced Video Objects** (`.EVO`, also written EVOB) — an extension of
the DVD VOB. Despite Wikipedia's infobox loosely calling it "transport stream," an EVO is an
**MPEG-2 Program Stream** (ISO/IEC 13818-1): the Toshiba patents state the Primary Enhanced
Video Object "complies with Program Stream," and FFmpeg demuxes `.evo` through its PS demuxer,
not its TS demuxer. **[spec][code]**

An EVO is a run of **2048-byte packs**, each beginning with a `00 00 01 BA` pack-start code —
one pack per logical sector. **[observed]** Packs are grouped into **EVOB Units (EVOBU)**, each
led by a **Navigation Pack (NV_PCK)**, directly analogous to DVD's VOBU + NV_PCK. The pack
types the patents define:

| Pack | Contents |
|---|---|
| `NV_PCK` | Navigation (PCI + DSI), on `private_stream_2` (`0xBF`) — never encrypted |
| `VM_PCK` / `VS_PCK` | Main / sub video |
| `AM_PCK` / `AS_PCK` | Main / sub audio |
| `SP_PCK` | Sub-picture (bitmap subtitles) |
| `ADV_PCK` | Advanced-Content files multiplexed inline, routed to the HDi file cache — never encrypted |

Clip filenames follow a fixed `HVnnnTnn.EVO` pattern, though retail discs also carry
human-named clips (`FEATURE_1.EVO`, `MAINMENU.EVO`, `MENULOOP.EVO`, …). **[observed]**

### Navigation sidecars: .MAP, .VTI, .IFO

- **`.MAP`** — a time map (the VTS_TMAP data) pairing chapter/timestamp to EVO pack, enabling
  seek. Playlists reference the `.MAP`, not the `.EVO` directly. **[spec/community]**
- **`.VTI`** — Video Title Information, the Advanced-VTS control block that references the
  EVOBs; the HD DVD analogue of DVD's `VTS_xx_0.IFO`. Example name `HVA00001.VTI`. A single
  reverse-engineered disc reports the ASCII tag `ADVANCED-VTS` at offset 0 with a clip table
  at ~0x3000; the *concept* is corroborated by patent, but the literal tag is **[community]**,
  not spec-confirmed.
- **`.IFO` / `.BUP`** — some discs use a DVD-style IFO/BUP navigation instead: `HV000I01.IFO`
  as the VMG analogue, `HV0nnI01.IFO` as per-VTS. AVC-video EVOs cannot play standalone; they
  depend on the IFO pair, exactly as DVD VOBs depend on their IFO. **[community]**

The DVD → HD DVD analogue map: `VIDEO_TS/`→`HVDVD_TS/`; `VIDEO_TS.IFO`(VMG)→`HV000I01.IFO` or
`VPLST000.XPL`; `VTS_xx_0.IFO`→`.VTI`/`HV0nnI01.IFO`; `VTS_xx_n.VOB`→`.EVO`; plus the new
`.MAP` time map (no DVD equivalent).

## ADV_OBJ — the Advanced Content tree

`ADV_OBJ` holds the HDi layer:

- **`VPLST%%%.XPL`** — the **playlist(s)**, XML in the DVD-Forum
  `http://www.dvdforum.org/2005/HDDVDVideo/Playlist` namespace. The document is a `<Playlist>`
  → `<Configuration>` → `<TitleSet>` → `<Title>`, each `<Title>` naming its
  `<PrimaryAudioVideoClip>` clips (referenced by `file:///dvddisc/HVDVD_TS/…MAP` URIs, i.e. the
  `.MAP` sidecar) in playback order with `titleTimeBegin`/`titleTimeEnd`, a `titleDuration`, a
  `displayName`, and a `<ChapterList>`. The `TitleSet` carries `tickBase` (the timecode
  frequency). Element names are **[community]**-confirmed across independent dumps; exact
  attribute value formats vary by authoring tool. **[community]**
- **`DISCID.DAT`** — disc identification/configuration. **[spec]**
- **`.ACA`** — Advanced Content Archive, a packaged resource container (authored by Microsoft's
  `CreateACA.exe`). **[community]**
- Loose HDi resources when not packed into an ACA: `.xmu` markup, `.js` ECMAScript, `.xas`
  subtitles, plus images/fonts. **[community]**

### Layer-break feature splitting

A feature spanning the disc's layer break (single-layer 15 GB / dual-layer 30 GB) is authored
as **multiple EVO segments** — commonly `FEATURE_1.EVO` + `FEATURE_2.EVO` — with the playlist
stitching them into one seamless title via ordered `<PrimaryAudioVideoClip>` entries. Tools
reassemble a spanning feature by concatenating the segments in playlist order (eac3to's `+`
operator). **[observed]** The naming variants `FEATURE_1`/`FEATURE_2` and `feature`/
`feature_Divide` both appear in the wild.

## Streams and codecs

HD DVD-Video mandates three video codecs — **VC-1 (SMPTE 421M), H.264/AVC, and H.262/MPEG-2**
— all decodable by every player; in practice the great majority of releases are VC-1. **[spec]**
Inside the EVO program stream, FFmpeg's demuxer routes them by `stream_id`: **[code]**

- **VC-1** rides the **extended stream-id `0xFD`** with `stream_id_extension = 0x55` (the
  SMPTE-registered VC-1 value) — composite `0xFD55`.
- **H.264 and MPEG-2 video** use ordinary video stream-ids **`0xE0`–`0xEF`** (the demuxer
  probes the payload to tell them apart).
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
(the DTS core is always present). **[spec]**

## AACS on HD DVD

HD DVD used **first-generation AACS** — the same generation and the same core crypto as Blu-ray
AACS 1.0 (AES-128, a subset-difference-tree MKB, and the `AES-G` derivation of the Volume
Unique Key). The single leaked processing key `09 F9 …` broke *both* formats, which is only
possible because the crypto is common. The label "AACS 1.0" is community shorthand; the spec
says "first-generation." AACS 2.0 / 2.1 are 4K-UHD-only and never touched HD DVD. The shared
[key hierarchy is documented on the AACS page](/docs/aacs/#the-invariant-one-key-hierarchy);
this section covers only what HD DVD does *differently* — which is entirely at the file and
container layer, not the cipher.

### The AACS directory: spec versus reality

The AACS HD DVD Book reserves the literal directory name **`AACS`** (with a parallel
**`AACS_BAK`** backup) and hard-codes boot paths like `/AACS/MKBROM.AACS`. The spec provides
**no** mechanism for a variable name. **[spec]**

Real retail discs deviate. Observed AACS directories: **`ANY!`** (Dukes of Hazzard) and
**`AAC!`** (Freedom, authored by Memory-Tech), each with a `<name>!_BAK` mirror. **[observed]**
The trailing `!`, the per-authoring-house token, and the deviation itself are **not documented
in any accessible source** — the standard `AACS`/`AACS_BAK` pairing is what libaacs, DumpHD,
and BackupHDDVD all assume. The consequence for any implementation is concrete: **the AACS
directory must be found by discovery** — scan the root for the directory that contains
`MKBROM.AACS`, ignoring the `!_BAK` mirror — because the spec-mandated `/AACS/` path does not
exist on these discs.

:::caution[Undocumented deviation]
The `ANY!` / `AAC!` naming is a genuine open question. The `!` (0x21) sorts ahead of letters
and digits in the UDF namespace and is not a valid ISO 9660 filename character, so a renamed
AACS directory would exist only in the UDF view and sort first — consistent with mastering-tool
behavior, but **no specification confirms this**. It is inference, not fact.
:::

### File inventory

Every file lives in the AACS directory above. Structure and semantics are from the AACS HD DVD
Book 0.952 unless noted.

| File | Role |
|---|---|
| `MKBROM.AACS` | The one and only Media Key Block for this pressed disc. Device Keys → Processing Key → applied here → **Media Key (Km)**. |
| `MKBRECORDABLE.AACS` | A read/write MKB used by *recording* devices to update recordable media — **not** used to play this disc. The only component not mirrored into the backup. |
| `VTKF%%%.AACS` | **Title Key File** (Video). Holds the encrypted title keys. Magic `DVD_HD_V_TKF`. Bound to one playlist (see below). |
| `VTUF%%%.AACS` | **Title Usage File** (Video). Holds usage rules (copy-control), indexed from each EVOB's CPI. Magic `DVD_HD_V_TUF`. Optional. |
| `DKF.AACS` | **Directory Key File** — decrypts a content provider's directory name in persistent storage. Magic `DVD_HD_V_DKF`. Not a disc/media key; ignored on Standard-Content discs. |
| `CONTENT_CERT.AACS` | Content Certificate — the AACS-LA-signed root of the on-disc integrity chain. |
| `CONTENT_HASH_TABLE1.AACS` | Hashes of the A/V hash units (the EVOB data). |
| `CONTENT_HASH_TABLE2.AACS` | Hashes of the navigation data (markup/script) plus the TKF/TUF/DKF/DISCID files. |
| `CONTENT_REVOCATION_LIST.AACS` | The content revocation list (distinct from the host/drive revocation lists carried inside the MKB). |

### VTKF — the Title Key File

The VTKF is where HD DVD diverges most visibly from Blu-ray (which keeps all title keys in one
`Unit_Key_RO.inf` indexed by CPS unit). On HD DVD:

- **The `%%%` suffix is the playlist index, not a CPS-unit number.** The spec states
  `VPLST%%%.XPL` "shall be accompanied by `VTKF%%%.AACS`" — each Title Key File is bound to
  exactly one Advanced-Content playlist (a **Category 2** disc). A bare `VTKF.AACS` with no
  suffix denotes a **Category 1** disc (Standard Content, no playlist). So Freedom's
  `VTKF090` + `VTKF100` correspond to playlists `VPLST090` + `VPLST100`; a disc with four
  VTKFs simply has four playlists. **[spec]**
- **The correct file is selected by name-match, not by trial.** The TKF header carries a
  12-byte `PLAYLIST_NAME`; the player compares it to the *currently active* playlist and, in
  the spec's words, "unless the names are identical, the Title Keys in this TKF must not be
  used." (For Standard Content, `PLAYLIST_NAME` is all `0xFF`.) **[spec]**
- **Structure — Table 3-8, a fixed 2480-byte file:** **[spec]**
  - a **128-byte header**: `TKF_ID` (`DVD_HD_V_TKF`, bytes 0–11), `HD_VTKF_SIZE`=2480 (12–15),
    `PLAYLIST_NAME` (16–27), version (32–33);
  - **64 title-key entries of 36 bytes each**, starting at byte 128 — each entry is 1 byte
    `BIFO` + 3 reserved + a 16-byte encrypted title key + a 16-byte binding MAC. Entry #1's
    key is at offset 132; entry #2 begins at 164; and so on;
  - a trailing **16-byte `TKF MAC`** (bytes 2464–2479), a CMAC over the file keyed by the
    Volume Unique Key — which lets an implementation *verify a candidate key is correct*.
  - For pre-recorded discs the binding type is "Volume-ID only" and the 16-byte binding MAC is
    filled with `0xFF`.
- The **SHA-1 of the whole VTKF file is the per-disc DiscID** used to index a key database.
  **[community]**

### VTUF, DKF, CONTENT_CERT

- **VTUF** (`DVD_HD_V_TUF`) carries the **usage rules**: a set of Usage Rule Sets that each
  EVOB's CPI points into via a Usage Rule Pointer. Same `%%%` playlist convention as the VTKF;
  optional; ≤64 KB; MAC-protected under the Volume Unique Key. **[spec]**
- **DKF** (`DVD_HD_V_DKF`) is a 64-byte file holding one encrypted **Directory Key**; the
  player derives `PROVIDER_DIR = AES-G(K_DIR, PROVIDER_ID)`, the provider's directory name in
  persistent storage, so one title's saved data cannot reach another's. No Blu-ray analogue.
  **[spec]**
- **CONTENT_CERT** (Table 3-17) is the signed root of trust. Byte 0 is the **Certificate Type
  (`0x00`)** — *not* an AACS version field; there is no version byte in the HD DVD content
  certificate. It carries an Applicant ID + Content Sequence Number (together the content ID),
  a Minimum CRL Version floor, SHA-1 digests of the two content hash tables, and the AACS-LA
  signature. The integrity chain runs: verify the certificate signature → check each hash
  table against the digest in the certificate → check the content against the tables. **[spec]**

### Content encryption — per-pack, not per-aligned-unit

This is the second major divergence from Blu-ray, and the one that most affects a decryptor.

Blu-ray encrypts a **6144-byte aligned unit** (three sectors): the first 16 bytes are a clear
seed, and bytes 16–6144 are AES-128-CBC encrypted under a per-unit block key, with a fresh CBC
chain per unit. **[spec]**

HD DVD does **not** use that model. Content is MPEG-2 Program Stream in 2048-byte packs, and
encryption is **per-pack**, CSS-style: **[community, quoting HD DVD Book 0.912 §4.3.2]**

- The **pack header and PES header stay in the clear**; only the **PES payload** is encrypted.
  (Directly observable: on a decrypted rip the pack header `00 00 01 BA …` and the clear PES
  header — e.g. `00 00 01 FD … 55` for VC-1 — are intact, and only the elementary-stream
  payload is opaque.) **[observed]**
- **Whether a pack is encrypted** is signaled by the MPEG-2 **`PES_scrambling_control`** field
  — the 2-bit field in the first PES-flags byte, at **offset 20** of the pack (14-byte pack
  header + 4-byte PES start code + 2-byte PES length). BackupHDDVD tests `(byte[20] & 0x30) ==
  0x10`, i.e. `PES_scrambling_control == 01`. **[community]**
- **Pack-type overrides:** `NV_PCK` (navigation) and `ADV_PCK` (advanced) are **never**
  encrypted; `HL_PCK` (highlight) **must** be decrypted even when the scrambling flag is
  clear. **[community, from spec 0.912]**
- Each encrypted pack derives a **per-pack Content Key**: `Kc = AES-G(Kt, D_tk ‖ CPI_lsb96)`,
  where `Kt` is the title key from the VTKF, `D_tk` is 32-bit Title Key Data, and `CPI_lsb96`
  is the low 96 bits of the CPI carried in the pack's control information. The payload is then
  AES-128-CBC decrypted under `Kc` with a **fixed constant IV**
  (`0B A0 F8 DD FE A6 1F B3 D8 DF 9F 56 6A 05 0F 78`, recovered from a shipping player).
  Interleaved (ILVU) packs use a Sequence Key in place of `Kt`. **[community]**

:::note
The public record here is genuinely incomplete: the leaked BackupHDDVD tool frequently
decrypted using the title key `Kt` directly as the CBC key rather than deriving `Kc`, and it
still worked on much content — the reverse-engineers themselves flagged this as unresolved. The
spec formula (`Kc`) is authoritative; exactly when `Kc`/Sequence-Key derivation is *required*
versus when plain `Kt` suffices is not settled in any open source. The precise clear-versus-
encrypted byte boundary inside a pack is likewise **[community]**, not spec-verified.
:::

## What is confirmed, and what is not

| Area | Status |
|---|---|
| UDF 2.5, 2048-byte packs, `HVDVD_TS` + `ADV_OBJ` layout | **Confirmed** (spec + every disc) |
| EVO = MPEG-2 Program Stream; stream-id routing (VC-1 `0xFD/0x55`, video `0xE0–0xEF`, audio `0xBD`) | **Confirmed** (FFmpeg + patents) |
| First-generation AACS, crypto identical to Blu-ray AACS 1.0 | **Confirmed** (spec + shared key break) |
| `.AACS` file inventory and each file's role; VTKF↔playlist binding; VTKF Table 3-8 layout | **Confirmed** (AACS HD DVD Book 0.952) |
| Per-2048-pack CBC, clear headers, `PES_scrambling_control` flag, `Kc = AES-G(Kt, …)`, constant IV | **Community RE** (quoting Book 0.912; not independently spec-verified) |
| The `ANY!` / `AAC!` directory name and the trailing `!` | **Undocumented deviation** — real on disc, absent from every spec/source |
| When `Kc` derivation is mandatory vs when plain `Kt` suffices; exact in-pack clear/encrypted boundary | **Open** |

## Sources

Primary:

- AACS "HD DVD and DVD Pre-recorded Book," Final Revision 0.952 (the source for every `.AACS`
  file definition; withdrawn from aacsla.com, recovered via the Internet Archive).
- AACS "Introduction and Common Cryptographic Elements" and "Pre-recorded Video Book"
  (aacsla.com) — the shared key hierarchy.
- DVD-Forum / Toshiba patents US20070091494A1, US 7,983,526, US 7,925,138, EP1868202A1
  (Primary Video Set, Advanced VTS, pack types, Program-Stream compliance, `DISCID.DAT`).
- FFmpeg `libavformat/mpeg.c` — the shipping EVO/PS demuxer (stream-id and audio sub-stream map).
- "An Overview of the Advanced Access Content System (AACS)," Henry/Sui/Zhong, U. Waterloo
  (CACR 2007-25).

Reference and community:

- Wikipedia: HD DVD, Enhanced VOB, Advanced Content, HDi, BackupHDDVD, Advanced Access Content
  System.
- Doom9 forum threads on BackupHDDVD (t-119871) and AACS key recovery (t-123311); the `Aaru`
  and `libaacs` projects (independent VTKF/KEYDB handling).
