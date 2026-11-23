import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqlite } from '$lib/server/db';

/** Consistent snapshot via the SQLite online backup API, safe while the app is running. */
export const GET = async () => {
	const dir = mkdtempSync(join(tmpdir(), 'itinerary-backup-'));
	const file = join(dir, 'backup.db');
	try {
		await sqlite.backup(file);
		const data = readFileSync(file);
		const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
		return new Response(data, {
			headers: {
				'content-type': 'application/vnd.sqlite3',
				'content-disposition': `attachment; filename="itinerary_planner-${stamp}.db"`
			}
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};
