// Desktop-app screenshots, one per OS: the homepage slideshow shows them in this
// order, and each platform docs page shows its own via <AppShowcase os="…" />.
export type AppShot = { os: string; src: string; w: number; h: number; label: string; alt: string };

export const appShots: AppShot[] = [
  { os: 'ubuntu', src: '/freemkv-gui-ubuntu.png', w: 1180, h: 762, label: 'Ubuntu 26.04 · GNOME (Wayland)', alt: 'The freemkv desktop app on Ubuntu with GNOME — the start screen with Open disc and Open file or ISO buttons above an empty log pane' },
  { os: 'windows', src: '/freemkv-gui-windows.png', w: 1686, h: 922, label: 'Windows Server 2022', alt: 'The freemkv desktop app on Windows with a disc image open — per-title and per-track selection with chapters and durations, output format, and a live log' },
  { os: 'macos', src: '/freemkv-gui-macos.png', w: 2360, h: 1520, label: 'macOS', alt: 'The freemkv desktop app on macOS with a DVD image open — titles expanded into video, audio and subtitle tracks with checkboxes, an MKV output target, and the log below' },
];
