---
title: Windows
description: A complete step-by-step Windows guide for freemkv and autorip, covering downloading, getting past SmartScreen, running from PowerShell, where your files go, and fixing common problems.
---

freemkv runs natively on Windows. There are two programs, each a single file: **`freemkv.exe`** (the command-line tool) and **`autorip.exe`** (a self-contained service you open in your browser). This page walks through everything start to finish; if you've never run a program from a terminal before, you can still follow along.

## Step 1: Download and unzip

Go to the **[Download](/download/)** page. There are two programs, downloaded separately, each as its own **`.zip`**:

- **autorip**: the automatic service with a web page (insert a disc, it rips by itself). **Most people want this one.**
- **freemkv**: the command-line tool (manual, one disc at a time).

Pick the one you want (you can grab both). **Unzip it:** find the downloaded `.zip` in your `Downloads` folder, then **right-click it → Extract All… → Extract**. Inside is the single program, `autorip.exe` (or `freemkv.exe`).

Windows names the extracted folder after the zip; rename it to something tidy like `freemkv` and keep it wherever you like (leaving it in Downloads is fine):

```
C:\Users\you\Downloads\freemkv\autorip.exe
```

There's **no installer**; the extracted `.exe` *is* the program.

Throughout the rest of this page, **`<install dir>`** means the folder that holds the `.exe`, wherever you put it (the example above is `C:\Users\you\Downloads\freemkv`). Substitute your own path wherever you see it.

## Step 2: Get past the blue "Windows protected your PC" screen

The first time you run a freshly downloaded program that isn't code-signed, Windows SmartScreen shows a blue box that says **"Windows protected your PC"**. This is expected for any small independent tool; it doesn't mean the file is broken or infected.

To run it anyway:

1. Click the **More info** link in the blue box.
2. A **Run anyway** button appears at the bottom. Click it.

You only have to do this once per download.

:::note[Antivirus flagged it?]
Some antivirus tools quarantine unknown `.exe` files on sight (a "false positive": it's reacting to the file being new and unsigned, not to anything it found). If the file vanishes after download or won't start, check your antivirus quarantine and allow/restore it, then add an exclusion for your `<install dir>\` folder.
:::

## Step 3: Open a terminal *in the folder*

freemkv is a command-line program, so **double-clicking the `.exe` does nothing useful**: a black window may flash and vanish. You run it by typing a command in a terminal that's already pointed at the folder.

The easy way:

1. Open **File Explorer** and go to your `<install dir>\` folder.
2. **Right-click an empty area** inside the folder.
3. Choose **Open in Terminal** (Windows 11) or **Open PowerShell window here** (Windows 10).

A terminal opens, already "inside" your folder. You'll know it worked because the prompt shows your folder path, e.g.:

```
PS <install dir>>
```

## Step 4: Run it

Type the command and press Enter. **On Windows you must type the `.\` in front** (it tells PowerShell "the program is right here in this folder"):

```powershell
# check it runs at all
.\autorip.exe --version

# start the service
.\autorip.exe serve
```

When `serve` is running, the terminal will say it's listening. **Leave that window open**; closing it stops autorip. Now open your browser to:

```
http://localhost:8080
```

That's the autorip control panel. Insert a disc and it takes over from there. For the `freemkv` CLI instead, the same `.\` rule applies:

```powershell
.\freemkv.exe --version
.\freemkv.exe info disc://
```

:::tip["...is not recognized" error?]
If you typed `autorip.exe` and got *"The term 'autorip.exe' is not recognized..."*, you left off the `.\`. Type `.\autorip.exe` (with the leading dot-backslash) and it'll work.
:::

## Step 5: Where are my files? (the important part)

`autorip.exe` is **self-contained**. It keeps *everything* in a single `config\` folder that sits **right next to the executable**; it does **not** scatter files across your system.

So if your `autorip.exe` is at `<install dir>\autorip.exe`, then:

| What | Where it lives |
|---|---|
| Settings | `<install dir>\config\settings.json` |
| Logs (one file per drive) | `<install dir>\config\logs\` |
| AACS keys | see **[Decryption Keys](/decryption-keys/)** |
| Work-in-progress (staging) | `<install dir>\config\staging\` |
| **Finished movies** | `<install dir>\config\output\` |

**Your finished `.mkv` files are in `config\output\`** unless you change the output folder in **Settings** in the web UI.

The control panel always shows you the *real, full path* it's using for staging and output, so you're never guessing where things went. If you'd rather send finished movies straight to a NAS or another drive, set the **Output directory** in Settings to any path you like, e.g. `D:\Movies` or `\\NAS\media\movies`.

:::tip[Moving or backing up autorip]
Because it's self-contained, you back up or relocate the whole thing by copying **the folder**: the `.exe` and its `config\` folder together. Drop that folder on another PC and it picks up exactly where it left off.
:::

### Putting it somewhere else

If you want autorip's data in a specific spot regardless of where the `.exe` lives, set the **`AUTORIP_DIR`** environment variable to a full path before starting it:

```powershell
$env:AUTORIP_DIR = "D:\autorip-data"
.\autorip.exe serve
```

### The `freemkv` CLI's files

| What | Where |
|---|---|
| AACS keys | see **[Decryption Keys](/decryption-keys/)** |
| Diagnostic log | off by default (see [Logs](#step-7-turning-on-logs-for-bug-reports)) |

## Step 6: Decryption keys for Blu-ray and UHD

**DVDs work out of the box.** **Blu-ray and 4K UHD discs are AACS-encrypted** and need keys: autorip can download and refresh them automatically, you can point it at an online key service, or you can supply your own keys. It works the same on every platform, so it's all on one page: **[Decryption Keys](/decryption-keys/)**.

## Step 7: Turning on logs (for bug reports)

By design freemkv keeps the terminal **clean** and writes **no log file** unless you ask. If you hit a problem and want to file a report, turn logging on:

```powershell
# CLI: write a detailed log next to where you're running it
.\freemkv.exe info disc:// --log-level 3
# creates .\log.txt in the current folder
```

Use `--log-level 3` for bug reports (level 4 is even more verbose). To choose where the file goes, add `--log-file C:\Users\you\Desktop\freemkv-log.txt`. For autorip, enable debug logging from the web UI and the per-drive logs collect under `config\logs\`.

## Device / drive access

freemkv and autorip reach your optical drive through native **SPTI** (SCSI pass-through), the standard Windows way to talk to a drive directly. No drivers are needed, but raw SCSI pass-through requires **Administrator**: open the terminal elevated ("Run as administrator") before starting the program, or drives won't be detected. You can refer to a drive by its letter (e.g. `D:`) where a device is requested.

## Common problems

| Symptom | What's going on / fix |
|---|---|
| Blue "Windows protected your PC" box | SmartScreen on an unsigned download. Click **More info → Run anyway** (Step 2). |
| `.exe` flashes a black window and closes | You double-clicked it. It's a terminal program; run it from a terminal (Step 3-4). |
| *"...is not recognized as the name of a cmdlet"* | You left off `.\`. Type `.\autorip.exe` (Step 4). |
| Downloaded file disappeared | Antivirus quarantine: restore it and add a folder exclusion (Step 2 note). |
| "No drives detected" | Confirm the drive appears in File Explorer and a disc is inserted; reseat USB drives. |
| Web page won't load at `localhost:8080` | The `serve` terminal window must stay open. If you closed it, run `.\autorip.exe serve` again. |
| Can't find my finished movie | It's in `config\output\` next to the `.exe`, unless you changed **Output directory** in Settings (Step 5). |
| Leftover `C:\config` from an old version | If `C:\config` exists and is writable, autorip still uses it (it's checked *before* the app-folder `config\`). Delete the old `C:\config` first, then restart so state lands in the app-folder `config\`. |

For capturing logs and fixes that apply to every platform, see **[Troubleshooting](/troubleshooting/)**.
