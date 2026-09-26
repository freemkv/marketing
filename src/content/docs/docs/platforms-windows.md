---
title: Windows
description: Install and update freemkv on Windows, find your settings and output, and troubleshoot optical-drive access.
---

freemkv provides a native desktop app and a command-line interface on Windows. Both use the same ripping engine. Download the **x86_64** builds from the **[Download page](/download/)**.

## Install

### Desktop app

Download `freemkv-x86_64-windows.zip`, right-click it and choose **Extract All**. Keep the extracted folder wherever you prefer, then open `freemkv-gui.exe`.

Open a disc, image or folder, select the titles and tracks, choose an output location and press **Rip**. No terminal is needed.

### Command line

Download `freemkv-x86_64-windows.exe`. In File Explorer, open its folder, right-click an empty area and choose **Open in Terminal**. In PowerShell, run:

```powershell
.\freemkv-x86_64-windows.exe --version
.\freemkv-x86_64-windows.exe info disc://
```

The `.\` tells PowerShell to use the file in the current folder. You can rename it to `freemkv.exe` for shorter commands. Running it with `gui` opens the desktop interface.

See the [CLI reference](/docs/cli/) for ripping commands and options.

## First launch

The Windows downloads are currently unsigned. SmartScreen may show **Windows protected your PC** for either the desktop app or CLI.

For a download you obtained from the official release page and trust, choose **More info → Run anyway** if Windows offers that option. Managed computers may require an administrator's approval. See [Microsoft's explanation of SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

If antivirus software quarantines the file, review its detection details and verify the download source. An unsigned-file warning and a malware detection are different; do not assume every alert is a false positive.

## Update or remove

Close freemkv, download the new release and replace the extracted desktop files or standalone CLI. There is no installer to run. Settings are stored separately from the program.

To remove freemkv, delete its program files. Keep or remove your settings and ripped movies separately.

## File locations

| What | Location |
|---|---|
| Desktop settings | `%APPDATA%\freemkv\gui-settings.json` |
| Finished movies | The output location you choose before ripping |
| AACS keys | See [Decryption Keys](/docs/decryption-keys/) |
| CLI diagnostic log | Off by default; `--log-level 3` writes `log.txt` in the current folder |

To capture a log at a specific path:

```powershell
.\freemkv-x86_64-windows.exe info disc:// --log-level 3 --log-file "$env:USERPROFILE\Desktop\freemkv-log.txt"
```

## Drive access

freemkv uses native Windows SCSI pass-through (SPTI). No freemkv-specific driver is required. If physical-drive access is denied, start the desktop app or terminal with **Run as administrator**. A drive can be selected by its letter, such as `D:`.

Close other software using the disc and confirm the drive appears in Windows before retrying.

## autorip

For automatic ripping through a browser, download `autorip-x86_64-windows.zip`, extract it and run:

```powershell
.\autorip.exe serve
```

Leave the terminal open and visit `http://localhost:8080`. See [autorip Service](/docs/autorip/) for configuration, data locations and running it as a service.

## Troubleshooting

- **A black window flashes and closes:** you opened the CLI by double-clicking it. Use a terminal, or open `freemkv-gui.exe` for the desktop app.
- **PowerShell says the command is not recognized:** check the filename, current folder and leading `.\`.
- **No drive is available:** check the connection, close other disc software and review [Drive access](#drive-access).
- **A movie is missing:** check the output location selected for that rip.

For key setup, see [Decryption Keys](/docs/decryption-keys/). For logs and shared fixes, see [Troubleshooting](/docs/troubleshooting/).
