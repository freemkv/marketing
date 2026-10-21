// One preference shared by marketing pages and Starlight documentation.
export function initializeTheme(win) {
  if (win.freemkvTheme) { win.freemkvTheme.sync(); return; }
  const document = win.document;
  const media = win.matchMedia('(prefers-color-scheme: dark)');
  const key = 'starlight-theme';
  const parse = value => value === 'light' || value === 'dark' ? value : 'system';
  const load = () => {
    try { return parse(win.localStorage.getItem(key)); }
    catch { return 'system'; }
  };
  let preference = load();
  const sync = () => {
    const resolved = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    document.querySelectorAll('[data-theme-select]').forEach(select => { select.value = preference; });
  };
  const set = (value, persist = true) => {
    preference = parse(value);
    if (persist) {
      try { win.localStorage.setItem(key, preference === 'system' ? '' : preference); }
      catch { /* The choice still works for this page when storage is unavailable. */ }
    }
    sync();
  };
  win.freemkvTheme = { sync, set, get preference() { return preference; } };
  document.addEventListener('change', event => {
    if (event.target?.matches?.('[data-theme-select]')) set(event.target.value);
  });
  media.addEventListener('change', () => { if (preference === 'system') sync(); });
  win.addEventListener('storage', event => {
    if (event.key === key || event.key === null) set(load(), false);
  });
  document.addEventListener('DOMContentLoaded', sync, { once: true });
  document.addEventListener('astro:after-swap', sync);
  sync();
}
