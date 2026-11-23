import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { db, t } from './db';

export function getSetting(key: string): string | null {
	return db.select().from(t.setting).where(eq(t.setting.key, key)).get()?.value ?? null;
}

export function setSetting(key: string, value: string | null) {
	db.insert(t.setting)
		.values({ key, value })
		.onConflictDoUpdate({ target: t.setting.key, set: { value } })
		.run();
}

/** Vault path: setting from the UI wins, then the VAULT_PATH env var. */
export function vaultPath(): string | null {
	return getSetting('vault_path') || env.VAULT_PATH || null;
}

/** Token used by the .ics feed URL so a phone calendar can subscribe without the login cookie. */
export function icsToken(): string {
	let token = getSetting('ics_token');
	if (!token) {
		token = randomBytes(18).toString('base64url');
		setSetting('ics_token', token);
	}
	return token;
}
