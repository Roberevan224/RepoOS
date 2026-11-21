import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, pool } from './db.js';
import {
  createSession,
  currentUser,
  destroySession,
  hashPassword,
  newId,
  publicUser,
  requireUser,
  verifyPassword,
} from './auth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3000);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// Minimal cookie parser: this app only ever reads one cookie.
app.use((req, _res, next) => {
  const header = req.headers.cookie;
  req.cookies = {};
  if (header) {
    for (const part of header.split(';')) {
      const index = part.indexOf('=');
      if (index > 0) req.cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  next();
});

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// Very small in-memory throttle so a single client cannot hammer sign-in.
const attempts = new Map();
function throttled(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.start > 5 * 60 * 1000) {
    attempts.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > 20;
}

/* ---------------------------------- auth ---------------------------------- */

app.post('/api/auth/signup', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim().slice(0, 40) || email.split('@')[0];

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const exists = await pool.query('select 1 from users where email = $1', [email]);
  if (exists.rowCount) return res.status(409).json({ error: 'An account with that email already exists.' });

  const { rows } = await pool.query(
    `insert into users (id, email, name, password_hash)
     values ($1, $2, $3, $4) returning *`,
    [newId(), email, name, await hashPassword(password)]
  );
  await createSession(res, rows[0].id);
  res.status(201).json({ user: publicUser(rows[0]) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (throttled(`${req.ip}:${email}`)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }

  const { rows } = await pool.query('select * from users where email = $1', [email]);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  await createSession(res, user.id);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

app.get('/api/me', wrap(async (req, res) => {
  const user = await currentUser(req);
  res.json({ user: user ? publicUser(user) : null });
}));

app.patch('/api/me', requireUser, wrap(async (req, res) => {
  const name = req.body?.name;
  const accent = req.body?.accent;
  const wallpaper = req.body?.wallpaper;
  const theme = req.body?.theme;

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: 'Name cannot be empty.' });
  }
  if (accent !== undefined && !/^#[0-9a-f]{6}$/i.test(String(accent))) {
    return res.status(400).json({ error: 'Invalid accent colour.' });
  }
  if (wallpaper !== undefined && !['aurora', 'sunset', 'ocean', 'graphite', 'forest'].includes(wallpaper)) {
    return res.status(400).json({ error: 'Unknown wallpaper.' });
  }
  if (theme !== undefined && !['dark', 'light'].includes(theme)) {
    return res.status(400).json({ error: 'Unknown theme.' });
  }

  const { rows } = await pool.query(
    `update users set
       name = coalesce($2, name),
       accent = coalesce($3, accent),
       wallpaper = coalesce($4, wallpaper),
       theme = coalesce($5, theme)
     where id = $1 returning *`,
    [
      req.user.id,
      name === undefined ? null : name.trim().slice(0, 40),
      accent ?? null,
      wallpaper ?? null,
      theme ?? null,
    ]
  );
  res.json({ user: publicUser(rows[0]) });
}));

/* ---------------------------------- notes --------------------------------- */

app.get('/api/notes', requireUser, wrap(async (req, res) => {
  const { rows } = await pool.query(
    'select id, title, body, updated_at from notes where user_id = $1 order by updated_at desc',
    [req.user.id]
  );
  res.json({ notes: rows });
}));

app.post('/api/notes', requireUser, wrap(async (req, res) => {
  const title = String(req.body?.title ?? '').slice(0, 120);
  const body = String(req.body?.body ?? '').slice(0, 20000);
  const { rows } = await pool.query(
    `insert into notes (id, user_id, title, body)
     values ($1, $2, $3, $4) returning id, title, body, updated_at`,
    [newId(), req.user.id, title, body]
  );
  res.status(201).json({ note: rows[0] });
}));

app.patch('/api/notes/:id', requireUser, wrap(async (req, res) => {
  const title = req.body?.title === undefined ? null : String(req.body.title).slice(0, 120);
  const body = req.body?.body === undefined ? null : String(req.body.body).slice(0, 20000);
  const { rows } = await pool.query(
    `update notes set
       title = coalesce($3, title),
       body = coalesce($4, body),
       updated_at = now()
     where id = $1 and user_id = $2
     returning id, title, body, updated_at`,
    [req.params.id, req.user.id, title, body]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Note not found.' });
  res.json({ note: rows[0] });
}));

app.delete('/api/notes/:id', requireUser, wrap(async (req, res) => {
  const { rowCount } = await pool.query(
    'delete from notes where id = $1 and user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Note not found.' });
  res.json({ ok: true });
}));

/* --------------------------------- system --------------------------------- */

app.get('/api/health', wrap(async (_req, res) => {
  let db = 'down';
  try {
    await pool.query('select 1');
    db = 'up';
  } catch {
    db = 'down';
  }
  res.status(db === 'up' ? 200 : 503).json({
    ok: db === 'up',
    db,
    uptimeSeconds: Math.round(process.uptime()),
  });
}));

/* --------------------------------- static --------------------------------- */

app.use('/assets', express.static(path.join(ROOT, 'assets'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}));

app.get(['/', '/index.html'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(ROOT, 'index.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.status(404).setHeader('Cache-Control', 'no-store');
  res.status(404).send('Not found');
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

await initDb();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`RepoOS listening on http://0.0.0.0:${PORT}`);
});
