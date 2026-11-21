const ACCENTS = ['#4f8cff', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4'];

const WALLPAPERS = [
  { id: 'aurora', label: 'Aurora' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'forest', label: 'Forest' },
];

export function mountSettings(root, ctx) {
  root.innerHTML = `
    <div class="app-pad">
      <section class="settings-group">
        <h3 class="section-title">Profile</h3>
        <p class="section-sub">How your account appears across the desktop.</p>
        <div class="setting-row">
          <div><strong>Display name</strong><span>Shown on the start menu and account menu.</span></div>
          <div style="display:flex; gap:8px;">
            <input type="text" id="name-input" maxlength="40" autocomplete="off">
            <button class="btn small primary" type="button" id="name-save">Save</button>
          </div>
        </div>
        <div class="setting-row">
          <div><strong>Email</strong><span>Used to sign in to RepoOS.</span></div>
          <span class="muted" id="email-value"></span>
        </div>
      </section>

      <section class="settings-group">
        <h3 class="section-title">Appearance</h3>
        <p class="section-sub">Changes apply instantly and follow you to any device.</p>
        <div class="setting-row">
          <div><strong>Accent colour</strong><span>Buttons, highlights and the start button.</span></div>
          <div class="swatches" id="swatches"></div>
        </div>
        <div class="setting-row" style="display:block;">
          <div style="margin-bottom:4px;"><strong>Wallpaper</strong><span>Pick the backdrop for your desktop.</span></div>
          <div class="wallpapers" id="wallpapers"></div>
        </div>
        <div class="setting-row">
          <div><strong>Theme</strong><span>Light or dark surfaces.</span></div>
          <div class="segmented" id="theme-switch">
            <button type="button" data-theme="dark">Dark</button>
            <button type="button" data-theme="light">Light</button>
          </div>
        </div>
      </section>

      <section class="settings-group">
        <h3 class="section-title">Account</h3>
        <p class="section-sub">Your account lives on this app's server — no third-party sign-in.</p>
        <div class="setting-row">
          <div><strong>Member since</strong><span>When this account was created.</span></div>
          <span class="muted" id="since-value"></span>
        </div>
      </section>
    </div>`;

  const nameInput = root.querySelector('#name-input');
  const nameSave = root.querySelector('#name-save');
  const swatches = root.querySelector('#swatches');
  const wallpapers = root.querySelector('#wallpapers');
  const themeSwitch = root.querySelector('#theme-switch');

  function paint() {
    nameInput.value = ctx.user.name;
    root.querySelector('#email-value').textContent = ctx.user.email;
    root.querySelector('#since-value').textContent = new Date(ctx.user.createdAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    swatches.replaceChildren();
    for (const accent of ACCENTS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `swatch ${ctx.user.accent.toLowerCase() === accent ? 'is-active' : ''}`;
      button.style.background = accent;
      button.title = accent;
      button.setAttribute('aria-label', `Accent ${accent}`);
      button.addEventListener('click', () => persist({ accent }));
      swatches.append(button);
    }

    wallpapers.replaceChildren();
    for (const wallpaper of WALLPAPERS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `wallpaper-option ${ctx.user.wallpaper === wallpaper.id ? 'is-active' : ''}`;
      button.innerHTML = `<span class="preview wp-${wallpaper.id}"></span><span>${wallpaper.label}</span>`;
      button.addEventListener('click', () => persist({ wallpaper: wallpaper.id }));
      wallpapers.append(button);
    }

    for (const button of themeSwitch.querySelectorAll('button')) {
      button.classList.toggle('is-active', button.dataset.theme === ctx.user.theme);
    }
  }

  async function persist(patch) {
    try {
      const updated = await ctx.updateUser(patch);
      ctx.user = updated;
      paint();
    } catch (err) {
      ctx.toast(err.message, 'error');
    }
  }

  nameSave.addEventListener('click', async () => {
    const value = nameInput.value.trim();
    if (!value) {
      ctx.toast('Name cannot be empty.', 'error');
      return;
    }
    nameSave.disabled = true;
    try {
      const updated = await ctx.updateUser({ name: value });
      ctx.user = updated;
      ctx.toast('Profile updated');
    } catch (err) {
      ctx.toast(err.message, 'error');
    } finally {
      nameSave.disabled = false;
    }
  });

  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') nameSave.click();
  });

  for (const button of themeSwitch.querySelectorAll('button')) {
    button.addEventListener('click', () => persist({ theme: button.dataset.theme }));
  }

  paint();
}
