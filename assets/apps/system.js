export function mountSystem(root, ctx) {
  root.innerHTML = `
    <div class="app-pad">
      <h3 class="section-title">About RepoOS</h3>
      <p class="section-sub">Version 2.0 · running on this app's own server and database.</p>

      <div class="status-grid" id="status-grid">
        <div class="status-row"><strong>Server</strong><span class="pill"><span class="dot"></span>Checking…</span></div>
        <div class="status-row"><strong>Database</strong><span class="pill"><span class="dot"></span>Checking…</span></div>
      </div>

      <div class="status-grid" style="margin-top:14px;">
        <div class="status-row"><strong>Signed in as</strong><span class="muted">${ctx.user.email}</span></div>
        <div class="status-row"><strong>Session</strong><span class="muted">Cookie · 30 days</span></div>
        <div class="status-row"><strong>Storage</strong><span class="muted">Accounts, notes and settings</span></div>
      </div>

      <p class="sys-note">
        RepoOS keeps your account, notes and preferences in its own database on the
        app's server. There is no third-party sign-in and no external script or font
        loaded from another site.
      </p>

      <button class="btn small" type="button" id="refresh-status" style="margin-top:14px;">Refresh status</button>
    </div>`;

  const grid = root.querySelector('#status-grid');

  function pill(ok, label) {
    return `<span class="pill ${ok ? 'ok' : 'bad'}"><span class="dot"></span>${label}</span>`;
  }

  async function check() {
    grid.innerHTML = `
      <div class="status-row"><strong>Server</strong>${pill(true, 'Online')}</div>
      <div class="status-row"><strong>Database</strong>${pill(false, 'Checking…')}</div>`;
    try {
      const health = await ctx.api('/health');
      grid.innerHTML = `
        <div class="status-row"><strong>Server</strong>${pill(true, 'Online')}</div>
        <div class="status-row"><strong>Database</strong>${pill(health.db === 'up', health.db === 'up' ? 'Connected' : 'Unavailable')}</div>
        <div class="status-row"><strong>Uptime</strong><span class="muted">${Math.floor(health.uptimeSeconds / 60)}m ${health.uptimeSeconds % 60}s</span></div>`;
    } catch {
      grid.innerHTML = `
        <div class="status-row"><strong>Server</strong>${pill(false, 'Unreachable')}</div>
        <div class="status-row"><strong>Database</strong>${pill(false, 'Unknown')}</div>`;
    }
  }

  root.querySelector('#refresh-status').addEventListener('click', check);
  check();
}
