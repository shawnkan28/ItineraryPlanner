import { fail } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { env } from '$env/dynamic/private';
import { authEnabled } from '$lib/server/auth';
import { DB_PATH, db, t } from '$lib/server/db';
import { getSetting, icsToken, setSetting, vaultPath } from '$lib/server/settings';
import { importPlaces } from '$lib/server/vault';

export const load = ({ url }) => {
	const vault = vaultPath();
	return {
		vault,
		vaultFromEnv: !getSetting('vault_path') && Boolean(env.VAULT_PATH),
		vaultOk: Boolean(vault && existsSync(vault)),
		dbPath: DB_PATH,
		authEnabled: authEnabled(),
		icsBase: `${url.origin}/ics/${icsToken()}`,
		trips: db.select({ id: t.trip.id, name: t.trip.name, startDate: t.trip.startDate }).from(t.trip).orderBy(asc(t.trip.startDate)).all()
	};
};

export const actions = {
	vault: async ({ request }) => {
		const f = await request.formData();
		const path = String(f.get('vaultPath') ?? '').trim();
		if (path && !existsSync(path)) return fail(400, { vaultError: `Folder not found: ${path}` });
		setSetting('vault_path', path || null);
		return { vaultSaved: true };
	},
	importPlaces: async () => {
		const vault = vaultPath();
		if (!vault || !existsSync(vault)) return fail(400, { importError: 'Set a valid vault path first' });
		return { imported: importPlaces(vault) };
	}
};
