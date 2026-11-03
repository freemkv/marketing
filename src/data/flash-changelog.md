# Changelog

Customer-visible changes to freemkv Flash and freemkv Modify, newest first.
Versions are independent of the freemkv ripping applications.

## [0.17.3] - 2026-11-02

### freemkv Flash

- Add BDR-212U 1.01 to BDR-213U 1.02 crossflashing, with drive-data backups and a recovery archive.
- Fix Pioneer startup settings during crossflashing. Unsupported drive-data conversions are blocked even when compatibility checks are bypassed.
- Show standard crossflashes separately from options that require specific original hardware. Hide duplicate hardware-specific options.

## [0.17.2] - 2026-11-02

### freemkv Flash

- Preserve original drive settings during supported UD02/UD03/UD04 firmware changes and returns to stock firmware.
- Fix Pioneer Recovery being blocked by a settings check for another hardware family.
- Explain when a firmware change needs a settings conversion that is not supported.
- Add Save Log after successful operations.
- Increase the macOS Flash window height.

## [0.17.1] - 2026-11-01

### freemkv Flash

- Improve Pioneer crossflash compatibility checks.
- Fix valid modified MediaTek firmware being rejected as the Current firmware file.
- Fix MediaTek Recovery for drives in boot mode.
- Improve logs for failed or blocked Flash and Recovery attempts.

## [0.17.0] - 2026-11-01

### freemkv Modify

- Fix UHD disc information and capacity handling in supported classic MT1939 and older MT1959 firmware. These changes still need physical-drive testing.
- Fix supported modifications being incorrectly marked unavailable. Show the saved settings when reopening modified firmware.
- Fix stale authentication after changing or resetting Encryption settings.
- Correct maximum read-speed and DVD region-free settings. Blu-ray region forcing is not supported.

### freemkv Flash

- Allow compatible BDX-PR1ML and BDR-211M SAT 8801 firmware to pass the hardware-family check.

## [0.16.2] - 2026-11-01

### freemkv Flash

- Fix UD02FAN drives being incorrectly refused for the BDR-UD02D 1.00 to BDR-UD04 1.14 conversion.
- Support returning converted drives to stock UD02 1.00 firmware. This does not add UD04-to-UD02 support for factory UD04 drives.

## [0.16.1] - 2026-10-31

### freemkv Flash

- Improve updates that need temporary firmware before installing the final image. Newly added Pioneer routes still need physical-drive testing.
- Check the full update plan before writing and verify each completed stage.
- Show which stages completed if a later stage fails, and explain temporary-firmware requirements in Flash and Recovery.
- Make MediaTek updates behave consistently for direct updates and multi-image packages.

## [0.16.0] - 2026-10-31

### freemkv Modify

- Expand supported MT1939 and older MT1959 firmware, with speed, region, encryption, HRL and Unrestricted settings where available.
- Preserve boot settings and drive identity when the drive starts or resets.
- Speed up firmware analysis and creation.
- UHD reading on the newly supported conversions still needs physical-drive testing; authentication differences remain under investigation.

## [0.15.4] - 2026-10-30

### freemkv Flash

- Add BDR-UD02D 1.00 to BDR-UD04 1.14 crossflashing for matching original hardware. Other UD02/UD04 combinations remain unsupported.
- Recognize more Pioneer factory records and improve guidance when a raw dump cannot become a restorable OEM backup.

### freemkv Modify

- Support more MediaTek firmware images and show the features and startup settings available for each. Experimental MT1939 UHD conversion is excluded.

## [0.15.3] - 2026-10-25

### freemkv Flash

- Explain MediaTek firmware-read restrictions before Flash, Backup and Dump, instead of reporting them as connection failures.
- Mark incomplete diagnostic dumps as unsuitable for restoration.
- Show DVD region counters only for drives that use them. Region-free drives no longer appear to have exhausted their resets.
- Improve guidance for disconnects, unavailable backups and unsupported comparisons.

### freemkv Modify

- Hide irrelevant region information after applying Region-free.
- Correct website feature listings for each firmware image, including unsupported UHD/BD controls on WH16NS58 1.V9.

## [0.15.2] - 2026-10-25

### freemkv Modify

- Fix modified WH16NS58 1.V9 firmware being corrupted during creation.
- Sign and verify generated firmware automatically. Use `freemkv-fw modify INPUT [OUTPUT]`; existing `create` commands still work.
- Treat already-enabled modifications as successful, and allow HRL changes when raw-read modification is unavailable.

### freemkv Flash

- Reject firmware with damaged integrity metadata before flashing.
- Include the firmware files used by an update in diagnostic reports.
- Check for stable updates at startup. Normal use remains available if the check fails.
- Require a description when submitting a diagnostic report and offer report submission after a successful flash.

## [0.15.1] - 2026-10-25

### freemkv Flash

- Give clearer guidance for corrupt firmware files and unsupported settings conversions.
- Distinguish the factory product code from the installed firmware model, and correctly label the factory test date.

## [0.15.0] - 2026-10-24

### freemkv Flash

- Keep prepared recovery firmware through confirmation and recheck the drive before writing.
- Show progress for reading, writing, restarting and verification.
- Explain failures in the selected language, including whether firmware was written and what to do next.
- Report Pioneer firmware readback and startup verification separately.

## [0.14.5] - 2026-10-24

### freemkv Flash

- Let Pioneer Recovery bypass a hardware-family mismatch for one attempt, with a risk warning and five-digit confirmation.
- Recognize more OEM-branded Pioneer and MediaTek drives.
- Improve Pioneer readback and startup verification, with separate results for each.
- Allow Recovery to continue checking the installed firmware after an unsupported-media response.
- Make firmware comparisons clearer about content, versions and hardware compatibility.

## [0.14.4] - 2026-10-23

### freemkv Flash

- Group CLI drive information into readable sections and keep low-level traces in the diagnostic log.
- Accept MediaTek BIN files and TAR packages in Flash and Recovery. Pioneer updates still require TAR packages.
- Improve compatibility checks for compressed Pioneer firmware.
- Restore compatibility matching between BDR-S08 and BDR-S11JX SAT 8800 firmware.

## [0.14.3] - 2026-10-23

### freemkv Flash

- Allow raw dumps from more Pioneer drives, including REC drives and previously unrecognized models.
- Offer Save raw dump when an OEM backup cannot be created.
- Add Submit Dump and Submit Backup, including logs and session history. Uploads require browser approval.
- Recognize 32 more Pioneer SAT images for OEM backups. ATA, SCSI and REC backup reconstruction remains unsupported.

## [0.14.2] - 2026-10-22

### freemkv Flash

- Improve Pioneer hardware compatibility checks, including distinguishing SAT 8000 from SAT 8680.
- Report flash failures and completed steps consistently across the CLI and desktop apps.

### freemkv Modify

- Improve integrity-error guidance and diagnostic logging for background failures.

## [0.14.1] - 2026-10-21

### freemkv Flash

- Ask whether to continue when a backup cannot be made. Final flash confirmation is still required.
- Request a Current firmware file when the drive blocks automatic detection.
- Translate operation forms, confirmations, results and error guidance into 29 languages.
- Make errors shorter and show a next step. Keep technical details in the log.
- Put View Log, Save Log and Submit Report together.

### freemkv Modify

- Add a saved language preference and translations in 29 languages.
- Restore missing Raw Read, HRL and Encryption options for WH16NS58 1.V9 firmware.

## [0.14.0] - 2026-10-21

### freemkv Flash

- Add a saved language preference and initial translations for controls and menus in 29 languages.
- Show the correct app version in macOS app information.
- Fix misleading errors for unrecognized MediaTek TAR files.
- Let MediaTek Flash and Recovery use a selected Current firmware file when automatic detection is blocked.
- Match firmware-selection controls between Flash and Recovery and explain when the selected file does not match the drive.
- Clearly distinguish blocked updates from failed writes, and explain hardware mismatches using drive model names.

### freemkv Modify

- Fix firmware creation and startup-setting editing for WH16NS58 1.V9 and other affected firmware.
- Explain when a clean OEM source is required because the selected image is already modified.

## [0.13.4] - 2026-10-20

### freemkv Modify

- Choose startup settings in the desktop app or with `--default FEATURE=VALUE` in the CLI.
- Reset startup defaults to Unrestricted On, with other features at OEM behavior.
- Reopen newly created BIN or TAR files to edit startup settings. Older modified images still require their OEM source.
- Fix settings from a previously selected file carrying over to another image.
- Explain unavailable settings and add `--dry-run` to preview changes without creating a file.

### freemkv Flash

- Preview Recovery's temporary firmware and restoration steps before confirming a write.
- Save session history and operation logs automatically, with View Log and Submit Report actions.
- Allow report submissions to be cancelled and avoid indefinite waits for the reporting service.
- Fix Pioneer Recovery preparation for WX1DM `0000` to S12JX 1.03. Report failed restoration clearly.
- Fix MediaTek INTM-to-1.V9 update preparation. Physical-drive confirmation is still outstanding.
- Recognize more Pioneer-based PLEXTOR and TEAC firmware, and clear stale results when the selected drive or firmware changes.

## [0.13.3] - 2026-10-19

### freemkv Flash

- Fix BDR-207M 1.60 to BDR-PR1ML 1.30 updates being incorrectly refused.
- Prepare required Pioneer startup settings in Flash and Recovery before transferring firmware.
- Skip unsupported settings commands when recovering a drive already running its loader.

## [0.13.2] - 2026-10-19

### freemkv Flash

- Prepare Pioneer startup settings for compatible firmware changes in either direction.
- Show the last observed drive status when Flash or Recovery cannot confirm a successful restart.
- Skip unsupported settings commands during loader recovery.
- Physical-drive confirmation of the supplied S12JX/WX1DM transition remains outstanding.

## [0.13.1] - 2026-10-19

### freemkv Flash

- Complete MediaTek updates that require intermediate firmware, rechecking the drive before the final transfer.
- Allow an optional Current firmware file in MediaTek Recovery and reject stale references.
- Explain when protected readback limits verification.
- Recognize more Pioneer-based drives and restore more supported Pioneer backup layouts, including WX1DM 1.01.
- Show whether firmware appears to be OEM, user-provided or unknown. This does not establish drive compatibility.

## [0.13.0] - 2026-10-16

### freemkv Flash

- Improve MediaTek Flash and Recovery preparation for drives in normal, intermediate-firmware or boot mode.
- Give clearer diagnostics when Recovery preparation fails.
- Fix Pioneer update preparation for packages that replace the Kernel.
- Keep operation tabs accessible when drive identification is incomplete.
- MediaTek Recovery remains experimental and needs physical-drive testing.

## [0.12.5] - 2026-10-16

### freemkv Flash

- Add experimental MediaTek Recovery, including drives that cannot supply Current firmware or a rollback backup.
- Accept MediaTek TAR packages that need intermediate firmware before the final update.
- Accept standalone BIN files for Flash and Recovery, and add `package` to wrap a BIN as a TAR.
- Choose transfer encoding automatically and block updates when the drive's requirements are unclear.

### freemkv Modify

- Modify the final firmware inside MediaTek release TAR packages while preserving the intermediate image.

## [0.12.4] - 2026-10-15

### freemkv Flash

- Accept valid MediaTek intermediate firmware for compatible updates.
- Improve errors when firmware identity, readback or backup restoration cannot be verified.
- Keep available drive model, version and serial information visible when other metadata cannot be read.

## [0.12.3] - 2026-10-14

### freemkv Modify

- Explain when no changes apply and identify already-modified images.
- When only some modifications apply, show which succeeded and why the others are unavailable.

### freemkv Flash

- Correct MediaTek generation labels for affected LG and ASUS drives. Existing backups remain usable.
- Explain firmware-read restrictions and add `dump --read-map` for support diagnostics.
- Distinguish rejected drive commands from connection failures.
- Fix Pioneer Kernel transfers during recovery between BDR-205 and BDR-206 families.
- Let the CLI proceed without a backup after explicit risk confirmation when the drive blocks reads.
- Back up MediaTek drives running freemkv firmware when their stock firmware blocked firmware reads.

## [0.12.2] - 2026-10-14

### freemkv Flash

- Restore compatible Pioneer crossflashes incorrectly refused by 0.12.1, including BDR-UD03 to BDR-UD04.
- Guide firmware changes that require different transfer encoding to experimental Recovery. Hardware confirmation remains outstanding.

## [0.12.1] - 2026-10-14

### freemkv Flash

- Block Pioneer updates that the installed firmware cannot receive or that would make the saved backup unusable.
- Add experimental Pioneer Recovery for compatible hardware when normal Flash refuses the update. Hardware confirmation remains outstanding.
- Allow compatible MediaTek cross-model updates within the same hardware family.

## [0.12.0] - 2026-10-10

### freemkv Flash

- Fix MT1939 backups failing on drives such as LG BH14NS40 and BE14NU40.
- Identify known OEM firmware in backups, Inspect and Compare, and label reconstructed backups separately.
- Reject raw dumps that cannot safely start the drive and report damaged firmware integrity data.
- Add a native desktop interface for macOS, Windows and supported Linux systems.
- Save backups before final confirmation and retain them if the update is cancelled.
- Require explicit risk acknowledgement before flashing and improve access to Recovery.
- Separate expected drive-specific data from unexpected firmware changes in comparisons.

## [0.11.2] - 2026-10-09

### freemkv Flash

- Show DVD regions 1–8 when all are allowed, and distinguish an unset region from a selected one.
- Show the original product code, factory date and country of manufacture when available.

## [0.11.1] - 2026-10-08

### freemkv Flash

- Show more firmware, media, DVD region, Quiet Drive and PureRead information.
- Make capability details easier to compare and hide unsupported or unknown rows.
- Show current and saved Quiet modes together, and keep diagnostic log locations visible.

## [0.11.0] - 2026-10-08

### freemkv Flash

- Add a Pioneer Recovery tab and `recover` command, replacing `flash --force`.
- Accept a Current firmware reference or a read from the drive during Recovery.
- Confirm drive identity and readiness after Recovery. The reported PR1ML recovery still needs hardware confirmation.
- Add Inspect and Compare for firmware files and captured drives, with text and JSON export.
- Explain unsupported files before entering update mode.

## [0.10.9]

### freemkv Flash

- Fix Pioneer backups failing on drives with restricted firmware reads, including BDR-212.
- Save usable captures even when they cannot support the proposed update.
- Recognize more OEM backup images, including BDR-XD06U 1.11.

## [0.10.8]

### freemkv Flash

- Fix Pioneer transfers failing partway through compatible crossflashes.
- Report failed restoration and incomplete verification accurately.
- Mark incomplete dumps clearly and stop reading when a drive disconnects.
- Include more available Pioneer diagnostic information in dumps.

## [0.10.7]

### freemkv Flash

- Identify and select drives by their operating-system names or device IDs, including Windows drive letters.
- Use operating-system names or device IDs instead of numbered drive selectors.

## [0.10.6]

### freemkv Flash

- Save MediaTek backups as flashable 2 MiB BIN files, replacing drive-specific data with factory contents. Raw dumps still retain drive-specific data.
- Fix restoration of older MediaTek TAR backups.
- Keep readable data around failed regions in MediaTek dumps.
- Find more Windows optical drives, including those behind strict USB bridges.
- Improve diagnostics when macOS cannot open or obtain exclusive access to a drive.

## [0.10.5]

### freemkv Flash and Modify

- Save detailed operation logs automatically and add desktop actions to view, copy and save them.
- Keep failure details available without a debug option, and limit log size.
- Verify newly saved files before reporting success.
- Accept valid short MediaTek identity replies and reject incomplete reads.
- Improve Pioneer detection and report transfer or readback failures clearly.

## [0.10.4]

### freemkv Flash

- Recognize compatible Pioneer firmware beyond the former UD04/S09 restrictions.
- Fix Pioneer transfer preparation and block incompatible components before writing.
- Improve desktop drive information, backup, dump, file checking and flash progress.
- Make backup-replacement confirmation consistent between CLI and desktop apps.
- Expand downloads for macOS, Windows and Linux architectures. Linux ARMv7 remains CLI-only.

## [0.10.3]

### freemkv Flash

- Find optical drives on Macs that previously reported none, including Blu-ray drives listed as DVD or CD devices.
- Restore drive access on supported macOS versions older than macOS 12.

## [0.10.2]

### freemkv Flash and Modify

- Add Linux desktop packages, Windows ARM64 downloads and separate Windows installers for each tool.
- Include the matching CLI with desktop downloads and provide static Linux CLIs, including Raspberry Pi OS.
- Add APT, RPM and Arch repositories.
- Fix Linux desktop startup failures caused by missing libraries.
- Improve errors for incomplete packages, disconnections and failed dumps.

## [0.10.1]

### freemkv Flash

- Accept Pioneer Kernel/Normal TAR packages without an extra manifest.
- Check the drive's identity after flashing.

## [0.10.0]

### freemkv Flash

- Add backup-first flashing for supported Pioneer Blu-ray drives, including compatible crossflashes and Kernel downgrades.
- Add Pioneer dump and recovery options.

## [0.9.2]

### freemkv Modify

- Fix a triple-layer UHD disc being refused as incompatible on BU40N 1.00.
- Combine Blu-ray and UHD acceptance under Unrestricted. Existing hosts using the former UHD control remain compatible.

## [0.9.1]

### freemkv Modify

- Improve firmware generation. Existing hardware-tested 0.9.0 images do not need replacement for this change alone.

## [0.9.0]

### freemkv Modify

- Combine AKE and Bus settings into one Encryption control. This firmware requires freemkv 1.7.5 or newer.
- Fix bus encryption being disabled at startup when OEM behavior was selected.
- Fix Encryption changes with an empty tray leaving the drive unresponsive.

### freemkv Flash

- Stop waiting indefinitely for drives to become ready and report incomplete verification as a failure.
- Block crossflashing when Current firmware cannot be identified.
- Improve checks for unrelated drives, malformed archives and changes to the selected drive before writing.

## [0.8.3]

### freemkv Modify

- Separate resets for saved settings, creation-time defaults and OEM behavior.
- Reset to OEM now clears saved freemkv settings; creation-time defaults apply at the next startup.

## [0.8.2]

### freemkv Modify

- Preserve Blu-ray/UHD acceptance after restarting the drive, using the selected startup defaults.
- Remember explicitly saved OEM settings instead of treating them as an empty configuration.

## [0.8.1]

### freemkv Modify

- Support more MT1939 firmware variants and show the features available for each.
- Add saved settings and resets for speed, region, disc acceptance and encryption features.
- Improve OEM firmware matching.
- Require freemkv 1.7.2 host software. Speed and UHD acceptance remain unavailable on classic MT1939 firmware.

## [0.7.1]

### freemkv Flash

- Identify more firmware formats, including Pioneer, Hitachi-LG and Renesas. Identification does not imply flashing support.
- Require a closed, empty tray before writing firmware.

## [0.7.0]

### freemkv Flash and Modify

- Block corrupted MediaTek images and firmware for the wrong drive model before writing.
- Report malformed or incomplete OEM images instead of crashing.
- Improve repeated raw reads after a failed or denied read.

## [0.6.2]

### freemkv Modify

- Improve experimental Raw Read authentication with the host.

## [0.6.1]

### freemkv Modify

- Fix an experimental raw-read command leaving BU40N unresponsive until the host restarted.

## [0.6.0]

### freemkv Modify

- Add experimental firmware creation and identification for LG BU40N while preserving normal drive commands.

## [0.5.0]

### freemkv Flash

- Introduce firmware identification, dumping and flashing for supported MediaTek drives on Windows, macOS and Linux.
- Preview updates, save a backup and check readback after writing.
- Recognize encrypted MediaTek images and verify firmware integrity.
- Report failed reads instead of silently saving bad backup data.
