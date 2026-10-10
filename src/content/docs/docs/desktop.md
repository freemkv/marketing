---
title: Desktop app
description: Opening discs, selecting titles and tracks, saving preferences, and understanding progress.
---

The desktop app uses the same reading and muxing engine as the CLI. Open a disc, file, folder, or ISO, check the titles and tracks you want, choose the output, then start the rip.

## Source and readiness

**Open disc** scans an optical drive. **Open file or ISO** opens an existing source without reading a physical disc. The startup log shows the application version immediately.

A successful optical scan establishes that a disc is present. A confirmed empty tray shows no disc; a failed scan does not prove the tray is empty. Permission, structure, and read failures appear in the log when you explicitly open the source. Disc presence alone does not guarantee that decryption keys are available.

## Titles, audio, and subtitles

These controls change the checked selection, not the source files. Expand a title to inspect its tracks before starting.

| Control | Meaning |
| --- | --- |
| **Titles: Main film only** | Select the recommended main feature. It is not necessarily the longest title. |
| **Titles: Episodes** | Select episodes supported by the shared selection model's authored evidence, collapsing exact alternate presentations. Incomplete or unsupported navigation requires manual title selection. |
| **Titles: Longest title** | Select by duration; a play-all title can be longer than any individual episode. |
| **Titles: All titles** | Check all titles visible under the minimum-duration setting, including extras. |
| **Titles: No titles** | Clear title selection so you can check titles individually. |
| **Audio: All** | Keep every audio track in selected titles. |
| **Audio: language(s)** | Prefer those audio languages; if a title has no match, its available audio is retained rather than silently producing a video-only file. |
| **Subtitles: All / None / Forced only** | Keep all subtitles, none, or only forced subtitles respectively. |
| **Subtitles: language(s)** | Select subtitle languages. Unticking the last selected language means None, not All. |

Title selection is automatic guidance, not proof of episode identity. Discs can contain alternate cuts, language versions, repeated playlists, menus, and misleading titles. Review the checked titles when the disc's authoring is ambiguous. Similar duration alone does not establish identical content.

The CLI, desktop, and library use the same selection model. A movie's First-Play target or a playlist mentioned in a Java menu is not, by itself, a complete episode list. When automatic episode selection cannot establish a complete list, inspect the titles and check them explicitly. Choosing **All titles** is an explicit choice and may include extras or duplicates.

## Remembering choices

The setting to remember audio/subtitle choices saves those toolbar changes across application restarts. Disable it to keep toolbar changes temporary. It does not save the toolbar's title choice: opening another source uses **Settings → Default selection**. **Episodes** is available only when the selection model can identify a supported episode selection.

Settings also provide separate preferred regular-subtitle and forced-subtitle language lists. Forced subtitles commonly translate signs or foreign dialogue; their preferred language need not match every audio language you retain.

## Output and progress

Choose a destination and output format before starting. Selected-title formats create separate files for selected titles; a whole-disc ISO is a disc image, not an episode split. See [MKV output](/docs/mkv-output/) and [recovery](/docs/how-recovery-works/) for format and damaged-disc behavior.

For multiple titles, the upper progress bar describes the current title and resets for the next one. The lower bar describes the whole batch. With equally sized titles, finishing one of three is approximately one third of the batch; unequal work can produce a different percentage. Recovery and muxing are distinct phases, so a phase reaching 100% does not alone mean all files have finished.

## Keys and update failures

Use **Settings → Keys** for a local key database or your configured online service. The keydb update URL must return supported keydb content, not a website's landing page.

A keydb update replaces the destination atomically, so its parent directory must be writable, not only the existing file. In sandboxed packages such as Snap, the app also needs access to that directory. A permission error is not evidence of an invalid database; check the path in the error and the package's access permissions. Do not run the desktop app as root to work around it. See [decryption keys](/docs/decryption-keys/) and [Linux setup](/docs/platforms-linux/).
