const endpoint = '/api/firmware-verification';
const detail = document.getElementById('drive-detail');
const config = document.getElementById('firmware-verification-config');
const scopeOf = button => ({target: button.dataset.verificationTarget, source: button.dataset.verificationSource || ''});
async function api(body) {
  const response = await fetch(endpoint, {method: 'POST', credentials: 'same-origin',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || 'Please try again.'); error.status = response.status; throw error; }
  return result;
}

if (detail && config) {
  let generation = 0;
  async function refresh() {
    const version = ++generation;
    const buttons = [...detail.querySelectorAll('[data-verification-target]')];
    const scopes = [...new Map(buttons.map(button => { const s = scopeOf(button); return [JSON.stringify(s), s]; })).values()];
    const values = new Map();
    try {
      for (let n = 0; n < scopes.length; n += 80) {
        const chunk = scopes.slice(n, n + 80), data = await api({action: 'counts', scopes: chunk});
        if (!Array.isArray(data.counts) || data.counts.length !== chunk.length) throw new Error('Counts unavailable.');
        chunk.forEach((scope, i) => values.set(JSON.stringify(scope), data.counts[i]));
      }
      if (version !== generation) return;
      for (const button of buttons) {
        const count = values.get(JSON.stringify(scopeOf(button)));
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Counts unavailable.');
        button.textContent = count ? `Verified - ${count}` : 'Not Verified';
        button.classList.toggle('is-verified', count > 0);
        button.disabled = false; button.hidden = false;
      }
    } catch {
      // Unavailable service is not evidence of zero confirmations.
      if (version === generation) buttons.forEach(button => { button.hidden = true; });
    }
  }
  new MutationObserver(refresh).observe(detail, {childList: true});
  refresh();

  const dialog = document.createElement('dialog');
  dialog.className = 'fw-verify-dialog';
  dialog.setAttribute('aria-labelledby', 'fw-verify-title');
  dialog.innerHTML = `<button type="button" class="fw-close" aria-label="Close">×</button>
    <h2 id="fw-verify-title">Firmware verification</h2><p class="fw-scope"></p>
    <form><div data-step="email"><label for="fw-verify-email">Email</label>
      <input id="fw-verify-email" type="email" autocomplete="email" maxlength="254" required>
      <div class="fw-challenge"></div><button type="submit" class="btn btn-primary">Send code</button></div>
    <div data-step="code" hidden><label for="fw-verify-code">Code</label>
      <input id="fw-verify-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6">
      <button type="submit" class="btn btn-primary">Continue</button></div></form>
    <div class="fw-actions" data-step="actions" hidden></div><p class="fw-error" role="alert" hidden></p>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector('form'), email = dialog.querySelector('#fw-verify-email'), code = dialog.querySelector('#fw-verify-code');
  const errorBox = dialog.querySelector('.fw-error'), actions = dialog.querySelector('.fw-actions');
  let scope, challenge, step = 'email', busy = false, opening = 0, loading, cancelChallenge;
  const fail = error => { errorBox.textContent = error.message || 'Please try again.'; errorBox.hidden = false; };
  function show(next) {
    step = next; errorBox.hidden = true;
    dialog.querySelectorAll('[data-step]').forEach(element => { element.hidden = element.dataset.step !== next; });
    email.required = next === 'email'; email.disabled = next !== 'email';
    code.required = next === 'code'; code.disabled = next !== 'code';
    if (next === 'email') email.focus();
    else if (next === 'code') code.focus();
  }
  function setBusy(value) {
    busy = value;
    dialog.querySelectorAll('button:not(.fw-close)').forEach(button => { button.disabled = value; });
  }
  async function status(version) {
    try {
      const data = await api({action: 'status', ...scope});
      if (version !== opening || !dialog.open) return;
      actions.replaceChildren();
      const operation = (label, action, source) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-primary'; button.textContent = label;
        button.addEventListener('click', async () => {
          if (busy) return;
          setBusy(true); errorBox.hidden = true;
          try { await api({action, target: scope.target, source}); dialog.close(); await refresh(); }
          catch (error) { if (error.status === 401) show('email'); else fail(error); }
          finally { setBusy(false); }
        });
        actions.appendChild(button);
      };
      if (!data.reports.length) operation('Verify', 'add', scope.source);
      else for (const report of data.reports) operation(
        data.reports.length > 1 || (report.source && !scope.source) ? `Remove ${report.label || 'verification'}` : 'Remove my verification',
        'remove', report.source);
      show('actions'); actions.querySelector('button')?.focus();
    } catch (error) {
      if (version !== opening || !dialog.open) return;
      if (error.status === 401) show('email'); else fail(error);
    }
  }
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    return loading ??= new Promise((resolve, reject) => {
      let script = document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/"]');
      const timer = setTimeout(() => { loading = undefined; reject(new Error('Verification could not load. Please try again.')); }, 15000);
      const loaded = () => { clearTimeout(timer); resolve(window.turnstile); };
      const failed = () => { clearTimeout(timer); loading = undefined; reject(new Error('Verification could not load. Please try again.')); };
      if (!script) {
        script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.addEventListener('load', loaded, {once: true}); script.addEventListener('error', failed, {once: true}); document.head.appendChild(script);
      } else { script.addEventListener('load', loaded, {once: true}); script.addEventListener('error', failed, {once: true}); }
    });
  }
  async function token() {
    if (!config.dataset.sitekey) throw new Error('Email verification is temporarily unavailable.');
    let turnstile, widget;
    const cancelled = new Promise((_, reject) => { cancelChallenge = () => reject(new Error('Cancelled.')); });
    try {
      turnstile = await Promise.race([loadTurnstile(), cancelled]);
      return await Promise.race([new Promise((resolve, reject) => {
        widget = turnstile.render(dialog.querySelector('.fw-challenge'), {sitekey: config.dataset.sitekey, action: 'firmware-verification', appearance: 'interaction-only', callback: resolve,
          'error-callback': () => { reject(new Error('Please try the verification check again.')); return true; },
          'expired-callback': () => reject(new Error('Verification check expired. Please try again.')),
          'timeout-callback': () => reject(new Error('Verification check timed out. Please try again.'))});
      }), cancelled]);
    } finally { cancelChallenge = undefined; if (widget != null) turnstile.remove(widget); }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const version = opening; setBusy(true); errorBox.hidden = true;
    try {
      if (step === 'email') {
        const data = await api({action: 'request', ...scope, email: email.value, token: await token()});
        if (version !== opening || !dialog.open) return;
        challenge = data.challenge; code.value = ''; show('code');
      } else if (step === 'code') {
        await api({action: 'authenticate', challenge, code: code.value});
        if (version === opening && dialog.open) await status(version);
      }
    } catch (error) { if (version === opening && dialog.open) fail(error); }
    finally { setBusy(false); }
  });
  dialog.querySelector('.fw-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { opening++; cancelChallenge?.(); challenge = null; email.value = ''; code.value = ''; });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const b = dialog.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) dialog.close(); } });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-verification-target]');
    if (!button || button.disabled || dialog.open || busy) return;
    event.preventDefault(); scope = scopeOf(button); const version = ++opening;
    dialog.querySelector('.fw-scope').textContent = button.dataset.verificationFrom
      ? `${button.dataset.verificationFrom} → ${button.dataset.verificationLabel}` : button.dataset.verificationLabel;
    actions.replaceChildren(); show('actions'); dialog.showModal(); await status(version);
  });
}
