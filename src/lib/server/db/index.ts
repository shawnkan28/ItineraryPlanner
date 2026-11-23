import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DATABASE_PATH, MIGRATIONS_PATH } from '$app/env/private';
import * as schema from './schema';

export const DB_PATH = resolve(DATABASE_PATH || 'data/itinerary_planner.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: resolve(MIGRATIONS_PATH || 'drizzle') });

// v1 is single-user: make sure the owner row exists so created_by / updated_by can point at it.
sqlite.prepare(`INSERT OR IGNORE INTO user (id, name, role) VALUES (1, 'me', 'owner')`).run();

export * as t from './schema';
