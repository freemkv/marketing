---
title: Unlocked drives
description: What an unlocked-firmware optical drive is, why it helps, and which drive families freemkv supports today.
---

Modified ("unlocked") firmware can lift restrictions such as **[rip-lock](/docs/drives-oem/#rip-lock-why-a-stock-drive-can-be-slow)** and the host-certificate requirement. On supported drives, that means a smoother ripping experience, especially for 4K UHD. Pioneer drives can use supported OEM firmware; see the [Pioneer beta](#pioneer-drives-beta) below.

Stock firmware also works through the [OEM-drive workflow](/docs/drives-oem/).

:::note[Unlocking is not decryption]
AACS-protected Blu-ray and 4K UHD discs still need [decryption keys](/docs/decryption-keys/). Unlocking the drive does not decrypt the disc.
:::

## Which drives does freemkv support?

:::note[Support keeps growing]
freemkv supports a growing range of drives and firmware versions. Check your model and firmware below; if yours is not covered yet, sharing a drive profile helps us extend support.
:::

### MediaTek-based drives

**MediaTek drive support is available in freemkv.** Compatible MediaTek-based drives require **updated firmware** for unlocked support. We recommend freemkv firmware.

Set up a compatible MediaTek drive in three steps:

1. **[Find and download your firmware](/firmware/find/)** — select your exact drive model and an appropriate firmware revision.
2. **[Modify the firmware](/firmware/modify/)** — build a freemkv-enabled image using the supported options.
3. **[Flash your drive](/firmware/flash/)** — follow the flashing guide to install the image that matches your drive.

Already running supported freemkv firmware? You can use it directly.

The large majority of consumer Blu-ray drives use a **MediaTek** chipset, and freemkv supports them. This covers **~200 drive + firmware combinations**, including:

- **LG**: most LG Blu-ray writers. In Windows your drive may show up as **"HL-DT-ST"**; that's LG (Hitachi-LG Data Storage), not a different brand. This is the most common family by far.
- **ASUS**: the MediaTek-based BW-16 models (e.g. BW-16D1HT) and the BC-12 series. These are often LG hardware under an ASUS badge. Note that the externally similar **BW-16D1X-U** is a *rebadged Pioneer* drive on a different chipset — see [Pioneer drives (beta)](#pioneer-drives-beta) below.
- **HP**: a handful of rebadged BD-RE / BD-RW models.

If you own an LG, ASUS, or HP Blu-ray drive from roughly **2012-2020**, it's very likely supported.

<span id="work-in-progress"></span>

### Pioneer drives (beta)

**Pioneer beta support is now available in freemkv 1.8.3.** Compatible Pioneer and Pioneer-based drives work with their original **OEM firmware**. No firmware modification or flashing is required.

[Download the latest freemkv](/download/) to try it. [Share your drive profile](#help-us-add-your-drive) to help us expand coverage.

## Firmware choices

- **[freemkv firmware](/firmware/find/) — recommended.** Our own firmware is the path we develop, test, and support directly. Start here when setting up a compatible MediaTek drive.
- **MK firmware — existing installations.** If your drive already has MK firmware, freemkv can work with supported combinations. Compatibility is partial; it is not the recommended firmware for a new setup.
- **OmniDrive — untested.** Listed for reference; compatibility has not been validated.

## Help us add your drive

**Share a drive profile to help us expand support**, whether your drive already works or is not covered yet:

```bash
freemkv info disc:// --share --mask
```

This captures your drive's identity and capabilities; `--mask` hides its serial number. Submit the profile to GitHub from freemkv, or copy it into a new issue.
