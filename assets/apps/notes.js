const relativeTime = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const clockTime = (iso) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function mountNotes(root, ctx) {
  root.innerHTML = `
    <div class="app-shell">
      <aside class="app-aside">
        <div class="notes-toolbar">
          <button class="btn small primary" type="button" id="new-note">+ New note</button>
        </div>
        <div style="padding: 0 10px;">
          <input class="notes-search" type="search" id="note-search" placeholder="Search notes" autocomplete="off">
        </div>
        <div class="note-list" id="note-list"></div>
      </aside>
      <div class="app-main" id="note-main"></div>
    </div>`;

  const listHost = root.querySelector('#note-list');
  const mainHost = root.querySelector('#note-main');
  const search = root.querySelector('#note-search');

  let notes = [];
  let activeId = null;
  let query = '';
  let saveTimer = null;
  let saving = false;
  let savePending = false;

  const activeNote = () => notes.find((note) => note.id === activeId) || null;

  function renderList() {
    const filtered = notes.filter((note) => {
      if (!query) return true;
      return `${note.title} ${note.body}`.toLowerCase().includes(query);
    });

    listHost.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'notes-empty';
      empty.textContent = notes.length
        ? 'No notes match that search.'
        : 'No notes yet. Create one to get started.';
      listHost.append(empty);
      return;
    }

    for (const note of filtered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `note-item ${note.id === activeId ? 'is-active' : ''}`;
      button.dataset.noteId = note.id;
      const title = document.createElement('strong');
      title.textContent = note.title.trim() || 'Untitled note';
      const meta = document.createElement('span');
      meta.textContent = relativeTime(note.updated_at);
      button.append(title, meta);
      button.addEventListener('click', () => {
        flushSave();
        activeId = note.id;
        renderList();
        renderEditor();
      });
      listHost.append(button);
    }
  }

  function renderEditor() {
    const note = activeNote();
    if (!note) {
      mainHost.innerHTML = `
        <div class="notes-empty" style="margin:auto;">
          <strong style="display:block;font-size:14px;color:var(--text);margin-bottom:6px;">Nothing selected</strong>
          Pick a note on the left, or create a new one.
        </div>`;
      return;
    }

    mainHost.innerHTML = `
      <div class="note-editor">
        <div class="note-head">
          <input class="note-title" id="note-title" maxlength="120" placeholder="Untitled note" autocomplete="off">
          <button class="btn small danger" type="button" id="delete-note">Delete</button>
        </div>
        <textarea class="note-body" id="note-body" placeholder="Start typing…"></textarea>
        <div class="note-status" id="note-status"></div>
      </div>`;

    const titleInput = mainHost.querySelector('#note-title');
    const bodyInput = mainHost.querySelector('#note-body');
    const status = mainHost.querySelector('#note-status');
    const deleteButton = mainHost.querySelector('#delete-note');

    titleInput.value = note.title;
    bodyInput.value = note.body;
    status.textContent = `Edited ${relativeTime(note.updated_at)} · saved to your account`;

    titleInput.addEventListener('input', scheduleSave);
    bodyInput.addEventListener('input', scheduleSave);
    titleInput.addEventListener('blur', flushSave);
    bodyInput.addEventListener('blur', flushSave);

    deleteButton.addEventListener('click', async () => {
      if (deleteButton.dataset.confirm !== 'yes') {
        deleteButton.dataset.confirm = 'yes';
        deleteButton.textContent = 'Confirm delete';
        setTimeout(() => {
          if (!deleteButton.isConnected) return;
          deleteButton.dataset.confirm = 'no';
          deleteButton.textContent = 'Delete';
        }, 3000);
        return;
      }
      clearTimeout(saveTimer);
      saveTimer = null;
      try {
        await ctx.api(`/notes/${note.id}`, { method: 'DELETE' });
        notes = notes.filter((item) => item.id !== note.id);
        activeId = notes[0]?.id ?? null;
        ctx.toast('Note deleted');
        renderList();
        renderEditor();
      } catch (err) {
        ctx.toast(err.message, 'error');
      }
    });

    bodyInput.focus();
  }

  async function save() {
    const note = activeNote();
    const titleInput = mainHost.querySelector('#note-title');
    const bodyInput = mainHost.querySelector('#note-body');
    if (!note || !titleInput || !bodyInput) return;
    if (saving) {
      savePending = true;
      return;
    }

    saving = true;
    try {
      const { note: saved } = await ctx.api(`/notes/${note.id}`, {
        method: 'PATCH',
        body: { title: titleInput.value, body: bodyInput.value },
      });
      note.title = saved.title;
      note.body = saved.body;
      note.updated_at = saved.updated_at;
      const status = mainHost.querySelector('#note-status');
      if (status) status.textContent = `Saved at ${clockTime(saved.updated_at)}`;
      renderList();
    } catch (err) {
      const status = mainHost.querySelector('#note-status');
      if (status) status.textContent = `Could not save: ${err.message}`;
    } finally {
      saving = false;
      if (savePending) {
        savePending = false;
        save();
      }
    }
  }

  function scheduleSave() {
    const status = mainHost.querySelector('#note-status');
    if (status) status.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 600);
  }

  function flushSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    save();
  }

  const newButton = root.querySelector('#new-note');
  newButton.addEventListener('click', async () => {
    if (newButton.disabled) return;
    newButton.disabled = true;
    newButton.textContent = 'Creating…';
    flushSave();
    try {
      const { note } = await ctx.api('/notes', { method: 'POST', body: { title: '', body: '' } });
      notes.unshift(note);
      activeId = note.id;
      query = '';
      search.value = '';
      renderList();
      renderEditor();
      mainHost.querySelector('#note-title')?.focus();
    } catch (err) {
      ctx.toast(err.message, 'error');
    } finally {
      newButton.disabled = false;
      newButton.textContent = '+ New note';
    }
  });

  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    renderList();
  });

  (async () => {
    try {
      const { notes: loaded } = await ctx.api('/notes');
      notes = loaded;
      activeId = notes[0]?.id ?? null;
      renderList();
      renderEditor();
    } catch (err) {
      mainHost.innerHTML = `<div class="notes-empty">Could not load notes: ${err.message}</div>`;
    }
  })();
}
