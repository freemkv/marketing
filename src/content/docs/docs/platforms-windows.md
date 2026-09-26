---
title: Windows
description: Install and update freemkv on Windows, find your settings and output, and troubleshoot optical-drive access.
---

freemkv comes in two builds for Windows. **Install one or the other**; both are the `freemkv` command. Download the **x86_64** builds from the **[Download page](/download/)**.

- **freemkv** (the app): the desktop app plus every CLI command.
- **freemkv CLI**: the command line only, as a single console program.

## Install

### App

Run `freemkv-x86_64-windows-setup.exe`. It installs for your user only (no administrator prompt) into `%LOCALAPPDATA%\Programs\freemkv`, adds a **freemkv** Start menu shortcut and an optional desktop icon, and **adds freemkv to your user PATH**.

For a portable copy instead, download `freemkv-x86_64-windows.zip`, right-click it, choose **Extract All** and keep the two files together.

The app is two files, because Windows fixes at build time whether a program owns a console:

| File | Purpose |
|---|---|
| `freemkv.exe` | The window. Double-click it or use the Start menu shortcut. |
| `freemkv.com` | The same program for terminals. |

Typing `freemkv` in PowerShell or Command Prompt runs `freemkv.com`, because Windows tries `.com` before `.exe`. So `freemkv disc:// mkv://Movie.mkv` rips with progress in the terminal, and a bare `freemkv` opens the window and returns to the prompt. After installing, open a **new** terminal so it picks up the PATH change:

```powershell
freemkv --version
freemkv info disc://
```

From the portable folder, use `.\freemkv` instead; the `.\` tells PowerShell to use the file in the current folder.

Open a disc, image or folder, select the titles and tracks, choose an output location and press **Rip**.

### Command line only

Download `freemkv-cli-x86_64-windows.exe` and rename it to `freemkv.exe`. In File Explorer, open its folder, right-click an empty area and choose **Open in Terminal**. In PowerShell, run:

```powershell
.\freemkv --version
.\freemkv info disc://
```

It has no window; a bare `freemkv` prints usage. See the [CLI reference](/docs/cli/) for ripping commands and options.

## First launch

The Windows downloads are currently unsigned. SmartScreen may show **Windows protected your PC** for the installer, the app or the CLI.

For a download you obtained from the official release page and trust, choose **More info → Run anyway** if Windows offers that option. Managed computers may require an administrator's approval. See [Microsoft's explanation of SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

If antivirus software quarantines the file, review its detection details and verify the download source. An unsigned-file warning and a malware detection are different; do not assume every alert is a false positive.

## Update or remove

To update, close freemkv and run the new installer, or replace the portable files or standalone CLI. Settings are stored separately from the program.

To remove the installed app, use **Settings → Apps → Installed apps → freemkv → Uninstall**; this also removes it from PATH. For the portable app or CLI, delete the files. Keep or remove your settings and ripped movies separately.

## File locations

| What | Location |
|---|---|
| Desktop settings | `%APPDATA%\freemkv\gui-settings.json` |
| Finished movies | The output location you choose before ripping |
| AACS keys | See [Decryption Keys](/docs/decryption-keys/) |
| CLI diagnostic log | Off by default; `--log-level 3` writes `log.txt` in the current folder |

To capture a log at a specific path:

```powershell
freemkv info disc:// --log-level 3 --log-file "$env:USERPROFILE\Desktop\freemkv-log.txt"
```

Use `.\freemkv` from a portable or CLI folder.

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

- **A black window flashes and closes:** you double-clicked the standalone CLI. Use a terminal, or install the app and open `freemkv.exe`.
- **PowerShell says the command is not recognized:** after installing, open a new terminal. For portable or CLI files, check the filename, current folder and leading `.\`.
- **No drive is available:** check the connection, close other disc software and review [Drive access](#drive-access).
- **A movie is missing:** check the output location selected for that rip.

For key setup, see [Decryption Keys](/docs/decryption-keys/). For logs and shared fixes, see [Troubleshooting](/docs/troubleshooting/).
