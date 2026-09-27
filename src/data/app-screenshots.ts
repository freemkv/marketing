// Desktop-app screenshots. Each platform docs page (<AppShowcase os="…" />)
// shows every shot for its OS, in list order, as a thumbnail gallery. The
// homepage slideshow shows only the `featured` shot of each OS, in list order
// (Ubuntu, Windows, macOS). Adding a shot is one line here.
export type AppShot = {
  os: string;
  src: string;
  w: number;
  h: number;
  label: string;
  alt: string;
  featured?: boolean;
};

export const appShots: AppShot[] = [
  { os: 'ubuntu', featured: true, src: '/freemkv-gui-ubuntu.png', w: 1180, h: 762, label: 'Ubuntu 26.04 · GNOME (Wayland)', alt: 'The freemkv desktop app on Ubuntu with GNOME — the start screen with Open disc and Open file or ISO buttons above an empty log pane' },
  { os: 'windows', featured: true, src: '/freemkv-gui-windows.png', w: 1686, h: 922, label: 'Windows Server 2022', alt: 'The freemkv desktop app on Windows with a disc image open — per-title and per-track selection with chapters and durations, output format, and a live log' },
  { os: 'macos', src: '/freemkv-gui-macos-titles.png', w: 1180, h: 803, label: 'macOS', alt: 'The freemkv desktop app on macOS with a UHD Blu-ray open — the first title expanded into its HEVC 4K HDR10 video, TrueHD, AC-3 and DTS-HD audio and PGS subtitle tracks with checkboxes, and the Output panel with the destination folder, Selected titles → MKV and Run Now' },
  { os: 'macos', src: '/freemkv-gui-macos-formats.png', w: 1180, h: 791, label: 'macOS', alt: 'The freemkv desktop app on macOS with the output menu open — selected titles to MKV, MP4, M2TS, separate track files, or video, audio or subtitle tracks only; the whole disc to an ISO image or a decrypted folder; or chapters, title info as JSON, or a video index' },
  { os: 'macos', src: '/freemkv-gui-macos-settings.png', w: 1180, h: 793, label: 'macOS', alt: 'The freemkv Settings window on macOS, Recovery tab — multi-pass rip mode, maximum recovery passes, abort on lost seconds, keep encrypted (raw passthrough) and overwrite existing files' },
  { os: 'macos', featured: true, src: '/freemkv-gui-macos-rip.png', w: 1180, h: 800, label: 'macOS', alt: 'The freemkv desktop app on macOS ripping a UHD Blu-ray to MKV — source, output file, read rate and free space above a progress bar at 10% with elapsed and remaining time, and a Cancel button' },
];

/** The homepage slideshow: one featured shot per OS, in list order. */
export const featuredShots = appShots.filter((s) => s.featured);
/** Every shot for one OS, in list order (a platform docs page). */
export const shotsFor = (os: string) => appShots.filter((s) => s.os === os);
