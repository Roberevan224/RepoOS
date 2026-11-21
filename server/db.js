import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const SCHEMA = `
create table if not exists users (
  id uuid primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  accent text not null default '#4f8cff',
  wallpaper text not null default 'aurora',
  theme text not null default 'dark',
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists notes (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_user_idx on notes(user_id, updated_at desc);
`;

/** Wait for Postgres, then make sure the schema exists. */
export async function initDb(attempts = 30) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await pool.query('select 1');
      break;
    } catch (err) {
      if (attempt >= attempts) throw err;
      console.warn(`database not ready (attempt ${attempt}): ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  await pool.query(SCHEMA);
}
