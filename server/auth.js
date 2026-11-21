import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db.js';

const scryptAsync = promisify(scrypt);

export const SESSION_COOKIE = 'repoos_session';
export const SESSION_DAYS = 30;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const key = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    'insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)',
    [hashToken(token), userId, expiresAt]
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await pool.query('delete from sessions where token_hash = $1', [hashToken(token)]);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    accent: row.accent,
    wallpaper: row.wallpaper,
    theme: row.theme,
    createdAt: row.created_at,
  };
}

/** Resolve the signed-in user from the session cookie, if any. */
export async function currentUser(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const { rows } = await pool.query(
    `select u.* from sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)]
  );
  return rows[0] ?? null;
}

export async function requireUser(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function newId() {
  return randomUUID();
}
