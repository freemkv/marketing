// Copy-paste setup lines for the freemkv.org package repositories, shared by
// the download, flash and modify pages.
export const aptSetup = [
  'curl -fsSL https://freemkv.org/apt/freemkv.gpg | sudo tee /etc/apt/keyrings/freemkv.gpg >/dev/null',
  'echo "deb [signed-by=/etc/apt/keyrings/freemkv.gpg] https://freemkv.org/apt stable main" | sudo tee /etc/apt/sources.list.d/freemkv.list',
];
export const rpmSetup = 'sudo curl -fsSL -o /etc/yum.repos.d/freemkv.repo https://freemkv.org/rpm/freemkv.repo';
export const pacmanSetup = [
  'curl -fsSL https://freemkv.org/arch/freemkv.asc | sudo pacman-key --add -',
  'sudo pacman-key --lsign-key 3C77286840178C3512276AC49030E403F8320C5D',
  "printf '\\n[freemkv]\\nServer = https://freemkv.org/arch/$arch\\n' | sudo tee -a /etc/pacman.conf",
];
export const scoopSetup = 'scoop bucket add freemkv https://github.com/freemkv/scoop-bucket';
export const linuxHelp = 'Setup, drive access and older distros: <a href="/docs/platforms-linux/">Linux guide</a>.';
export const windowsHelp = 'Windows may flag this unsigned download: <a href="/docs/platforms-windows/#first-launch">first-run help</a>.';

