// Loaded only when the Finder build has a Turnstile site key configured.
const config = document.getElementById('firmware-download-config');
const sitekey = config?.dataset.sitekey;
if (sitekey) {
  let loading;
  function loadChallenge() {
    return loading ??= new Promise((resolve, reject) => {
      if (window.turnstile) { resolve(window.turnstile); return; }
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => { loading = undefined; reject(new Error('Download verification could not load. Please try again.')); };
      document.head.appendChild(script);
    });
  }
  let busy = false;
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-firmware-download]');
    if (!button) return;
    event.preventDefault();
    if (busy) return;
    busy = true; button.setAttribute('aria-disabled', 'true');
    const status = document.createElement('div'); status.setAttribute('role', 'status');
    status.textContent = 'Preparing download…'; button.after(status);
    const challenge = document.createElement('div'); status.after(challenge);
    let turnstile, widget;
    try {
      turnstile = await loadChallenge();
      const token = await new Promise((resolve, reject) => {
        widget = turnstile.render(challenge, {sitekey, action: 'firmware-download',
          appearance: 'interaction-only', callback: resolve,
          'error-callback': () => { reject(new Error('Verification failed. Click Download to try again.')); return true; },
          'expired-callback': () => reject(new Error('Verification expired. Click Download to try again.')),
          'timeout-callback': () => reject(new Error('Verification timed out. Click Download to try again.')),
        });
      });
      const file = button.dataset.firmwareDownload;
      const response = await fetch('/api/firmware-download', {method: 'POST',
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify({file, token})});
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = objectUrl;
      link.download = decodeURIComponent(file.split('/').pop());
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      status.textContent = 'Download ready.';
    } catch (error) { status.textContent = error.message || 'Download failed. Please try again.'; }
    finally {
      if (widget != null) turnstile.remove(widget);
      challenge.remove(); button.removeAttribute('aria-disabled'); busy = false;
    }
  });
}
